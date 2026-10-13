import type { Provider, WorkerResult } from './index.ts';
export type WorkerRequest = { protocol: 1; runId: string; provider: Provider; role: 'writer' | 'reviewer'; brief: string };
export function parseRequest(input: string): WorkerRequest {
  if (Buffer.byteLength(input) > 32768) throw new Error('Request limit');
  const value = JSON.parse(input) as WorkerRequest;
  if (value.protocol !== 1 || !/^[a-f0-9-]{36}$/.test(value.runId) || !((value.role === 'writer' && value.provider === 'codex') || (value.role === 'reviewer' && value.provider === 'claude-code')) || typeof value.brief !== 'string' || !value.brief.trim() || value.brief.length > 24000) throw new Error('Invalid worker request');
  return value;
}
export function parseTerminal(input: string, request: WorkerRequest): WorkerResult {
  if (Buffer.byteLength(input) > 131072) throw new Error('Worker output limit');
  const lines = input.trim().split('\n'); if (lines.length !== 1) throw new Error('Expected exactly one terminal record');
  const value = JSON.parse(lines[0]!) as Record<string, unknown>;
  if (value.protocol !== 1 || value.runId !== request.runId || value.role !== request.role || value.provider !== request.provider) throw new Error('Worker protocol identity mismatch');
  if (value.type === 'error') throw new Error(['AUTH_UNAVAILABLE', 'INVALID_REQUEST', 'START_FAILED', 'CLEANUP_FAILED', 'ISOLATION_UNAVAILABLE'].includes(String(value.code)) ? `Native worker: ${value.code}` : 'Invalid worker error');
  if (value.type !== 'result' || value.stopReason !== 'completed' || typeof value.text !== 'string' || !value.text.trim() || Buffer.byteLength(value.text) > 65536 || (request.role === 'reviewer' && value.readonlyChecked !== true)) throw new Error('Native result or readonly qualification invalid');
  return { text: value.text, stopReason: 'completed' };
}
