# Example completion conventions for this demo

These are curated example conventions, not claims about an actual company policy.

The host owns persistent task state, acceptance checks, and verification receipts. Model-generated text is a proposal, not completion evidence. The agent may describe hypotheses and pending checks; it may not supply a verification report or write a verified flag through a model tool.

Finish requires the latest completed verification attempt to pass in Docker and its recorded digest to match the current candidate contents. Process mode is unisolated development evidence. Missing Docker, model configuration, or native authentication is unqualified, never a live success.

Candidate changes invalidate completion. Host startup explicitly recovers interrupted verification into needs_review. Reconcile unknown outcomes and cleanup before retrying. Cancellation does not roll back edits or external work. Verification is sequential and allows an initial attempt plus at most two repair attempts.

Store data and authoritative receipts stay outside the candidate workspace. Internal and hybrid profiles use different data directories. An internal profile must not load external delegation providers or fall back to public inference. Credentials never belong in Git.
