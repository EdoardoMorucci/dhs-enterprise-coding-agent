# Example order-service conventions for this demo

These are curated example conventions, not claims about an actual company policy.

Preserve the caller's request identifier across retries. Retrying after an ambiguous timeout must produce one order for the same request, while distinct request identifiers represent distinct orders. Reject invalid input and conflicting reuse of a request identifier.

Investigate before changing code: record a concrete hypothesis and the pending check that could disprove it. Keep edits scoped to the candidate and explain the observed acceptance evidence. Do not infer correctness from an attractive UI or a confident answer. Host-owned checks and correct-reference fixtures stay outside the candidate.
