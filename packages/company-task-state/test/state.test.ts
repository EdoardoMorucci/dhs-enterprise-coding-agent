import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fingerprintWorkspace, runVerification, type VerificationReport } from '@company/company-verification';

async function api() {
  const loaded = await import('../src/index.ts').catch(() => ({})) as typeof import('../src/index.ts');
  assert.equal(typeof loaded.TaskStore, 'function', 'persistent TaskStore API must exist');
  return loaded;
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'task-state-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate');
  const dataDir = join(root, 'state');
  await mkdir(workspace);
  await cp(new URL('../../../verifier/reference/orders.mjs', import.meta.url), join(workspace, 'orders.mjs'));
  const { TaskStore } = await api();
  const store = new TaskStore(dataDir);
  const input = { taskId: 'orders', objective: 'Repair retries', criteria: ['One order per request'], workspace };
  await store.create(input);
  return { root, workspace, dataDir, store, input, TaskStore };
}
// Synthetic host receipt tests state transitions only; these are not Docker qualification.
async function receipt(workspace: string, changes: Partial<VerificationReport> = {}): Promise<VerificationReport> {
  return { runId: 'host-run-1', sourceDigest: await fingerprintWorkspace(workspace), suiteVersion: 'test-suite',
    isolation: 'docker', startedAt: '2026-10-13T10:00:00.000Z', completedAt: '2026-10-13T10:00:01.000Z',
    passed: true, checks: [{ name: 'acceptance', passed: true }], ...changes };
}

test('tasks persist independently across a new store and safe ids prevent traversal', async t => {
  const f = await fixture(t);
  await f.store.create({ ...f.input, taskId: 'other', objective: 'Other objective' });
  await f.store.updateInvestigation('orders', { hypotheses: ['Lost idempotency key'], pendingChecks: ['Inspect timeout'] });
  const recovered = new f.TaskStore(f.dataDir);
  assert.equal((await recovered.get('other')).objective, 'Other objective');
  assert.deepEqual((await recovered.get('orders')).pendingChecks, ['Inspect timeout']);
  assert.equal((await recovered.get('orders')).schemaVersion, 1);
  await assert.rejects(f.store.create(f.input), /exists/i);
  for (const taskId of ['../escape', 'CON', 'a/b', 'a.b', '']) await assert.rejects(f.store.get(taskId), /id/i);
});

test('unknown external writer requires reconciliation and a fresh receipt even if bytes match', async t => {
  const f = await fixture(t); await f.store.recordVerification('orders', await receipt(f.workspace)); await f.store.finish('orders');
  await f.store.requireReconciliation('orders', 'Native outcome uncertain');
  const restarted = new f.TaskStore(f.dataDir); assert.equal((await restarted.get('orders')).reconciliationRequired, true);
  await restarted.reconcileInterruption('orders'); await assert.rejects(restarted.finish('orders'), /verification/i);
  assert.equal((await restarted.get('orders')).attempts, 1);
});

test('running verification stays running on reads and explicit restart reconciliation is conservative', async t => {
  const f = await fixture(t);
  await f.store.beginVerification('orders');
  assert.equal((await f.store.get('orders')).phase, 'verifying');
  const recovered = new f.TaskStore(f.dataDir);
  assert.equal((await recovered.get('orders')).phase, 'verifying');
  const state = await recovered.recoverInterrupted('orders');
  assert.equal(state.phase, 'needs_review');
  assert.equal(state.attempts, 1);
  assert.match(state.pendingChecks.join(' '), /reconcil/i);
  await assert.rejects(recovered.finish('orders'), /verification/i);
});

test('successful isolated receipt permits completion and candidate edits invalidate persisted verified state', async t => {
  const f = await fixture(t);
  await f.store.recordVerification('orders', await receipt(f.workspace));
  const state = await f.store.finish('orders');
  assert.equal(state.phase, 'verified');
  assert.ok(state.receiptReference);
  assert.equal((await new f.TaskStore(f.dataDir).get('orders')).phase, 'verified');
  await writeFile(join(f.workspace, 'changed.txt'), 'new contents');
  assert.equal((await f.store.get('orders')).phase, 'needs_review');
  assert.equal((await new f.TaskStore(f.dataDir).get('orders')).phase, 'needs_review');
  await assert.rejects(f.store.finish('orders'), /stale/i);
});

test('latest evidence supersedes old success and failed or inconsistent reports cannot finish', async t => {
  const f = await fixture(t);
  await f.store.recordVerification('orders', await receipt(f.workspace));
  await f.store.recordVerification('orders', await receipt(f.workspace, { runId: 'host-run-2', passed: false, checks: [{name: 'acceptance', passed: false}] }));
  await assert.rejects(f.store.finish('orders'), /passed|successful/i);
  assert.equal((await f.store.get('orders')).phase, 'failed');
  await assert.rejects(f.store.recordVerification('orders', await receipt(f.workspace, { checks: [{ name: 'acceptance', passed: false }] })), /report/i);
});

test('real unisolated host verification is stored but can never satisfy completion', async t => {
  const f = await fixture(t);
  const report = await runVerification({ workspace: f.workspace, artifactsDir: join(f.root, 'runner-reports'), mode: 'process' });
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  await f.store.recordVerification('orders', report);
  await assert.rejects(f.store.finish('orders'), /isolat/i);
});

test('store workspace overlap in either direction and linked storage are rejected', async t => {
  const f = await fixture(t);
  for (const dataDir of [f.workspace, join(f.workspace, 'data'), f.root]) {
    await assert.rejects(new f.TaskStore(dataDir).create({ ...f.input, taskId: 'overlap' }), /overlap|outside/i);
  }
  const linked = join(f.root, 'linked');
  await symlink(f.workspace, linked, 'junction');
  await assert.rejects(new f.TaskStore(linked).create(f.input), /symlink/i);
});

test('corrupt or unsupported persisted storage fails closed without overwriting', async t => {
  const f = await fixture(t);
  const file = join(f.dataDir, 'orders.json');
  for (const value of ['{bad', '{"schemaVersion":99}', '{"schemaVersion":1,"phase":"verified"}']) {
    await writeFile(file, value);
    await assert.rejects(new f.TaskStore(f.dataDir).get('orders'), /corrupt|schema/i);
    assert.equal(await readFile(file, 'utf8'), value);
  }
});

test('serialized updates preserve bounded history and leave only atomic state files', async t => {
  const f = await fixture(t);
  await Promise.all(Array.from({ length: 40 }, (_, i) => f.store.updateInvestigation('orders', { hypotheses: [`Hypothesis ${i}`], pendingChecks: [] })));
  const state = await new f.TaskStore(f.dataDir).get('orders');
  assert.deepEqual(state.hypotheses, ['Hypothesis 39']);
  assert.ok(state.history.length <= 32);
  assert.deepEqual(await readdir(f.dataDir), ['orders.json']);
  await assert.rejects(f.store.updateInvestigation('orders', { hypotheses: ['x'.repeat(100000)], pendingChecks: [] }), /limit/i);
});

test('attempt accounting allows initial verification and two repairs but no fourth run', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) {
    await f.store.beginVerification('orders');
    await assert.rejects(f.store.beginVerification('orders'), /running/i);
    await f.store.recordVerification('orders', await receipt(f.workspace, { runId: `run-${i}`, passed: false, checks: [{name: 'acceptance', passed: false}] }));
  }
  assert.equal((await f.store.get('orders')).attempts, 3);
  await assert.rejects(f.store.beginVerification('orders'), /attempt|repair/i);
});

test('reconciled interrupted run cannot finish with a successful receipt from an older attempt', async t => {
  const f = await fixture(t);
  await f.store.recordVerification('orders', await receipt(f.workspace));
  await f.store.beginVerification('orders');
  await f.store.recoverInterrupted('orders');
  await assert.rejects(f.store.beginVerification('orders'), /reconcil/i);
  await f.store.reconcileInterruption('orders');
  await assert.rejects(f.store.finish('orders'), /latest attempt/i);
});

test('missing candidate downgrades verified evidence instead of retaining completion', async t => {
  const f = await fixture(t);
  await f.store.recordVerification('orders', await receipt(f.workspace));
  await f.store.finish('orders');
  await rm(f.workspace, { recursive: true });
  const state = await new f.TaskStore(f.dataDir).get('orders');
  assert.equal(state.phase, 'needs_review');
  assert.equal(state.evidenceStatus, 'unavailable');
  await assert.rejects(f.store.finish('orders'), /unavailable|stale/i);
});

test('host reconciles interrupted attempt by recording its receipt without consuming another attempt', async t => {
  const f = await fixture(t);
  await f.store.beginVerification('orders');
  await new f.TaskStore(f.dataDir).recoverInterrupted('orders');
  const state = await f.store.recordVerification('orders', await receipt(f.workspace));
  assert.equal(state.attempts, 1);
  assert.equal(state.reconciliationRequired, false);
  assert.equal((await f.store.finish('orders')).phase, 'verified');
});

test('report snapshots resist caller mutation and task reads cannot mutate authority', async t => {
  const f = await fixture(t);
  const report = await receipt(f.workspace);
  const save = f.store.recordVerification('orders', report);
  report.passed = false;
  report.checks[0]!.passed = false;
  await save;
  const exposed = await f.store.get('orders');
  exposed.phase = 'failed';
  exposed.latestVerification!.passed = false;
  assert.equal((await f.store.finish('orders')).phase, 'verified');
});

test('corrupt receipt digest and overlarge state fail closed', async t => {
  const f = await fixture(t);
  const file = join(f.dataDir, 'orders.json');
  const state = await f.store.recordVerification('orders', await receipt(f.workspace));
  state.latestVerification!.sourceDigest = 'invalid';
  await writeFile(file, JSON.stringify(state));
  await assert.rejects(f.store.get('orders'), /corrupt/i);
  await writeFile(file, ' '.repeat(300000));
  await assert.rejects(f.store.get('orders'), /corrupt|limit/i);
});

test('stale successful receipt cannot finish even when candidate changed before recording', async t => {
  const f = await fixture(t);
  const report = await receipt(f.workspace);
  await writeFile(join(f.workspace, 'extra.txt'), 'changed before record');
  const state = await f.store.recordVerification('orders', report);
  assert.equal(state.evidenceStatus, 'stale');
  await assert.rejects(f.store.finish('orders'), /stale/i);
});

test('real failed runner receipt without a source digest is persisted as unavailable evidence', async t => {
  const f = await fixture(t);
  await f.store.beginVerification('orders');
  await symlink(f.root, join(f.workspace, 'escape'), 'junction');
  const report = await runVerification({ workspace: f.workspace, artifactsDir: join(f.root, 'runner-reports'), mode: 'process' });
  assert.equal(report.passed, false);
  assert.equal(report.sourceDigest, '');
  const state = await f.store.recordVerification('orders', report);
  assert.equal(state.phase, 'failed');
  assert.equal(state.evidenceStatus, 'unavailable');
  assert.equal((await new f.TaskStore(f.dataDir).get('orders')).latestVerification!.passed, false);
  await assert.rejects(f.store.finish('orders'), /passed/i);
});

test('replaying an earlier successful receipt cannot relabel it as the third attempt', async t => {
  const f = await fixture(t);
  const first = await receipt(f.workspace, { runId: 'first-success' });
  await f.store.recordVerification('orders', first);
  await f.store.recordVerification('orders', await receipt(f.workspace, { runId: 'second-failure', passed: false, checks: [{ name: 'acceptance', passed: false }] }));
  await f.store.beginVerification('orders');
  await assert.rejects(f.store.recordVerification('orders', first), /already recorded|reused/i);
  const state = await f.store.get('orders');
  assert.equal(state.phase, 'verifying');
  assert.equal(state.latestVerification!.runId, 'second-failure');
  assert.equal(state.latestVerificationAttempt, 2);
  await assert.rejects(f.store.finish('orders'), /running/i);
});

test('receipt identities survive history truncation and reload during explicit interruption recovery', async t => {
  const f = await fixture(t);
  const first = await receipt(f.workspace, { runId: 'first-success' });
  await f.store.recordVerification('orders', first);
  await f.store.recordVerification('orders', await receipt(f.workspace, { runId: 'second-failure', passed: false, checks: [{ name: 'acceptance', passed: false }] }));
  for (let i = 0; i < 40; i++) await f.store.updateInvestigation('orders', { hypotheses: [`Revision ${i}`], pendingChecks: [] });
  await f.store.beginVerification('orders');
  const recovered = new f.TaskStore(f.dataDir);
  await recovered.recoverInterrupted('orders');
  await assert.rejects(recovered.recordVerification('orders', first), /already recorded|reused/i);
  assert.equal((await recovered.get('orders')).reconciliationRequired, true);
  await assert.rejects(recovered.finish('orders'), /reconcil/i);
  await recovered.recordVerification('orders', await receipt(f.workspace, { runId: 'third-success' }));
  assert.equal((await recovered.finish('orders')).phase, 'verified');
});

test('stored receipt identity inconsistent with its attempt is rejected as corrupt', async t => {
  const f = await fixture(t);
  await f.store.recordVerification('orders', await receipt(f.workspace));
  const file = join(f.dataDir, 'orders.json');
  const state = JSON.parse(await readFile(file, 'utf8'));
  state.receiptIndex = [{ runId: 'host-run-1', attempt: 2 }];
  await writeFile(file, JSON.stringify(state));
  await assert.rejects(new f.TaskStore(f.dataDir).get('orders'), /corrupt/i);
});
