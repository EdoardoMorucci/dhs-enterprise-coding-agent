import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../../company-task-state/src/index.ts';
import { CompanyController, taskIdForSession } from '../src/controller.ts';

test('candidate file operations reject traversal, links, special paths and oversized files', async () => {
  const api = await import('../src/files.ts').catch(() => null);
  assert.ok(api, 'scoped file API must exist');
  const root = await mkdtemp(join(tmpdir(), 'company-boundary-'));
  try {
    const candidate = join(root, 'candidate with spaces'); await mkdir(candidate);
    await api.writeCandidate(candidate, 'nested/order.txt', 'safe');
    assert.equal(await api.readCandidate(candidate, 'nested/order.txt'), 'safe');
    for (const path of ['../outside', '/outside', 'C:\\outside', 'a/../../outside', 'a:ads', '.git/config', 'NUL', 'a\\..\\outside']) {
      await assert.rejects(api.writeCandidate(candidate, path, 'unsafe'), /path|outside|reserved/i);
    }
    const outside = join(root, 'outside'); await mkdir(outside);
    await symlink(outside, join(candidate, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(api.writeCandidate(candidate, 'linked/escape', 'bad'), /link/i);
    await writeFile(join(candidate, 'huge'), 'x'.repeat(262145));
    await assert.rejects(api.readCandidate(candidate, 'huge'), /limit/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('controller binds state to session, blocks premature finish and recovers interrupted host verification once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-session-'));
  try {
    const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'export {};');
    const config = { stateRoot: join(root, 'state'), workspace, knowledge: [] };
    const controller = new CompanyController(config);
    await controller.start('session/one', 'One', ['Pass']);
    assert.equal(await controller.hydrate('session/two'), null);
    await controller.start('session/two', 'Two', ['Pass']);
    assert.equal((await controller.requireTask('session/one')).objective, 'One');
    await assert.rejects(controller.finish('session/one'), /verification/i);
    await assert.rejects(controller.start('session/one', 'Replace', ['Pass']), /already owns/);
    const signal = AbortSignal.abort(new Error('cancelled before dispatch'));
    await assert.rejects(controller.verify('session/one', signal), /cancelled/);
    assert.equal((await controller.requireTask('session/one')).attempts, 0);
    await controller.store.beginVerification(taskIdForSession('session/one'));
    assert.equal((await controller.hydrate('session/one'))?.phase, 'verifying', 'ongoing runtime does not mistake active work for a crash');
    const restarted = new CompanyController(config);
    const recovered = await restarted.hydrate('session/one');
    assert.equal(recovered?.phase, 'needs_review'); assert.equal(recovered?.reconciliationRequired, true);
    await assert.rejects(restarted.write('session/one', 'orders.mjs', 'unsafe'), /Reconcile/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('completion exhaustion remains authoritative after store restart without consuming verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-exhaust-'));
  try {
    const candidate = join(root, 'candidate'); await mkdir(candidate); await writeFile(join(candidate, 'orders.mjs'), 'export {};');
    const store = new TaskStore(join(root, 'state'));
    await store.create({ taskId: 'session1', objective: 'Repair', criteria: ['passes'], workspace: candidate });
    assert.equal(typeof store.markNeedsReview, 'function', 'host needs a durable exhaustion API');
    await store.markNeedsReview('session1', 'Completion repair limit reached');
    const state = await new TaskStore(join(root, 'state')).get('session1');
    assert.equal(state.phase, 'needs_review'); assert.equal(state.attempts, 0);
    assert.ok(state.pendingChecks.includes('Completion repair limit reached'));
    await assert.rejects(store.finish('session1'), /verification/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
