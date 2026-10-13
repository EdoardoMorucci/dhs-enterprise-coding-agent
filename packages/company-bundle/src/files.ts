import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const LIMIT = 256 * 1024;
export async function rejectLinks(path: string): Promise<void> {
  let current = resolve(path);
  for (;;) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error('Linked paths are forbidden');
    if (info?.isFile() && info.nlink > 1) throw new Error('Hard linked files are forbidden');
    const parent = dirname(current); if (parent === current) break; current = parent;
  }
}
async function scoped(workspace: string, path: string): Promise<string> {
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\\:\x00-\x1f]/.test(path) || isAbsolute(path)) throw new Error('Invalid relative candidate path');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) throw new Error('Reserved or escaping candidate path');
  const root = resolve(workspace); const target = resolve(root, ...parts); const rel = relative(root, target);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('Path outside candidate');
  await rejectLinks(target); return target;
}
export async function readCandidate(workspace: string, path: string): Promise<string> {
  const target = await scoped(workspace, path);
  const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > LIMIT) throw new Error('Candidate file limit or type rejected');
    const buffer = Buffer.alloc(LIMIT + 1); let length = 0;
    while (length < buffer.length) { const result = await file.read(buffer, length, buffer.length - length, null); if (!result.bytesRead) break; length += result.bytesRead; }
    if (length > LIMIT) throw new Error('Candidate file limit exceeded');
    return buffer.subarray(0, length).toString('utf8');
  } finally { await file.close(); }
}
export async function writeCandidate(workspace: string, path: string, content: string): Promise<void> {
  if (typeof content !== 'string' || Buffer.byteLength(content) > LIMIT) throw new Error('Candidate write limit exceeded');
  const target = await scoped(workspace, path);
  await mkdir(dirname(target), { recursive: true }); await rejectLinks(target);
  const temporary = join(dirname(target), `.company-${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
    await rejectLinks(target); await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
