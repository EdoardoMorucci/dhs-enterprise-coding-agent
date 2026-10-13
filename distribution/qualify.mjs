import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditRuntime, sha256 } from './audit.mjs';

// Real consumer installation, deliberately outside the checkout. Retain evidence for inspection.
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = JSON.parse(execFileSync(process.execPath, ['distribution/build.mjs'], { cwd: source, encoding: 'utf8' }));
const external = await mkdtemp(join(tmpdir(), 'company-agent-consumer-'));
const runtime = join(external, 'runtime'); await cp(built.runtime, runtime, { recursive: true });
await auditRuntime(runtime);
await new Promise((resolveDone, reject) => {
  // Command and arguments are fixed; only the generated temporary cwd changes.
  const args = ['ci', '--omit=dev', '--include=optional', '--ignore-scripts', '--no-audit', '--no-fund'];
  const child = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --include=optional --ignore-scripts --no-audit --no-fund'], { cwd: runtime, shell: false, windowsHide: true, stdio: 'inherit' })
    : spawn('npm', args, { cwd: runtime, shell: false, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGKILL'), 600000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('close', code => { clearTimeout(timer); code === 0 ? resolveDone() : reject(new Error(`Clean consumer npm ci failed: ${code}`)); });
});
const audit = await auditRuntime(runtime);
const load = relative => import(pathToFileURL(join(runtime, relative)).href);
for (const name of ['company-verification', 'company-task-state', 'company-context', 'company-delegation', 'company-bundle']) await load(`packages/${name}/dist/index.js`);
await load('packages/company-delegation/dist/docker.js');
const launcher = join(runtime, 'scripts/company-agent.mjs'), dataRoot = join(external, 'data');
function cli(args, expected = 0) {
  const child = spawnSyncNode(args); assert.equal(child.status, expected, child.stderr); return child.stdout;
}
function spawnSyncNode(args) {
  // execFileSync throws for intentional process verification failures; normalize that exit.
  try { return { status: 0, stdout: execFileSync(process.execPath, [launcher, ...args], { cwd: runtime, env: { ...process.env, COMPANY_PORTABLE_FIXTURE_KEY: 'non-secret-fixture' }, encoding: 'utf8', timeout: 60000, windowsHide: true }), stderr: '' }; }
  catch (error) { return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? error.message }; }
}
const workspace = JSON.parse(cli(['demo', 'reset', '--root', dataRoot])).workspace;
cli(['configure', '--root', dataRoot, '--endpoint', 'http://127.0.0.1:9/v1', '--model', 'unqualified-portable-fixture', '--api-key-env', 'COMPANY_PORTABLE_FIXTURE_KEY', '--workspace', workspace]);
for (let i = 0; i < 2; i++) assert.match(cli(['start', '--root', dataRoot, '--dump-config']), /company-bundle/);
const failed = JSON.parse(cli(['verify', '--root', dataRoot, '--development-process'], 1));
assert.equal(failed.passed, false); assert.match(failed.qualification, /UNISOLATED/);
const { CompanyController } = await load('packages/company-bundle/dist/controller.js');
const controller = new CompanyController({ stateRoot: join(dataRoot, 'internal/state'), workspace, knowledge: [] });
await controller.start('consumer-session', 'Investigate retry', ['One order per request']); await controller.note('consumer-session', 'hypothesis', 'Retry investigation persisted');
const reload = new CompanyController(controller.config); await reload.hydrate('consumer-session'); assert.match(reload.context('consumer-session'), /Retry investigation persisted/);
const manifestBytes = await readFile(join(runtime, 'release-manifest.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const result = { runtime, artifactSha256: audit.artifactSha256, releaseManifestSha256: sha256(manifestBytes), files: audit.files, dependencyLockSha256: manifest.dependencyLockSha256, workerDependencyLockSha256: manifest.workerDependencyLockSha256, sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty, node: process.version, checks: ['external npm ci', 'artifact inventory before/after install', 'five compiled modules and Docker subpath', 'two real DSH config compositions', 'buggy seed rejects unisolated acceptance', 'note reload/context'], liveModel: 'unqualified', docker: 'unqualified', authenticatedNative: 'unqualified' };
await writeFile(join(external, 'qualification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
