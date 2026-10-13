import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
const sorted = value => JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))));
export async function inventory(root) {
  const files = {};
  async function walk(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      if (prefix === '' && name === 'node_modules') continue; // Audit remains usable after consumer npm ci.
      const path = join(directory, name), key = prefix + name, stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`Linked artifact asset: ${key}`);
      if (stat.isDirectory()) await walk(path, key + '/');
      else {
        if (!stat.isFile()) throw new Error(`Non-file artifact asset: ${key}`);
        if (key === 'release-manifest.json') continue;
        if (/(^|\/)(src|test|tests|\.cache|\.git|\.env[^/]*|auth\.json|owner\.json|receipts|reference|node_modules)(\/|$)/i.test(key)) throw new Error(`Forbidden artifact asset: ${key}`);
        const contents = await readFile(path);
        if (/C:[\\/]+Users[\\/]|\/home\/[^/]+\/|\.cache[\\/]sdk-research|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}/i.test(contents.toString('utf8'))) throw new Error(`Personal path or secret-shaped artifact content: ${key}`);
        files[key] = sha256(contents);
      }
    }
  }
  await walk(root); return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
export async function auditRuntime(root) {
  const manifest = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
  const files = await inventory(root);
  if (JSON.stringify(files) !== JSON.stringify(manifest.files) || sha256(JSON.stringify(files)) !== manifest.artifactSha256) throw new Error('Artifact inventory/hash mismatch');
  if (files['package-lock.json'] !== manifest.dependencyLockSha256) throw new Error('Dependency lock hash mismatch');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (pkg.dependencies['@deepseek-ai/dsh'] !== manifest.dsh) throw new Error('Release DSH version mismatch');
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  if (sorted(pkg.dependencies) !== sorted(lock.packages[''].dependencies)) throw new Error('Runtime dependency lock does not match package manifest');
  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (name.startsWith('@company/')) {
      if (!/^file:packages\/company-[a-z-]+$/.test(version)) throw new Error('Local dependency escapes artifact');
      const path = version.slice(5), local = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8'));
      if (manifest.companyPackages[local.name] !== local.version) throw new Error('Release company version mismatch');
      if (sorted(local.dependencies) !== sorted(lock.packages[path]?.dependencies)) throw new Error('Local package dependency lock mismatch');
      for (const value of Object.values(local.dependencies ?? {})) if (typeof value !== 'string' || (value.startsWith('file:') && !/^file:\.\.\/company-[a-z-]+$/.test(value))) throw new Error('Invalid local package dependency');
      if (JSON.stringify(local.exports).includes('./src/')) throw new Error('Source package export in artifact');
    }
  }
  const workerPath = 'packages/company-delegation/runtime/package-lock.json';
  if (files[workerPath] !== manifest.workerDependencyLockSha256) throw new Error('Worker lock hash mismatch');
  const worker = JSON.parse(await readFile(join(root, workerPath), 'utf8'));
  for (const native of ['codex-linux-x64', 'claude-agent-sdk-linux-x64']) if (!Object.keys(worker.packages).some(key => key.includes(native))) throw new Error('Linux worker optional dependency missing');
  const workerPackage = JSON.parse(await readFile(join(root, 'packages/company-delegation/runtime/package.json'), 'utf8'));
  if (sorted(workerPackage.dependencies) !== sorted(worker.packages[''].dependencies)) throw new Error('Worker dependency lock mismatch');
  return { artifactSha256: manifest.artifactSha256, files: Object.keys(files).length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await auditRuntime(resolve(process.argv[2]))));
