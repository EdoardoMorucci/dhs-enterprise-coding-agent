import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function api() { const value = await import('../src/index.ts').catch(() => null); assert.ok(value, 'persisted native controller must exist'); return value; }
test('native sequence verifies before readonly review and after it without granting completion', async () => {
  const { delegate } = await api();
  const root = await mkdtemp(join(tmpdir(), 'native-sequence-'));
  try {
    const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'initial');
    const events: string[] = []; let verified = false;
    const result = await delegate({ task: { taskId: 'task1', workspace, objective: 'repair orders', criteria: ['pass acceptance'], attempts: 0, reconciliationRequired: false }, journalRoot: join(root, 'journal'), signal: new AbortController().signal,
      adapter: { async preflight() { events.push('preflight'); }, async run(request: any) { events.push(request.provider); assert.match(request.brief, /repair orders/); if (request.role === 'writer') await writeFile(join(request.cwd, 'orders.mjs'), 'changed'); else { assert.notEqual(request.cwd, workspace); assert.equal(await readFile(join(request.cwd, 'orders.mjs'), 'utf8'), 'changed'); } return { text: 'review text is evidence, not approval', stopReason: 'completed' }; } },
      async verify() { events.push('verify'); return { passed: true }; }, async uncertain() { verified = true; } });
    assert.deepEqual(events, ['preflight', 'codex', 'verify', 'claude-code', 'verify']);
    assert.equal(verified, false); assert.equal(result.status, 'review_required'); assert.match(result.review, /not approval/);
    const record = JSON.parse(await readFile(result.journalPath, 'utf8')); assert.equal(record.status, 'completed'); assert.equal(record.events.filter((e: any) => e.event === 'dispatch').length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const fault of ['writer', 'intermediate', 'isolation', 'candidate-change', 'budget']) test(`native sequence stops at ${fault}`, async () => {
  const { delegate } = await api(); const root = await mkdtemp(join(tmpdir(), 'native-fail-'));
  try { const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'initial'); const events: string[] = [];
    await assert.rejects(delegate({ task: { taskId: 'task1', workspace, objective: 'repair', criteria: ['pass'], attempts: fault === 'budget' ? 2 : 0, reconciliationRequired: false }, journalRoot: join(root, 'journal'), signal: new AbortController().signal,
      adapter: { async preflight() { if (fault === 'isolation') throw new Error('Isolation unavailable'); }, async run(request: any) { events.push(request.role); if (fault === 'writer') throw new Error('Worker failed'); if (fault === 'candidate-change' && request.role === 'reviewer') await writeFile(join(workspace, 'orders.mjs'), 'raced'); return { text: 'done', stopReason: 'completed' }; } }, async verify() { return { passed: fault !== 'intermediate' }; }, async uncertain() {} }));
    assert.equal(events.includes('reviewer'), fault === 'candidate-change');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('uncertain dispatch survives restart and blocks replay', async () => {
  const { delegate, UncertainOutcome } = await api(); const root = await mkdtemp(join(tmpdir(), 'native-uncertain-'));
  try { const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'initial'); let marked = false; let calls = 0;
    const options = { task: { taskId: 'task1', workspace, objective: 'repair', criteria: ['pass'], attempts: 0, reconciliationRequired: false }, journalRoot: join(root, 'journal'), signal: new AbortController().signal,
      adapter: { async preflight() {}, async run() { calls++; await writeFile(join(workspace, 'orders.mjs'), 'partial'); throw new UncertainOutcome('Container exit unknown'); } }, async verify() { return { passed: true }; }, async uncertain() { marked = true; } };
    await assert.rejects(delegate(options), /unknown/); assert.equal(marked, true);
    await assert.rejects(delegate(options), /reconcil/i); assert.equal(calls, 1); assert.equal(await readFile(join(workspace, 'orders.mjs'), 'utf8'), 'partial');
  } finally { await rm(root, { recursive: true, force: true }); }
});
