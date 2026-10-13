import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('configure stores credential variable name only and isolates profile homes', async () => {
  const api = await import('../../../scripts/company-agent.mjs').catch(() => null);
  assert.ok(api, 'launcher API must exist');
  const root = await mkdtemp(join(tmpdir(), 'company-launch-'));
  try {
    const config = await api.configure({ root, profile: 'internal', endpoint: 'http://127.0.0.1:11434/v1', model: 'explicit-model', apiKeyEnv: 'TEST_COMPANY_KEY', workspace: root + '-candidate' });
    assert.equal(config.model, 'explicit-model');
    const saved = await readFile(join(root, 'internal', 'config.json'), 'utf8');
    assert.match(saved, /TEST_COMPANY_KEY/);
    assert.notEqual(api.profilePaths(root, 'internal').home, api.profilePaths(root, 'hybrid').home);
    await assert.rejects(api.configure({ root, profile: '../escape' }), /profile/i);
    await assert.rejects(api.configure({ root, profile: 'internal', endpoint: 'https://name:secret@example.com/v1', model: 'm', apiKeyEnv: 'KEY', workspace: root + '-candidate' }), /credential/i);
    const release = await api.acquireOwnership(root, 'internal');
    await assert.rejects(api.acquireOwnership(root, 'internal'), /owner|running/i);
    await release(); const releaseAgain = await api.acquireOwnership(root, 'internal'); await releaseAgain();
  } finally { await rm(root, { recursive: true, force: true }); }
});
