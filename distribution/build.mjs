import { cp, mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(source, 'dist'), { recursive: true });
// Additive output: never recursively delete a caller-selected directory.
const target = await mkdtemp(join(source, 'dist', 'company-agent-'));
const packages = ['company-verification', 'company-task-state', 'company-context', 'company-bundle'];
const root = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
const dependencies = { ...root.dependencies };
for (const name of packages) {
  const from = join(source, 'packages', name), to = join(target, 'packages', name);
  await mkdir(to, { recursive: true }); await cp(join(from, 'dist'), join(to, 'dist'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(from, 'package.json'), 'utf8'));
  manifest.exports = { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './package.json': './package.json', ...(name === 'company-bundle' ? { './patch.yaml': './patch.yaml' } : {}) };
  delete manifest.scripts; delete manifest.devDependencies;
  manifest.files = ['dist', 'runtime', 'patch.yaml'];
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) if (version === 'workspace:*') manifest.dependencies[dependency] = '0.1.0';
  if (name === 'company-verification') await cp(join(from, 'runtime'), join(to, 'runtime'), { recursive: true });
  if (name === 'company-bundle') await cp(join(from, 'patch.yaml'), join(to, 'patch.yaml'));
  await writeFile(join(to, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  dependencies[manifest.name] = `file:packages/${name}`;
}
for (const directory of ['company-knowledge', 'demo/orders-app', 'profiles']) await cp(join(source, directory), join(target, directory), { recursive: true });
await mkdir(join(target, 'scripts'));
for (const name of ['company-agent.mjs', 'doctor.mjs', 'demo.mjs']) await cp(join(source, 'scripts', name), join(target, 'scripts', name));
await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'company-agent-runtime', private: true, type: 'module', engines: root.engines, scripts: { 'company-agent': 'node scripts/company-agent.mjs' }, dependencies }, null, 2) + '\n');
await writeFile(join(target, 'INSTALL.txt'), 'Run npm install in this directory, then node scripts/company-agent.mjs demo reset. Configure your real endpoint/model/workspace; doctor reports missing dependencies. This runtime contains compiled company modules and trusted host assets only. Upstream dependency licenses are retained by npm installation. No inference or Docker qualification is implied.\n');
console.log(JSON.stringify({ runtime: target }));
