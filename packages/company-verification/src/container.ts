import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

export type HostIdentity = { platform: string; uid?: number | undefined; gid?: number | undefined };
export type WorkerIdentity = { policy: 'linux-host' | 'windows-desktop'; uid: number; gid: number };
export const currentHostIdentity = (): HostIdentity => ({ platform: process.platform, uid: process.getuid?.(), gid: process.getgid?.() });
export function selectWorkerIdentity(host: HostIdentity): WorkerIdentity {
  if (host.platform === 'win32') return { policy: 'windows-desktop', uid: 10001, gid: 10001 };
  if (host.platform !== 'linux' || !Number.isSafeInteger(host.uid) || !Number.isSafeInteger(host.gid) || host.uid! <= 0 || host.gid! <= 0 || host.uid! > 2147483647 || host.gid! > 2147483647) throw new Error('Container identity unsupported: use a non-root Linux host user with a non-root primary group, or Windows Docker Desktop');
  return { policy: 'linux-host', uid: host.uid!, gid: host.gid! };
}
export function assertPosixPermission(stat: { uid: number; gid: number; mode: number }, identity: WorkerIdentity, required: number, credential: boolean): void {
  const bits = stat.uid === identity.uid ? (stat.mode >> 6) & 7 : stat.gid === identity.gid ? (stat.mode >> 3) & 7 : stat.mode & 7;
  if (credential && (stat.uid !== identity.uid || (stat.mode & 0o077) !== 0)) throw new Error('Native credential must be private and owned by the non-root host user (owner-readable 0600 or 0400); do not make it world-readable');
  if ((bits & required) !== required) throw new Error(`Container bind permission incompatible with worker ${identity.uid}:${identity.gid}; run as the candidate owner and grant required owner access`);
}
/** Metadata-only preflight; never reads credential values or changes source permissions. */
export async function checkBindPermissions(path: string, identity: WorkerIdentity, role: 'writer' | 'reviewer' | 'credential'): Promise<void> {
  let count = 0;
  const visit = async (entry: string): Promise<void> => {
    const stat = await lstat(entry); if (++count > 513 || stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Container bind metadata unavailable or unsupported');
    if (stat.isFile() && stat.nlink !== 1) throw new Error('Hardlink bind input rejected');
    // Desktop ACL projection differs, but link/special-file rejection applies on every host.
    if (identity.policy === 'linux-host') assertPosixPermission(stat, identity, stat.isDirectory() ? role === 'writer' ? 7 : 5 : role === 'writer' ? 6 : 4, role === 'credential');
    if (stat.isDirectory()) for (const name of await readdir(entry)) await visit(join(entry, name));
  };
  await visit(path);
}

/** Bind ownership is supported only for local rootful Linux and Windows Desktop. */
export function assertDockerIdentity(endpoint: unknown, override: string | undefined, securityOptions: unknown, identity: WorkerIdentity): void {
  if (typeof endpoint !== 'string' || !/^(unix:\/\/|npipe:\/\/)/.test(endpoint) || (override && !/^(unix:\/\/|npipe:\/\/)/.test(override))) throw new Error('Remote Docker contexts are unsupported');
  if (!(identity.policy === 'linux-host' ? /^unix:\/\// : /^npipe:\/\//).test(override ?? endpoint)) throw new Error('Container identity requires local rootful Linux Docker or Windows Docker Desktop named-pipe transport');
  if (!Array.isArray(securityOptions) || !securityOptions.every(value => typeof value === 'string') || securityOptions.some(value => /rootless|userns/i.test(value))) throw new Error('Rootless or user-namespace Docker mapping is unsupported for bind permissions; use local rootful Docker as a non-root host user');
}

async function dockerMetadata(args: string[]): Promise<unknown> {
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'USERPROFILE', 'HOME'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  try {
    const result = await promisify(execFile)('docker', args, { env, windowsHide: true, timeout: 10000, killSignal: 'SIGKILL', maxBuffer: 65536 });
    return JSON.parse(result.stdout);
  } catch { throw new Error('Docker identity mapping information unavailable; check the local rootful Docker context'); }
}

export async function verificationIdentity(snapshot: string, bridge: string): Promise<WorkerIdentity> {
  const identity = selectWorkerIdentity(currentHostIdentity());
  await checkBindPermissions(snapshot, identity, 'reviewer');
  await checkBindPermissions(bridge, identity, 'reviewer');
  const context = await dockerMetadata(['context', 'inspect']) as { Endpoints?: { docker?: { Host?: string } } }[];
  const security = await dockerMetadata(['info', '--format', '{{json .SecurityOptions}}']);
  assertDockerIdentity(context?.[0]?.Endpoints?.docker?.Host, process.env.DOCKER_HOST, security, identity);
  return identity;
}

export function verificationDockerArguments(options: { snapshot: string; bridge: string; name: string; image: string }, identity: WorkerIdentity): string[] {
  if ([options.snapshot, options.bridge].some(path => /[,\r\n\0]/.test(path))) throw new Error('Unsupported verification mount path');
  return [
    'run', '--rm', '--pull=never', '--name', options.name, '-i',
    '--network=none', '--read-only', `--user=${identity.uid}:${identity.gid}`, '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=64', '--memory=128m', '--cpus=0.5',
    '--mount', `type=bind,source=${options.snapshot},target=/candidate,readonly,bind-recursive=disabled`,
    '--mount', `type=bind,source=${options.bridge},target=/bridge.mjs,readonly,bind-recursive=disabled`,
    '--workdir=/candidate', options.image, 'node', '/bridge.mjs', '/candidate/orders.mjs'
  ];
}
