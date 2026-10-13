import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoSymlinkAncestors, digestEntries, fingerprintWorkspace, readWorkspace } from './fingerprint.ts';
import { CandidateProcess } from './process.ts';
import { runHostSuite, SUITE_VERSION, type VerificationCheck } from './suite.ts';

export { fingerprintWorkspace, readWorkspace, digestEntries } from './fingerprint.ts';
export type { VerificationCheck } from './suite.ts';
export type VerificationReport = {
  runId: string;
  sourceDigest: string;
  suiteVersion: string;
  isolation: 'process' | 'docker';
  startedAt: string;
  completedAt: string;
  passed: boolean;
  checks: VerificationCheck[];
};
export type VerificationOptions = {
  workspace: string;
  artifactsDir: string;
  mode: 'process' | 'docker';
  timeoutMs?: number;
};
const BRIDGE = fileURLToPath(new URL('../runtime/bridge.mjs', import.meta.url));
export const DOCKER_IMAGE = 'node:24.13.0-alpine';

/** Process mode is development-only and UNISOLATED. Use Docker for candidate isolation. */
export async function runVerification(options: VerificationOptions): Promise<VerificationReport> {
  if (options.mode !== 'process' && options.mode !== 'docker') throw new Error('Unknown verification mode');
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error('timeoutMs must be between 100 and 60000');
  const workspace = resolve(options.workspace);
  const artifacts = resolve(options.artifactsDir);
  const artifactRelative = relative(workspace, artifacts);
  if (!artifactRelative || (artifactRelative !== '..' && !artifactRelative.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(artifactRelative))) {
    throw new Error('Authoritative artifacts must be outside the candidate workspace');
  }
  await assertNoSymlinkAncestors(artifacts);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const checks: VerificationCheck[] = [];
  let sourceDigest = '';
  let temporary: string | undefined;
  let candidate: CandidateProcess | undefined;
  const containerName = options.mode === 'docker' ? `company-verification-${runId}` : undefined;
  try {
    const entries = await readWorkspace(workspace);
    sourceDigest = digestEntries(entries);
    temporary = await mkdtemp(join(tmpdir(), 'company-verification-'));
    const snapshot = join(temporary, 'candidate');
    await mkdir(snapshot);
    for (const entry of entries) {
      const destination = join(snapshot, entry.path);
      if (entry.data === null) {
        await mkdir(destination, { recursive: true, mode: entry.mode });
        await chmod(destination, entry.mode);
      }
      else {
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, entry.data, { mode: entry.mode });
        await chmod(destination, entry.mode);
      }
    }
    checks.push({ name: 'snapshot-inputs', passed: true });
    if (options.mode === 'process') {
      candidate = new CandidateProcess(process.execPath, [BRIDGE, join(snapshot, 'orders.mjs')], snapshot, timeoutMs);
    } else {
      candidate = new CandidateProcess('docker', [
        'run', '--rm', '--pull=never', '--name', containerName!, '-i',
        '--network=none', '--read-only', '--user=65534:65534', '--cap-drop=ALL',
        '--security-opt=no-new-privileges', '--pids-limit=64', '--memory=128m', '--cpus=0.5',
        '--mount', `type=bind,source=${snapshot},target=/candidate,readonly`,
        '--mount', `type=bind,source=${BRIDGE},target=/bridge.mjs,readonly`,
        '--workdir=/candidate', DOCKER_IMAGE, 'node', '/bridge.mjs', '/candidate/orders.mjs'
      ], temporary, timeoutMs);
    }
    checks.push(...await runHostSuite(candidate));
    await candidate.stop(containerName);
    candidate = undefined;
    // Hash only after the candidate tree is stopped; background edits cannot race a pass.
    checks.push({ name: 'snapshot-unchanged', passed: await fingerprintWorkspace(snapshot) === sourceDigest });
    checks.push({ name: 'workspace-unchanged', passed: await fingerprintWorkspace(workspace) === sourceDigest });
  } catch (error) {
    checks.push({ name: 'runner', passed: false, detail: String(error).slice(0, 1024) });
  } finally {
    try { await candidate?.stop(containerName); }
    catch (error) { checks.push({ name: 'cleanup', passed: false, detail: String(error).slice(0, 1024) }); }
    if (temporary) {
      try { await rm(temporary, { recursive: true, force: true }); }
      catch (error) { checks.push({ name: 'snapshot-cleanup', passed: false, detail: String(error).slice(0, 1024) }); }
    }
  }
  const report: VerificationReport = {
    runId, sourceDigest, suiteVersion: SUITE_VERSION, isolation: options.mode,
    startedAt, completedAt: new Date().toISOString(),
    passed: checks.length > 0 && checks.every(check => check.passed), checks
  };
  const output = join(artifacts, runId);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}
