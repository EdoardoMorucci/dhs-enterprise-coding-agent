import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/worker-auth.ts';
test('worker authentication reads only the selected file and redacts its value from native output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-auth-')); const previous = { home: process.env.NATIVE_WORKER_HOME, file: process.env.NATIVE_WORKER_AUTH_FILE };
  try {
    process.env.NATIVE_WORKER_HOME = root; process.env.NATIVE_WORKER_AUTH_FILE = join(root, 'explicit.json');
    const missing = new Context(); await apply(missing, { provider: 'claude-code' }); assert.equal(missing.nativeWorkerAuth.available, false);
    await writeFile(process.env.NATIVE_WORKER_AUTH_FILE, JSON.stringify({ kind: 'api-key', value: 'fake-selected-key-for-fixture' }), { mode: 0o600 });
    const ctx = new Context(); await apply(ctx, { provider: 'claude-code' }); assert.equal(ctx.nativeWorkerAuth.available, true);
    assert.equal(ctx.nativeWorkerAuth.redact('result fake-selected-key-for-fixture'), 'result [REDACTED]');
    assert.deepEqual(Object.keys(ctx.nativeWorkerAuth.env).sort(), ['ANTHROPIC_API_KEY', 'HOME', 'USERPROFILE']);
  } finally {
    if (previous.home === undefined) delete process.env.NATIVE_WORKER_HOME; else process.env.NATIVE_WORKER_HOME = previous.home;
    if (previous.file === undefined) delete process.env.NATIVE_WORKER_AUTH_FILE; else process.env.NATIVE_WORKER_AUTH_FILE = previous.file;
    await rm(root, { recursive: true, force: true });
  }
});
