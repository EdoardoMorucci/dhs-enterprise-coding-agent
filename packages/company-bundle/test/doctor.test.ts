import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { probeModelListing } from '../../../scripts/doctor.mjs';

async function modelServer(t: test.TestContext, handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer((request, response) => {
    if (request.url !== '/models' || request.headers.authorization !== 'Bearer local-test-value') {
      response.writeHead(400).end();
      return;
    }
    handler(request, response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  }));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { endpoint: `http://127.0.0.1:${address.port}`, model: 'configured/model', server };
}

// Catches rejecting a realistic public catalog solely because it exceeds 256 KiB.
test('model readiness accepts the configured id in a 770930-byte public catalog', async t => {
  const body = JSON.stringify({ data: [{ id: 'other/model', description: 'x'.repeat(770856) }, { id: 'configured/model' }] });
  assert.equal(Buffer.byteLength(body), 770930);
  const config = await modelServer(t, (_request, response) => response.writeHead(200, { 'Content-Type': 'application/json' }).end(body));
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, true, result.detail);
  assert.match(result.detail, /tool-use inference remains unqualified/);
});

// Catches buffering to completion, counting characters instead of bytes, or leaving the stream open.
test('model readiness cancels an oversized chunked UTF-8 catalog before the server finishes', { timeout: 5000 }, async t => {
  const disconnected = Promise.withResolvers<void>();
  let bytesSent = 0;
  const config = await modelServer(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"data":[{"id":"configured/model","description":"');
    const chunk = Buffer.from('é'.repeat(32768));
    const writer = setInterval(() => {
      bytesSent += chunk.byteLength;
      response.write(chunk);
      if (bytesSent === 3 * 1024 * 1024) {
        clearInterval(writer);
        response.end('"}]}');
      }
    }, 10);
    response.on('close', () => {
      clearInterval(writer);
      disconnected.resolve();
    });
  });
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.match(result.detail, /Model listing exceeds limit/);
  await disconnected.promise;
  assert.ok(bytesSent < 3 * 1024 * 1024, 'the producer must be disconnected while the catalog is still streaming');
});

// Catches accepting a related id or silently treating every successful HTTP response as ready.
test('model readiness requires an exact configured model id', async t => {
  const config = await modelServer(t, (_request, response) => response.end('{"data":[{"id":"configured/model-v2"}]}'));
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.match(result.detail, /not present/);
});

// Catches accepting a model embedded in a provider error response.
test('model readiness reports HTTP errors even when the body includes the configured id', async t => {
  const config = await modelServer(t, (_request, response) => response.writeHead(401).end('{"data":[{"id":"configured/model"}]}'));
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.match(result.detail, /HTTP 401/);
});

// Catches treating malformed provider data as a successful catalog.
test('model readiness reports malformed catalog JSON', async t => {
  const config = await modelServer(t, (_request, response) => response.end('{"data":'));
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.match(result.detail, /Configured endpoint unavailable:/);
});

// Catches following a redirect and forwarding the configured credential to another endpoint.
test('model readiness rejects redirects without requesting the destination', async t => {
  let destinationRequested = false;
  const destination = await modelServer(t, (_request, response) => response.end('{"data":[{"id":"configured/model"}]}'));
  destination.server.on('request', () => { destinationRequested = true; });
  const config = await modelServer(t, (_request, response) => response.writeHead(302, { Location: `${destination.endpoint}/models` }).end());
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.equal(destinationRequested, false);
});

// Catches dropping the existing deadline while replacing response.text() with streaming reads.
test('model readiness times out while waiting for a catalog body', { timeout: 6500 }, async t => {
  const config = await modelServer(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{"data":[');
  });
  const result = await probeModelListing(config, 'local-test-value');
  assert.equal(result.ready, false);
  assert.match(result.detail, /abort|timeout|timed out/i);
});
