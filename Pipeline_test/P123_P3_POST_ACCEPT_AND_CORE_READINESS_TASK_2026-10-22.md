# ACTIVE CODEX TASK — P3 post-accept intent safety + P1/P2/P3 core readiness

**Assigned:** 2026-10-22 (Asia/Bangkok)
**Branch:** `codex/ai-copilot-pipeline-test` ONLY
**Authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4
**GPT-6 independent review:** `Pipeline_test/reviews/2026-10-22-p123-headless/p3-intent-fence/GPT6_P3_INTENT_FENCE_INDEPENDENT_REVIEW.md`
**Prior tested source:** `a7081c6932e33bd5500d0ca40604afe6bb0d51e4`
**Prior evidence HEAD:** `a77a2451b3e590a8308f911a0eac5d614b9fa0e8`
**Status:** `HOLD_FE_INTEGRATION_ONLY`. The bounded P3 **pre-accept** intent fence is accepted as source/evidence; aggregate P3 Core remains PARTIAL until post-accept progress is resolved.

## Goal and stop criteria

Finish **one focused** P3 safety slice and then publish an honest all-three-use-case core readiness matrix. Do **not** loop into unlimited hardening. Do not redo P1/P2 functional builds, build a new FE, integrate FE PRs, or run live provider/100k tests.

### P0 — Post-accept skip/stop → memory → objective progression atomicity

Source finding to reproduce or refute: `autonomous-controller.service.ts` accepts generated draft under correct run/objective intent fence, **then** rechecks only run.status while it processes outbox, `approveAutonomousMemory`, evaluates and issues unconditional status update `completed` using the earlier `eligibleObj` snapshot. Author skip/stop can commit after revision acceptance but before downstream analysis/canon/plan progress.

1. Define policy explicitly before implementation:
   - Already committed `AI_DRAFT_ACCEPT` revision and outbox are immutable historical data; cannot be erased.
   - If author skip or stop commits **before** controller's canon approval/objective progress step, the superseded objective must not be auto-approved into official Story Brain nor silently rewritten from `skipped` to `completed`. Leave prior accepted revision attributable and require author-controlled reconciliation/review as appropriate.
   - If canon/objective advance already committed before skip, preserve truthful history and status; do not imply skip rolled back committed changes.
   - Human Entity Review ON must still halt at `waiting_for_entity_review`; only API-mediated `SIMULATED_HUMAN_VIA_API` decisions can resume and approve. A stale resume cannot revive a skipped/stopped objective.
2. Deterministically **reproduce** post-accept/pre-outbox, post-accept/pre-proposal approval and pre-objective-completed skip/stop interleavings with real isolated PG/Mongo/backend/AI-service and loopback fake upstream. Capture exact HTTP request timeline, plan/objective intent_version, run, accepted revision lineage, outbox states, proposal group approvals, official memory and restart readback. Preserve RED artifacts if reproduced, label source hypothesis if not.
3. Implement the narrowest **durable** mutual exclusion or conditional objective-intent/epoch transition spanning each unsafe downstream decision. Do not rely on a final GET, in-memory lock, or stale plan snapshot. Respect SQL lock order established by `controller-intent.ts`; avoid long DB locks held across external provider calls. If atomic canon approval across different stores/services cannot be guaranteed, fail closed and document the safe serialized API transition/reconciliation policy; do not claim cross-store ACID.
4. Verify no ghost canon or automatic objective advance, no duplicate revisions/outbox on retry, no skipped-to-completed overwrite and truthful run terminal/retry behavior. Preserve accepted-first semantics and regular P3 happy paths.
5. Test unauthenticated/wrong-owner actions, stale objective epoch, repeated stop/skip, unexpected plan replacement, worker SIGKILL/restart at meaningful downstream seam, and HITL replay. Use new test-owned resources; abort unsafe injection.

### P1 — No-plan contention / native worker scheduling

- Executor's `p3-no-plan` first failed preflight, `p3-no-plan-02` conflicted with a real background worker, and `p3-no-plan-03` succeeded with a **bounded evidence-side adapter** retrying `RUN_STEP_BUSY`. Diagnose scheduler / manual step contention as a real integration concern.
- Either demonstrate the production-supported caller can reliably handle conflict with deterministic backoff on a fresh 2-objective fake-only run, or document an explicit `P3_SCHEDULING_CONTENTION_LIMIT` with exact HTTP behavior and consumer contract. Do **not** treat a test-only adapter as a product feature.
- No unbounded polling, automatic publishing or real model egress.

### P2 — Single P1/P2/P3 Core readiness handoff, no premature full acceptance

Create `Pipeline_test/reviews/2026-10-22-p123-headless/core-readiness/P123_CORE_READINESS_MATRIX.md`:
- P1 manuscript/bootstrap, official canon, writing and durable revision/outbox with P1 writer race + crash/reload bounds.
- P2 idea explicit extraction, approved baseline, future plan distinct from historical canon, accepted first chapter and M-FIRST.
- P3 existing/no plan, 2+ objectives, HITL, cancel/stop before accept and **after accept**, no publish, objective completion, terminal and crash/resume limits.
- For each stage: actual supported API path, source tested SHA, evidence refs, `PASS_BOUNDED_EXECUTOR` / `FAIL` / `BLOCKED` / `NOT_RUN`, remaining risk and ownership. List prior GPT-6 reviews separately and flag **remote evidence inspection vs actual independent runtime**.
- Explicit separate gates `UI_BLOCKED_FE` (S09 RED), FE PR #52/#54/#55 read-only compatibility, `REAL_PROVIDER_NOT_TESTED`, `SEMANTIC_RAG_NOT_ASSESSED`, `LITERARY_QUALITY_NOT_ASSESSED`, `P3_HITL_CONTROLLER_100K_NOT_RUN`.
- Provide `FE_BACKEND_CUTOVER_CONTRACT.md` as read-only handoff: actual schemas and migration order (including 0013 objective intent, PR #55 stacked migrations 015/016 and expectedVersion/428 differences), request/response version handling, Auth/ownership, `409`, draft/latest revision and human review states. No merge/cherry-pick/FE code edits or speculative cross-branch assumption.
- Re-run only impacted P3 scenarios, P1 writer + P2 headless sanity and focused regressions at **exact clean committed source SHA**; preserve all past artifacts (including prior RED). New evidence under `Pipeline_test/reviews/2026-10-22-p123-headless/post-accept/`.

## Completion / acceptance boundaries

- `P3_POST_ACCEPT_INTENT_BOUNDED_OFFLINE_EXECUTOR_PASS` is permitted only if both commit orders and stop/skip after acceptance satisfy the documented policy with real DB/HTTP readback, no unsafe canon advancement and no silent overwrites; otherwise `P3_POST_ACCEPT_BLOCKED`.
- Even after this, only propose `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` (not the final product E2E PASS). A new independent source/evidence review determines release readiness.
- Keep one documented finite handoff; do not automatically start 100,000–105,000-word P3, provider-backed testing or FE integration.

## Hard boundaries

**NO `web/` edits**, no FE PR integration/cherry-pick/merge, no main writes, no real Gemini/OpenAI/embedding egress, no payment, no auto publish, no historical evidence/gold/ledger mutation. Use fresh test-owned isolated PG/Mongo/Compose volumes, accounts, novels and run IDs; fake upstream only. API-mediated human decisions must be labeled `SIMULATED_HUMAN_VIA_API`. Commit production/test source first, test clean exact SHA, commit sanitized evidence separately and stop for GPT-6 review.
