import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { VerificationReport } from '../src/index.ts';

type API = {
  fingerprintWorkspace: (path: string) => Promise<string>;
  runVerification: (options: { workspace: string; artifactsDir: string; mode: 'process' | 'docker'; timeoutMs?: number }) => Promise<VerificationReport>;
};
async function api(): Promise<API> {
  const loaded = await import('../src/index.ts').catch(() => ({})) as Partial<API>;
  assert.equal(typeof loaded.runVerification, 'function', 'host verification API must exist');
  assert.equal(typeof loaded.fingerprintWorkspace, 'function', 'fingerprint API must exist');
  return loaded as API;
}
async function fixture(t: { after(fn: () => Promise<void>): void }, source = 'reference') {
  const root = await mkdtemp(join(tmpdir(), 'company-verification-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate');
  const artifactsDir = join(root, 'evidence');
  await mkdir(workspace);
  if (source === 'reference') await cp(new URL('../../../verifier/reference/orders.mjs', import.meta.url), join(workspace, 'orders.mjs'));
  else if (source === 'seed') await cp(new URL('../../../demo/orders-app/orders.mjs', import.meta.url), join(workspace, 'orders.mjs'));
  else await writeFile(join(workspace, 'orders.mjs'), source);
  return { root, workspace, artifactsDir, mode: 'process' as const };
}

test('reference passes host suite and persists report tied to every candidate file', async t => {
  const runner = await api();
  const options = await fixture(t);
  await writeFile(join(options.workspace, 'index.html'), '<p>Orders</p>');
  const report = await runner.runVerification(options);
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  assert.equal(report.isolation, 'process');
  assert.equal(report.sourceDigest, await runner.fingerprintWorkspace(options.workspace));
  assert.ok(report.checks.some(check => check.name === 'retry-after-timeout' && check.passed));
  const saved = JSON.parse(await readFile(join(options.artifactsDir, report.runId, 'report.json'), 'utf8'));
  assert.deepEqual(saved, report);
  await writeFile(join(options.workspace, 'index.html'), '<p>Changed</p>');
  assert.notEqual(await runner.fingerprintWorkspace(options.workspace), report.sourceDigest);
  assert.deepEqual(await readdir(join(options.artifactsDir, report.runId)), ['report.json']);
});
test('buggy seed fails the same independent retry-after-timeout check', async t => {
  const runner = await api();
  const report = await runner.runVerification(await fixture(t, 'seed'));
  assert.equal(report.passed, false);
  assert.ok(report.checks.some(check => check.name === 'retry-after-timeout' && !check.passed));
});
test('fingerprint includes nested hidden files and is independent of absolute location', async t => {
  const runner = await api();
  const options = await fixture(t);
  await mkdir(join(options.workspace, '.hidden'));
  await writeFile(join(options.workspace, '.hidden', 'input.txt'), 'one');
  const copy = join(options.root, 'copy');
  await cp(options.workspace, copy, { recursive: true });
  const initial = await runner.fingerprintWorkspace(options.workspace);
  assert.equal(await runner.fingerprintWorkspace(copy), initial);
  await writeFile(join(copy, '.hidden', 'input.txt'), 'two');
  assert.notEqual(await runner.fingerprintWorkspace(copy), initial);
});
test('fingerprinting rejects symlink escapes instead of reading outside input', async t => {
  const runner = await api();
  const options = await fixture(t);
  await symlink(options.root, join(options.workspace, 'escape'), 'junction');
  await assert.rejects(runner.fingerprintWorkspace(options.workspace), /symlink/i);
  const report = await runner.runVerification(options);
  assert.equal(report.passed, false);
});
test('candidate crash cannot produce a passed report', async t => {
  const runner = await api();
  const options = await fixture(t, 'process.exit(7);');
  const report = await runner.runVerification(options);
  assert.equal(report.passed, false);
  assert.ok(report.checks.some(check => !check.passed));
});
test('candidate passed claim is never accepted as behavioral evidence', async t => {
  const runner = await api();
  const options = await fixture(t, 'console.log(JSON.stringify({passed:true})); export const createOrderStore = () => ({create: () => ({passed:true}), list: () => []});');
  assert.equal((await runner.runVerification(options)).passed, false);
});
test('infinite candidate execution is bounded and cleans snapshot', async t => {
  const runner = await api();
  const options = await fixture(t, 'while (true) {}');
  const started = Date.now();
  const report = await runner.runVerification({ ...options, timeoutMs: 500 });
  assert.equal(report.passed, false);
  assert.ok(Date.now() - started < 10_000);
  assert.match(JSON.stringify(report.checks), /timeout/i);
  assert.deepEqual(await readdir(join(options.artifactsDir, report.runId)), ['report.json']);
});
test('candidate output flood is bounded and fails', async t => {
  const runner = await api();
  const options = await fixture(t, 'while (true) console.log("x".repeat(4096));');
  const report = await runner.runVerification({ ...options, timeoutMs: 3000 });
  assert.equal(report.passed, false);
  assert.match(JSON.stringify(report.checks), /output|protocol/i);
});
test('artifacts inside candidate are rejected', async t => {
  const runner = await api();
  const options = await fixture(t);
  await assert.rejects(runner.runVerification({ ...options, artifactsDir: join(options.workspace, 'evidence') }), /outside/i);
});

test('oversized candidate file is rejected before execution', async t => {
  const runner = await api();
  const options = await fixture(t);
  await writeFile(join(options.workspace, 'large.bin'), Buffer.alloc(9 * 1024 * 1024));
  await assert.rejects(runner.fingerprintWorkspace(options.workspace), /limit/i);
  assert.equal((await runner.runVerification(options)).passed, false);
});
test('candidate changing snapshot cannot retain a passing report', async t => {
  const runner = await api();
  const options = await fixture(t);
  await writeFile(join(options.workspace, 'orders.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync("changed.txt", "edited");\n' + await readFile(join(options.workspace, 'orders.mjs'), 'utf8'));
  const report = await runner.runVerification(options);
  assert.equal(report.passed, false);
  assert.ok(report.checks.some(check => check.name === 'snapshot-unchanged' && !check.passed));
});

test('overlarge directory tree is rejected before execution', async t => {
  const runner = await api();
  const options = await fixture(t);
  await Promise.all(Array.from({ length: 513 }, (_, index) => writeFile(join(options.workspace, `file-${index}`), '')));
  await assert.rejects(runner.fingerprintWorkspace(options.workspace), /limit/i);
});

test('symlink artifacts are rejected to keep authoritative output outside candidate', async t => {
  const runner = await api();
  const options = await fixture(t);
  const linked = join(options.root, 'linked-evidence');
  await symlink(options.workspace, linked, 'junction');
  await assert.rejects(runner.runVerification({ ...options, artifactsDir: linked }), /symlink/i);
});

test('candidate editing live workspace during verification invalidates its report', async t => {
  const runner = await api();
  const options = await fixture(t);
  const path = JSON.stringify(join(options.workspace, 'edited.txt'));
  await writeFile(join(options.workspace, 'orders.mjs'), `import {writeFileSync} from "node:fs"; writeFileSync(${path}, "edited");\n` + await readFile(join(options.workspace, 'orders.mjs'), 'utf8'));
  const report = await runner.runVerification(options);
  assert.equal(report.passed, false);
  assert.ok(report.checks.some(check => check.name === 'workspace-unchanged' && !check.passed));
});

test('timeout cleanup stops the running candidate child process tree', async t => {
  const runner = await api();
  const options = await fixture(t);
  const marker = join(options.root, 'child.pid');
  await writeFile(join(options.workspace, 'orders.mjs'), `
    import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
    writeFileSync(${JSON.stringify(marker)}, String(child.pid));
    while(true) {}
  `);
  const report = await runner.runVerification({ ...options, timeoutMs: 1000 });
  assert.equal(report.passed, false);
  const pid = Number(await readFile(marker, 'utf8'));
  assert.throws(() => process.kill(pid, 0), /ESRCH|not found/i);
});

test('late malformed protocol output invalidates an otherwise passing behavioral report', async t => {
  const runner = await api();
  const options = await fixture(t);
  const reference = await readFile(join(options.workspace, 'orders.mjs'), 'utf8');
  await writeFile(join(options.workspace, 'orders.mjs'), reference + `
    const originalWrite = process.stdout.write.bind(process.stdout);
    let conflicts = 0;
    process.stdout.write = function(chunk, ...args) {
      const reply = JSON.parse(String(chunk));
      if (reply.ok === false && reply.error.includes('already used')) conflicts++;
      if (conflicts === 2 && reply.ok && reply.value?.requestId === 'req-1') {
        return originalWrite(String(chunk) + 'invalid-protocol-tail\\n', ...args);
      }
      return originalWrite(chunk, ...args);
    };
  `);
  const report = await runner.runVerification(options);
  assert.equal(report.checks.filter(check => ['normal-order', 'retry-after-timeout', 'distinct-requests', 'validation', 'conflicting-reuse'].includes(check.name) && check.passed).length, 5);
  assert.equal(report.passed, false);
  assert.match(JSON.stringify(report.checks), /protocol/i);
});

test('parent artifact directory is outside the candidate and accepts evidence', async t => {
  const runner = await api();
  const options = await fixture(t);
  const report = await runner.runVerification({ ...options, artifactsDir: options.root });
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  assert.equal(JSON.parse(await readFile(join(options.root, report.runId, 'report.json'), 'utf8')).passed, true);
});
