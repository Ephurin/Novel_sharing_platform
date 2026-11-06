# P2-01 bootstrap foundation contract

Scope: backend-only intermediate foundation on `integration/p2-planning-studio`.
The mounted AuthorMemoryPanel currently sends `extract`; it receives explicit 422 until P2-02. This PR does not claim usable setup extraction, M0, M-FIRST or Planning Studio acceptance. Existing manuscript entry remains the P1 path. Codex owns all later frontend work.

## API and compatibility

Gateway public prefix `/api/v1/ai`, Python prefix `/v1`:
- POST `/story-brains/bootstrap/from-idea`: existing fields `novel_id`, `idea`, `outline`, `locale`, `preferences`, `author_constraints`; additive `mode: extract|blueprint` and optional body `idempotency_key` (1–128 chars). Missing mode preserves legacy blueprint compatibility. Top-level and nested preferences reject unknown fields. `extract` is intentionally 422 `EXTRACT_NOT_IMPLEMENTED`, before reservation/provider; never secretly invokes blueprint.
- POST `/story-brains/bootstrap/from-manuscript`: existing immutable revision list/options; optional body `idempotency_key`. Legacy identity is preserved when key absent. Explicit-key payload hashing includes locale. Manuscript nested validation behavior otherwise remains P1-compatible.
- POST `/story-brains/{novel_id}/baseline/activate`: existing `job_id`, unchanged P1 DTO. Transaction revalidates scoped job, eligibility, required membership/terminal decisions, competing workers and active status under Brain lock. Missing required rows do not count as approved. No new client CAS field is promised in this slice.

Exact authorized replay returns the persisted job even after activation, without external work. Same explicit key with changed input returns 409 `IDEMPOTENCY_CONFLICT`. New operations on active Brain return 409 `ALREADY_ACTIVE`. New competing queued/running/entity-review job returns 409 `BOOTSTRAP_IN_PROGRESS`. Pending or missing required decisions return 409 `BASELINE_REVIEW_REQUIRED`; ineligible activation returns 409 `BOOTSTRAP_NOT_REVIEWABLE`. Stale blueprint finalization returns 409 `BRAIN_VERSION_CONFLICT`. JSON new bootstrap and activation return 503 `BOOTSTRAP_REQUIRES_POSTGRES`. Malformed DTO returns 422. Gateway retains active AUTHOR/ADMIN + ownership checks and ignores caller tenant headers; configured Python repository tenant mismatch is 403. This remains a single configured tenant deployment.

## Lifecycle and persistence

Selectively ported from PR72 `bb0ad38824c2d107929032ae10073d006a2b5851` relative to its `749b4bf3` base; no wholesale branch merge or evidence import. PG admission locks scoped advisory key → Brain → job. Active admission precedes blueprint generation. Manuscript read-only active preflight precedes immutable source access; authoritative admission rechecks under lock. Blueprint reserves before provider and atomically finalizes analysis run/proposals/job after token/version revalidation. Network calls remain outside transaction. Activation uses same lock order and terminal review validation. No migration; existing tables and result JSON suffice. Newly created empty Brain is draft, never implicitly active.

Job result metadata includes `bootstrap_input_hash`, `source_hash`, `mode=blueprint`, `origin=model_proposed|author_supplied`, reservation token, contract_version and required proposal IDs. These are foundation metadata, NOT P2-02 immutable setup snapshot/readback or span provenance. Author constraints/preferences retain legacy blueprint mapping in this bounded slice; their separate nonhistorical storage and context lanes remain P2-02 work. No future event or fake revision is created here. Blueprint proposals remain pending until existing Canon/HITL approval.

Failed blueprint replay/resume returns persisted failure without redispatch; start a new explicit operation to retry. Manuscript failed worker resumes durable chapter checkpoints. Crash-abandoned running reservation has no recovery lease and remains fail-closed; do not claim exactly-once provider delivery or automatic recovery. JSON is unsupported for lifecycle authority. Review/identity/Writer lease/revisions/outbox/Canon transaction and plan storage are reused unchanged.

## Next DTO work (P2-02, not implemented)

Freeze distinct setup input, hints, outline/future intent and private constraints; persist immutable setup snapshot/hash/version and source_kind/origin/author decision; authorized readback. Extract must ground explicit setup entities only; blueprint remains creative proposals. No event-history promotion from either setup or future outline. M0/null-baseline bridge is P2-04, no fabricated manuscript revision.
