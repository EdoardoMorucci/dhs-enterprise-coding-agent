import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configure } from '../../../scripts/company-agent.mjs';
import { CandidateAdmission } from '../src/admission.ts';
import { CompanyController } from '../src/controller.ts';
import { reconcileNative } from '../../../scripts/native-reconcile.mjs';

// This deterministic crash fixture has no dispatched container; it does not qualify Docker cleanup.
test('operator reconciliation requires acknowledgement and a dead owner before releasing admission', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'operator-reconcile-'));
  try {
    const root = join(temporary, 'data'), workspace = join(temporary, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'partial writer change');
    await configure({ root, profile: 'hybrid', workspace, endpoint: 'http://localhost:8000/v1', model: 'fixture', apiKeyEnv: 'FIXTURE_KEY' });
    const admission = new CandidateAdmission(join(root, 'candidate-admission'), workspace);
    await admission.run(lease => lease.retain('Interrupted fixture'));
    await assert.rejects(reconcileNative(root, 'hybrid', false), /acknowledge/);
    await assert.rejects(reconcileNative(root, 'hybrid', true), /still running/);
    const path = await admission.path(), record = JSON.parse(await readFile(path, 'utf8')); record.pid = 2147483647; await writeFile(path, JSON.stringify(record));
    const journalDir = join(root, 'hybrid', 'state', 'native-runs'); await mkdir(journalDir, { recursive: true });
    const journalPath = join(journalDir, '11111111-1111-4111-8111-111111111111.json');
    await writeFile(journalPath, JSON.stringify({ version: 1, id: '11111111-1111-4111-8111-111111111111', taskId: 'missing-task', workspace: record.workspace, status: 'running', events: [], identity: { image: 'sha256:' + 'a'.repeat(64), writerCredential: '/explicit-only', reviewerCredential: '/explicit-only' } }));
    await assert.rejects(reconcileNative(root, 'hybrid', true));
    assert.equal(JSON.parse(await readFile(journalPath, 'utf8')).status, 'running', 'task transition failure must retain an unresolved journal for retry');
    assert.ok(await admission.inspect()); await rm(journalPath);
    const result = await reconcileNative(root, 'hybrid', true); assert.equal(result.status, 'reconciled'); assert.equal(await admission.inspect(), null);
    assert.equal(await readFile(join(workspace, 'orders.mjs'), 'utf8'), 'partial writer change');
    const controller = new CompanyController({ stateRoot: join(root, 'hybrid', 'state'), workspace, knowledge: [] }); await controller.start('fresh', 'repair', ['pass']);
    await assert.rejects(controller.finish('fresh'), /verification/i);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
