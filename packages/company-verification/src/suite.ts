import assert from 'node:assert/strict';
import type { CandidateProcess, Reply } from './process.ts';

export type VerificationCheck = { name: string; passed: boolean; detail?: string };
export const SUITE_VERSION = 'orders-v1';
function success(reply: Reply): unknown {
  assert.equal(reply.ok, true, reply.error);
  return reply.value;
}
function order(value: unknown, requestId: string, customer = 'Ada', quantity = 2): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  assert.ok(typeof record.id === 'string' && record.id.length > 0);
  assert.equal(record.requestId, requestId);
  assert.equal(record.customer, customer);
  assert.equal(record.quantity, quantity);
  return record;
}
export async function runHostSuite(candidate: CandidateProcess): Promise<VerificationCheck[]> {
  const input = { requestId: 'req-1', customer: 'Ada', quantity: 2 };
  const cases: Array<[string, () => Promise<void>]> = [
    ['normal-order', async () => {
      const first = order(success(await candidate.call('create', input)), 'req-1');
      assert.deepEqual(success(await candidate.call('list')), [first]);
    }],
    ['retry-after-timeout', async () => {
      const lost = await candidate.call('create', input, true);
      assert.equal(lost.ok, false);
      assert.equal(lost.error, 'response-timeout-after-commit');
      const committed = success(await candidate.call('list'));
      assert.ok(Array.isArray(committed));
      assert.equal(committed.length, 1);
      const original = order(committed[0], 'req-1');
      const retry = order(success(await candidate.call('create', input)), 'req-1');
      assert.deepEqual(retry, original);
      assert.deepEqual(success(await candidate.call('list')), [original]);
    }],
    ['distinct-requests', async () => {
      const first = order(success(await candidate.call('create', input)), 'req-1');
      const second = order(success(await candidate.call('create', { ...input, requestId: 'req-2' })), 'req-2');
      assert.notEqual(first.id, second.id);
      assert.deepEqual(success(await candidate.call('list')), [first, second]);
    }],
    ['validation', async () => {
      for (const invalid of [null, {}, { ...input, requestId: '' }, { ...input, requestId: 1 },
        { ...input, customer: ' ' }, { ...input, customer: 1 }, { ...input, quantity: 0 },
        { ...input, quantity: -1 }, { ...input, quantity: 1.5 }, { ...input, quantity: '2' },
        { ...input, quantity: Number.MAX_SAFE_INTEGER + 1 }]) {
        assert.equal((await candidate.call('create', invalid)).ok, false);
      }
      assert.deepEqual(success(await candidate.call('list')), []);
      order(success(await candidate.call('create', input)), 'req-1');
    }],
    ['conflicting-reuse', async () => {
      const first = order(success(await candidate.call('create', input)), 'req-1');
      assert.equal((await candidate.call('create', { ...input, customer: 'Grace' })).ok, false);
      assert.equal((await candidate.call('create', { ...input, quantity: 3 })).ok, false);
      assert.deepEqual(success(await candidate.call('list')), [first]);
      assert.deepEqual(success(await candidate.call('create', input)), first);
    }]
  ];
  const checks: VerificationCheck[] = [];
  for (const [name, check] of cases) {
    try {
      success(await candidate.call('new'));
      await check();
      checks.push({ name, passed: true });
    } catch (error) {
      checks.push({ name, passed: false, detail: String(error).slice(0, 1024) });
    }
  }
  return checks;
}
