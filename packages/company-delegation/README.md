# Optional native delegation

Only an explicitly configured hybrid profile exposes `company_delegate`. The deterministic sequence is Codex writer → independent host Docker verification → Claude Code reviewer on a captured snapshot → independent final host verification. It reserves two remaining verification attempts before dispatch. Native text is returned for the parent to read; it never grants approval or verified state.

Internal profiles do not evaluate this package or native provider plugins. The native providers run only in one-shot containers through the actual DSH `ctx.subagents.start` API and an idle parent with `/workspace` cwd. No extra model controls the sequence.

Build compiled assets with `pnpm build`. The Linux recipe uses `runtime/package-lock.json`, `npm ci`, retained optional native dependencies, and an operator-selected immutable Node 24.13.0 glibc image:

```
node packages/company-delegation/runtime/build-image.mjs node:24.13.0-bookworm-slim@sha256:<base-digest>
docker image inspect company-native-worker:rc2 --format '{{.Id}}'
```

Use the observed image ID with `company-agent configure --profile hybrid --native-image sha256:<worker-image-id> --writer-credential <absolute-file> --reviewer-credential <absolute-file>` alongside the ordinary endpoint/model/workspace options. Build context contains compiled own files and the locked Linux install recipe; no Windows `node_modules` or credentials are copied. No image publication is performed.

Each credential is an explicitly selected, bounded JSON **file**, outside the candidate and protected from writes by the candidate. Its content is `{"kind":"api-key","value":"<selected-key>"}`. Claude also accepts kind `oauth-token`. Do not place real values in configuration, commands or source control. Host code checks only path/type/size; each container reads only its selected mounted file. Grant the container UID 10001 read access to that file. Codex runs its official `login --with-api-key` command with the selected value on stdin, storing auth only in its isolated tmpfs `CODEX_HOME`; a successful `--version` does not establish authentication. No account-store discovery or authentication fallback is used.

Containers have immutable image identity, unprivileged UID, readonly root, dropped capabilities, bounded resources, private IPC and isolated tmpfs. The only bind mounts are the exact project candidate/snapshot and the selected credential file. Bind recursion is disabled. The explicitly selected bridge network permits native inference; it is **not** an egress allowlist. Do not provide repo or unrelated service credentials. Reviewer startup attempts overwrite, creation, rename and deletion in the actual project mount before calling Claude; all must fail while reading and tmpfs writes succeed. Host digests must remain unchanged. These checks are operational qualification when the container runs, not a claim that Docker has been qualified on this development host.

Every native dispatch is persisted before container creation, with run/provider/role, deterministic container name, paths, image/auth references, digest and deadline. The container's confirmed stopped state is persisted before removal. Abort/timeout stops then kills if necessary and inspects the named container; killing the Docker client alone is insufficient. Raw stderr is bounded and discarded. Invalid/duplicate protocol output and contradictory process exits fail closed.

One persistent lease sits in `.company-admission` beside the canonical candidate, preventing concurrent mutation even across separate configured data roots. Task start, writes, verification, finish and native delegation use it. A crash or uncertain cleanup keeps mutation blocked. State/read remain available. The lease records its original configured root; do not manually remove it to bypass reconciliation.

After stopping the runtime and inspecting partial changes, run `company-agent native-reconcile --profile hybrid --root <original-root> --acknowledge-partial-changes`. The host command checks dead ownership, converges every unresolved named container, captures the current candidate digest, marks journals reconciled and releases the lease. Missing containers do not prove no writes occurred; the acknowledgement explicitly preserves partial changes. The command grants no acceptance, and an uncertain writer requires a fresh verification receipt. No agent tool can invoke this reset. Retry the command if reconciliation itself is interrupted; no native work is automatically replayed.

Qualification: deterministic transport/terminal fixtures validate orchestration and failure handling only. The test suite also boots compiled workers through the actual DSH CLI without credentials and requires `AUTH_UNAVAILABLE`. Docker Desktop was unavailable and no native credential or model endpoint was supplied; Linux image execution, actual readonly mount enforcement and authenticated native calls remain unqualified.
