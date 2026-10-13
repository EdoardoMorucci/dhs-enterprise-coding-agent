import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, readdir, realpath, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fingerprintWorkspace, readWorkspace, digestEntries } from '@company/company-verification';

export type Provider = 'codex' | 'claude-code';
export type WorkerCall = { runId: string; provider: Provider; role: 'writer' | 'reviewer'; brief: string; cwd: string; signal: AbortSignal; settled?: () => Promise<void> };
export type WorkerResult = { text: string; stopReason: string };
export type Adapter = { preflight(signal: AbortSignal): Promise<void>; run(request: WorkerCall): Promise<WorkerResult>; identity?: { image: string; writerCredential: string; reviewerCredential: string } };
export class UncertainOutcome extends Error { override name = 'UncertainOutcome'; }
export type Task = { taskId: string; workspace: string; objective: string; criteria: string[]; attempts: number; reconciliationRequired: boolean };
export type Journal = { version: 1; id: string; taskId: string; workspace: string; status: 'running' | 'completed' | 'failed' | 'uncertain' | 'reconciled'; identity?: Adapter['identity']; events: { event: string; at: string; deadline?: string; runId?: string; provider?: Provider; role?: 'writer' | 'reviewer'; cwd?: string; digest?: string; container?: string }[] };
export async function saveJournal(path: string, journal: Journal): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const temporary = path + '.' + randomUUID() + '.tmp';
  const file = await open(temporary, 'wx', 0o600); try { await file.writeFile(JSON.stringify(journal, null, 2)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}
export async function journals(root: string): Promise<{ path: string; record: Journal }[]> {
  const names = await readdir(root).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
  if (names.length > 4096) throw new Error('Journal count limit'); const result = [];
  for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
    const path = join(root, name), info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 128 * 1024) throw new Error('Invalid native journal');
    const record = JSON.parse(await readFile(path, 'utf8')) as Journal;
    if (record.version !== 1 || name !== record.id + '.json' || !isAbsolute(record.workspace) || !Array.isArray(record.events) || record.events.length > 30 || !['running', 'completed', 'failed', 'uncertain', 'reconciled'].includes(record.status)) throw new Error('Invalid native journal');
    for (const event of record.events) if (event.event === 'dispatch' && (!/^[a-f0-9-]{36}$/.test(event.runId ?? '') || event.container !== `company-native-${event.runId}` || !['codex', 'claude-code'].includes(event.provider ?? ''))) throw new Error('Invalid native dispatch');
    result.push({ path, record });
  } return result;
}
export async function delegate(options: { task: Task; journalRoot: string; adapter: Adapter; signal: AbortSignal; verify(): Promise<{ passed: boolean }>; uncertain(): Promise<void> }): Promise<{ status: 'review_required'; review: string; journalPath: string }> {
  const { task, adapter, signal } = options; signal.throwIfAborted();
  if (task.reconciliationRequired || task.attempts > 1) throw new Error('Delegation needs two remaining verification attempts and no reconciliation');
  const workspace = await realpath(task.workspace), journalRoot = resolve(options.journalRoot);
  const part = relative(workspace, journalRoot); if (!part || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep))) throw new Error('Journal must be outside candidate');
  for (const { record } of await journals(journalRoot)) if (record.workspace === workspace && ['running', 'uncertain'].includes(record.status)) throw new Error('Native outcome requires host reconciliation before replay');
  await adapter.preflight(signal); signal.throwIfAborted();
  const id = randomUUID(), journalPath = join(journalRoot, `${id}.json`);
  const journal: Journal = { version: 1, id, taskId: task.taskId, workspace, status: 'running', events: [], ...(adapter.identity ? { identity: adapter.identity } : {}) };
  const event = async (value: Omit<Journal['events'][number], 'at'>) => { journal.events.push({ ...value, at: new Date().toISOString() }); await saveJournal(journalPath, journal); };
  await event({ event: 'start', digest: await fingerprintWorkspace(workspace) });
  const common = `Objective: ${task.objective}\nAcceptance criteria:\n${task.criteria.map(item => '- ' + item).join('\n')}\nOnly /workspace is the project. Host verification is authoritative. Never claim task completion. Do not access credentials or external services except your selected model provider.\n`;
  const run = async (provider: Provider, role: WorkerCall['role'], cwd: string, brief: string) => {
    signal.throwIfAborted(); const runId = randomUUID();
    await event({ event: 'dispatch', runId, provider, role, cwd, digest: await fingerprintWorkspace(cwd), container: `company-native-${runId}`, deadline: new Date(Date.now() + 300000).toISOString() });
    const output = await adapter.run({ runId, provider, role, cwd, brief, signal, settled: () => event({ event: 'container-stopped', runId, provider, role }) });
    if (output.stopReason !== 'completed' || !output.text.trim() || Buffer.byteLength(output.text) > 65536) throw new Error('Native worker did not complete successfully');
    // Native prose is returned as evidence only; never persisted as instructions or machine approval.
    await event({ event: 'result', runId, provider, role }); return output.text;
  };
  try {
    await run('codex', 'writer', workspace, common + 'Role: implementation writer. Diagnose and edit the candidate to meet all criteria; preserve unrelated files. Report changes and unresolved issues.');
    signal.throwIfAborted(); if (!(await options.verify()).passed) throw new Error('Intermediate host verification failed; review not dispatched');
    const entries = await readWorkspace(workspace), digest = digestEntries(entries), snapshot = join(journalRoot, `${id}-snapshot`);
    await mkdir(snapshot, { recursive: true });
    for (const entry of entries) { const path = join(snapshot, entry.path); if (entry.data === null) await mkdir(path, { recursive: true }); else { await mkdir(dirname(path), { recursive: true }); const file = await open(path, 'wx', entry.mode); try { await file.writeFile(entry.data); } finally { await file.close(); } } await chmod(path, entry.mode); }
    if (await fingerprintWorkspace(snapshot) !== digest || await fingerprintWorkspace(workspace) !== digest) throw new Error('Candidate changed before review');
    const review = await run('claude-code', 'reviewer', snapshot, common + 'Role: independent reviewer. The project is an immutable snapshot. Inspect correctness, tests, regressions and unmet criteria. Do not modify files. Return findings with severity and paths, or state what was checked. Your text is evidence for the parent to inspect, not machine approval.');
    signal.throwIfAborted(); if (await fingerprintWorkspace(snapshot) !== digest || await fingerprintWorkspace(workspace) !== digest) throw new Error('Candidate changed during review; evidence invalid');
    if (!(await options.verify()).passed) throw new Error('Final host verification failed');
    if (await fingerprintWorkspace(workspace) !== digest) throw new Error('Candidate changed after review');
    journal.status = 'completed'; await event({ event: 'final-verification', digest }); return { status: 'review_required', review, journalPath };
  } catch (error) {
    journal.status = error instanceof UncertainOutcome ? 'uncertain' : 'failed';
    try { await event({ event: journal.status }); } catch { await options.uncertain(); throw new UncertainOutcome('Native outcome journal unavailable; reconciliation required'); }
    if (journal.status === 'uncertain') await options.uncertain();
    throw error;
  }
}
