import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CandidateAdmission } from '../packages/company-bundle/dist/admission.js';
import { journals, saveJournal } from '../packages/company-delegation/dist/index.js';
import { DockerAdapter } from '../packages/company-delegation/dist/docker.js';
import { TaskStore } from '../packages/company-task-state/dist/index.js';
import { fingerprintWorkspace } from '../packages/company-verification/dist/index.js';
import { acquireOwnership, profilePaths, readConfig } from './company-agent.mjs';
function alive(pid) { if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid recorded process owner'); try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
/** Explicit operator action. Never registered as an agent tool. */
export async function reconcileNative(root, profile, acknowledge) {
  if (!acknowledge) throw new Error('Inspect the candidate, then pass --acknowledge-partial-changes; cancellation is not rollback');
  const config = await readConfig(root, profile, false), paths = profilePaths(root, profile);
  const admission = new CandidateAdmission(join(root, 'candidate-admission'), config.workspace), lease = await admission.inspect();
  if (!lease) throw new Error('No interrupted candidate admission requires reconciliation');
  if (lease.ownerRoot !== resolve(root, 'candidate-admission')) throw new Error('Reconcile from the original configured data root: ' + lease.ownerRoot);
  if (alive(lease.pid)) throw new Error('Recorded candidate owner is still running; stop it before reconciliation');
  // A crashed launcher may leave its separate profile owner. Explicit reconciliation can replace only an observed dead owner.
  const owner = await readFile(paths.lock, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (owner) { if (alive(owner.pid)) throw new Error('Profile owner is still running'); const latest = JSON.parse(await readFile(paths.lock, 'utf8')); if (latest.token !== owner.token) throw new Error('Profile ownership changed'); await rm(paths.lock); }
  const release = await acquireOwnership(root, profile);
  try {
    const reconciled = [];
    for (const sibling of ['internal', 'hybrid']) {
      const siblingPaths = profilePaths(root, sibling);
      for (const { path, record } of await journals(join(siblingPaths.state, 'native-runs'))) {
        if (record.workspace !== lease.workspace || !['running', 'uncertain'].includes(record.status)) continue;
        if (sibling !== profile) throw new Error(`Reconcile using the owning ${sibling} profile`);
        if (!record.identity) throw new Error('Missing recorded native worker identity; manual investigation required');
        const adapter = new DockerAdapter(record.identity);
        for (const event of record.events.filter(event => event.event === 'dispatch')) await adapter.reconcile(event.runId);
        const digest = await fingerprintWorkspace(config.workspace);
        const store = new TaskStore(join(paths.state, 'tasks'));
        await store.requireReconciliation(record.taskId, 'Native outcome reconciled by operator; fresh verification required');
        await store.reconcileInterruption(record.taskId);
        await store.markNeedsReview(record.taskId, 'Native outcome reconciled by operator; fresh verification required');
        // Commit the journal last: a crash during state transitions must remain retryable.
        record.status = 'reconciled'; record.events.push({ event: 'operator-reconciled-partial-changes', at: new Date().toISOString(), digest }); await saveJournal(path, record);
        reconciled.push({ taskId: record.taskId, journal: path, currentDigest: digest });
      }
    }
    const currentDigest = await fingerprintWorkspace(config.workspace);
    await admission.release(lease.token);
    return { status: 'reconciled', currentDigest, reconciled, note: 'Partial changes preserved. No acceptance or completion granted; inspect and run fresh host verification.' };
  } finally { await release(); }
}
