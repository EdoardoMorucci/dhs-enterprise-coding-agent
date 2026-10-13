import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fingerprintWorkspace, type VerificationReport } from '@company/company-verification';

export type TaskPhase = 'investigating' | 'repairing' | 'verifying' | 'needs_review' | 'verified' | 'failed';
export type EvidenceStatus = 'none' | 'current' | 'stale' | 'unavailable';
export type TaskState = {
  schemaVersion: 1;
  taskId: string;
  objective: string;
  criteria: string[];
  workspace: string;
  phase: TaskPhase;
  attempts: number;
  hypotheses: string[];
  pendingChecks: string[];
  reconciliationRequired: boolean;
  latestVerification: VerificationReport | null;
  latestVerificationAttempt: number | null;
  receiptReference: string | null;
  evidenceStatus: EvidenceStatus;
  createdAt: string;
  updatedAt: string;
  history: { at: string; event: string; phase: TaskPhase; attempts: number }[];
};
export type CreateTask = Pick<TaskState, 'taskId' | 'objective' | 'criteria' | 'workspace'>;
export type Investigation = Pick<TaskState, 'hypotheses' | 'pendingChecks'>;
const MAX_STATE_BYTES = 256 * 1024;
const PHASES: TaskPhase[] = ['investigating', 'repairing', 'verifying', 'needs_review', 'verified', 'failed'];

function safeId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id)) throw new Error('Invalid task id');
}
function text(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error('Text limit or type invalid');
}
function strings(value: unknown, count: number, length: number): asserts value is string[] {
  if (!Array.isArray(value) || value.length > count) throw new Error('List limit or type invalid');
  for (const item of value) text(item, length);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Object required');
}
function date(value: unknown): asserts value is string {
  text(value, 64);
  if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid timestamp');
}
function validateReport(value: unknown): asserts value is VerificationReport {
  try {
    object(value);
    safeId(value.runId);
    if (typeof value.sourceDigest !== 'string' || (!/^[a-f0-9]{64}$/.test(value.sourceDigest)
      && !(value.sourceDigest === '' && value.passed === false))) throw new Error('Invalid digest');
    text(value.suiteVersion, 128);
    if (!['docker', 'process'].includes(String(value.isolation)) || typeof value.passed !== 'boolean') throw new Error('Invalid result');
    date(value.startedAt); date(value.completedAt);
    if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) throw new Error('Invalid time order');
    if (!Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 64) throw new Error('Check limit');
    for (const check of value.checks) {
      object(check); text(check.name, 128);
      if (typeof check.passed !== 'boolean') throw new Error('Invalid check');
      if (check.detail !== undefined) text(check.detail, 2048);
    }
    if (value.passed !== value.checks.every(check => check.passed)) throw new Error('Inconsistent result');
  } catch (error) { throw new Error('Invalid verification report', { cause: error }); }
}
function validateState(value: unknown, expectedId: string): asserts value is TaskState {
  try {
    object(value);
    if (value.schemaVersion !== 1) throw new Error('Unsupported schema');
    safeId(value.taskId);
    if (value.taskId !== expectedId) throw new Error('Wrong task');
    text(value.objective, 8000); strings(value.criteria, 32, 2000);
    if (value.criteria.length === 0) throw new Error('Criteria required');
    text(value.workspace, 4096);
    if (!isAbsolute(value.workspace)) throw new Error('Absolute workspace required');
    if (!PHASES.includes(value.phase as TaskPhase)) throw new Error('Invalid phase');
    if (!Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > 3) throw new Error('Invalid attempts');
    strings(value.hypotheses, 20, 2000); strings(value.pendingChecks, 20, 2000);
    if (typeof value.reconciliationRequired !== 'boolean') throw new Error('Invalid recovery');
    if (value.reconciliationRequired && value.phase !== 'needs_review') throw new Error('Invalid recovery phase');
    if (!['none', 'current', 'stale', 'unavailable'].includes(String(value.evidenceStatus))) throw new Error('Invalid evidence status');
    if (value.latestVerification !== null) {
      validateReport(value.latestVerification);
      if (Number(value.attempts) === 0 || value.receiptReference !== `${expectedId}.json#latestVerification/${value.latestVerification.runId}`
        || value.evidenceStatus === 'none') throw new Error('Invalid receipt reference');
      if (!Number.isInteger(value.latestVerificationAttempt) || Number(value.latestVerificationAttempt) < 1
        || Number(value.latestVerificationAttempt) > Number(value.attempts)) throw new Error('Invalid receipt attempt');
      if (!value.latestVerification.sourceDigest && value.evidenceStatus !== 'unavailable') throw new Error('Missing source evidence');
    } else if (value.receiptReference !== null || value.evidenceStatus !== 'none' || value.latestVerificationAttempt !== null) throw new Error('Missing evidence');
    if (value.phase === 'verified' && (value.latestVerification === null || !value.latestVerification.passed
      || value.latestVerification.isolation !== 'docker' || value.evidenceStatus !== 'current'
      || value.latestVerificationAttempt !== value.attempts)) throw new Error('Invalid verified state');
    if (value.phase === 'verifying' && Number(value.attempts) === 0) throw new Error('Invalid running state');
    date(value.createdAt); date(value.updatedAt);
    if (!Array.isArray(value.history) || value.history.length < 1 || value.history.length > 32) throw new Error('History limit');
    for (const entry of value.history) {
      object(entry); date(entry.at); text(entry.event, 128);
      if (!PHASES.includes(entry.phase as TaskPhase) || !Number.isInteger(entry.attempts)
        || Number(entry.attempts) < 0 || Number(entry.attempts) > 3) throw new Error('Invalid history');
    }
  } catch (error) { throw new Error('Corrupt task storage or unsupported schema', { cause: error }); }
}
async function noLinks(path: string): Promise<void> {
  let cursor = resolve(path);
  while (true) {
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error('Symlink storage path rejected');
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}
function contains(parent: string, child: string): boolean {
  const part = relative(parent, child);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep));
}

/** Host-only API. One owning runtime/store per data directory; not a multi-process database. */
export class TaskStore {
  readonly dataDir: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) { text(dataDir, 4096); this.dataDir = resolve(dataDir); }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async boundary(workspace: string): Promise<void> {
    if (contains(workspace, this.dataDir) || contains(this.dataDir, workspace)) throw new Error('Store must be outside workspace without overlap in either direction');
    await noLinks(this.dataDir);
    await noLinks(workspace);
  }
  private async read(taskId: string): Promise<TaskState> {
    safeId(taskId);
    const path = join(this.dataDir, `${taskId}.json`);
    await noLinks(path);
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let value: unknown;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_STATE_BYTES) throw new Error('Corrupt task storage: file limit');
      const buffer = Buffer.alloc(MAX_STATE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await file.read(buffer, length, buffer.length - length, null);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      if (length > MAX_STATE_BYTES) throw new Error('Corrupt task storage: file limit');
      try { value = JSON.parse(buffer.subarray(0, length).toString('utf8')); }
      catch (error) { throw new Error('Corrupt task storage JSON', { cause: error }); }
    } finally { await file.close(); }
    validateState(value, taskId);
    await this.boundary(value.workspace);
    return value;
  }
  private async save(state: TaskState, event: string): Promise<TaskState> {
    state.updatedAt = new Date().toISOString();
    state.history = [...state.history, { at: state.updatedAt, event, phase: state.phase, attempts: state.attempts }].slice(-32);
    validateState(state, state.taskId);
    const json = JSON.stringify(state, null, 2) + '\n';
    if (Buffer.byteLength(json) > MAX_STATE_BYTES) throw new Error('Task storage limit exceeded');
    await this.boundary(state.workspace);
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const destination = join(this.dataDir, `${state.taskId}.json`);
    await noLinks(destination);
    const temporary = join(this.dataDir, `.${state.taskId}-${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(json); await file.sync(); } finally { await file.close(); }
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
    return structuredClone(state);
  }
  private async refresh(state: TaskState): Promise<TaskState> {
    if (!state.latestVerification) return state;
    let status: EvidenceStatus;
    try { status = !state.latestVerification.sourceDigest ? 'unavailable'
      : await fingerprintWorkspace(state.workspace) === state.latestVerification.sourceDigest ? 'current' : 'stale'; }
    catch { status = 'unavailable'; }
    if (state.evidenceStatus === status) return state;
    state.evidenceStatus = status;
    if (state.phase === 'verified' && status !== 'current') state.phase = 'needs_review';
    return this.save(state, 'evidence-refreshed');
  }

  create(input: CreateTask): Promise<TaskState> {
    const copy = structuredClone(input);
    return this.serial(async () => {
      safeId(copy.taskId); text(copy.objective, 8000); strings(copy.criteria, 32, 2000);
      if (!copy.criteria.length) throw new Error('Acceptance criteria required');
      text(copy.workspace, 4096);
      const workspace = resolve(copy.workspace);
      await this.boundary(workspace);
      await fingerprintWorkspace(workspace);
      const path = join(this.dataDir, `${copy.taskId}.json`);
      const exists = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (exists) throw new Error('Task already exists');
      const now = new Date().toISOString();
      return this.save({ schemaVersion: 1, ...copy, workspace, phase: 'investigating', attempts: 0,
        hypotheses: [], pendingChecks: [], reconciliationRequired: false, latestVerification: null,
        latestVerificationAttempt: null, receiptReference: null, evidenceStatus: 'none', createdAt: now, updatedAt: now, history: [] }, 'created');
    });
  }
  get(taskId: string): Promise<TaskState> {
    return this.serial(async () => structuredClone(await this.refresh(await this.read(taskId))));
  }
  updateInvestigation(taskId: string, input: Investigation): Promise<TaskState> {
    const copy = structuredClone(input);
    return this.serial(async () => {
      strings(copy.hypotheses, 20, 2000); strings(copy.pendingChecks, 20, 2000);
      const state = await this.refresh(await this.read(taskId));
      if (state.phase === 'verifying') throw new Error('Verification is running');
      state.hypotheses = copy.hypotheses; state.pendingChecks = copy.pendingChecks;
      if (!state.reconciliationRequired) state.phase = state.attempts ? 'repairing' : 'investigating';
      return this.save(state, 'investigation-updated');
    });
  }
  beginVerification(taskId: string): Promise<TaskState> {
    return this.serial(async () => {
      const state = await this.refresh(await this.read(taskId));
      if (state.phase === 'verifying') throw new Error('Verification already running');
      if (state.reconciliationRequired) throw new Error('Interrupted verification requires reconciliation');
      if (state.attempts >= 3) throw new Error('Verification attempt limit: initial run plus two repairs');
      state.attempts++; state.phase = 'verifying';
      return this.save(state, 'verification-started');
    });
  }
  /** Called only after the host has taken runtime ownership following a crash/restart. */
  recoverInterrupted(taskId: string): Promise<TaskState> {
    return this.serial(async () => {
      const state = await this.refresh(await this.read(taskId));
      if (state.phase !== 'verifying') return state;
      state.phase = 'needs_review'; state.reconciliationRequired = true;
      state.pendingChecks = ['Reconcile interrupted verification; outcome unknown', ...state.pendingChecks].slice(0, 20);
      return this.save(state, 'verification-interrupted');
    });
  }
  /** Host confirms cleanup/outcome reconciliation before starting a fresh run. */
  reconcileInterruption(taskId: string): Promise<TaskState> {
    return this.serial(async () => {
      const state = await this.refresh(await this.read(taskId));
      if (!state.reconciliationRequired) throw new Error('No interruption requires reconciliation');
      state.reconciliationRequired = false;
      state.pendingChecks = state.pendingChecks.filter(check => check !== 'Reconcile interrupted verification; outcome unknown');
      return this.save(state, 'interruption-reconciled');
    });
  }
  /** Trusted host receipt only; never register this method as a model tool. */
  recordVerification(taskId: string, report: VerificationReport): Promise<TaskState> {
    const copy = structuredClone(report);
    return this.serial(async () => {
      validateReport(copy);
      const state = await this.read(taskId);
      if (state.latestVerification?.runId === copy.runId) throw new Error('Verification report already recorded');
      if (state.phase !== 'verifying' && !state.reconciliationRequired) {
        if (state.attempts >= 3) throw new Error('Verification attempt limit');
        state.attempts++;
      }
      state.latestVerification = copy;
      state.latestVerificationAttempt = state.attempts;
      state.receiptReference = `${taskId}.json#latestVerification/${copy.runId}`;
      state.reconciliationRequired = false;
      state.phase = copy.passed ? 'needs_review' : 'failed';
      try { state.evidenceStatus = !copy.sourceDigest ? 'unavailable'
        : await fingerprintWorkspace(state.workspace) === copy.sourceDigest ? 'current' : 'stale'; }
      catch { state.evidenceStatus = 'unavailable'; }
      return this.save(state, 'verification-recorded');
    });
  }
  finish(taskId: string): Promise<TaskState> {
    return this.serial(async () => {
      const state = await this.refresh(await this.read(taskId));
      if (state.phase === 'verifying' || state.reconciliationRequired) throw new Error('Verification is running or requires reconciliation');
      const report = state.latestVerification;
      if (!report) throw new Error('Successful verification required');
      if (state.latestVerificationAttempt !== state.attempts) throw new Error('Latest attempt has no completed verification receipt');
      if (!report.passed) throw new Error('Latest verification must have passed');
      if (report.isolation !== 'docker') throw new Error('Isolated Docker verification required');
      if (state.evidenceStatus !== 'current') throw new Error('Verification evidence is stale or workspace unavailable');
      state.phase = 'verified';
      return this.save(state, 'finished');
    });
  }
}
