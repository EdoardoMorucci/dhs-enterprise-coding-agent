# Bounded company context

`buildCompanyContext({ state, knowledge, maxChars? })` returns model-independent system context. Supply fresh authoritative state from `TaskStore.get(taskId)` and host-curated `{ title, text }` documents. The builder does not read files, recover tasks, invoke models, or grant completion.

The default budget is 16000 JavaScript string characters (UTF-16 code units), with a configurable 512–64000 range. This is a deterministic character budget, not a tokenizer-specific token estimate. The completion contract, objective, acceptance criteria, task phase, attempt count, reconciliation flag, current evidence digest/status/result, receipt reference and pending checks come first. If that required data alone exceeds the budget, the builder throws instead of silently dropping acceptance requirements.

Hypotheses, curated example conventions, and most recent history are included as complete JSON data sections only if they fit the remaining space. Oversized optional sections are omitted; they cannot displace required state. Inputs are not mutated. The host is responsible for curating knowledge and providing sufficient context budget for the selected model.

The documents in `company-knowledge` describe example conventions for this demo, not actual company policy. Candidate file content is not curated knowledge. Task and document data does not override the host's completion contract.

Workspace exports are TypeScript source; `pnpm -r build` emits the separate compiled package in dependency order.
