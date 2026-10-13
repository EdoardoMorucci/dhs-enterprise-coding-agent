import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type LeaseRecord = { version: 1; token: string; workspace: string; ownerRoot: string; pid: number; startedAt: string; reason?: string };
export type CandidateLease = { retain(reason: string): Promise<void> };
async function noLinks(path: string): Promise<void> {
  let current = resolve(path);
  for (;;) { const info = await lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink() || (info?.isFile() && info.nlink !== 1)) throw new Error('Linked admission storage rejected');
    const parent = dirname(current); if (parent === current) break; current = parent; }
}
/** One filesystem lease beside the canonical candidate, shared even across configured data roots.
 * A crashed owner is never automatically replaced; operator reconciliation owns recovery. */
export class CandidateAdmission {
  constructor(readonly root: string, readonly workspace: string) {}
  async path(): Promise<string> {
    await noLinks(this.workspace); await noLinks(this.root);
    const canonical = await realpath(this.workspace);
    const lockRoot = join(dirname(canonical), '.company-admission'); await noLinks(lockRoot);
    return join(lockRoot, createHash('sha256').update(process.platform === 'win32' ? canonical.toLowerCase() : canonical).digest('hex') + '.json');
  }
  async inspect(): Promise<LeaseRecord | null> {
    const path = await this.path(); await noLinks(path);
    const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) return null; if (!stat.isFile() || stat.size > 8192) throw new Error('Invalid admission record');
    const record = JSON.parse(await readFile(path, 'utf8')) as LeaseRecord;
    if (record.version !== 1 || !/^[a-f0-9-]{36}$/.test(record.token) || !isAbsolute(record.ownerRoot ?? '') || record.workspace !== await realpath(this.workspace)) throw new Error('Invalid admission record');
    return record;
  }
  async run<T>(operation: (lease: CandidateLease) => Promise<T>): Promise<T> {
    const path = await this.path(); await mkdir(dirname(path), { recursive: true });
    const record: LeaseRecord = { version: 1, token: randomUUID(), workspace: await realpath(this.workspace), ownerRoot: resolve(this.root), pid: process.pid, startedAt: new Date().toISOString() };
    let file;
    try { file = await open(path, 'wx', 0o600); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Candidate admission owned or interrupted; explicit host reconciliation required'); throw error; }
    try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
    let retained = false;
    try { return await operation({ retain: async reason => {
      retained = true; record.reason = reason.slice(0, 1000);
      const temporary = `${path}.${record.token}.tmp`; const output = await open(temporary, 'wx', 0o600);
      try { await output.writeFile(JSON.stringify(record)); await output.sync(); } finally { await output.close(); }
      await rename(temporary, path);
    } }); } finally { if (!retained) await this.release(record.token); }
  }
  /** Trusted CLI only, after checking recorded container outcomes and current contents. */
  async release(token: string): Promise<void> {
    const record = await this.inspect(); if (record?.token !== token) throw new Error('Admission ownership changed');
    await rm(await this.path());
  }
}
