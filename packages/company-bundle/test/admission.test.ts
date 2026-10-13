import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanyController } from '../src/controller.ts';

test('persistent candidate admission blocks independent writers and survives uncertain restart', async () => {
  const api = await import('../src/admission.ts').catch(() => null); assert.ok(api, 'persistent candidate admission must exist');
  const root = await mkdtemp(join(tmpdir(), 'admission-'));
  try {
    const workspace = join(root, 'candidate'); await mkdir(workspace); await writeFile(join(workspace, 'orders.mjs'), 'initial');
    const config = { stateRoot: join(root, 'internal', 'state'), workspace, knowledge: [] }; const controller = new CompanyController(config); await controller.start('one', 'repair', ['pass']);
    const gate = new api.CandidateAdmission(join(root, 'candidate-admission'), workspace);
    await gate.run(async lease => {
      const otherRoot = new CompanyController({ ...config, stateRoot: join(root, 'different-installation-root', 'hybrid', 'state') });
      await assert.rejects(otherRoot.start('foreign-owner', 'repair', ['pass']), /admission|reconcil|owned/i);
      for (const operation of [() => controller.write('one', 'orders.mjs', 'raced'), () => controller.verify('one', new AbortController().signal), () => controller.finish('one'), () => controller.start('two', 'repair', ['pass'])]) await assert.rejects(operation(), /admission|reconcil|owned/i);
      assert.ok(await controller.read('one', 'orders.mjs'));
      await lease.retain('Native outcome uncertain');
    });
    const restart = new CompanyController(config); await assert.rejects(restart.write('one', 'orders.mjs', 'raced'), /admission|reconcil|owned/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('restored sessions cannot mutate their old candidate through a differently configured admission lease', async () => {
  const { CandidateAdmission } = await import('../src/admission.ts');
  const root = await mkdtemp(join(tmpdir(), 'admission-restored-'));
  try {
    const first = join(root, 'first'), second = join(root, 'second'); await mkdir(first); await mkdir(second); await writeFile(join(first, 'orders.mjs'), 'original');
    const config = { stateRoot: join(root, 'hybrid', 'state'), workspace: first, knowledge: [], delegation: { image: 'sha256:' + 'a'.repeat(64), writerCredential: join(root, 'selected-key'), reviewerCredential: join(root, 'selected-key') } };
    await new CompanyController(config).start('persisted', 'repair', ['pass']);
    const restored = new CompanyController({ ...config, workspace: second });
    await new CandidateAdmission(join(root, 'candidate-admission'), first).run(async () => {
      for (const operation of [() => restored.write('persisted', 'orders.mjs', 'bypass'), () => restored.verify('persisted', new AbortController().signal), () => restored.delegate('persisted', new AbortController().signal), () => restored.finish('persisted')]) await assert.rejects(operation(), /workspace.*match|candidate.*match/i);
    });
    assert.equal(await readFile(join(first, 'orders.mjs'), 'utf8'), 'original');
    assert.equal((await restored.hydrate('persisted'))?.attempts, 0);
    const same = new CompanyController({ ...config, workspace: await realpath(first) }); await same.write('persisted', 'orders.mjs', 'same canonical candidate');
    assert.equal(await readFile(join(first, 'orders.mjs'), 'utf8'), 'same canonical candidate');
  } finally { await rm(root, { recursive: true, force: true }); }
});
