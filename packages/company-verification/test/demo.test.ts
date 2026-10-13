import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Server } from 'node:http';

test('HTTP timeout happens after commit and retry exposes seed duplicate', async t => {
  const path = '../../../demo/orders-app/server.mjs';
  const module = await import(path).catch(() => ({})) as { createOrdersServer?: () => Server };
  assert.equal(typeof module.createOrdersServer, 'function', 'demo HTTP API must exist');
  const server = module.createOrdersServer!();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const body = JSON.stringify({ requestId: 'lost-1', customer: 'Ada', quantity: 2 });
  const first = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-timeout': 'true' }, body });
  assert.equal(first.status, 504);
  const committed = await (await fetch(`${base}/api/orders`)).json() as unknown[];
  assert.equal(committed.length, 1);
  const retry = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(retry.status, 201);
  assert.equal((await (await fetch(`${base}/api/orders`)).json() as unknown[]).length, 2);
  assert.equal((await fetch(`${base}/api/orders`, { method: 'POST', body: '{bad' })).status, 400);
  const html = await (await fetch(base)).text();
  assert.match(html, /<form/);
});

test('reset creates dedicated workspaces and preserves all existing files', async t => {
  const path = '../../../scripts/demo.mjs';
  const module = await import(path).catch(() => ({})) as { resetDemo?: (parent: string) => Promise<string> };
  assert.equal(typeof module.resetDemo, 'function', 'safe demo reset API must exist');
  const root = await mkdtemp(join(tmpdir(), 'company-demo-reset-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'keep.txt'), 'Do not delete');
  const first = await module.resetDemo!(root);
  await writeFile(join(first, 'orders.mjs'), 'user changes');
  const second = await module.resetDemo!(root);
  assert.notEqual(first, second);
  assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'Do not delete');
  assert.equal(await readFile(join(first, 'orders.mjs'), 'utf8'), 'user changes');
  assert.deepEqual((await readdir(second)).sort(), ['index.html', 'orders.mjs', 'server.mjs']);
});
