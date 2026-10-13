# Persistent host task state

`@company/company-task-state` provides `TaskStore(dataDir)` for a single owning host runtime. Internal and hybrid profiles must use separate directories. Create one store per directory and serialize verification execution in the host. The store queues its own reads and writes; it does not coordinate independent instances, processes, or network filesystems. A second instance is appropriate only after the previous runtime has relinquished ownership.

```ts
const store = new TaskStore(profileDataDir);
await store.create({ taskId, objective, criteria, workspace });
await store.updateInvestigation(taskId, { hypotheses, pendingChecks });
await store.beginVerification(taskId);
const report = await runVerification({ workspace, artifactsDir, mode: 'docker' });
await store.recordVerification(taskId, report);
await store.finish(taskId);
```

`recordVerification` is a trusted host API, never a model tool accepting arbitrary arguments. It snapshots and validates the verifier's report and atomically embeds the latest authoritative receipt in the task file. `receiptReference` identifies that task file and run. A direct host `recordVerification` without `beginVerification` counts an attempt too, for callers using only the required minimal interface. The initial verification plus two repairs consumes at most three attempts. Failed, stale, unisolated, malformed, or older-attempt evidence cannot finish.

`get` refreshes evidence against the whole candidate fingerprint. Changed or unreadable candidate contents downgrade verified tasks to `needs_review`; the original receipt remains available with `stale` or `unavailable` status. Restoring exact contents does not automatically restore the verified phase: the host must call `finish` again. Ordinary reads preserve running verification.

The verifier can fail before a candidate digest exists. Such failed receipts retain their empty digest with `unavailable` evidence status; a successful receipt must always contain a valid SHA-256 digest.

After restart, acquire exclusive runtime ownership and call `recoverInterrupted(taskId)` for any `verifying` task. This records `needs_review`, an unknown outcome check, and `reconciliationRequired`. It does not retry. Before a new run, reconcile external outcomes and process/container cleanup, then call the host-only `reconcileInterruption(taskId)`. If a genuine receipt for the interrupted run was recovered instead, `recordVerification` attaches it to that consumed attempt and clears the reconciliation flag. A prior attempt's success cannot satisfy the interrupted attempt.

Task ids are restricted to 1–64 ASCII letters, digits, underscores and hyphens, starting with a letter/digit; Windows device names are rejected. Storage and candidate directories must not overlap in either direction. Symlink ancestors and state files are rejected. Receipts and state belong outside the candidate; file tools must be confined to the candidate by the adapter.

Each version-1 JSON state is capped at 256 KiB, with 32 history events, 20 hypotheses, 20 pending checks, an 8000-character objective and up to 32 criteria of 2000 characters each. Hypotheses/checks are each capped at 2000 characters. Writes use an exclusive temporary file, file sync and same-directory atomic rename; malformed or unsupported stored state fails closed. Interrupted writes can leave an ignored temporary file, which is never read as task state. Rename/file-sync guarantees depend on the host filesystem; this is not a transactional distributed database or a guarantee against hardware power loss.

Workspace development exports TypeScript source. `pnpm -r build` emits separate `dist` JavaScript/declarations in dependency order. Build configurations resolve sibling compiled declarations to keep each package's output confined to its own source. A packaged runtime should export the compiled entries and preserve the package dependencies.
