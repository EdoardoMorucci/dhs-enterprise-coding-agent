import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type HostIdentity = { platform: string; uid?: number | undefined; gid?: number | undefined };
export type WorkerIdentity = { policy: 'linux-host' | 'windows-desktop'; uid: number; gid: number };
export const currentHostIdentity = (): HostIdentity => ({ platform: process.platform, uid: process.getuid?.(), gid: process.getgid?.() });
export function selectWorkerIdentity(host: HostIdentity): WorkerIdentity {
  if (host.platform === 'win32') return { policy: 'windows-desktop', uid: 10001, gid: 10001 };
  if (host.platform !== 'linux' || !Number.isSafeInteger(host.uid) || !Number.isSafeInteger(host.gid) || host.uid! <= 0 || host.gid! <= 0 || host.uid! > 2147483647 || host.gid! > 2147483647) throw new Error('Native identity unsupported: use a non-root Linux host user with a non-root primary group, or Windows Docker Desktop');
  return { policy: 'linux-host', uid: host.uid!, gid: host.gid! };
}
export function assertPosixPermission(stat: { uid: number; gid: number; mode: number }, identity: WorkerIdentity, required: number, credential: boolean): void {
  const bits = stat.uid === identity.uid ? (stat.mode >> 6) & 7 : stat.gid === identity.gid ? (stat.mode >> 3) & 7 : stat.mode & 7;
  if (credential && (stat.uid !== identity.uid || (stat.mode & 0o077) !== 0)) throw new Error('Native credential must be private and owned by the non-root host user (owner-readable 0600 or 0400); do not make it world-readable');
  if ((bits & required) !== required) throw new Error(`Native bind permission incompatible with worker ${identity.uid}:${identity.gid}; run as the candidate owner and grant required owner access`);
}
/** Metadata-only preflight; never reads credential values or changes source permissions. */
export async function checkBindPermissions(path: string, identity: WorkerIdentity, role: 'writer' | 'reviewer' | 'credential'): Promise<void> {
  // Docker Desktop projects Windows ACLs through its VM; POSIX host mode bits do not describe that mapping.
  if (identity.policy !== 'linux-host') return;
  let count = 0;
  const visit = async (entry: string): Promise<void> => {
    const stat = await lstat(entry); if (++count > 513 || stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Native bind metadata unavailable or unsupported');
    assertPosixPermission(stat, identity, stat.isDirectory() ? role === 'writer' ? 7 : 5 : role === 'writer' ? 6 : 4, role === 'credential');
    if (stat.isDirectory()) for (const name of await readdir(entry)) await visit(join(entry, name));
  };
  await visit(path);
}
