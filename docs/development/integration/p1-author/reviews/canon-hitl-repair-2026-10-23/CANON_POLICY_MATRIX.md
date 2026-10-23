# Canon decision authority

Contract: pipeline WORKFLOW_CONTRACT.md v1.4 (2026-10-21), P1 review loop and P3 mode distinctions. New task supersedes older promt.md outbox auto-materialization text and branch restrictions. No new API policy selected.

| Flow | Authorized behavior | Current result |
|---|---|---|
| P1 Save / Accept Draft | Immutable source + transactional outbox; extraction leaves pending proposals; author reviews canon | Repaired and exercised through real HTTP/PG/Mongo |
| Generic analysis worker, all modes | Deliver idempotent extraction; no accept/reject/edit canon authority | Exactly one analysis request; no proposal/brain lookup or canon mutation |
| Outbox COMPLETED | Successful extraction delivery; may leave required human checkpoint or canon review outstanding | Verified pending proposals remain pending after COMPLETED; not canon acceptance |
| Author accept | Gateway owner check, trusted group resolution, novel/latest revision/hash scope and optimistic brain version | Actual owner accept changes projection once; replay conflict leaves projection/version stable |
| Author reject/edit | Existing reject audit semantics; edit accepts reviewed payload with latest-source and version fences | Real reject leaves canon unchanged; edit materializes reviewed event summary |
| P3 legacy, review disabled | Existing controller owns revision-scoped downstream accept; existing intent and quality gates remain | Production controller unchanged; unit regressions executed; no full runtime step certification |
| P3_HITL_CONTROLLER_100K, review enabled | Stop waiting_for_entity_review; human frozen source/inventory checkpoint; continue then scoped controller canon approval | BLOCKED: integration lacks flag, AI review routes and waiting state. This worker repair does not implement or certify HITL |
| Unattended acceptance | Requires separately supported/versioned policy | No new authority granted; legacy is not relabeled HITL/unattended acceptance |
| Context / future plan | Approved projections only; pending knowledge and future intent separate from history | Source reviewed, canonical before/after checked. Pending-only/future-only counterfactual tests NOT_RUN |

The obsolete six outbox tests explicitly required implicit approval. They were replaced by six production-handler tests tied to v1.4; failure/retry/idempotency/claim-token assertions remain. No controller feature was removed. No direct SQL was used to fabricate Story Brain baseline, proposals, approvals or human checkpoints.

Decision/implementation proposal for owner: separately reconcile the existing pipeline entity-review state machine/routes and explicit mode configuration into integration; validate revision/intent/guidance/checkpoint fences before enabling HITL. Preserve controller-only legacy approval while disabled. This task does not invent a mode switch or grant background-worker authority. Independent acceptance must wait for that work and its real runtime proof.
