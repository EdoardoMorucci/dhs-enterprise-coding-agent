import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const image = 'sha256:' + 'a'.repeat(64);
const runId = '11111111-1111-4111-8111-111111111111';
async function api() { const value = await import('../src/docker.ts').catch(() => null); assert.ok(value, 'Docker lifecycle adapter must exist'); return value; }
async function fixture(body: (root: string, cwd: string, secret: string) => Promise<void>) { const root = await mkdtemp(join(tmpdir(), 'native-docker-')); try { const cwd = join(root, 'candidate'), secret = join(root, 'selected-auth.json'); await mkdir(cwd); await writeFile(secret, '{}'); await body(root, await realpath(cwd), await realpath(secret)); } finally { await rm(root, { recursive: true, force: true }); } }
test('Docker terminal protocol rejects malformed output, duplicates, identity mismatch and textual success with cleanup uncertainty', async () => {
  const { parseTerminal } = await api(); const request = { protocol: 1 as const, runId, provider: 'claude-code' as const, role: 'reviewer' as const, brief: 'review' };
  const line = JSON.stringify({ ...request, type: 'result', stopReason: 'completed', text: 'review findings', readonlyChecked: true });
  assert.equal(parseTerminal(line, request).text, 'review findings');
  for (const bad of ['hello', line + '\n' + line, line.replace(runId, 'other'), line.replace('completed', 'unknown'), line.replace('true', 'false'), 'x'.repeat(131073)]) assert.throws(() => parseTerminal(bad, request));
});

for (const fault of ['none', 'rw', 'timeout', 'cleanup', 'cancel']) test(`Docker adapter ${fault} validates actual mount and converges named container`, async () => {
  const { DockerAdapter } = await api(); await fixture(async (_root, cwd, credential) => {
    const calls: string[] = []; let running = false, removed = false; const abort = new AbortController();
    const transport = async (args: string[], input?: string, signal?: AbortSignal) => {
      calls.push(args[0]!);
      if (args[0] === 'context') return { code: 0, stdout: JSON.stringify([{ Endpoints: { docker: { Host: 'npipe:////./pipe/dockerDesktopLinuxEngine' } } }]) };
      if (args[0] === 'image') return { code: 0, stdout: JSON.stringify([{ Id: image, Os: 'linux', RepoDigests: [] }]) };
      if (args[0] === 'create') return { code: 0, stdout: 'container-id' };
      if (args[0] === 'inspect') {
        if (fault === 'cleanup' && calls.includes('start')) throw new Error('daemon unavailable');
        if (removed) return { code: 1, stdout: '' };
        return { code: 0, stdout: JSON.stringify([{ Name: '/company-native-' + runId, Image: image, Config: { User: '10001:10001', Labels: { 'company.run': runId } }, HostConfig: { ReadonlyRootfs: true, Privileged: false, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], NetworkMode: 'bridge', PidMode: '', IpcMode: 'private', Devices: [], Binds: [], Tmpfs: { '/tmp': 'rw,nosuid,nodev,size=256m,uid=10001,gid=10001' } }, Mounts: [{ Type: 'bind', Source: cwd, Destination: '/workspace', RW: fault === 'rw' }, { Type: 'bind', Source: credential, Destination: '/run/native-auth.json', RW: false }], State: { Running: running, Status: running ? 'running' : calls.includes('start') ? 'exited' : 'created', ExitCode: 0, OOMKilled: false, Error: '' } }]) };
      }
      if (args[0] === 'start') { running = true; const request = JSON.parse(input!); if (fault === 'cancel') abort.abort(); if (fault === 'timeout') { await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); return { code: -1, stdout: '' }; } running = false; return { code: 0, stdout: JSON.stringify({ ...request, type: 'result', stopReason: 'completed', text: 'findings', readonlyChecked: true }) }; }
      if (args[0] === 'stop' || args[0] === 'kill') { running = false; return { code: 0, stdout: '' }; }
      if (args[0] === 'rm') { removed = true; return { code: 0, stdout: '' }; }
      throw new Error('Unexpected command');
    };
    const adapter = new DockerAdapter({ image, writerCredential: credential, reviewerCredential: credential, timeoutMs: 25 }, transport);
    const operation = adapter.run({ runId, provider: 'claude-code', role: 'reviewer', cwd, brief: 'review', signal: abort.signal });
    if (fault === 'none') { assert.equal((await operation).text, 'findings'); assert.equal(removed, true); }
    else { if (fault === 'cleanup') await assert.rejects(operation, /uncertain|reconcil/i); else await assert.rejects(operation); if (fault === 'rw') assert.equal(calls.includes('start'), false); else assert.ok(calls.includes('stop') || calls.includes('inspect')); }
    assert.equal(running, false);
  });
});

test('missing credentials and candidate-contained credentials refuse before Docker dispatch', async () => {
  const { DockerAdapter } = await api(); await fixture(async (_root, cwd, credential) => {
    let calls = 0; const transport = async () => { calls++; return { code: 0, stdout: '[]' }; };
    for (const selected of [join(cwd, 'key.json'), cwd]) { const adapter = new DockerAdapter({ image, writerCredential: selected, reviewerCredential: credential }, transport); await assert.rejects(adapter.run({ runId, provider: 'codex', role: 'writer', cwd, brief: 'repair', signal: new AbortController().signal })); }
    assert.equal(calls, 0);
  });
});
