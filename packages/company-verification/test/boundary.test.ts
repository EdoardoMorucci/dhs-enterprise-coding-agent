import test from 'node:test';
import assert from 'node:assert/strict';
import { link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprintWorkspace, readWorkspace } from '../src/index.ts';

test('verification selects the supported non-root owner identity without relaxing private snapshot modes', async () => {
  const api = await import('../src/container.ts').catch(() => null); assert.ok(api, 'verifier container identity boundary must exist');
  const identity = api.selectWorkerIdentity({ platform: 'linux', uid: 1000, gid: 1000 });
  const args = api.verificationDockerArguments({ snapshot: '/private-snapshot', bridge: '/trusted/bridge.mjs', name: 'company-verification-fixture', image: 'node:24.13.0-alpine' }, identity);
  assert.ok(args.includes('--user=1000:1000')); assert.ok(args.includes('--read-only')); assert.ok(args.includes('--network=none'));
  assert.ok(args.includes('type=bind,source=/private-snapshot,target=/candidate,readonly,bind-recursive=disabled'));
  for (const [mode, required] of [[0o600, 4], [0o700, 5]] as const) assert.doesNotThrow(() => api.assertPosixPermission({ mode, uid: 1000, gid: 1000 }, identity, required, false));
  assert.throws(() => api.assertPosixPermission({ mode: 0o600, uid: 1000, gid: 1000 }, { ...identity, uid: 65534, gid: 65534 }, 4, false), /permission/i);
  for (const security of [['name=rootless'], ['name=userns']]) assert.throws(() => api.assertDockerIdentity('unix:///var/run/docker.sock', undefined, security, identity), /rootless|namespace/i);
  assert.throws(() => api.assertDockerIdentity('tcp://remote:2375', undefined, [], identity), /remote/i);
  assert.throws(() => api.selectWorkerIdentity({ platform: 'linux', uid: 0, gid: 0 }), /non-root/i);
});

test('shared fingerprint and snapshot input reject external regular-file hardlinks without touching outside data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'verification-hardlink-'));
  try {
    const workspace = join(root, 'candidate'); await mkdir(workspace); const outside = join(root, 'outside.mjs'); await writeFile(outside, 'external-original', { mode: 0o600 });
    await link(outside, join(workspace, 'orders.mjs')); assert.equal((await lstat(outside)).nlink, 2);
    await assert.rejects(readWorkspace(workspace), /hard.?link/i); await assert.rejects(fingerprintWorkspace(workspace), /hard.?link/i);
    assert.equal(await readFile(outside, 'utf8'), 'external-original');
  } finally { await rm(root, { recursive: true, force: true }); }
});
