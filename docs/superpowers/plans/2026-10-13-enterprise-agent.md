# Enterprise Coding Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver an installable DSH company bundle with a reproducible coding workload, persistent task context, externally checked completion and optional native workers.

**Architecture:** Pure TypeScript domain modules implement task state, context, verification and delegation. Thin DSH plugins expose their tools and hooks. The acceptance oracle runs in the controlling process; candidate code runs either in an explicitly unisolated development process or a Docker container. Only isolated, current, successful evidence can authorize verified completion.

**Tech Stack:** Node.js 24, TypeScript, pnpm, Node test runner, published DSH packages pinned to one qualified version, Docker for candidate isolation. No separate application backend or database.

**Spec:** docs/progetto-coding-agent-aziendale.md

## Global Constraints

- User authorized implementation and incremental pushes to EdoardoMorucci/dhs-enterprise-coding-agent.
- Internal and hybrid profiles have separate data directories. Internal does not load external delegation providers.
- No credentials in Git. No fallback from an internal model to public inference.
- A successful model answer never substitutes for acceptance evidence. Changed candidate contents invalidate completion.
- Native workers are sequential; cancellation is not rollback. Unknown outcomes require reconciliation.
- Missing model, Docker or native authentication is reported as unqualified, never silently simulated as live success.
- Model-driven trials, offline qualification and webinar rehearsal require the actual deployment; deterministic tests do not establish those results.

## Review Focus

1. Workspace paths with spaces, traversal and symlinks: reject escape and hash exact executed contents (Task 1).
2. Stale evidence after a source edit or process restart: deny verified completion (Task 2).
3. Existing user DSH configuration: preserve it and use dedicated data homes; fail on incompatible configuration (Task 3).
4. Child runtime failure, timeout or interrupted previous delegation: stop sequence and retain uncertain state (Task 4).
5. Clean installation with no endpoint/credentials/Docker: useful diagnostics without false qualification (Task 5).

## Task 1: Demo and independent verifier

**Files:** package.json, pnpm-workspace.yaml, tsconfig.json, packages/company-verification/{package.json,src/*.ts,test/*.test.ts}, demo/orders-app/{orders.mjs,server.mjs,index.html}, verifier/{bridge.mjs,reference/orders.mjs}, scripts/demo.mjs.

**Interfaces:** Export `VerificationReport`, `fingerprintWorkspace(workspace)`, and `runVerification({workspace, artifactsDir, mode, timeoutMs?})` from company-verification. Report includes runId, sourceDigest, suiteVersion, isolation (`process` or `docker`), startedAt, completedAt, passed and named checks. Failures cannot claim success. Source fingerprint rejects symlinks and includes all execution inputs. Candidate module `orders.mjs` exports `createOrderStore()`, returning `{create(input), list()}`. Input has requestId, customer and positive integer quantity; identical retries return the original order, conflicting reuse rejects. Store is in-memory and makes no persistence claim.

- [x] Write and run failing behavioral tests for timeout-after-commit duplicate, distinct requests, validation, conflicting reuse, fingerprints, symlink escape and candidate crashes.
- [x] Implement a deliberately buggy seed and correct reference. Verify reference passes and buggy seed fails the same host-owned suite. Keep reference outside copies given to the agent.
- [x] Implement snapshot verification with bounded process lifetime/output and deterministic cleanup. Development process mode is explicitly unisolated. Docker mode has no network, read-only root and candidate mount, non-root user, no extra capabilities and resource limits; host owns expected results.
- [x] Provide a minimal visible orders demo and reset command that creates a new dedicated workspace without deleting arbitrary existing paths.
- [x] Run focused tests, full available suite and typecheck. Commit only task files.

Example behavioral contract:

```ts
const report = await runVerification({ workspace: fixedCopy, artifactsDir, mode: 'process' });
assert.equal(report.passed, true);
await appendFile(join(fixedCopy, 'orders.mjs'), '\n// edited\n');
assert.notEqual(await fingerprintWorkspace(fixedCopy), report.sourceDigest);
```

## Task 2: Persistent task state and bounded company context

**Files:** packages/company-task-state/{package.json,src/*.ts,test/*.test.ts}, packages/company-context/{package.json,src/*.ts,test/*.test.ts}, company-knowledge/*.md.

**Interfaces:** `TaskStore(dataDir)` with `create({taskId,objective,criteria,workspace})`, `get(taskId)`, `updateInvestigation(taskId,{hypotheses,pendingChecks})`, `recordVerification(taskId,report)` and `finish(taskId)`. `finish` recomputes the workspace digest, requires the latest successful Docker report, and never accepts a model-supplied report through public agent tools. Serialize writes and persist bounded history atomically. Context builder accepts authoritative TaskState and curated knowledge and returns bounded system context; it is model-independent.

- [x] Write and run failing tests for cross-task separation, restart recovery, stale evidence, failed or unisolated reports, corrupt storage and oversized context.
- [x] Implement JSON-backed local state with safe IDs, atomic writes, schema version, phase, attempts, hypotheses, pending checks and receipt reference. Mark uncertain prior running work as needing reconciliation.
- [x] Implement conservative recovery, bounded context and company rules explaining the completion contract.
- [x] Run suite/typecheck and commit task files.

```ts
await store.recordVerification(id, successfulProcessReport);
await assert.rejects(store.finish(id), /isolat/i);
```

## Task 3: Real DSH bundle and launcher

**Files:** packages/company-bundle/{package.json,patch.yaml,src/*.ts,test/*.test.ts}, profiles/{internal,hybrid}/*, distribution/*, scripts/{company-agent,doctor}.mjs, .env.example.

**Interfaces:** CLI commands `doctor`, `configure`, `start`, `demo reset`, `verify`, `status`; internal default. Configuration reads explicit endpoint/model and a named environment variable for credentials, never writes secrets. Runtime version is pinned using registry/source qualification. Expose `company_task_start`, `company_task_state`, `company_read_file`, `company_write_file`, `company_verify`, `company_finish`; context/pre-step and stopping hooks enforce state continuity and bounded repair attempts. File tools operate only in the selected candidate workspace. Internal profile must deny unapproved generic tools that could modify authoritative state.

- [ ] Test actual DSH plugin loading, dedicated profile setup, path handling, traversal rejection and completion hooks against the installed version.
- [ ] Wire domain modules through documented DSH APIs. Build compiled entrypoint and bundle YAML. Preserve personal DSH_HOME.
- [ ] Show task state and evidence through DSH tools and ordinary UI; a bespoke visual panel is optional and must not delay functional integration.
- [ ] Start actual runtime, test config dump and a deterministic protocol integration where practical. Label any protocol fixture clearly, separately from a live model qualification.
- [ ] Commit and push a working baseline.

## Task 4: Optional native delegation

**Files:** packages/company-delegation/{package.json,src/*.ts,test/*.test.ts}, hybrid bundle configuration and delegation tool registration.

**Interfaces:** Sequential controller consumes a provider adapter with `run({provider,brief,cwd,signal})`; records dispatch/result/error and never grants verified status. Codex implementation uses explicit candidate cwd, Claude review uses an isolated snapshot, then parent verifier runs again. Native DSH adapters must be real provider calls, not canned responses.

- [ ] Write failing sequence tests including timeout, failed worker, cancellation, uncertain restart and review isolation unavailable.
- [ ] Implement persisted orchestration, complete briefs, abort propagation and reconciliation. Enforce one writer. Fail closed when required isolation or provider authentication is unavailable.
- [ ] Qualify available native CLIs without reading or committing credentials; only report live success for an observed successful invocation.
- [ ] Run tests/typecheck and commit. Internal profile remains independent of these providers.

## Task 5: Distribution, integration and handover

**Files:** README.md, docs/{installation,webinar,qualification}.md, evaluations/*, distribution/release-manifest.json, .github/workflows/ci.yml and focused integration tests.

- [ ] Test installation/configuration from a clean temporary directory and inspect packed artifact contents for credentials or developer paths.
- [ ] Exercise demo bug and reference, stale receipt, runtime loading, process failures and state recovery. Run Docker and live model checks only when available.
- [ ] Add cross-platform CI for typecheck/build/tests and packaging. Record exact versions, observed qualification and remaining infrastructure dependencies.
- [ ] Supply Italian quickstart, reset/recovery and webinar walkthrough; distinguish the seeded demo from real agent runs.
- [ ] Obtain independent whole-branch review, fix substantial findings, recheck affected behavior and push all completed increments.

## Execution rulings

- The user approved the architecture and instructed immediate implementation; no duplicate design-approval gate.
- The selected remote was empty and this directory contained only the approved documents. Initialize it in place, publish the documentation baseline to main, and implement on `feat/enterprise-agent`; no existing source checkout is displaced.
- Hardware observed: Windows, Node 24.13.0, roughly 32 GB RAM, integrated AMD graphics. Docker client exists but daemon was initially unavailable. Endpoint/model qualification remains an explicit external dependency while implementation proceeds.
