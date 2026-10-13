import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configure, profilePatch, profilePaths } from '../../../scripts/company-agent.mjs';
test('hybrid persists only selected credential references and internal refuses native delegation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hybrid-config-'));
  try { const workspace = join(root, 'candidate'); await mkdir(workspace); const credential = join(root, 'auth.json'); await writeFile(credential, '{"private":"do-not-copy"}');
    const options = { root: join(root, 'data'), workspace, endpoint: 'http://localhost:8000/v1', model: 'internal', apiKeyEnv: 'COMPANY_KEY', nativeImage: 'sha256:' + 'a'.repeat(64), writerCredential: credential, reviewerCredential: credential };
    const hybrid = await configure({ ...options, profile: 'hybrid' });
    assert.equal(hybrid.delegation.image, options.nativeImage); assert.doesNotMatch(JSON.stringify(hybrid), /do-not-copy/);
    const patch = profilePatch(hybrid, profilePaths(options.root, 'hybrid'), true); assert.ok(JSON.stringify(patch).includes('delegation'));
    await assert.rejects(configure({ ...options, profile: 'internal' }), /hybrid/i);
    await assert.rejects(configure({ ...options, profile: 'hybrid', writerCredential: join(workspace, 'key.json') }), /credential|candidate/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
