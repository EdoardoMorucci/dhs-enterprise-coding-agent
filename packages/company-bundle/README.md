# Company DSH bundle

The published DSH runtime and authoring APIs are pinned to `0.2.0-rc.2`, with Cordis `4.0.4`. Run `pnpm install`, `pnpm build`, then use `pnpm company-agent` from the repository. Root tests build the plugin before invoking actual DSH processes.

```powershell
pnpm company-agent demo reset
# Use the returned candidate path, your actual model id and endpoint:
pnpm company-agent configure --endpoint http://127.0.0.1:11434/v1 --model YOUR_MODEL --api-key-env DSH_LOCAL_API_KEY --workspace C:/candidate/path
# Set DSH_LOCAL_API_KEY in the process environment, never in committed files.
pnpm company-agent doctor
pnpm company-agent start
```

Open the token-bearing URL printed by DSH to authenticate the normal Web UI. Internal is the default; `--profile hybrid` selects a separate home and store. `--root PATH` selects the deployment data directory. The launcher ignores personal DSH_HOME and starts DSH from the trusted profile directory so candidate project configuration cannot become launcher configuration. `start --dump-config` composes the actual CLI profile without inference and is repeatable.

`company_task_start` binds one task to the actual session, using a host-derived id and configured candidate path. `company_task_state`, `company_read_file`, `company_write_file`, `company_verify`, and `company_finish` expose state and evidence as ordinary DSH tool results. Generic shell, file, web, workflow and delegation tools and stock presets are disabled; a final monotonic guard denies any later unapproved tool. Per-agent catalog restriction uses the rc.2 `agent.ctx` API. Company tool calls and verification are serialized across this runtime's candidate.

The synchronous context provider reads a cache hydrated before each admitted step. Other middleware rejections are preserved. Completion permits two repair steers; a separate 24-step turn bound prevents endless tool loops. Exhaustion persists `needs_review`. A plain conversation without a started task remains allowed. A model claim cannot mark success: only current, successful Docker evidence and host `finish()` can. Cancellation before dispatch consumes no attempt; after dispatch the bounded verifier owns cleanup and the receipt is retained. A resumed interrupted verification requires host reconciliation.

`verify` runs standalone Docker acceptance and stores a separate CLI receipt; it does not complete a session task. `verify --development-process` is explicitly **unisolated development execution** and cannot establish task completion. `status` reads persisted snapshots without opening another writable TaskStore; live freshness is available through `company_task_state` in the UI.

One launcher owns each profile using an exclusive ownership file. A crashed launcher leaves that file in place: verify the runtime and its external operations have stopped, reconcile unknown outcomes, then remove the stale file manually before restarting. Never run a second direct DSH process against the same state directory. Filesystem links, traversal, Windows special paths and files larger than 256 KiB are rejected. This application boundary does not provide an OS sandbox against a hostile concurrent filesystem operator; candidate code executes only in the separate Docker verifier.

`pnpm package:runtime` creates an additive compiled runtime tree under `dist`. Copy that directory elsewhere, run `npm install` there, and use `node scripts/company-agent.mjs`. It includes compiled domain modules, host verifier bridge, example knowledge and buggy candidate seed; it excludes tests, correct reference implementation and research cache. Transitive runtime artifact locking/reproducible archive qualification is a separate distribution step.

Tests named **deterministic protocol fixture** use a local SSE server to exercise the actual DSH provider, loop and tools. They do not qualify a live model. Docker, real model tool-use, native authentication and hybrid worker isolation remain separately qualified capabilities. The hybrid profile currently reserves the trusted controller seam and loads no native delegation providers.
