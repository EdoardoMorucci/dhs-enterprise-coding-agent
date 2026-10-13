import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type WorkspaceEntry = { path: string; data: Buffer | null; mode: number };
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 512;

async function readBoundedFile(path: string, availableBytes: number): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Special input rejected');
    if (stat.size > availableBytes) throw new Error('Workspace input limit exceeded');
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      // Bound reads even when a file grows after stat; never load an unbounded file.
      const chunk = Buffer.alloc(Math.min(64 * 1024, availableBytes - total + 1));
      const { bytesRead } = await file.read(chunk);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > availableBytes) throw new Error('Workspace input limit exceeded');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally { await file.close(); }
}

export async function assertNoSymlinkAncestors(path: string): Promise<void> {
  let cursor = resolve(path);
  while (true) {
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Symlink path rejected: ${cursor}`);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

export async function readWorkspace(workspace: string): Promise<WorkspaceEntry[]> {
  const root = resolve(workspace);
  await assertNoSymlinkAncestors(root);
  if (!(await lstat(root)).isDirectory()) throw new Error('Workspace must be a directory');
  const entries: WorkspaceEntry[] = [];
  let bytes = 0;
  async function walk(directory: string, prefix: string): Promise<void> {
    const names: string[] = [];
    for await (const entry of await opendir(directory)) {
      if (names.length + entries.length >= MAX_ENTRIES) throw new Error('Workspace input limit exceeded');
      names.push(entry.name);
    }
    for (const name of names.sort()) {
      const absolute = join(directory, name);
      const path = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Symlink input rejected: ${path}`);
      if (!stat.isDirectory() && !stat.isFile()) throw new Error(`Special input rejected: ${path}`);
      if (entries.length >= MAX_ENTRIES) throw new Error('Workspace input limit exceeded');
      const data = stat.isFile() ? await readBoundedFile(absolute, MAX_BYTES - bytes) : null;
      bytes += data?.length ?? 0;
      if (bytes > MAX_BYTES) throw new Error('Workspace input limit exceeded');
      entries.push({ path, data, mode: stat.mode & 0o777 });
      if (data === null) await walk(absolute, path);
    }
  }
  await walk(root, '');
  return entries;
}

export function digestEntries(entries: WorkspaceEntry[]): string {
  const hash = createHash('sha256');
  for (const entry of entries) {
    hash.update(JSON.stringify([entry.path, entry.mode, entry.data?.length ?? null]) + '\n');
    if (entry.data) hash.update(entry.data);
  }
  return hash.digest('hex');
}

/** Hash every workspace input; no hidden files, dependency files or assets are excluded. */
export async function fingerprintWorkspace(workspace: string): Promise<string> {
  return digestEntries(await readWorkspace(workspace));
}
