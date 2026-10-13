import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { configure, prepareProfile, runtimeBin, childEnvironment, boundedCommand } from '../../../scripts/company-agent.mjs';

// Deterministic OpenAI protocol fixture. This verifies the actual DSH adapter/loop,
// tool calls and stopping policy; it is explicitly NOT a live model qualification.
test('actual rc.2 CLI composition and deterministic protocol fixture invoke scoped tools with bounded completion', { timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'company-real-dsh-'));
  const requests: any[] = []; const sessionCalls = new Map<string, number>();
  const server = createServer(async (request, response) => {
    let data = ''; for await (const part of request) data += part;
    if (request.url === '/v1/models') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'deterministic-protocol-fixture' }] })); return; }
    const body = JSON.parse(data); requests.push(body);
    const noTask = JSON.stringify(body.messages).includes('chat-without-task');
    const key = noTask ? 'chat' : 'task'; const count = (sessionCalls.get(key) ?? 0) + 1; sessionCalls.set(key, count);
    const call = !noTask && count === 1 ? { name: 'company_task_start', arguments: JSON.stringify({ objective: 'Fixture repair', criteria: ['Host acceptance must pass'] }) }
      : !noTask && count === 2 ? { name: 'company_write_file', arguments: JSON.stringify({ path: 'note.txt', content: 'fixture-owned candidate text' }) }
      : !noTask && count === 3 ? { name: 'company_task_note', arguments: JSON.stringify({ kind: 'hypothesis', text: 'Persisted protocol investigation' }) }
      : !noTask && count === 4 ? { name: 'company_read_file', arguments: JSON.stringify({ path: '../escape' }) } : null;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `fixture-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: 'deterministic-protocol-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant', ...(call ? { tool_calls: [{ index: 0, id: `call-${count}`, type: 'function', function: call }] } : { content: noTask ? 'Fixture human chat.' : 'Fixture claims done without evidence.' }) });
    chunk({}, call ? 'tool_calls' : 'stop'); response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  let harness: DeepSeekHarness | undefined;
  try {
    const candidate = join(root, 'candidate with spaces'); await mkdir(candidate); await writeFile(join(candidate, 'orders.mjs'), 'export {};');
    const config = await configure({ root: join(root, 'data'), profile: 'internal', endpoint: `http://127.0.0.1:${port}/v1`, model: 'deterministic-protocol-fixture', apiKeyEnv: 'COMPANY_FIXTURE_KEY', workspace: candidate });
    const paths = await prepareProfile(join(root, 'data'), 'internal', config, true);
    const proof = join(root, 'guard-proof.json');
    await writeFile(paths.patch, `\n- insert:\n    - id: fixture-policy-probe\n      name: ${JSON.stringify(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/policy-probe.mjs').replaceAll('\\', '/'))}\n      config:\n        output: ${JSON.stringify(proof)}\n`, { flag: 'a' });
    const env = { ...childEnvironment(config, paths.home), COMPANY_FIXTURE_KEY: 'non-secret-protocol-fixture' };
    const dump = await boundedCommand(process.execPath, [runtimeBin(), '--profile', 'enterprise-fixture', '--from-default-profile', 'sdk', '--patch', paths.patch, '--dump-config'], { env, timeout: 30000 });
    assert.equal(dump.code, 0, dump.stderr); assert.match(dump.stdout, /company_task|company-bundle/);
    harness = new DeepSeekHarness({ dshBin: runtimeBin(), profile: 'enterprise-fixture', patches: [paths.patch], dshHome: paths.home, processCwd: paths.base, cwd: candidate, provider: 'local', model: config.model, env, initializeTimeoutMs: 60000, requestTimeoutMs: 45000 });
    const diagnosticClient = harness.client;
    try { await harness.start(); } catch (error) { console.error('DSH fixture diagnostics:', (diagnosticClient as any).stderrTail); throw error; }
    const task = await harness.run('task-fixture: exercise the deterministic company flow');
    assert.deepEqual((harness.client as any).stderrTail, [], 'actual runtime must activate the company plugin without warnings');
    assert.ok(task.events.length > 0); assert.equal(await readFile(join(candidate, 'note.txt'), 'utf8'), 'fixture-owned candidate text');
    assert.equal(sessionCalls.get('task'), 7, 'four tool requests, initial stop, then exactly two repair stops');
    const files = await readdir(join(paths.state, 'tasks'));
    const state = JSON.parse(await readFile(join(paths.state, 'tasks', files.find(name => name.endsWith('.json'))!), 'utf8'));
    assert.equal(state.phase, 'needs_review'); assert.equal(state.attempts, 0); assert.match(state.pendingChecks.join(' '), /limit reached/);
    assert.deepEqual(state.hypotheses, ['Persisted protocol investigation']);
    const chat = await harness.run('chat-without-task'); assert.match(chat.finalResponse, /human chat/); assert.equal(sessionCalls.get('chat'), 1);
    const guardProof = JSON.parse(await readFile(proof, 'utf8')); assert.equal(guardProof.executed, false); assert.match(JSON.stringify(guardProof.result), /Enterprise profile permits only/);
    const before = requests.length; await harness.run('reject-by-host-fixture'); assert.equal(requests.length, before, 'company middleware must preserve other host rejection');
    for (const request of requests) {
      const names = request.tools.map((tool: any) => tool.function.name);
      assert.equal(names.length, 7); assert.ok(names.every((name: string) => name.startsWith('company_')), names.join(','));
    }
    assert.ok(requests.some(request => JSON.stringify(request.messages).includes('Reserved or escaping candidate path')));
    assert.ok(requests.some(request => JSON.stringify(request.messages).includes('Fixture repair')));
  } finally { await harness?.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
