import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CompanyController } from '../src/controller.ts';
import { fingerprintWorkspace } from '@company/company-verification';

test('real scoped company edits with private files and directories pass Docker verification without mode changes', {
  skip: process.env.COMPANY_VERIFICATION_DOCKER !== '1' || process.platform !== 'linux' ? 'Opt-in Linux Docker qualification; non-root local rootful daemon/image required' : false,
  timeout: 60000
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-edit-docker-'));
  try {
    const workspace = join(root, 'candidate'); await mkdir(workspace, { mode: 0o700 });
    const controller = new CompanyController({ workspace, stateRoot: join(root, 'internal', 'state'), knowledge: [] });
    await controller.start('private-edits', 'Repair order retries', ['Host acceptance passes']);
    await mkdir(join(workspace, 'private'), { mode: 0o700 }); await controller.write('private-edits', 'private/note.txt', 'private-input');
    const probe = `import { statSync, readFileSync } from 'node:fs';
      if ((statSync('/candidate/orders.mjs').mode & 0o777) !== 0o600) throw Error('Source mode changed');
      if ((statSync('/candidate/private').mode & 0o777) !== 0o700) throw Error('Directory mode changed');
      if (readFileSync('/candidate/private/note.txt', 'utf8') !== 'private-input') throw Error('Private input unreadable');\n`;
    await controller.write('private-edits', 'orders.mjs', probe + await readFile(new URL('../../../verifier/reference/orders.mjs', import.meta.url), 'utf8'));
    assert.equal((await lstat(join(workspace, 'orders.mjs'))).mode & 0o777, 0o600);
    const digest = await fingerprintWorkspace(workspace), state = await controller.verify('private-edits', new AbortController().signal);
    assert.equal(state.latestVerification?.passed, true, JSON.stringify(state.latestVerification?.checks));
    assert.equal(state.latestVerification?.sourceDigest, digest); assert.equal(await fingerprintWorkspace(workspace), digest);
    assert.equal((await controller.finish('private-edits')).phase, 'verified');
  } finally { await rm(root, { recursive: true, force: true }); }
});
