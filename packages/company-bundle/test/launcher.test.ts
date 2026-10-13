import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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

test('candidate boundaries protect both profiles and trusted installation on configure and persisted reads', async () => {
  const api = await import('../../../scripts/company-agent.mjs');
  const root = await mkdtemp(join(tmpdir(), 'company-protected-'));
  const fields = { endpoint: 'http://127.0.0.1:9/v1', model: 'boundary-fixture', apiKeyEnv: 'BOUNDARY_FIXTURE_KEY' };
  try {
    for (const profile of ['internal', 'hybrid']) {
      const other = profile === 'internal' ? 'hybrid' : 'internal';
      const safe = join(root, 'workspaces', profile, 'candidate');
      await api.configure({ root, profile, ...fields, workspace: safe });
      assert.equal((await api.readConfig(root, profile)).workspace, resolve(safe));
      for (const workspace of [join(root, other), join(root, other, 'state'), root, api.installRoot, resolve(api.installRoot, '..'), join(api.installRoot, 'packages/company-task-state'), join(api.installRoot, 'company-knowledge')]) {
        await assert.rejects(api.configure({ root, profile, ...fields, workspace }), /overlap|protected|trusted/i, `configure must reject ${workspace}`);
        const config = api.profilePaths(root, profile).config;
        await writeFile(config, JSON.stringify({ ...fields, workspace }));
        await assert.rejects(api.readConfig(root, profile), /overlap|protected|trusted/i, `persisted config must reject ${workspace}`);
      }
    }
    for (const asset of ['packages', 'scripts', 'distribution', 'profiles', 'company-knowledge', 'demo', 'node_modules', 'dist', 'verifier', '.git']) {
      const redirectedRoot = join(api.installRoot, asset);
      await assert.rejects(api.configure({ root: redirectedRoot, profile: 'internal', ...fields, workspace: join(redirectedRoot, 'workspaces', 'candidate') }), /protected|trusted/i, 'data-root override cannot turn trusted assets into a candidate');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('managed workspace siblings remain usable beneath the installation data root', async () => {
  const api = await import('../../../scripts/company-agent.mjs');
  const root = await mkdtemp(join(api.installRoot, '.company-agent-boundary-test-'));
  try {
    const reset = await api.boundedCommand(process.execPath, [join(api.installRoot, 'scripts/company-agent.mjs'), 'demo', 'reset', '--root', root]);
    assert.equal(reset.code, 0, reset.stderr);
    const workspace = JSON.parse(reset.stdout).workspace as string;
    assert.ok(workspace.startsWith(join(root, 'workspaces', 'internal')));
    await api.configure({ root, profile: 'internal', endpoint: 'http://127.0.0.1:9/v1', model: 'boundary-fixture', apiKeyEnv: 'BOUNDARY_FIXTURE_KEY', workspace });
    assert.equal((await api.readConfig(root, 'internal')).workspace, workspace);
  } finally { await rm(root, { recursive: true, force: true }); }
});
