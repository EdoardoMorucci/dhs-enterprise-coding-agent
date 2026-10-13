import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { TaskStore, type TaskState } from '@company/company-task-state';
import { runVerification } from '@company/company-verification';
import { buildCompanyContext, type CuratedKnowledge } from '@company/company-context';
import { readCandidate, writeCandidate } from './files.ts';

export const EXHAUSTED = 'Completion repair limit reached; human review required';
export const taskIdForSession = (sessionId: string): string => createHash('sha256').update(sessionId).digest('hex');
export type ControllerConfig = { stateRoot: string; workspace: string; knowledge: readonly CuratedKnowledge[] };
/** Trusted host seam; Task 4 can invoke orchestration here, never through arbitrary model reports. */
export class CompanyController {
  readonly store: TaskStore;
  readonly config: ControllerConfig;
  private queue: Promise<unknown> = Promise.resolve();
  private hydrated = new Set<string>();
  private cache = new Map<string, TaskState | null>();
  constructor(config: ControllerConfig) { this.config = { ...config, workspace: resolve(config.workspace) }; this.store = new TaskStore(join(config.stateRoot, 'tasks')); }
  serial<T>(operation: () => Promise<T>): Promise<T> { const result = this.queue.then(operation); this.queue = result.catch(() => undefined); return result; }
  async hydrate(sessionId: string): Promise<TaskState | null> {
    const taskId = taskIdForSession(sessionId);
    let state: TaskState | null;
    try { state = await this.store.get(taskId); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') state = null; else throw error; }
    if (!this.hydrated.has(sessionId) && state?.phase === 'verifying') state = await this.store.recoverInterrupted(taskId);
    this.hydrated.add(sessionId); this.cache.set(sessionId, state); return state;
  }
  context(sessionId: string): string {
    const state = this.cache.get(sessionId);
    return state ? buildCompanyContext({ state, knowledge: this.config.knowledge }) : 'No company task is active. Human conversation is allowed. Start work with company_task_start; only company tools may read or change the configured candidate. Completion requires company_verify then company_finish.';
  }
  async start(sessionId: string, objective: string, criteria: string[]): Promise<TaskState> {
    if (objective.length > 2000 || criteria.length > 8 || criteria.some(item => item.length > 500)) throw new Error('Task context input limit exceeded');
    const existing = await this.hydrate(sessionId); if (existing) throw new Error('This session already owns a task; use a new session for a new task');
    const state = await this.store.create({ taskId: taskIdForSession(sessionId), objective, criteria, workspace: this.config.workspace });
    this.cache.set(sessionId, state); return state;
  }
  async requireTask(sessionId: string): Promise<TaskState> { const state = await this.hydrate(sessionId); if (!state) throw new Error('Start a company task first'); return state; }
  async read(sessionId: string, path: string): Promise<string> { const state = await this.requireTask(sessionId); return readCandidate(state.workspace, path); }
  async write(sessionId: string, path: string, content: string): Promise<TaskState> {
    const state = await this.requireTask(sessionId);
    if (state.reconciliationRequired || state.phase === 'verifying') throw new Error('Reconcile outstanding verification before editing');
    await writeCandidate(state.workspace, path, content); return (await this.hydrate(sessionId))!;
  }
  async verify(sessionId: string, signal: AbortSignal): Promise<TaskState> {
    signal.throwIfAborted(); const state = await this.requireTask(sessionId);
    await this.store.beginVerification(state.taskId);
    try {
      // This verifier is bounded and owns cleanup. Cancellation never discards a receipt or means rollback.
      const report = await runVerification({ workspace: state.workspace, artifactsDir: join(this.config.stateRoot, 'receipts'), mode: 'docker' });
      await this.store.recordVerification(state.taskId, report);
    } catch (error) { await this.store.recoverInterrupted(state.taskId); throw error; }
    const result = (await this.hydrate(sessionId))!; signal.throwIfAborted(); return result;
  }
  async finish(sessionId: string): Promise<TaskState> { const state = await this.requireTask(sessionId); const finished = await this.store.finish(state.taskId); this.cache.set(sessionId, finished); return finished; }
  async exhaust(sessionId: string): Promise<void> { const state = await this.requireTask(sessionId); await this.store.markNeedsReview(state.taskId, EXHAUSTED); await this.hydrate(sessionId); }
}
