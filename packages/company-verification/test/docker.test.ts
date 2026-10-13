import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runVerification } from '../src/index.ts';

test('Docker reference passes with runtime isolation and seed fails the host oracle', {
  skip: process.env.COMPANY_VERIFICATION_DOCKER !== '1' ? 'Live Docker qualification not enabled; daemon/image required' : false,
  timeout: 60_000
}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'company-verification-docker-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate');
  await mkdir(workspace);
  const probe = `
    import { readFileSync, writeFileSync } from 'node:fs';
    import { networkInterfaces } from 'node:os';
    if (process.getuid() === 0) throw Error('Root user');
    if (Object.keys(networkInterfaces()).some(name => name !== 'lo')) throw Error('Network enabled');
    if (!/CapEff:\\s+0+\\n/.test(readFileSync('/proc/self/status', 'utf8'))) throw Error('Capabilities retained');
    for (const path of ['/candidate/changed.txt', '/bridge.mjs', '/root-write-test']) {
      try { writeFileSync(path, 'changed'); throw Error('Writable mount'); }
      catch (error) { if (error.message === 'Writable mount') throw error; }
    }
    if (readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim() !== '134217728') throw Error('Memory unlimited');
    if (readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim() !== '64') throw Error('PIDs unlimited');
    if (readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim() !== '50000 100000') throw Error('CPU unlimited');
  `;
  await writeFile(join(workspace, 'orders.mjs'), probe + await readFile(new URL('../../../verifier/reference/orders.mjs', import.meta.url), 'utf8'));
  const options = { workspace, artifactsDir: join(root, 'evidence'), mode: 'docker' as const, timeoutMs: 20_000 };
  const reference = await runVerification(options);
  assert.equal(reference.passed, true, JSON.stringify(reference.checks));
  assert.equal(reference.isolation, 'docker');
  await writeFile(join(workspace, 'orders.mjs'), await readFile(new URL('../../../demo/orders-app/orders.mjs', import.meta.url), 'utf8'));
  const seed = await runVerification(options);
  assert.equal(seed.passed, false);
  assert.ok(seed.checks.some(check => check.name === 'retry-after-timeout' && !check.passed));
});
