import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanyController, EXHAUSTED, taskIdForSession } from '../src/controller.ts';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'company-notes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'export {};');
  const config = { stateRoot: join(root, 'internal', 'state'), workspace, knowledge: [] };
  const controller = new CompanyController(config);
  await controller.start('owner', 'Repair retries', ['One order per request']);
  assert.equal(typeof (controller as any).note, 'function', 'bounded session notes must exist');
  return { root, config, controller, note: (kind: string, text: string) => (controller as any).note('owner', kind, text) };
}

test('session notes survive restart, remain visible and cannot target another session', async t => {
  const f = await fixture(t);
  await f.note('hypothesis', 'Retry loses the request key'); await f.note('pending_check', 'Inspect timeout handling');
  const reload = new CompanyController(f.config); await reload.hydrate('owner');
  assert.match(reload.context('owner'), /Retry loses the request key/); assert.match(reload.context('owner'), /Inspect timeout handling/);
  assert.ok(reload.context('owner').length <= 16000);
  await assert.rejects((reload as any).note('foreign', 'hypothesis', 'overwrite'), /Start a company task/i);
  await reload.start('foreign', 'Other task', ['Other criterion']); await (reload as any).note('foreign', 'hypothesis', 'Foreign note');
  assert.deepEqual((await reload.requireTask('owner')).hypotheses, ['Retry loses the request key']);
});

test('notes preserve lifecycle, exhaustion and fresh-verification authority', async t => {
  const f = await fixture(t); const id = taskIdForSession('owner');
  await f.controller.exhaust('owner'); await f.note('pending_check', 'Check request cache');
  let state = await f.controller.requireTask('owner'); assert.equal(state.phase, 'needs_review'); assert.ok(state.pendingChecks.includes(EXHAUSTED));
  await f.controller.store.requireReconciliation(id, 'Unknown native writer');
  const before = await f.controller.requireTask('owner'); await f.note('hypothesis', 'Inspect partial changes');
  state = await f.controller.requireTask('owner');
  for (const field of ['phase', 'attempts', 'reconciliationRequired', 'latestVerification', 'receiptIndex'] as const) assert.deepEqual(state[field], before[field]);
  assert.ok(state.pendingChecks.includes('Unknown native writer')); assert.ok(state.pendingChecks.includes(EXHAUSTED));
  assert.ok(state.pendingChecks.includes('Fresh verification required after an uncertain external writer'));
});

test('invalid notes and required-context overflow never overwrite durable task data', async t => {
  const f = await fixture(t); const id = taskIdForSession('owner'); const file = join(f.config.stateRoot, 'tasks', `${id}.json`);
  for (const [kind, text] of [['phase', 'verified'], ['hypothesis', ''], ['pending_check', 'x'.repeat(501)]]) {
    const before = await readFile(file, 'utf8'); await assert.rejects(f.note(kind!, text!), /note|limit|kind|text/i); assert.equal(await readFile(file, 'utf8'), before);
  }
  await f.controller.store.updateInvestigation(id, { hypotheses: Array.from({ length: 20 }, (_, i) => `Note ${i}`), pendingChecks: [] });
  const full = await readFile(file, 'utf8'); await assert.rejects(f.note('hypothesis', 'Twenty-first'), /count limit/i); assert.equal(await readFile(file, 'utf8'), full);
  await f.controller.store.updateInvestigation(id, { hypotheses: [], pendingChecks: Array.from({ length: 8 }, (_, i) => `${i}${'\\'.repeat(1900)}`) });
  const before = await readFile(file, 'utf8'); await assert.rejects(f.note('pending_check', 'Overflow'), /context.*budget/i); assert.equal(await readFile(file, 'utf8'), before);
});

test('notes respect candidate admission and reject restored mismatched workspace', async t => {
  const f = await fixture(t);
  await f.controller.admission.run(async () => { await assert.rejects(f.note('hypothesis', 'Raced'), /admission|owned/i); });
  const other = join(f.root, 'other'); await mkdir(other);
  const reload = new CompanyController({ ...f.config, workspace: other });
  await assert.rejects((reload as any).note('owner', 'hypothesis', 'Wrong workspace'), /workspace.*match/i);
});
