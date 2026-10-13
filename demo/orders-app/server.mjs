import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrderStore } from './orders.mjs';

export function createOrdersServer() {
  const store = createOrderStore();
  const timedOut = new Set();
  return createServer(async (request, response) => {
    function json(status, data) {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    }
    if (request.method === 'GET' && request.url === '/') {
      try {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(await readFile(new URL('./index.html', import.meta.url)));
      } catch { json(500, { error: 'Demo page unavailable' }); }
      return;
    }
    if (request.url !== '/api/orders') { json(404, { error: 'Not found' }); return; }
    if (request.method === 'GET') { json(200, store.list()); return; }
    if (request.method !== 'POST') { json(405, { error: 'Use GET or POST' }); return; }
    try {
      let text = '';
      for await (const chunk of request) {
        text += chunk.toString('utf8');
        if (Buffer.byteLength(text) > 8192) { json(413, { error: 'Request too large' }); return; }
      }
      const input = JSON.parse(text);
      const order = await store.create(input);
      if (request.headers['x-demo-timeout'] === 'true' && !timedOut.has(input.requestId)) {
        timedOut.add(input.requestId);
        json(504, { error: 'Simulated response timeout after commit. Retry the same request identifier.' });
        return;
      }
      json(201, order);
    } catch (error) { json(400, { error: String(error.message ?? error) }); }
  });
}

export function startOrdersServer(port = 3000) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const server = createOrdersServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Orders demo: http://127.0.0.1:${server.address().port} (memory only)`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startOrdersServer(Number(process.env.PORT ?? 3000));
}
