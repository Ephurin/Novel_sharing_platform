# C-01: individual review versus atomic Canon commit

The current FE wire contract stays stable. For a multi-proposal dependency group, use the
existing group acceptance endpoint and submit the complete persisted group. A single-item
approval is valid only for a genuine singleton group. Selecting one member of a larger group
returns 422 (INVALID_PROJECTION / complete dependency group), without mutation. A concurrent
winner or stale version may instead produce the existing 409. Do not automatically approve
the other members on behalf of a single-item request; reload and request explicit group approval.

## Acceptance entry points inspected

| Entry | Path to authoritative PostgreSQL transaction |
|---|---|
| Public Node POST /api/v1/ai/proposals/:id/edit-and-accept | Owner/evidence checks → Python edit-and-accept → service accept_proposal_by_id → accept_proposal → repository accept_proposal_group |
| Trusted Python POST /v1/proposals/:id/accept | Service-token boundary → same service/repository path, unedited |
| Trusted Python POST /v1/proposals/:id/edit-and-accept | Same transaction, with B5 payload validation |
| Public Node POST /api/v1/ai/proposal-groups/:id/accept | Owner/evidence checks → Python group route → service complete-group preflight → same repository transaction |
| Trusted Python group accept | Same service and repository; public Gateway checks are not relied upon for completeness |
| Direct service accept_proposal / accept_proposal_by_id | Same repository transaction |
| Direct service accept_proposal_group / accept_proposal_group_by_ids | Same repository transaction |
| Direct PostgreSQL repository accept_proposal_group | Authoritative membership/status/identity/projection validation under transaction locks |
| Service/repository decide_proposal(accepted=True) | Legacy PostgreSQL status-only path removed; delegates to atomic Canon acceptance, then reads the committed proposal |
| Existing autonomous-controller group caller | Already calls Python group accept; inherits the guard. No P3 code changed or new P3 execution authorized |

Node does not mount an unedited /proposals/:id/accept route. Its trusted Python counterpart is
covered directly over HTTP. Reject endpoints record a final rejection, not staged approval;
rejected group members are included in persisted membership and cannot be silently omitted.
Legacy JSON/in-memory adapters were inspected; they do not provide PostgreSQL transaction
authority and are not a substitute for the supported P1 PostgreSQL execution/readback gate.
Legacy suggestion-validation status="accepted" is not proposal Canon acceptance.

## Transactional invariant

The repository rejects empty/duplicate IDs, locks the scoped Brain and validates expected version.
It locks selected proposal rows, verifies statuses and a single group, then loads and locks every
persisted member using tenant + novel + dependency_group_id, including accepted/rejected members.
The exact persisted ID set must equal the submitted set. No client count or service preflight can
replace this check. A genuine singleton passes; a subset or mixed/foreign group fails closed.

B5 full replacement payload validation and frozen inventory restrictions run before materialization
under the same Brain lock. Entities/events/facts/transitions, projection, proposal status/decision
rows and the single Brain version increment remain in the existing transaction. Any exception
rolls back all of them. There is no post-commit version write. Overlapping acceptance requests
serialize at the Brain; a loser cannot commit a partial group. Rejection locks its row before
reading status, preventing a concurrent rejection from overwriting a just-committed acceptance.

The old repository decide_proposal(accepted=True) incremented version and marked a proposal
accepted without materializing Canon. It now delegates to the transaction above. Legacy tests
using malformed status-only payloads were changed to valid standalone facts; the stale-version
fixture explicitly assigns two independent groups rather than depending on the partial-approval
bypass. Their original status/version assertions remain, with an added materialized-fact assertion.

## Future two-phase review: design note only

Phase A could save per-item human choices (approve/reject/edit) as staged review. Proposals remain
pending Canon; no artifact or Brain version changes. A group review version/CAS must bind author,
tenant, novel, immutable revision/hash, complete membership, proposal payload versions, frozen
inventory and expected Brain version. Staged edits must preserve original proposed payloads and
immutable evidence. Retrying a decision must not create competing authoritative choices.

Phase B would validate a complete compatible decision set, dependency closure and any rejection
policy, then atomically commit the authorized result using the existing Canon transaction. An
entity rejection cannot leave an approved event/transition referencing it. Concurrent/stale reviews
must reload/reconcile. Only successful Canon commit advances Brain once. Existing accepted means
canonical approval; it must never be reinterpreted as noncanonical staging.

Current ProposalDecisionRecord has actor, accept/reject/edit_accept, edited payload, reason and
timestamp. Its database check constraint admits only final decision labels; it has no staged/final
discriminator, group review CAS version, source/membership snapshot or unique active review choice.
Proposal status is currently pending/accepted/rejected. These records are insufficient to safely
promise a durable staged-review contract merely by reusing accepted or adding an unchecked JSON key.

A future durable staging feature therefore needs a separately reviewed storage/API design, likely
a migration for staged review/group version records (or explicit extensions with suitable constraints),
plus new FE contracts for saving choices, loading/reconciling review state and explicitly committing
a group. Product must decide how rejected dependencies invalidate the review. None of those states,
migrations or endpoints is introduced for C-01. Existing complete-group FE approval stays unchanged.
