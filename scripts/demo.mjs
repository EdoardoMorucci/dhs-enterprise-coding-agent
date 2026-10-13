import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Reset is additive. Each run creates a fresh dedicated directory; it deletes nothing.
export async function resetDemo(parent = resolve('.company-agent/demo-workspaces')) {
  await mkdir(parent, { recursive: true });
  const workspace = await mkdtemp(join(resolve(parent), 'orders-'));
  for (const name of ['orders.mjs', 'server.mjs', 'index.html']) {
    await cp(new URL(`../demo/orders-app/${name}`, import.meta.url), join(workspace, name));
  }
  return workspace;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, workspace] = process.argv.slice(2).filter(value => value !== '--');
  if (command === 'reset') {
    console.log(JSON.stringify({ workspace: await resetDemo(workspace) }));
  } else if (command === 'start' && workspace) {
    const module = await import(pathToFileURL(join(resolve(workspace), 'server.mjs')).href);
    module.startOrdersServer(Number(process.env.PORT ?? 3000));
  } else {
    console.error('Usage: pnpm demo:reset [parent-directory] | pnpm demo:start <workspace>');
    process.exitCode = 1;
  }
}
