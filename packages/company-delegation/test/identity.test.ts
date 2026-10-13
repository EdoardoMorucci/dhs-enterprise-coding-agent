import test from 'node:test';
import assert from 'node:assert/strict';
test('Linux workers use the non-root host identity and preserve private credential permissions', async () => {
  const api = await import('../src/identity.ts').catch(() => null); assert.ok(api, 'explicit native identity policy must exist');
  const identity = api.selectWorkerIdentity({ platform: 'linux', uid: 1000, gid: 1000 });
  assert.deepEqual(identity, { policy: 'linux-host', uid: 1000, gid: 1000 });
  // Ordinary mkdtemp(0700), owned source(0644), and private key(0600) are usable without chmod.
  for (const [mode, required, credential] of [[0o700, 7, false], [0o644, 6, false], [0o600, 4, true]] as const) assert.doesNotThrow(() => api.assertPosixPermission({ uid: 1000, gid: 1000, mode }, identity, required, credential));
  assert.throws(() => api.assertPosixPermission({ uid: 1000, gid: 1000, mode: 0o700 }, { ...identity, uid: 10001, gid: 10001 }, 7, false), /permission|owner/i);
  assert.throws(() => api.assertPosixPermission({ uid: 1000, gid: 1000, mode: 0o644 }, identity, 4, true), /private|credential/i);
  assert.throws(() => api.assertPosixPermission({ uid: 2000, gid: 2000, mode: 0o600 }, identity, 4, true), /permission|owner/i);
  for (const host of [{ platform: 'linux', uid: 0, gid: 0 }, { platform: 'linux', uid: 1000, gid: 0 }, { platform: 'darwin', uid: 501, gid: 20 }]) assert.throws(() => api.selectWorkerIdentity(host), /unsupported|non-root/i);
  assert.deepEqual(api.selectWorkerIdentity({ platform: 'win32' }), { policy: 'windows-desktop', uid: 10001, gid: 10001 });
});
