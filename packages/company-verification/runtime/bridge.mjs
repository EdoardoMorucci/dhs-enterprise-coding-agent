// Behavior plumbing only. All assertions and expected outcomes stay in the host.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const module = await import(pathToFileURL(process.argv[2]).href);
let store;
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const request = JSON.parse(line);
  try {
    let value;
    if (request.op === 'new') {
      store = await module.createOrderStore();
      value = null;
    } else if (request.op === 'create') {
      value = await store.create(request.input);
      if (request.loseResponse) {
        // The operation committed but its transport response was lost.
        process.stdout.write(JSON.stringify({ id: request.id, ok: false, error: 'response-timeout-after-commit' }) + '\n');
        continue;
      }
    } else if (request.op === 'list') {
      value = await store.list();
    } else {
      throw new Error('Unknown operation');
    }
    process.stdout.write(JSON.stringify({ id: request.id, ok: true, value }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ id: request.id, ok: false, error: String(error?.message ?? error).slice(0, 512) }) + '\n');
  }
}
