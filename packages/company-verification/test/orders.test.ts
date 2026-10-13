import assert from 'node:assert/strict';
import { test } from 'node:test';

type Input = { requestId: string; customer: string; quantity: number };
type Order = Input & { id: string };
type Store = { create(input: unknown): Order; list(): Order[] };
async function store(reference = true): Promise<Store> {
  const path = reference ? '../../../verifier/reference/orders.mjs' : '../../../demo/orders-app/orders.mjs';
  const module = await import(path).catch(() => ({})) as { createOrderStore?: () => Store };
  assert.equal(typeof module.createOrderStore, 'function', 'createOrderStore API must exist');
  return module.createOrderStore!();
}
const input = { requestId: 'req-1', customer: 'Ada', quantity: 2 };

test('retry after response loss returns original committed order', async () => {
  const orders = await store();
  const committed = orders.create(input); // Commit happened; transport loses this response.
  const retry = orders.create(input);
  assert.deepEqual(retry, committed);
  assert.equal(orders.list().length, 1);
});
test('distinct request ids with identical payload remain distinct', async () => {
  const orders = await store();
  assert.notEqual(orders.create(input).id, orders.create({ ...input, requestId: 'req-2' }).id);
  assert.equal(orders.list().length, 2);
});
test('invalid requests never commit', async () => {
  const orders = await store();
  for (const bad of [null, {}, { ...input, requestId: '' }, { ...input, customer: ' ' },
    { ...input, quantity: 0 }, { ...input, quantity: -1 }, { ...input, quantity: 1.5 },
    { ...input, quantity: '2' }, { ...input, quantity: Infinity }]) {
    assert.throws(() => orders.create(bad));
  }
  assert.deepEqual(orders.list(), []);
});
test('conflicting request id reuse rejects without changing original', async () => {
  const orders = await store();
  const first = orders.create(input);
  assert.throws(() => orders.create({ ...input, customer: 'Grace' }));
  assert.throws(() => orders.create({ ...input, quantity: 3 }));
  assert.deepEqual(orders.list(), [first]);
});
test('callers cannot mutate committed state through returned objects', async () => {
  const orders = await store();
  const first = orders.create(input);
  first.quantity = 100;
  orders.list()[0]!.customer = 'Changed';
  assert.deepEqual(orders.create(input), { id: 'order-1', ...input });
});
test('buggy seed visibly duplicates a retry after commit', async () => {
  const orders = await store(false);
  assert.notEqual(orders.create(input).id, orders.create(input).id);
  assert.equal(orders.list().length, 2);
});
