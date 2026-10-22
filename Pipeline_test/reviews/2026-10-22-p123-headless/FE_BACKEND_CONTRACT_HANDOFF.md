# Current API contract for later FE integration

Frozen source for this bounded delivery: `b5c9c8d` (2026-10-22, Asia/Saigon).
This inventory describes existing backend/AI behavior. No FE code or FE PR was modified.

| Operation | Current request / response | Concurrency or error boundary |
|---|---|---|
| Login `POST /api/v1/auth/login` | `{identifier,password}`; returns user and accessToken | Login bodies/tokens excluded from evidence |
| Create novel/chapter | `POST /novels`, `POST /novels/:id/chapters` | AUTHOR/ADMIN and novel ownership; chapter returns draftVersion |
| Initial immutable snapshot | `POST /chapters/:id/revisions/snapshot`, purpose=MANUSCRIPT_BOOTSTRAP | Allowed before active baseline; 409 CANNOT_BOOTSTRAP_ACTIVE_STORY_BRAIN afterward |
| Ordinary save `PATCH /chapters/:id` | Optional title/content/isVip/priceCoins; autosave boolean. Response has draftVersion and analysisRevisionId | **No expectedVersion field or compare-and-swap guard in current schema**. Unknown fields are stripped by Zod. Do not promise a stale-write 409 or concurrent-writer protection |
| Read draft `GET /chapters/:id` | draft.title/content/wordCount/version/autosave/updatedAt; chapter metadata | draft.version and save response draftVersion use different response shapes |
| Read revisions | `GET /chapters/:id/revisions[/:revisionId]` | Immutable revisionId/contentHash/content; author ownership required |
| Initial extraction | `POST /ai/story-brains/bootstrap/from-manuscript` with novel_id and revision triplets | Async job_id; status waiting_entity_review is a handoff, not completion of canon |
| Entity decisions | GET .../entity-reviews; POST .../:run/review with expected_version and decisions; POST .../:run/continue | Review uses review_version, separate from draft version and brain version. Latest revision guard returns 409 STALE_PROPOSAL_EVIDENCE; stale review version returns 409 ENTITY_REVIEW_CHANGED |
| Canon review | GET .../review-queue returns flat proposals with dependency_group_id; POST /ai/proposal-groups/:id/accept with proposal_ids and expected_brain_version | Group IDs resolve server-side ownership; stale brain/reused decisions return 409; source evidence must still be latest |
| Activate baseline | POST .../baseline/activate with job_id | Required proposals must be decided; entity decisions alone do not activate canon |
| Plans | POST /ai/story-plans with versioned objectives; POST /:id/activate with novel_id; GET /by-novel/:id/active | Future planning_context/current_objective remain separate from recent_events |
| Generation | POST /ai/writing/generations with novel_id/chapter_id/revision_id/content_hash, selection, expected_brain_version; returns async job_id | Backend derives chapter_number and actor_id. Stale brain returns 409. Nullable/omitted selection now normalizes to default offsets. Requests without client idempotency keys now get unique durable identities; explicit replay keys retain semantics |
| Accept generated draft | POST /chapters/:id/revisions/accept-draft with generationId | Present but not executed in this first slice; manual ordinary-save continuation was executed instead. Do not infer accept-draft E2E PASS |

PR #55 comparison is limited to the previously committed Wave 1G source review:
that FE proposal expects an expectedVersion/409 contract that this branch's PATCH schema
does not implement, and its account-switch/autosave behavior remains separately unaccepted.
No claim is made about the latest remote PR head. This handoff does not authorize a blind
cherry-pick, new FE protocol, merge, or changes to Author IDE autosave.

Integration needs after core review: agree on a compatible optimistic-write contract,
verify authenticated account/chapter identity and in-flight save ownership, and rerun real
browser S09 B→A→B plus the remaining UI steps on the FE owner's reviewed patch.
Headless API saves do not close the historical browser defect.
