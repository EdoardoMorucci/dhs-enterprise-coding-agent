import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../../../', import.meta.url));

test('actual compiled DSH worker boots keyless and emits useful typed refusal without calling a model', { timeout: 90000 }, async () => {
  const api = await import('../runtime/entrypoint.mjs').catch(() => null); assert.ok(api, 'compiled native worker entrypoint must exist');
  const home = await mkdtemp(join(tmpdir(), 'native-keyless-'));
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
      const child = spawn(process.execPath, [resolve(repository, 'packages/company-delegation/runtime/entrypoint.mjs'), 'codex'], { cwd: repository, windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, NATIVE_WORKER_HOME: home, NATIVE_WORKER_AUTH_FILE: join(home, 'missing-explicit-auth.json') }, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; const timer = setTimeout(() => child.kill(), 75000);
      child.stdout.on('data', data => { stdout += data.toString(); }); child.stderr.on('data', data => { stderr += data.toString(); }); child.once('error', reject); child.once('close', code => { clearTimeout(timer); done({ code, stdout, stderr }); });
      child.stdin.end(JSON.stringify({ protocol: 1, runId: '11111111-1111-4111-8111-111111111111', provider: 'codex', role: 'writer', brief: 'Keyless refusal only' }) + '\n');
    });
    assert.equal(result.code, 2, result.stderr); const terminal = JSON.parse(result.stdout.trim()); assert.equal(terminal.code, 'AUTH_UNAVAILABLE'); assert.equal(terminal.runId, '11111111-1111-4111-8111-111111111111'); assert.doesNotMatch(result.stderr, /activation|unknown service|failed to load/i);
  } finally { await rm(home, { recursive: true, force: true }); }
});
