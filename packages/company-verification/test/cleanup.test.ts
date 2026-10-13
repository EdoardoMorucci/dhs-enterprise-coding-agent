import assert from 'node:assert/strict';
import test from 'node:test';

async function helper() {
  const api = await import('../src/process.ts');
  assert.equal(typeof (api as any).boundedCleanupCommand, 'function', 'bounded cleanup helper must expose its finite success contract for tests');
  return (api as any).boundedCleanupCommand as (command: string, args: string[], timeoutMs?: number) => Promise<boolean>;
}
test('cleanup accepts observed successful helper exit beyond the old three-second limit', async () => {
  const run = await helper();
  assert.equal(await run(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),3500)']), true);
});
test('cleanup timeout and nonzero exit never count as confirmed cleanup', async () => {
  const run = await helper();
  assert.equal(await run(process.execPath, ['-e', 'process.exit(7)']), false);
  const started = performance.now();
  assert.equal(await run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 100), false);
  assert.ok(performance.now() - started < 5000, 'timed-out helper must remain bounded');
});
