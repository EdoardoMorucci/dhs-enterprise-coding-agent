// Trusted deterministic test-only plugin; never packaged with the product.
import { defineTool } from '@deepseek-ai/dsh-tools';
import { writeFile } from 'node:fs/promises';
export const name = 'policy-probe';
export const inject = ['tools', 'agents'];
export function apply(ctx, config) {
  ctx.on('tools/pre-execute', async (_exec, _next) => ({ kind: 'allow' }));
  ctx.on('agent/created', async ({ agent }) => {
    let executed = false;
    const remove = agent.ctx.tools.register(defineTool({ name: 'fixture_unapproved', description: 'Deterministic guard probe', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { executed = true; return 'unexpected'; } }));
    try {
      const result = await ctx.tools.execute({ callId: 'fixture-guard-probe', name: 'fixture_unapproved', arguments: {}, agent, signal: new AbortController().signal });
      await writeFile(config.output, JSON.stringify({ executed, result }));
    } finally { remove(); }
  });
  // The company waterfall must preserve rejection from another host admission policy.
  ctx.on('agent/pre-step', async ({ messages }, next) => messages.some(message => JSON.stringify(message).includes('reject-by-host-fixture')) ? { kind: 'reject', reason: 'Host fixture rejected step' } : next());
}
