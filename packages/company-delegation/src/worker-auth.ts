import { Service, type Context } from '@deepseek-ai/cordis';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
declare module '@deepseek-ai/cordis' { interface Context { nativeWorkerAuth: NativeWorkerAuth; } }
export const name = 'native-worker-auth';
class NativeWorkerAuth extends Service {
  env: Record<string, string> = {};
  available = false;
  redact = (text: string): string => text;
  constructor(ctx: Context) { super(ctx, 'nativeWorkerAuth'); }
}
export async function apply(ctx: Context, config: { provider: 'codex' | 'claude-code' }): Promise<void> {
  const service = new NativeWorkerAuth(ctx);
  // No ambient authentication discovery: exactly one caller-selected file, mounted read-only by the host.
  const file = process.env.NATIVE_WORKER_AUTH_FILE ?? '/run/native-auth.json';
  try {
    const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > 16384) return;
    const auth = JSON.parse(await readFile(file, 'utf8')) as { kind: string; value: string };
    if (typeof auth.value !== 'string' || !auth.value.trim() || auth.value.length > 12000 || /[\r\n\0]/.test(auth.value)) return;
    service.redact = text => text.split(auth.value).join('[REDACTED]');
    const home = process.env.NATIVE_WORKER_HOME!; if (!home) return;
    const nativeHome = join(home, 'native-home'); await mkdir(nativeHome, { recursive: true, mode: 0o700 });
    service.env = { HOME: nativeHome, USERPROFILE: nativeHome };
    if (config.provider === 'claude-code') {
      const variable = auth.kind === 'api-key' ? 'ANTHROPIC_API_KEY' : auth.kind === 'oauth-token' ? 'CLAUDE_CODE_OAUTH_TOKEN' : undefined;
      if (!variable) return; service.env[variable] = auth.value; service.available = true; return;
    }
    if (auth.kind !== 'api-key') return;
    const codexHome = join(nativeHome, 'codex'); await mkdir(codexHome, { recursive: true, mode: 0o700 }); service.env.CODEX_HOME = codexHome;
    await writeFile(join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\nsandbox_mode = "workspace-write"\napproval_policy = "never"\n', { mode: 0o600 });
    const require = createRequire(import.meta.url), bin = require.resolve('@openai/codex/bin/codex.js');
    // Official Codex login reads the explicit key from stdin and persists it only in isolated tmpfs CODEX_HOME.
    service.available = await new Promise<boolean>(resolve => {
      const child = spawn(process.execPath, [bin, 'login', '--with-api-key'], { env: { PATH: process.env.PATH, ...service.env }, windowsHide: true, shell: false, stdio: ['pipe', 'ignore', 'ignore'] });
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000); child.stdin.on('error', () => {});
      child.once('error', () => { clearTimeout(timer); resolve(false); }); child.once('close', code => { clearTimeout(timer); resolve(code === 0); }); child.stdin.end(auth.value + '\n');
    });
  } catch { service.available = false; service.env = {}; }
}
