import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure, boundedCommand, installRoot, childEnvironment, profilePaths } from '../../../scripts/company-agent.mjs';

test('real Web profile can be composed twice and starts on loopback with stock presets disabled', { timeout: 90000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-web-'));
  const free = createServer(); await new Promise<void>(resolve => free.listen(0, '127.0.0.1', resolve));
  const port = (free.address() as { port: number }).port; await new Promise<void>(resolve => free.close(() => resolve()));
  let child: ReturnType<typeof spawn> | undefined; let closed: Promise<void> | undefined;
  try {
    const candidate = join(root, 'candidate'); await mkdir(candidate); await writeFile(join(candidate, 'orders.mjs'), 'export {};');
    const data = join(root, 'data'); const config = await configure({ root: data, profile: 'internal', endpoint: 'http://127.0.0.1:9/v1', model: 'unqualified-web-smoke', apiKeyEnv: 'COMPANY_WEB_FIXTURE_KEY', workspace: candidate, port });
    const cli = join(installRoot, 'scripts/company-agent.mjs'); const env = { ...childEnvironment(config, profilePaths(data, 'internal').home), COMPANY_WEB_FIXTURE_KEY: 'non-secret-fixture' };
    for (let n = 0; n < 2; n++) {
      const result = await boundedCommand(process.execPath, [cli, 'start', '--root', data, '--dump-config'], { env, timeout: 30000 });
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /preset-company/);
      assert.match(result.stdout, /host: 127\.0\.0\.1/);
    }
    const api = await import('../../../scripts/company-agent.mjs');
    const paths = profilePaths(data, 'internal'); const args = await api.runtimeArguments(paths);
    child = spawn(process.execPath, args, { env, cwd: paths.base, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    closed = new Promise(resolve => child!.once('close', () => resolve()));
    let output = ''; child.stdout!.on('data', data => { output += data; }); child.stderr!.on('data', data => { output += data; });
    let html = ''; let lastResponse = ''; let cookie = '';
    for (let n = 0; n < 200; n++) {
      try {
        const printed = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0];
        const response = await fetch(cookie ? `http://127.0.0.1:${port}/` : printed ?? `http://127.0.0.1:${port}/`, { headers: cookie ? { cookie } : {}, redirect: 'manual', signal: AbortSignal.timeout(1000) });
        cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
        lastResponse = `${response.status}: ${(await response.text()).slice(0, 400)}`;
        if (response.ok) { html = lastResponse; break; }
      } catch { /* startup */ }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve,250));
    }
    assert.match(html, /html/i, `${lastResponse}\n${output.replace(/token=[^\s]+/g, 'token=[redacted]')}`); assert.doesNotMatch(output, /company.*(?:Error|pending)|did not activate/);
  } finally { if (child?.exitCode === null) child.kill('SIGTERM'); await closed; await rm(root, { recursive: true, force: true }); }
});
