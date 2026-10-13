import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-system-prompt';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CompanyController, EXHAUSTED, type ControllerConfig } from './controller.ts';

declare module '@deepseek-ai/dsh-llm' { interface MessageSourceMap { company: { kind: 'company' }; } }
export const name = 'company';
export const inject = ['tools', 'agents', 'systemPrompt'];
export type Config = { stateRoot: string; workspace: string; knowledgeRoot: string; delegation?: ControllerConfig['delegation'] };
export const COMPANY_TOOLS = ['company_task_start', 'company_task_state', 'company_task_note', 'company_read_file', 'company_write_file', 'company_verify', 'company_finish'];
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!config.stateRoot || !config.workspace || !config.knowledgeRoot) throw new Error('Explicit company state, workspace and knowledge paths required');
  const knowledge = await Promise.all(['completion-contract.md', 'order-conventions.md'].map(async title => ({ title, text: await readFile(resolve(config.knowledgeRoot, title), 'utf8') })));
  const controller = new CompanyController({ ...config, knowledge });
  const allowedTools = [...COMPANY_TOOLS, ...(config.delegation ? ['company_delegate'] : [])];
  const session = (exec: ToolRunContext): string => { exec.signal.throwIfAborted(); if (!exec.agent) throw new Error('Company tools require an actual agent session'); return String(exec.agent.session.id); };
  const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] };
  ctx.tools.guard(exec => !allowedTools.includes(exec.name) ? 'Enterprise profile permits only scoped company tools' : undefined);
  if (config.delegation) ctx.tools.register(defineTool({ name: 'company_delegate', description: 'Sequential native Codex implementation, host verification, isolated Claude Code review and final host verification. Requires two remaining checks. Read review findings before deciding company_finish; native text does not approve completion.', parameters: {}, output,
    async execute(_args, exec) { return controller.serial(async () => JSON.stringify(await controller.delegate(session(exec), exec.signal))); } }));
  ctx.tools.register(defineTool({ name: 'company_task_start', description: 'Start this session task in the host-selected candidate. The host owns evidence and completion.', parameters: { objective: { type: 'string', required: true }, criteria: { type: 'array', required: true, items: { type: 'string' } } }, output,
    async execute(args, exec) { return controller.serial(async () => JSON.stringify(await controller.start(session(exec), args.objective, args.criteria))); } }));
  ctx.tools.register(defineTool({ name: 'company_task_state', description: 'Read fresh authoritative task state and evidence for this session.', parameters: {}, output,
    async execute(_args, exec) { return controller.serial(async () => JSON.stringify(await controller.hydrate(session(exec)))); } }));
  ctx.tools.register(defineTool({ name: 'company_task_note', description: 'Append one investigation hypothesis or pending check for this session; maximum 500 characters and 20 entries per list. Cannot change authority or clear host reasons.', parameters: { kind: { type: 'string', required: true, enum: ['hypothesis', 'pending_check'] }, text: { type: 'string', required: true } }, output,
    async execute(args, exec) { return controller.serial(async () => JSON.stringify(await controller.note(session(exec), args.kind, args.text))); } }));
  ctx.tools.register(defineTool({ name: 'company_read_file', description: 'Read one UTF-8 file relative to this task candidate; maximum 256 KiB.', parameters: { path: { type: 'string', required: true } }, output,
    async execute(args, exec) { return controller.serial(() => controller.read(session(exec), args.path)); } }));
  ctx.tools.register(defineTool({ name: 'company_write_file', description: 'Write one UTF-8 candidate file. Relative slash paths only; source edits invalidate evidence.', parameters: { path: { type: 'string', required: true }, content: { type: 'string', required: true } }, output,
    async execute(args, exec) { return controller.serial(async () => JSON.stringify(await controller.write(session(exec), args.path, args.content))); } }));
  ctx.tools.register(defineTool({ name: 'company_verify', description: 'Run host-owned isolated Docker acceptance checks; initial verification plus at most two repairs. Missing Docker is a failure.', parameters: {}, output,
    async execute(_args, exec) { return controller.serial(async () => JSON.stringify(await controller.verify(session(exec), exec.signal))); } }));
  ctx.tools.register(defineTool({ name: 'company_finish', description: 'Finish only after current passing Docker evidence. Text claims cannot establish completion.', parameters: {}, output,
    async execute(_args, exec) { return controller.serial(async () => { const state = await controller.finish(session(exec)); exec.concludeTurn(); return JSON.stringify(state); }); } }));
  ctx.systemPrompt.context({ name: 'company:task-state', order: 9000, text: ({ agent }) => agent ? controller.context(String(agent.session.id)) : '' });
  ctx.on('agent/created', async ({ agent }) => {
    agent.ctx.tools.restrict({ allow: allowedTools });
    await controller.serial(() => controller.hydrate(String(agent.session.id)));
  });
  const rounds = new Map<string, { turn: number; repairs: number; steps: number }>();
  ctx.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
    const decision = await next(); if (decision.kind === 'reject') return decision;
    signal.throwIfAborted(); const id = String(agent.session.id);
    const state = await controller.serial(() => controller.hydrate(id));
    let budget = rounds.get(id); if (!budget || budget.turn !== turn) { budget = { turn, repairs: 0, steps: 0 }; rounds.set(id, budget); }
    budget.steps++;
    if (state && budget.steps > 24) { await controller.serial(() => controller.exhaust(id)); return { kind: 'reject', reason: EXHAUSTED }; }
    return decision;
  });
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    if (signal.aborted) return;
    const id = String(agent.session.id); const state = await controller.serial(() => controller.hydrate(id));
    if (!state || state.phase === 'verified' || state.reconciliationRequired) return;
    const budget = rounds.get(id) ?? { turn, repairs: 0, steps: 0 }; rounds.set(id, budget);
    if (budget.repairs >= 2 || state.attempts >= 3 || state.pendingChecks.includes(EXHAUSTED)) { await controller.serial(() => controller.exhaust(id)); return; }
    budget.repairs++;
    agent.steer(createUserMessage({ source: { kind: 'company' }, content: [{ type: 'text', text: `Task is not verified. Repair cycle ${budget.repairs}/2. Inspect company_task_state, repair within the candidate, call company_verify and company_finish. Explain unresolved checks if blocked.` }] }));
  });
  ctx.on('agent/disposed', ({ agent }) => { rounds.delete(String(agent.session.id)); });
}
