import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const base = process.argv[2];
if (!/^node:24\.13\.0-bookworm-slim@sha256:[a-f0-9]{64}$/.test(base ?? '')) throw new Error('Provide node:24.13.0-bookworm-slim@sha256:<verified-base-digest> explicitly');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const result = spawnSync('docker', ['build', '--pull=false', '--build-arg', `NODE_IMAGE=${base}`, '--file', 'packages/company-delegation/runtime/Dockerfile', '--tag', 'company-native-worker:rc2', '.'], { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
process.exitCode = result.status ?? 1;
