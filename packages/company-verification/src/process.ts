import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type Reply = { ok: boolean; value?: unknown; error?: string };
type Pending = { id: number; resolve(reply: Reply): void; reject(error: Error): void };
const OUTPUT_LIMIT = 64 * 1024;

/** Internal cleanup seam; only observed exit zero confirms termination. */
export async function boundedCleanupCommand(command: string, args: string[], timeoutMs = 10000): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); resolve(false); });
    child.once('close', code => { clearTimeout(timer); resolve(code === 0); });
  });
}

export class CandidateProcess {
  readonly child: ChildProcessWithoutNullStreams;
  private pending: Pending | undefined;
  private failure: Error | undefined;
  private buffer = '';
  private outputBytes = 0;
  private nextId = 0;
  private shutdownRequested = false;
  private dockerShutdownRequested = false;
  private readonly timer: NodeJS.Timeout;
  private readonly closed: Promise<void>;

  constructor(command: string, args: string[], cwd: string, timeoutMs: number) {
    this.child = spawn(command, args, {
      cwd, stdio: 'pipe', windowsHide: true, detached: process.platform !== 'win32',
      // Do not forward credentials, NODE_OPTIONS or candidate-controlled module paths.
      env: Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'USERPROFILE', 'HOME'].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []))
    });
    this.closed = new Promise(resolve => this.child.once('close', () => resolve()));
    this.timer = setTimeout(() => this.fail(new Error('Candidate timeout exceeded')), timeoutMs);
    this.child.once('error', error => this.fail(error));
    this.child.once('exit', (code, signal) => {
      const expectedHostExit = this.shutdownRequested && (
        signal === 'SIGKILL' ||
        (process.platform === 'win32' && code === 1) ||
        (this.dockerShutdownRequested && (code === 0 || code === 137))
      );
      if (!expectedHostExit) this.fail(new Error(`Candidate exited: ${code ?? signal}`));
    });
    this.child.stdin.on('error', error => this.fail(error));
    this.child.stderr.on('data', (chunk: Buffer) => this.countOutput(chunk));
    this.child.stdout.on('data', (chunk: Buffer) => {
      if (!this.countOutput(chunk)) return;
      this.buffer += chunk.toString('utf8');
      while (this.buffer.includes('\n')) {
        const newline = this.buffer.indexOf('\n');
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (!this.pending || message.id !== this.pending.id || typeof message.ok !== 'boolean' ||
              (!message.ok && typeof message.error !== 'string') ||
              (message.ok && !Object.hasOwn(message, 'value'))) throw new Error('Unexpected candidate protocol output');
          const pending = this.pending;
          this.pending = undefined;
          pending.resolve(message as Reply);
        } catch {
          this.fail(new Error('Invalid candidate protocol output'));
          return;
        }
      }
    });
  }

  private countOutput(chunk: Buffer): boolean {
    this.outputBytes += chunk.length;
    if (this.outputBytes > OUTPUT_LIMIT) this.fail(new Error('Candidate output limit exceeded'));
    return !this.failure;
  }
  private fail(error: Error): void {
    this.failure ??= error;
    this.pending?.reject(this.failure);
    this.pending = undefined;
  }
  async call(op: 'new' | 'create' | 'list', input?: unknown, loseResponse = false): Promise<Reply> {
    if (this.failure) throw this.failure;
    if (this.pending) throw new Error('Concurrent candidate operations are unsupported');
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.child.stdin.write(JSON.stringify({ id, op, input, loseResponse }) + '\n');
    });
  }
  async stop(containerName?: string): Promise<void> {
    clearTimeout(this.timer);
    // Always remove the named container even if the Docker client has already exited.
    let dockerCleanupFailed = false;
    let treeCleanupFailed = false;
    if (containerName) {
      this.shutdownRequested = true;
      this.dockerShutdownRequested = true;
      dockerCleanupFailed = !await boundedCleanupCommand('docker', ['rm', '-f', containerName]);
    }
    if (process.platform === 'win32' && this.child.pid) {
      const running = this.child.exitCode === null && this.child.signalCode === null;
      this.shutdownRequested = true;
      treeCleanupFailed = !await boundedCleanupCommand('taskkill', ['/pid', String(this.child.pid), '/T', '/F']) && running;
    } else if (this.child.pid) {
      this.shutdownRequested = true;
      try { process.kill(-this.child.pid, 'SIGKILL'); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    this.child.kill('SIGKILL');
    await Promise.race([this.closed, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Candidate process cleanup timeout')), 3000);
      timer.unref();
    })]);
    if (dockerCleanupFailed) throw new Error('Docker container removal was not confirmed');
    if (treeCleanupFailed) throw new Error('Candidate process tree cleanup was not confirmed');
    if (this.buffer.length > 0) this.fail(new Error('Incomplete candidate protocol output'));
    // A resolved final RPC is not a verdict: drain/cleanup may still expose bad output or a crash.
    if (this.failure) throw this.failure;
  }
}
