import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, open, rm, readdir, lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { dump } from 'js-yaml';
import { resetDemo } from './demo.mjs';

export const installRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const runtimeBin = () => require.resolve('@deepseek-ai/dsh/lib/bin.js');
export function profilePaths(root, profile) {
  if (!['internal', 'hybrid'].includes(profile)) throw new Error('Profile must be internal or hybrid');
  const base = resolve(root, profile);
  return { base, home: join(base, 'dsh-home'), state: join(base, 'state'), config: join(base, 'config.json'), patch: join(base, 'enterprise.patch.yml'), lock: join(base, 'owner.json') };
}
async function noLinks(path) {
  let current = resolve(path);
  for (;;) {
    const info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink() || (info?.isFile() && info.nlink > 1)) throw new Error('Linked runtime paths are forbidden');
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}
export async function acquireOwnership(root, profile) {
  const paths = profilePaths(root, profile); await noLinks(paths.base); await mkdir(paths.base, { recursive: true });
  const token = randomUUID(); let file;
  try { file = await open(paths.lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Profile already has an owner or interrupted runtime: ${paths.lock}. Stop it and reconcile pending operations before removing a stale ownership file.`); throw error; }
  await file.writeFile(JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })); await file.sync(); await file.close();
  return async () => { const record = JSON.parse(await readFile(paths.lock, 'utf8')); if (record.token !== token) throw new Error('Runtime ownership changed'); await rm(paths.lock); };
}
function validateConfig(input) {
  const url = new URL(input.endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Endpoint must be HTTP(S), without embedded credentials, query or fragment');
  if (!input.model?.trim() || input.model.length > 256) throw new Error('Explicit model id required');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.apiKeyEnv ?? '')) throw new Error('Credential environment variable name required');
  if (/^(NODE_OPTIONS|NODE_PATH|DSH_HOME|PATH|PATHEXT|HOME|USERPROFILE|COMSPEC|SYSTEMROOT|WINDIR|TEMP|TMP)$/i.test(input.apiKeyEnv)) throw new Error('Credential variable must not override runtime configuration');
  if (!input.workspace) throw new Error('Explicit candidate workspace required');
  const port = Number(input.port ?? 3080); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback web port');
  const contextWindow = Number(input.contextWindow ?? 32768), maxTokens = Number(input.maxTokens ?? 4096);
  if (!Number.isSafeInteger(contextWindow) || !Number.isSafeInteger(maxTokens) || maxTokens < 256 || contextWindow < maxTokens || contextWindow > 2000000) throw new Error('Invalid model capacities');
  const selected = input.delegation ?? (input.nativeImage || input.writerCredential || input.reviewerCredential ? { image: input.nativeImage, writerCredential: input.writerCredential, reviewerCredential: input.reviewerCredential } : undefined);
  let delegation;
  if (selected) {
    if (input.profile !== 'hybrid') throw new Error('Native delegation is available only in the hybrid profile');
    if (!/^(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}$/.test(selected.image ?? '')) throw new Error('Native image requires immutable sha256 identity');
    for (const key of ['writerCredential', 'reviewerCredential']) if (typeof selected[key] !== 'string' || !isAbsolute(selected[key]) || /[,\r\n\0]/.test(selected[key])) throw new Error('Explicit absolute native credential file required');
    delegation = { image: selected.image, writerCredential: resolve(selected.writerCredential), reviewerCredential: resolve(selected.reviewerCredential) };
  }
  return { version: 1, endpoint: url.href.replace(/\/$/, ''), model: input.model, apiKeyEnv: input.apiKeyEnv, workspace: resolve(input.workspace), port, contextWindow, maxTokens, ...(delegation ? { delegation } : {}) };
}
function containsPath(parent, child) {
  const part = relative(parent, child);
  return !part || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep));
}
async function canonicalPath(path) {
  // Resolve existing ancestors, including Windows short-name aliases, before comparing paths.
  const absolute = resolve(path); let ancestor = absolute;
  for (;;) {
    try { return resolve(await realpath(ancestor), relative(ancestor, absolute)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; const parent = dirname(ancestor); if (parent === ancestor) throw error; ancestor = parent; }
  }
}
async function validateCandidateBoundary(root, workspace) {
  await noLinks(workspace);
  const candidate = await canonicalPath(workspace);
  const installation = await canonicalPath(installRoot);
  const overlaps = path => containsPath(candidate, path) || containsPath(path, candidate);
  for (const profile of ['internal', 'hybrid']) {
    if (overlaps(await canonicalPath(profilePaths(root, profile).base))) throw new Error('Candidate must not overlap either protected profile data directory');
  }
  if (containsPath(candidate, installation)) throw new Error('Candidate must not contain the trusted installation');
  if (!containsPath(installation, candidate)) return;
  const managedWorkspaces = await canonicalPath(join(root, 'workspaces'));
  if (!containsPath(managedWorkspaces, candidate)) throw new Error('Candidate inside trusted installation must use the managed workspaces subtree');
  const assets = ['packages', 'scripts', 'distribution', 'profiles', 'company-knowledge', 'demo', 'node_modules', 'dist', 'verifier', 'docs', 'evaluations', '.git', '.github',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', '.env', '.env.example', 'README.md'];
  for (const asset of assets) {
    if (overlaps(await canonicalPath(join(installRoot, asset)))) throw new Error('Candidate must not overlap trusted installation assets');
  }
}
export async function configure(input) {
  const paths = profilePaths(input.root, input.profile); const config = validateConfig(input);
  await validateCandidateBoundary(input.root, config.workspace);
  await validateNativeCredentials(config);
  const release = await acquireOwnership(input.root, input.profile);
  try { await noLinks(paths.config); await writeFile(paths.config, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 }); } finally { await release(); }
  return config;
}
export async function readConfig(root, profile, checkNativeCredentials = true) {
  const paths = profilePaths(root, profile); await noLinks(paths.config);
  let parsed; try { parsed = JSON.parse(await readFile(paths.config, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('Profile is not configured. Run company-agent configure --endpoint URL --model ID --api-key-env NAME --workspace PATH'); throw error; }
  const config = validateConfig({ ...parsed, profile });
  await validateCandidateBoundary(root, config.workspace);
  if (checkNativeCredentials) await validateNativeCredentials(config);
  return config;
}
async function validateNativeCredentials(config) {
  if (!config.delegation) return;
  const candidate = await canonicalPath(config.workspace);
  for (const path of [config.delegation.writerCredential, config.delegation.reviewerCredential]) {
    if (containsPath(candidate, await canonicalPath(path))) throw new Error('Native credential must be outside the candidate');
    await noLinks(path); const info = await lstat(path).catch(() => null);
    if (!info?.isFile() || info.size < 1 || info.size > 16384) throw new Error('Selected native credential file unavailable or outside size limit');
  }
}
export function childEnvironment(config, home) {
  const keys = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG'];
  const env = Object.fromEntries(keys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  env.DSH_HOME = home;
  if (process.env[config.apiKeyEnv] !== undefined) env[config.apiKeyEnv] = process.env[config.apiKeyEnv];
  return env;
}
export function providerRow(config) {
  return { id: 'llm-pi-ai', config: { providers: { local: { displayName: 'Configured internal model', api: 'openai-completions', baseURL: config.endpoint, apiKeyEnv: config.apiKeyEnv,
    models: [{ id: config.model, contextWindow: config.contextWindow, maxTokens: config.maxTokens, input: ['text'], reasoningEfforts: false }], retryPolicy: { mode: 'normal', maxRetries: 0 } } } } };
}
export function profilePatch(config, paths, sdk = false) {
  return [
    ...['llm-deepseek', 'llm-deepseek-account', 'web-search-deepseek', 'tool-web', 'preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis', 'agent-instructions',
      'tool-plugin-manager', 'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search', 'tool-skill', 'tool-subagent-control', 'tool-subagent-list-agents',
      'tool-subagent', 'tool-subagent-fork', 'tool-workflow', 'tool-todo', 'tool-goal', 'tool-ralph', 'plan-mode', 'goal-round-driver', 'session-title-llm',
      'desktop-product-telemetry', 'product-analytics'].map(id => ({ id, disabled: true })),
    providerRow(config), { id: 'agent-default-model', config: { provider: 'local', model: config.model } },
    ...(!sdk ? [{ id: 'agent-preset-registry', config: { default: 'company' } }] : []),
    ...(!sdk ? [{ id: 'webserver', config: { host: '127.0.0.1', port: config.port, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } }, { id: 'web-runtime', config: { openBrowser: false, printUrl: true, surfaceContext: true, trustedHosts: ['127.0.0.1', 'localhost'] } }] : []),
    { insert: [...(!sdk ? [{ id: 'preset-company', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'company', name: 'Company evidence workflow', plugins: [] } }] : []),
      { id: 'company', name: resolve(installRoot, 'packages/company-bundle/dist/index.js').replaceAll('\\', '/'), config: { stateRoot: paths.state, workspace: config.workspace, knowledgeRoot: join(installRoot, 'company-knowledge'), ...(config.delegation ? { delegation: config.delegation } : {}) } }] }
  ];
}
export async function prepareProfile(root, profile, config, sdk = false) {
  const paths = profilePaths(root, profile); await noLinks(paths.home); await mkdir(paths.home, { recursive: true });
  await noLinks(paths.patch); await writeFile(paths.patch, dump(profilePatch(config, paths, sdk)), { mode: 0o600 }); return paths;
}
export async function boundedCommand(command, args, options = {}) {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '', stderr = '', settled = false;
    const finish = (code, error) => { if (settled) return; settled = true; clearTimeout(timer); resolveResult({ code, stdout, stderr, error }); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, options.timeout ?? 10000);
    child.stdout.on('data', data => { stdout += data.toString(); if (stdout.length > 2_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', data => { stderr += data.toString(); if (stderr.length > 2_000_000) child.kill('SIGKILL'); });
    child.once('error', error => finish(-1, error.message)); child.once('close', code => finish(code ?? -1));
  });
}
export async function status(root, profile) {
  const paths = profilePaths(root, profile); await noLinks(paths.base);
  const owner = await readFile(paths.lock, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const directory = join(paths.state, 'tasks'); await noLinks(directory);
  const files = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const tasks = [];
  for (const name of files.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) { const path = join(directory, name); await noLinks(path); const info = await lstat(path); if (info.size > 262144) throw new Error('Task snapshot size limit'); tasks.push(JSON.parse(await readFile(path, 'utf8'))); }
  return { profile, owner, freshness: 'Read-only persisted snapshot; use company_task_state in the running UI for current digest validation.', tasks };
}
async function start(root, profile, dumpConfig) {
  const config = await readConfig(root, profile); const release = await acquireOwnership(root, profile);
  try {
    const { doctor } = await import('./doctor.mjs');
    if (!dumpConfig) {
      const health = await doctor(root, profile);
      if (!health.model.ready) throw new Error(health.model.detail);
      if (!health.compiled || !health.workspace || !health.runtime.ready) throw new Error('Runtime, compiled bundle or candidate workspace is unavailable; run build and doctor before start.');
    }
    const paths = await prepareProfile(root, profile, config); const args = await runtimeArguments(paths);
    if (dumpConfig) { const result = await boundedCommand(process.execPath, [...args, '--dump-config'], { env: childEnvironment(config, paths.home), timeout: 30000 }); if (result.code !== 0) throw new Error(result.stderr || result.error || 'DSH config composition failed'); process.stdout.write(result.stdout); return; }
    await new Promise((resolveDone, reject) => {
      const child = spawn(process.execPath, args, { shell: false, windowsHide: true, stdio: 'inherit', cwd: paths.base, env: childEnvironment(config, paths.home) });
      const stop = () => child.kill('SIGTERM'); process.on('SIGINT', stop); process.on('SIGTERM', stop);
      child.once('error', reject); child.once('close', code => { process.off('SIGINT', stop); process.off('SIGTERM', stop); code === 0 ? resolveDone() : reject(new Error(`DSH exited with ${code}`)); });
    });
  } finally { await release(); }
}
export async function runtimeArguments(paths) {
  const manifest = join(paths.home, 'profiles', 'enterprise', 'package.json'); await noLinks(manifest);
  const exists = await lstat(manifest).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  return [runtimeBin(), '--profile', 'enterprise', ...(!exists ? ['--from-default-profile', 'web'] : []), '--patch', paths.patch];
}
function parse(argv) {
  const positional = [], flags = {};
  for (let i = 0; i < argv.length; i++) { const value = argv[i]; if (!value.startsWith('--')) positional.push(value); else { const name = value.slice(2); flags[name] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } }
  return { positional, flags };
}
export async function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parse(argv); const root = resolve(flags.root || '.company-agent'); const profile = flags.profile || 'internal'; profilePaths(root, profile);
  const command = positional[0]; let result;
  if (command === 'configure') result = await configure({ root, profile, endpoint: flags.endpoint, model: flags.model, apiKeyEnv: flags['api-key-env'], workspace: flags.workspace, port: flags.port, contextWindow: flags['context-window'], maxTokens: flags['max-tokens'], nativeImage: flags['native-image'], writerCredential: flags['writer-credential'], reviewerCredential: flags['reviewer-credential'] });
  else if (command === 'native-reconcile') result = await (await import('./native-reconcile.mjs')).reconcileNative(root, profile, !!flags['acknowledge-partial-changes']);
  else if (command === 'status') result = await status(root, profile);
  else if (command === 'doctor') { result = await (await import('./doctor.mjs')).doctor(root, profile); if (!result.ready) process.exitCode = 1; }
  else if (command === 'start') return start(root, profile, !!flags['dump-config']);
  else if (command === 'demo' && positional[1] === 'reset') { const release = await acquireOwnership(root, profile); try { await noLinks(join(root, 'workspaces', profile)); result = { workspace: await resetDemo(join(root, 'workspaces', profile)), next: 'Pass this workspace to configure; existing tasks and candidates are preserved.' }; } finally { await release(); } }
  else if (command === 'verify') {
    const config = await readConfig(root, profile); const release = await acquireOwnership(root, profile);
    try { const { runVerification } = await import('../packages/company-verification/dist/index.js'); const { CandidateAdmission } = await import('../packages/company-bundle/dist/admission.js'); const admission = new CandidateAdmission(join(root, 'candidate-admission'), config.workspace); result = await admission.run(() => runVerification({ workspace: config.workspace, artifactsDir: join(profilePaths(root, profile).state, 'cli-receipts'), mode: flags['development-process'] ? 'process' : 'docker' })); result.qualification = flags['development-process'] ? 'UNISOLATED DEVELOPMENT ONLY; cannot complete tasks' : 'Host Docker acceptance evidence; this standalone run is not attached to a session task'; if (!result.passed) process.exitCode = 1; } finally { await release(); }
  } else throw new Error('Usage: company-agent configure|doctor|start|demo reset|verify|status [--profile internal|hybrid] [--root PATH]. Configure requires --endpoint URL --model ID --api-key-env NAME --workspace PATH.');
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
