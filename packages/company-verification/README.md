# Orders demo and verifier

`pnpm demo:reset` prints a new workspace path under `.company-agent/demo-workspaces`.
It never deletes or replaces an existing workspace. Run `pnpm demo:start <workspace>`
and open the printed loopback URL. Create an order with timeout simulation checked,
then retry the same request: the deliberately buggy seed commits two orders.
State is in memory only; restarting clears it. The server and UI have no dependencies.
Reference code and host acceptance tests are never copied into the demo workspace.

`runVerification({ workspace, artifactsDir, mode: 'process' | 'docker', timeoutMs? })`
captures every candidate file, executes that snapshot and writes a host-generated
`<artifactsDir>/<runId>/report.json`. Artifacts must be outside the candidate.
`sourceDigest` is SHA-256 over snapshot file paths, modes and contents, including
hidden and nested files. Empty directories are included. Symlinks and special files
are rejected; input is limited to 8 MiB and 512 entries. Recompute
`fingerprintWorkspace(workspace)` before using a report after any edit.

**Process mode is unisolated and development-only.** The candidate runs with the
host user's filesystem and network access. It must not be used for untrusted code
or authoritative deployment acceptance. Docker mode requires the local image
`node:24.13.0-alpine` (prepare it with `docker pull node:24.13.0-alpine`). It runs
with no network, read-only root and candidate/bridge mounts, user 65534, all
capabilities dropped, no privilege escalation, 64 PIDs, 128 MiB and 0.5 CPU.
The reference and authoritative host assertions are never mounted into Docker.
Missing Docker/image, crashes, malformed protocol, output over 64 KiB and timeout
fail verification; there is no fallback to process mode.

The host owns the expected orders and all pass/fail assertions. The bridge only
executes `createOrderStore`, `create` and `list` and simulates transport response
loss after commit. A candidate's `passed: true` is never accepted as evidence.
This behavioral suite does not qualify models, native workers, offline operation,
webinar readiness, or provide a general adversarial sandbox security proof.
