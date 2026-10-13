import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
