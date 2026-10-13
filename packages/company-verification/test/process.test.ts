import assert from 'node:assert/strict';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { CandidateProcess } from '../src/process.ts';

test('late candidate crash is surfaced by finalization after a valid response', async () => {
  const script = `
    process.stdin.once('data', chunk => {
      const { id } = JSON.parse(chunk);
      process.stdout.write(JSON.stringify({ id, ok: true, value: null }) + '\\n', () => process.exit(7));
    });
  `;
  const candidate = new CandidateProcess(process.execPath, ['-e', script], tmpdir(), 3000);
  const exited = once(candidate.child, 'exit');
  assert.deepEqual(await candidate.call('new'), { id: 1, ok: true, value: null });
  await exited;
  await assert.rejects(candidate.stop(), /Candidate exited: 7/);
});

test('late output limit failure is surfaced by finalization after a valid response', async () => {
  const script = `
    process.stdin.once('data', chunk => {
      const { id } = JSON.parse(chunk);
      process.stdout.write(JSON.stringify({ id, ok: true, value: null }) + '\\n');
      setTimeout(() => process.stderr.write('x'.repeat(70 * 1024)), 50);
    });
  `;
  const candidate = new CandidateProcess(process.execPath, ['-e', script], tmpdir(), 3000);
  try {
    assert.deepEqual(await candidate.call('new'), { id: 1, ok: true, value: null });
    let bytes = 0;
    await new Promise<void>(resolve => candidate.child.stderr.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes >= 70 * 1024) resolve();
    }));
    await assert.rejects(candidate.stop(), /output limit/i);
  } finally { await candidate.stop().catch(() => {}); }
});
