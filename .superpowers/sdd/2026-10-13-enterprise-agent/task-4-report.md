# Task 4 — sequential native DSH delegation

## Scope and behavior

Implemented `company-delegation`, the optional hybrid `company_delegate` tool, persistent candidate admission, native worker bootstrap/authentication, Docker transport and lifecycle, host-only reconciliation, launcher configuration and distribution seams. No custom UI or additional control model was added. Root-owned project/installation/plan documents were not edited or staged.

The host sequence is Codex writer → independent host verification → exact snapshot → Claude Code readonly reviewer → independent final host verification. Two verification attempts must remain before dispatch. A failed intermediate verification prevents review. Native completion yields review text for the parent to inspect and never calls `TaskStore.finish`. Snapshot/candidate digests are compared around review and final verification.

The actual worker calls `ctx.agents.create` with an idle parent at `/workspace`, then `ctx.subagents.start` for the selected native provider, awaits the result and closes the native run and parent. Native provider plugins run in the one-shot worker only. Internal profiles do not evaluate the delegation module or register native tools. The normal company catalog remains six tools; only a configured hybrid adds the controller tool.

Candidate mutation admission uses an exclusive persisted file beside the canonical candidate in `.company-admission`. This location blocks a second configured data root as well as competing sessions/profiles. Task start, file writes, verification, finish, delegation and standalone CLI verification share the boundary. State and file reads remain available for diagnosis. A dead process does not auto-clear the lease; its original root is recorded for explicit recovery.

Each dispatch journal includes run/provider/role, exact cwd/digest, deterministic container name, deadline, image identity and credential references. No credential values, raw stderr or native text are persisted in the journal. A stopped-container observation is recorded before removal; result/failure follows before admission release. Unknown cleanup retains admission and marks task reconciliation required. No automatic replay occurs on restart.

`native-reconcile --acknowledge-partial-changes` is an explicit host command, never an agent tool. It refuses live owners, checks the original configured root, converges unresolved containers, captures the current digest, updates TaskStore, then commits reconciled journal state and releases admission. The journal commit occurs after TaskStore transitions so interrupted reconciliation remains retryable. Unknown external writers require a new host receipt even if the digest matches an older successful receipt. The marker survives investigation-note replacement and is removed only by a newly recorded host receipt; consumed attempts and receipt replay protection remain intact.

## Docker and credentials

Host transport uses bounded structured arguments, local Docker context checks and immutable image identities. It creates first, inspects image/user/root/mount/capability/security/network constraints, then attaches/starts. Project bind recursion is disabled; only the exact candidate or snapshot and a single selected credential file are mounted. The reviewer mount is readonly. Timeout/cancellation converges the named container with stop, kill when needed and inspect; killing only the Docker client is not considered cleanup. Failure to confirm/remove the container produces an uncertain outcome. Bridge network is deliberate and is not described as an egress allowlist.

The reviewer performs an in-container project probe before native review: overwrite, creation, rename and deletion must fail, while reads and tmpfs writes succeed. Parent hashes the snapshot and candidate again. This is the implementation of the future runtime check, not evidence that Docker mounts were tested on this host.

Authentication requires explicit bounded credential files outside the candidate. The host checks metadata without reading contents. Worker reads only its selected file; it does not discover host account stores. Codex API keys are supplied to the installed official `login --with-api-key` command through stdin, using isolated tmpfs `CODEX_HOME` and file auth storage. The installed 0.153.4 CLI `login --help` confirmed this interface. Claude explicitly reinserts only the selected API key or OAuth token into native provider env. Both native homes are isolated; exact selected values are redacted from returned text. No secret values appear in Docker argument values, profile config, request protocol or persisted logs.

The Linux image recipe contains a separately generated exact npm lock, optional platform packages, a required immutable Node 24.13.0 glibc base input, compiled own worker assets and unprivileged UID 10001. It installs inside Linux and never copies Windows native packages. Distribution preserves the worker subpath exports and includes the recipe/lock/entrypoint. No image publication was requested or performed.

## RED/GREEN evidence

- Initial controller/admission tests: **8 expected failures** for absent product APIs; controller/admission sequence tests then passed.
- Initial Docker tests: **7 expected failures** for absent lifecycle adapter. Transport fixtures subsequently exercised normal completion, wrong readonly mount, timeout, cancellation, cleanup uncertainty, missing/contained credentials, malformed/duplicate protocol and identity/stop-reason mismatch.
- Worker bootstrap initially failed the missing-entrypoint assertion; the actual compiled DSH CLI now boots and emits one typed `AUTH_UNAVAILABLE` terminal with exit 2 and no activation warnings.
- Hybrid configuration test initially failed because native configuration was absent; it now verifies reference-only persistence, internal refusal and credential/candidate separation.
- A same-candidate/different-data-root regression initially admitted a second writer; moving the lease beside the canonical candidate made it reject.
- A prior successful receipt initially remained finishable after unknown-writer reconciliation; the host-owned fresh-verification marker made that test reject without resetting attempt or receipt identity history.
- Reconciliation-transition failure initially persisted `reconciled` prematurely; the regression now confirms unresolved journal and retained admission when TaskStore transition fails.
- Explicit credential redaction initially failed because no sanitizer existed; the test now loads a synthetic selected key and confirms allowed env keys and redacted output. This fixture is not authenticated model execution.
- Docker fixture initially used Windows short-name temp paths while real adapter canonicalized them; fixture paths were corrected to actual canonical sources. No product mount validation was weakened.

## Validation and qualification limits

Final command results are recorded below after completion. An earlier complete suite passed 76 tests with one explicit live-Docker skip; added auth/reconciliation coverage increases the final total. One typecheck was started before concurrent build declarations settled and reported stale `NativeWorkerAuth` augmentation types; the sequential post-build rerun passed. No product change was needed for that invocation ordering issue.

`node distribution/build.mjs` succeeded and produced `dist/company-agent-qu3jqc` containing compiled runtime and worker packaging inputs. Clean installation, frozen artifact manifest/hash audit and Linux lock qualification remain Task 5. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` succeeded in `packages/company-delegation/runtime`; its lock includes Linux optional Codex/Claude payloads. This proves lock generation only, not a Linux image install or execution.

The Docker backend was unavailable; no further daemon probes, image build/run, live readonly qualification or authenticated native model requests were performed. No internal endpoint/model was provided. Codex keyless DSH bootstrap is observed; authenticated Codex and Claude behavior and the Linux worker boundary remain explicitly unqualified. Unit fixtures validate orchestration and terminal states only. Like Task 3 storage, host file checks assume a trusted host rather than a hostile concurrent filesystem operator. Independent scoped review and push belong to root.

## Final results

- `pnpm test`: **exit 0**, including the final build. Verification: 27 pass / 1 explicit live skip; task state: 20 pass; native delegation: 16 pass; context: 4 pass; bundle: 11 pass. **78 passed, 0 failed, 1 skipped (79 total)**.
- Actual keyless compiled DSH worker in the final suite: **pass**, 18.2 seconds. Existing actual SDK and Web integration fixtures: **pass**, 36.7 and 45.7 seconds respectively.
- `pnpm typecheck`: **exit 0**, sequentially after compiled declarations were current, all five packages.
- `pnpm build`: **exit 0**, both independently and within the final root test command.
- `node distribution/build.mjs`: **exit 0**; packaging seam output recorded above. No clean install or artifact-freeze claim is made.
- `git diff --check`: **exit 0** before staging. No runtime behavior changed after the final passing tests.
- Commit: Task 4 implementation commit produced immediately after this report; root receives its exact hash. No push by this agent.
