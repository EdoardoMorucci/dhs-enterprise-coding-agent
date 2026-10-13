import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-loop';
import type {} from '@deepseek-ai/dsh-subagent';
import type {} from '@deepseek-ai/dsh-cmdline';
import type {} from './worker-auth.ts';
import { brandString } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { randomUUID, createHash } from 'node:crypto';
import { lstat, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRequest, type WorkerRequest } from './protocol.ts';
export const name = 'native-worker-app';
export const inject = ['agents', 'agentLoop', 'subagents', 'nativeWorkerAuth'];
async function requestInput(): Promise<WorkerRequest> {
  let input = ''; for await (const chunk of process.stdin) { input += chunk.toString(); if (Buffer.byteLength(input) > 32768) throw new Error('Request limit'); }
  return parseRequest(input);
}
/** Runs within the actual reviewer container before native dispatch. Any successful project write refuses review. */
async function readonlyProbe(): Promise<void> {
  const root = '/workspace'; let existing: string | undefined;
  const visit = async (directory: string): Promise<void> => { for (const name of await readdir(directory)) { const path = join(directory, name), info = await lstat(path); if (info.isFile()) { existing = path; return; } if (info.isDirectory()) await visit(path); if (existing) return; } };
  await visit(root); if (!existing) throw new Error('Readonly probe requires a regular project file');
  const before = createHash('sha256').update(await readFile(existing)).digest('hex');
  const denied = async (operation: () => Promise<unknown>) => { try { await operation(); } catch (error) { if (['EROFS', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) return; throw error; } throw new Error('Project write unexpectedly permitted'); };
  await denied(async () => { const file = await open(existing!, 'r+'); try { await file.write(Buffer.from([0]), 0, 1, 0); } finally { await file.close(); } });
  await denied(() => writeFile(join(root, '.readonly-probe-' + randomUUID()), 'probe', { flag: 'wx' }));
  await denied(() => rename(existing!, existing! + '.readonly-probe'));
  await denied(() => unlink(existing!));
  if (createHash('sha256').update(await readFile(existing)).digest('hex') !== before) throw new Error('Readonly probe digest changed');
  await writeFile('/tmp/native-readonly-scratch', 'scratch allowed');
}
export function apply(ctx: Context): void {
  const abort = new AbortController(); const stop = () => abort.abort(); let lifetime: Promise<void> | undefined;
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  const cancelReady = ctx.get('appReady')!.onReady(() => { lifetime = (async () => {
    let request: WorkerRequest | undefined, terminal: Record<string, unknown> = { code: 'INVALID_REQUEST' }, code = 2;
    try {
      request = await requestInput();
      if (!ctx.nativeWorkerAuth.available) terminal = { code: 'AUTH_UNAVAILABLE' };
      else {
        if (request.role === 'reviewer') { try { await readonlyProbe(); } catch { terminal = { code: 'ISOLATION_UNAVAILABLE' }; throw new Error('Isolation unavailable'); } }
        const parent = await ctx.agents.create({ sessionId: brandString<SessionId>(randomUUID()), meta: { cwd: '/workspace' }, signal: abort.signal });
        try {
          const run = await ctx.subagents.start(request.provider, { parent: parent.agent, label: `${request.role}:${request.runId}`, prompt: [{ type: 'text', text: request.brief }], signal: abort.signal });
          try {
            const result = await run.result; const text = ctx.nativeWorkerAuth.redact(result.output.filter(block => block.type === 'text').map(block => block.text).join('\n'));
            if (result.stopReason !== 'completed' || !text.trim() || Buffer.byteLength(text) > 65536) throw new Error('Native outcome unsuccessful');
            terminal = { type: 'result', stopReason: result.stopReason, text, readonlyChecked: request.role === 'reviewer' }; code = 0;
          } finally { try { await run.dispose(); } catch { terminal = { code: 'CLEANUP_FAILED' }; code = 2; } }
        } finally { try { await parent.dispose(); } catch { terminal = { code: 'CLEANUP_FAILED' }; code = 2; } }
      }
    } catch { if (!['ISOLATION_UNAVAILABLE', 'CLEANUP_FAILED'].includes(String(terminal.code))) terminal = { code: request ? 'START_FAILED' : 'INVALID_REQUEST' }; code = 2; }
    process.stdout.write(JSON.stringify({ protocol: 1, type: 'error', runId: request?.runId ?? '', role: request?.role ?? '', provider: request?.provider ?? '', ...terminal }) + '\n');
    ctx.get('appExit')!(code);
  })(); });
  ctx.effect(() => async () => { cancelReady(); stop(); process.off('SIGTERM', stop); process.off('SIGINT', stop); await lifetime; });
}
