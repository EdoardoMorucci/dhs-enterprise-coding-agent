import { cp, mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { inventory, sha256, auditRuntime } from './audit.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(source, 'dist'), { recursive: true });
// Additive output: never recursively delete a caller-selected directory.
const target = await mkdtemp(join(source, 'dist', 'company-agent-'));
const packages = ['company-verification', 'company-task-state', 'company-context', 'company-delegation', 'company-bundle'];
const root = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const dependencies = { ...root.dependencies };
const companyPackages = {};
for (const name of packages) {
  const from = join(source, 'packages', name), to = join(target, 'packages', name);
  await mkdir(to, { recursive: true }); await cp(join(from, 'dist'), join(to, 'dist'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));
  companyPackages[manifest.name] = manifest.version;
  if (typeof manifest.exports === 'string' && manifest.exports.startsWith('./src/')) manifest.exports = { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './package.json': './package.json' };
  // Preserve explicit compiled subpath exports, including the hybrid Docker/worker entries.
  delete manifest.scripts; delete manifest.devDependencies;
  manifest.files = ['dist', 'runtime', 'patch.yaml'];
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) if (version === 'workspace:*') manifest.dependencies[dependency] = `file:../${dependency.split('/')[1]}`;
  if (name === 'company-verification' || name === 'company-delegation') await cp(join(from, 'runtime'), join(to, 'runtime'), { recursive: true, filter: path => !path.replaceAll('\\', '/').includes('/node_modules') });
  if (name === 'company-bundle') await cp(join(from, 'patch.yaml'), join(to, 'patch.yaml'));
  await writeFile(join(to, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  dependencies[manifest.name] = `file:packages/${name}`;
}
for (const directory of ['company-knowledge', 'demo/orders-app', 'profiles']) await cp(join(source, directory), join(target, directory), { recursive: true });
await mkdir(join(target, 'scripts'));
for (const name of ['company-agent.mjs', 'doctor.mjs', 'demo.mjs', 'native-reconcile.mjs']) await cp(join(source, 'scripts', name), join(target, 'scripts', name));
await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'company-agent-runtime', private: true, type: 'module', engines: root.engines, scripts: { 'company-agent': 'node scripts/company-agent.mjs' }, dependencies }, null, 2) + '\n');
await mkdir(join(target, 'docs'));
for (const name of ['installation.md', 'webinar.md', 'customization.md', 'runtime-qualification.md']) await cp(join(source, 'docs', name), join(target, 'docs', name));
const installationPath = join(target, 'docs/installation.md');
await writeFile(installationPath, (await readFile(installationPath, 'utf8')).replaceAll('../packages/company-delegation/README.md', 'native-delegation.md'));
await cp(join(source, 'evaluations'), join(target, 'evaluations'), { recursive: true });
await cp(join(source, 'packages/company-delegation/README.md'), join(target, 'docs/native-delegation.md'));
await cp(join(source, 'distribution/THIRD-PARTY-NOTICES.md'), join(target, 'THIRD-PARTY-NOTICES.md'));
await cp(join(source, 'distribution/audit.mjs'), join(target, 'scripts/audit-runtime.mjs'));
await writeFile(join(target, 'INSTALL.txt'), 'Run npm ci --omit=dev --include=optional --ignore-scripts in this directory, then node scripts/audit-runtime.mjs . and node scripts/company-agent.mjs demo reset. See docs/installation.md for portable commands. Configure your real endpoint/model/workspace; doctor reports missing dependencies. Upstream licenses remain in installed dependencies. No live model, Docker, native or offline deployment qualification is implied.\n');
if (process.argv.includes('--prepare-lock')) { console.log(JSON.stringify({ runtime: target, lockPreparation: true })); process.exit(0); }
await cp(join(source, 'distribution/runtime-package-lock.json'), join(target, 'package-lock.json'));
const files = await inventory(target);
const release = JSON.parse(await readFile(join(source, 'distribution/release-manifest.json'), 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8', windowsHide: true }).trim();
const sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: source, encoding: 'utf8', windowsHide: true }).trim() !== '';
const manifest = { ...release, companyPackages, sourceCommit, sourceDirty, dependencyLockSha256: files['package-lock.json'], workerDependencyLockSha256: files['packages/company-delegation/runtime/package-lock.json'], artifactSha256: sha256(JSON.stringify(files)), files };
await writeFile(join(target, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await auditRuntime(target);
console.log(JSON.stringify({ runtime: target }));
