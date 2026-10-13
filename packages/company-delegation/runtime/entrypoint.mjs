import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const own = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function prepareWorkerProfile(home, provider) {
  if (!['codex', 'claude-code'].includes(provider)) throw new Error('Explicit native provider required');
  const profile = join(home, 'dsh', 'profiles', 'native-worker'); await mkdir(profile, { recursive: true });
  const dependencies = Object.fromEntries(['session', 'session-projection', 'llm', 'system-prompt', 'tools', 'agent', 'agent-loop', 'subagent', 'subprocess-local', 'subagent-' + provider].map(name => ['@deepseek-ai/dsh-' + name, '0.2.0-rc.2']));
  // Profile resolution starts at this node_modules link; installed Linux packages stay in the immutable image.
  const runtimeModules = process.env.NATIVE_WORKER_MODULES ?? resolve(own, '..', '..', 'node_modules');
  await symlink(runtimeModules, join(profile, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies, dsh: { profile: { bundles: [] } } }));
  const quote = value => JSON.stringify(value.replaceAll('\\', '/'));
  const rows = ['session', 'session-projection', 'llm', 'system-prompt', 'tools', 'agent', 'agent-loop', 'subagent', 'subprocess-local'].map(name => `    - id: ${name}\n      name: '@deepseek-ai/dsh-${name}'${name === 'agent-loop' ? '\n      config: { agents: [] }' : name === 'system-prompt' ? '\n      config: { includeHarnessIdentity: false, includeRuntimeContext: false }' : ''}`).join('\n');
  const patch = `- insert:\n${rows}\n    - id: native-auth\n      name: ${quote(join(own, 'dist', 'worker-auth.js'))}\n      config: { provider: ${provider} }\n    - id: native-provider\n      name: '@deepseek-ai/dsh-subagent-${provider}'\n      inject: [nativeWorkerAuth]\n      config:\n        providerName: ${provider}\n        permissionMode: ${provider === 'codex' ? 'never' : 'plan'}\n        disposeGraceMs: 3000\n        env: !!js ctx.nativeWorkerAuth.env\n    - id: native-app\n      name: ${quote(join(own, 'dist', 'worker-app.js'))}\n`;
  await writeFile(join(profile, 'cordis.patch.yml'), patch);
  return { profile, bin: require.resolve('@deepseek-ai/dsh/lib/bin.js') };
}
export async function main(provider) {
  const home = process.env.NATIVE_WORKER_HOME ?? '/tmp/native-worker';
  const { profile, bin } = await prepareWorkerProfile(home, provider);
  const env = { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: join(home, 'dsh'), NATIVE_WORKER_HOME: home, DSH_TELEMETRY: '0' };
  const child = spawn(process.execPath, [bin, '--profile', 'native-worker'], { cwd: profile, env, stdio: 'inherit', windowsHide: true, shell: false });
  const stop = () => child.kill('SIGTERM'); process.on('SIGTERM', stop); process.on('SIGINT', stop);
  await new Promise((done, reject) => { child.once('error', reject); child.once('close', code => { process.exitCode = code ?? 2; done(); }); });
  process.off('SIGTERM', stop); process.off('SIGINT', stop);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]).catch(() => { console.error('Native worker bootstrap unavailable'); process.exitCode = 2; });
