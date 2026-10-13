import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { UncertainOutcome, type WorkerCall, type WorkerResult } from './index.ts';
import { parseRequest, parseTerminal, type WorkerRequest } from './protocol.ts';
import { assertDockerIdentity, checkBindPermissions, currentHostIdentity, selectWorkerIdentity, type HostIdentity, type WorkerIdentity } from './identity.ts';
export { parseTerminal } from './protocol.ts';
export type DockerConfig = { image: string; writerCredential: string; reviewerCredential: string; timeoutMs?: number };
export type Transport = (args: string[], input?: string, signal?: AbortSignal, timeoutMs?: number) => Promise<{ code: number; stdout: string }>;
/** Discard raw stderr. Process loss never proves a container has stopped. */
export const dockerCommand: Transport = async (args, input, signal, timeoutMs = 10000) => new Promise((resolveResult, reject) => {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG'];
  const env = Object.fromEntries(allowed.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const child = spawn('docker', args, { shell: false, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', bytes = 0, stderrBytes = 0, settled = false, stopped = false;
  const finish = (code: number) => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(reap); signal?.removeEventListener('abort', stop); resolveResult({ code: stopped ? -1 : code, stdout }); };
  let reap: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { stopped = true; child.kill('SIGKILL'); reap ??= setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(-1); }, 1000); };
  const timer = setTimeout(stop, timeoutMs); signal?.addEventListener('abort', stop, { once: true });
  child.stdout.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 131072) stop(); else stdout += data.toString('utf8'); });
  child.stderr.on('data', (data: Buffer) => { stderrBytes += data.length; if (stderrBytes > 65536) stop(); });
  child.stdin.on('error', () => {}); child.once('error', () => { if (!settled) { finish(-1); } }); child.once('close', code => finish(code ?? -1));
  if (signal?.aborted) stop(); else child.stdin.end(input ?? '');
});
const contains = (parent: string, child: string) => { const part = relative(parent, child); return !part || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep)); };
async function canonical(path: string, file: boolean): Promise<string> {
  if (typeof path !== 'string' || !isAbsolute(path) || /[,\r\n\0]/.test(path)) throw new Error('Explicit absolute native mount path required');
  let cursor = resolve(path);
  for (;;) { const info = await lstat(cursor); if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1)) throw new Error('Linked native mount rejected'); const parent = dirname(cursor); if (parent === cursor) break; cursor = parent; }
  const info = await lstat(path); if (file ? !info.isFile() || info.size < 1 || info.size > 16384 : !info.isDirectory()) throw new Error('Native credential file or workspace unavailable');
  return realpath(path);
}
type Inspection = { Name: string; Image: string; Config: { User: string; Labels: Record<string, string> }; HostConfig: { ReadonlyRootfs: boolean; Privileged: boolean; CapDrop: string[]; SecurityOpt: string[]; NetworkMode: string; PidMode: string; IpcMode: string; Devices: unknown[] | null; Binds: unknown[] | null; Tmpfs: Record<string, string> }; Mounts: { Type: string; Source: string; Destination: string; RW: boolean }[]; State: { Running: boolean; Status: string; ExitCode: number; OOMKilled: boolean; Error: string } };
export class DockerAdapter {
  readonly identity: { image: string; writerCredential: string; reviewerCredential: string; workerIdentity: WorkerIdentity };
  constructor(readonly config: DockerConfig, private readonly command: Transport = dockerCommand, host: HostIdentity = currentHostIdentity()) {
    if (!/^(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}$/.test(config.image)) throw new Error('Native image must be an immutable sha256 identity');
    if (config.timeoutMs !== undefined && (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 1800000)) throw new Error('Invalid native deadline');
    this.identity = { image: config.image, writerCredential: config.writerCredential, reviewerCredential: config.reviewerCredential, workerIdentity: selectWorkerIdentity(host) };
  }
  private async localImage(signal?: AbortSignal): Promise<string> {
    const context = await this.command(['context', 'inspect'], undefined, signal); if (context.code !== 0) throw new Error('Local Docker context unavailable');
    const endpoint = JSON.parse(context.stdout)?.[0]?.Endpoints?.docker?.Host;
    const security = await this.command(['info', '--format', '{{json .SecurityOptions}}'], undefined, signal);
    if (security.code !== 0) throw new Error('Docker identity mapping information unavailable');
    assertDockerIdentity(endpoint, process.env.DOCKER_HOST, JSON.parse(security.stdout), this.identity.workerIdentity);
    const inspected = await this.command(['image', 'inspect', this.config.image], undefined, signal);
    if (inspected.code !== 0) throw new Error('Pinned Linux native worker image unavailable; build and select its immutable identity');
    const image = JSON.parse(inspected.stdout)?.[0];
    if (image?.Os !== 'linux' || !/^sha256:[a-f0-9]{64}$/.test(image.Id ?? '') || (this.config.image !== image.Id && !image.RepoDigests?.includes(this.config.image))) throw new Error('Native image identity mismatch');
    return image.Id;
  }
  async preflight(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    for (const credential of [this.config.writerCredential, this.config.reviewerCredential]) await checkBindPermissions(await canonical(credential, true), this.identity.workerIdentity, 'credential');
    await this.localImage(signal);
  }
  private async inspect(name: string): Promise<Inspection> {
    const result = await this.command(['inspect', name]); if (result.code !== 0) throw new UncertainOutcome('Container inspect unavailable; reconciliation required');
    const value = JSON.parse(result.stdout); if (!Array.isArray(value) || value.length !== 1 || value[0]?.Name !== '/' + name) throw new UncertainOutcome('Container identity uncertain'); return value[0] as Inspection;
  }
  private validate(info: Inspection, call: WorkerCall, image: string, cwd: string, auth: string): void {
    const host = info.HostConfig;
    const { uid, gid } = this.identity.workerIdentity;
    const expected = [{ path: cwd, target: '/workspace', rw: call.role === 'writer' }, { path: auth, target: '/run/native-auth.json', rw: false }];
    if (info.Image !== image || info.Config.User !== `${uid}:${gid}` || info.Config.Labels?.['company.run'] !== call.runId || !host.ReadonlyRootfs || host.Privileged || host.CapDrop?.length !== 1 || host.CapDrop[0] !== 'ALL' || !host.SecurityOpt?.includes('no-new-privileges') || host.NetworkMode !== 'bridge' || host.PidMode || host.IpcMode !== 'private' || host.Devices?.length || host.Binds?.length || Object.keys(host.Tmpfs ?? {}).join(',') !== '/tmp' || !host.Tmpfs['/tmp']?.split(',').includes(`uid=${uid}`) || !host.Tmpfs['/tmp']?.split(',').includes(`gid=${gid}`) || info.Mounts.length !== 2) throw new Error('Native container isolation mismatch');
    for (const entry of expected) {
      const mount = info.Mounts.find(item => item.Destination === entry.target);
      // Docker Desktop reports canonical Windows sources as host paths or /run/desktop/mnt/host/<drive>/... .
      const source = mount?.Source.replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//i, (_all, drive: string) => drive.toUpperCase() + ':/');
      if (!mount || mount.Type !== 'bind' || !source || resolve(source).toLowerCase() !== resolve(entry.path).toLowerCase() || mount.RW !== entry.rw) throw new Error('Native container mount isolation mismatch');
    }
  }
  private async converge(name: string): Promise<Inspection> {
    let state = await this.inspect(name);
    if (state.State.Running) { await this.command(['stop', '--time', '3', name]); state = await this.inspect(name); }
    if (state.State.Running) { await this.command(['kill', name]); state = await this.inspect(name); }
    if (state.State.Running || !['created', 'exited', 'dead'].includes(state.State.Status)) throw new UncertainOutcome('Container exit uncertain; reconciliation required');
    return state;
  }
  async reconcile(runId: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid reconciliation id');
    await this.localImage(); const name = `company-native-${runId}`;
    // A missing container alone cannot establish what the writer changed. The caller still captures the current digest and requires explicit operator acknowledgement.
    const list = await this.command(['container', 'ls', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']);
    if (list.code !== 0) throw new UncertainOutcome('Docker reconciliation unavailable');
    if (!list.stdout.trim()) return;
    if (list.stdout.trim() !== name) throw new UncertainOutcome('Docker reconciliation identity mismatch');
    const info = await this.inspect(name); if (info.Config.Labels?.['company.run'] !== runId) throw new UncertainOutcome('Docker reconciliation label mismatch');
    await this.converge(name); const result = await this.command(['rm', name]); if (result.code !== 0) throw new UncertainOutcome('Container removal uncertain');
  }
  async run(call: WorkerCall): Promise<WorkerResult> {
    call.signal.throwIfAborted(); const request: WorkerRequest = parseRequest(JSON.stringify({ protocol: 1, runId: call.runId, provider: call.provider, role: call.role, brief: call.brief }));
    const cwd = await canonical(call.cwd, false), auth = await canonical(call.role === 'writer' ? this.config.writerCredential : this.config.reviewerCredential, true);
    // Check both references against writer candidate, not just the currently selected credential.
    for (const selected of [this.config.writerCredential, this.config.reviewerCredential]) if (contains(cwd, await canonical(selected, true))) throw new Error('Native credential must be outside the candidate and snapshot');
    const { uid, gid } = this.identity.workerIdentity;
    await checkBindPermissions(cwd, this.identity.workerIdentity, call.role);
    await checkBindPermissions(auth, this.identity.workerIdentity, 'credential');
    const image = await this.localImage(call.signal), name = `company-native-${call.runId}`;
    const deadline = new AbortController(); const timer = setTimeout(() => deadline.abort(), this.config.timeoutMs ?? 300000); const signal = AbortSignal.any([call.signal, deadline.signal]);
    let attempted = false, result: WorkerResult | undefined, failed: unknown;
    try {
      signal.throwIfAborted(); attempted = true;
      const created = await this.command(['create', '--pull=never', '--name', name, '--label', `company.run=${call.runId}`, '--interactive', '--init', '--read-only', '--user', `${uid}:${gid}`, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--network', 'bridge', '--ipc', 'private', '--pids-limit', '128', '--memory', '1g', '--cpus', '2', '--tmpfs', `/tmp:rw,nosuid,nodev,size=256m,uid=${uid},gid=${gid}`, '--mount', `type=bind,source=${cwd},target=/workspace,${call.role === 'reviewer' ? 'readonly,' : ''}bind-recursive=disabled`, '--mount', `type=bind,source=${auth},target=/run/native-auth.json,readonly,bind-recursive=disabled`, '--workdir', '/workspace', this.config.image, call.provider], undefined, signal);
      if (created.code !== 0) throw new Error('Native container create failed');
      this.validate(await this.inspect(name), call, image, cwd, auth); signal.throwIfAborted();
      const completed = await this.command(['start', '--attach', '--interactive', name], JSON.stringify(request) + '\n', signal, this.config.timeoutMs ?? 300000);
      signal.throwIfAborted(); if (completed.code !== 0) throw new Error('Native worker process failed');
      result = parseTerminal(completed.stdout, request);
    } catch (error) { failed = error; }
    finally {
      clearTimeout(timer);
      if (attempted) try {
        const info = await this.converge(name);
        if (info.State.OOMKilled || info.State.Error || info.State.ExitCode !== 0 || info.State.Status !== 'exited') failed ??= new Error('Native worker exit was not successful');
        // Persist observed exit before removal. Missing containers after a crash still need operator reconciliation.
        await call.settled?.();
        const removed = await this.command(['rm', name]); if (removed.code !== 0) throw new Error('Container removal failed');
      } catch { throw new UncertainOutcome('Native container cleanup uncertain; explicit host reconciliation required'); }
    }
    if (failed) throw failed; if (!result) throw new Error('Native worker missing terminal result'); return result;
  }
}
