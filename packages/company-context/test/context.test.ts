import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TaskStore, type TaskState } from '@company/company-task-state';
import { fingerprintWorkspace } from '@company/company-verification';

async function api() {
  const loaded = await import('../src/index.ts').catch(() => ({})) as typeof import('../src/index.ts');
  assert.equal(typeof loaded.buildCompanyContext, 'function', 'bounded company context API must exist');
  return loaded;
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'company-context-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate');
  await mkdir(workspace);
  await writeFile(join(workspace, 'input.txt'), 'candidate');
  const store = new TaskStore(join(root, 'state'));
  await store.create({ taskId: 'orders', objective: 'Keep each retry idempotent', criteria: ['Only one order per request', 'Preserve distinct requests'], workspace });
  await store.updateInvestigation('orders', { hypotheses: ['Key lost after timeout'], pendingChecks: ['Inspect duplicate order'] });
  await store.recordVerification('orders', { runId: 'context-test-run', sourceDigest: await fingerprintWorkspace(workspace), suiteVersion: 'test',
    isolation: 'process', passed: true, startedAt: '2026-10-13T10:00:00Z', completedAt: '2026-10-13T10:00:01Z', checks: [{ name: 'test-check', passed: true }] });
  return { store, workspace, state: await store.get('orders') };
}

test('oversized knowledge cannot displace objective criteria evidence or pending checks', async t => {
  const { state } = await fixture(t);
  const { buildCompanyContext } = await api();
  const context = buildCompanyContext({ state, knowledge: [{ title: 'Large optional conventions', text: 'x'.repeat(100000) }], maxChars: 2400 });
  assert.ok(context.length <= 2400);
  for (const required of [state.objective, ...state.criteria, ...state.pendingChecks, state.latestVerification!.sourceDigest, 'process', 'current']) assert.ok(context.includes(required), required);
  assert.ok(!context.includes('x'.repeat(100)));
});

test('required state that exceeds budget fails explicitly rather than silently truncating acceptance', async t => {
  const { state } = await fixture(t);
  const { buildCompanyContext } = await api();
  const large: TaskState = { ...state, objective: 'Required objective '.repeat(300) };
  assert.throws(() => buildCompanyContext({ state: large, knowledge: [], maxChars: 2400 }), /required|budget/i);
  assert.throws(() => buildCompanyContext({ state, knowledge: [], maxChars: NaN }), /budget/i);
});

test('fresh authoritative state preserves stale evidence status and recovery check before optional history', async t => {
  const f = await fixture(t);
  await f.store.beginVerification('orders');
  await f.store.recoverInterrupted('orders');
  await writeFile(join(f.workspace, 'input.txt'), 'edited');
  const state = await f.store.get('orders');
  const { buildCompanyContext } = await api();
  const context = buildCompanyContext({ state, knowledge: [], maxChars: 2400 });
  assert.match(context, /stale/);
  assert.match(context, /needs_review/);
  assert.match(context, /Reconcile interrupted verification/);
  assert.match(context, /"reconciliationRequired":true/);
});

test('context uses only the supplied task and frames curated knowledge as example conventions', async t => {
  const { state } = await fixture(t);
  const { buildCompanyContext } = await api();
  const knowledge = [{ title: 'Order conventions', text: 'Preserve request identifiers.' }];
  const snapshot = structuredClone(state);
  const first = buildCompanyContext({ state, knowledge });
  const second = buildCompanyContext({ state: { ...state, taskId: 'separate', objective: 'Other objective', criteria: ['Other criterion'], pendingChecks: [] }, knowledge: [] });
  assert.match(first, /example conventions/i);
  assert.match(first, /Preserve request identifiers/);
  assert.match(first, /host/i);
  assert.match(first, /Docker/);
  assert.ok(!second.includes(state.objective));
  assert.deepEqual(state, snapshot);
});
