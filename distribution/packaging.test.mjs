import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('portable build carries frozen local dependencies, compiled exports and tamper-detectable inventory', async () => {
  const result = JSON.parse(execFileSync(process.execPath, ['distribution/build.mjs'], { cwd: source, encoding: 'utf8' }));
  assert.ok(result.runtime.startsWith(join(source, 'dist', 'company-agent-')));
  try {
    const lock = JSON.parse(await readFile(join(result.runtime, 'package-lock.json'), 'utf8').catch(() => 'null'));
    assert.ok(lock, 'the exact portable deliverable must contain a frozen npm lock');
    const manifest = JSON.parse(await readFile(join(result.runtime, 'release-manifest.json'), 'utf8'));
    assert.equal(manifest.stateSchema, 1); assert.equal(manifest.verificationSuite, 'orders-v1'); assert.match(manifest.dependencyLockSha256, /^[a-f0-9]{64}$/);
    for (const name of ['company-task-state', 'company-context']) {
      const pkg = JSON.parse(await readFile(join(result.runtime, 'packages', name, 'package.json'), 'utf8'));
      assert.equal(pkg.exports['.'].default, './dist/index.js');
    }
    assert.equal(lock.packages['node_modules/@company/company-bundle'].resolved, 'packages/company-bundle');
    assert.equal(lock.packages['node_modules/@company/company-bundle'].link, true);
    const workerLock = JSON.parse(await readFile(join(result.runtime, 'packages/company-delegation/runtime/package-lock.json'), 'utf8'));
    assert.ok(Object.keys(workerLock.packages).some(path => path.includes('codex-linux-x64')));
    const { auditRuntime } = await import('./audit.mjs');
    await auditRuntime(result.runtime);
    await writeFile(join(result.runtime, 'demo/orders-app/orders.mjs'), 'tampered');
    await assert.rejects(auditRuntime(result.runtime), /digest|hash|inventory/i);
  } finally { await rm(result.runtime, { recursive: true, force: true }); }
});
