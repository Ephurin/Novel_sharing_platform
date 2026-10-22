# ACTIVE ASTRA TASK — Repair legacy Mongo reconciliation test fixture; seal FE/Core cutover decisions

**Assigned:** 2026-10-22 Asia/Ho_Chi_Minh  
**Executor:** ASTRA; GPT-6 independent reviewer  
**Repository/branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test` ONLY  
**Last actual P0 fix tested source:** `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`  
**ASTRA draft-read evidence HEAD:** `b094e9a3c7574f3a029445f69a5b125df017bec7`
**GPT-6 final bounded delta acceptance:** [GPT6_DRAFT_READ_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_DRAFT_READ_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md)
**Mode:** `HOLD_FE_INTEGRATION_ONLY`. FE code remains FE-owner-only. This is a **short test-fixture and owner decision handoff**, not another Core feature implementation.

## State already completed — DO NOT repeat

P1/P2/P3 headless Core bounded accepted; previously independently identified `JOB_RESUME_OWNERSHIP` and `CORE_DRAFT_READ_SCOPE` P0 repairs now source/evidence accepted, subject to limited scopes. Current `GET /chapters/:id` and `GET /novels/:id/chapters` are private AUTHOR/ADMIN+actual active ownership, while `/reading/*` still gates PUBLISHED/VIP. ASTRA's draft read RED→GREEN, 54 focused backend PASS, typecheck/build exits 0 at `d7d9651`; GPT-6 review did not rerun tests. Combined **empty** DB migration rehearsal 18 backend SQL + AI Alembic 0013 already delivered by preflight. PR #52/#54/#55 remain separate/unmerged. Full S09 Author IDE is **NOT accepted**; PR55 hook-only fixture PASS is narrower.

## Workstream A — Fix three pre-existing Mongo/PG test fixture failures ONLY

1. At current latest branch HEAD, examine `backend/src/modules/novels/mongo-reconciliation.live.test.ts` and `draft-chapters.repository.ts:syncDraftFromRevisionConditional()` / `chapter-revisions.repository.ts:findLatestRevisionByChapterId()`. Baseline evidence is `astra-draft-read-2026-10-22/baseline-regression-logs.txt`: all 3 tests FAIL with PostgreSQL `22P02` because chapter fixture IDs `live-test-chap-...` are not UUIDs. The same 3 FAIL were reproduced against baseline `7191016f`. This is a test-fixture mismatch, **not proven production fault**. Do not modify production database code or weaken UUID constraints to turn tests green.
2. Use a fresh isolated test-owned PG+Mongo with explicit opt-in (`EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, `EXPECTED_TEST_DB_NAME`) and no historical DB/volumes. First reproduce the three failures using the still-unmodified test at pinned exact source, record actual commands/exits and source SHA. If not reproducible, document environment limitations rather than invent RED.
3. Apply the smallest **test-only** correction to use proper UUID chapter/novel/author identity where required and PG fixtures only where necessary for a meaningful test; if creating PG chapter/revision rows, preserve real schema/foreign keys and use test-owned synthetic author/novel records. If no PG row is necessary for the asserted branch, verify the `latest=null` behavior and that it is actually testing the intended race, not just a vacuous no-revision path. Ensure Probe 1 checks correct revision lineage and Probe 2 stale accept never overwrites newer manual draft, Probe 3 no-draft recovery retains trusted novel/author IDs and version.
4. Existing cleanup deletes only chapter IDs matching the legacy `live-test-chap-` prefix. Switching to UUID **must not leave untracked test records forever or accidentally delete other test/production data**: track exact inserted IDs and delete only those in the owned fixture DB, with finally/after cleanup; preserve before/after test-owned DB snapshot and no-history-deletion guard. Never delete general `draft_chapters` collections, global container volumes or unrelated user data.
5. Commit this test-only source separately, verify clean SHA, rerun all 3 live test probes plus focused 54-test backend authz/revision/outbox suite and typecheck/build; run AI focused tests only if shared source changed (otherwise NOT_RERUN). If any failure persists, preserve full RED and report `MONGO_FIXTURE_REPAIR_BLOCKED`, **do not** expand into cross-store production redesign without independent review.
6. Audit unchanged private draft read AUTHORIZATION and `JOB_RESUME_OWNERSHIP` via focused existing tests; no full P3 100k or live model usage.

## Workstream B — FE/Core owner decision packet (derived from EXISTING reports)

Read current latest `Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/{FE_BACKEND_DELTA_MATRIX.md,MIGRATION_COLLISION_MATRIX.md,S09_FE_HANDOFF.md,P123_INTEGRATION_GATE_MATRIX.md}`. Check current PR #52/#54/#55 immutable heads **read-only**, label any newly moved PR SHA instead of pretending old snapshots still current. DO NOT redo the 18-row analysis or make a composite merge.

Produce a finite one-page `FE_CORE_OWNER_DECISIONS.md` listing **decisions needed before FE implementation**, not premature unilateral API contract changes:
- Draft saving: pipeline optional `expectedVersion` versus PR55 title/content `428 DRAFT_VERSION_REQUIRED`, lost response / retry 409 policy, and version-0 initialization. Indicate proposal/options, FE/Core decision owner, backward compatibility and test acceptance — **do not choose silently**.
- Preserve P1 ordered writer lease, Mongo CAS, immutable versioned revision/outbox and active-baseline M-FIRST when porting PR55 Author IDE autosave/revision/snapshot. No blanket backend service replacement.
- S09 requires **full editor** against compatible Core and fresh data (B→A→Undo B, in-flight save, account/chapter switch, 409 recovery, latest revision/outbox readback); PR55 isolated hook fixture PASS alone is insufficient. The FE team owns actual `web/` work and S09 issue.
- Combined migrations: 18 unique SQL files including two distinct `012` names and PR55 `017_transactional_moderation_evidence.sql`, plus separate AI Alembic `0013_objective_intent`. Already empty-DB rehearsal PASS only; schema owner decides populated-data migration/rolling execution/recovery.
- Product-owner policy for `GET /novels/:id`: DRAFT novel metadata currently public (no chapter body observed); choose whether the public discovery surface may expose unpublished novel title/synopsis/status. **No unauthorized policy change.**
- P2/P3 future FE consumes run/objective/HITL canon review routes and `409 RUN_STEP_BUSY / OBJECTIVE_INTENT_SUPERSEDED`, separate from reader/publish workflows.
- Mark per decision `OWNER_FE`, `OWNER_CORE`, `OWNER_PRODUCT`, `OWNER_SCHEMA`, `NEEDS_APPROVAL`, and include minimal stable source references and acceptance tests. Identify blockers vs optional backlog. Hand off, do NOT comment or submit review to open PRs without user direction.

## Required evidence & stop

Create `Pipeline_test/reviews/2026-10-22-p123-headless/astra-regression-cutover-2026-10-22/` with:
- `MONGO_FIXTURE_BEFORE_AFTER.md`, `validation.json`, real commands/exits and exact clean source SHA(s), test-owned identity/PG/Mongo lifecycle plus sanitized logs and 3 probe readbacks;
- `FE_CORE_OWNER_DECISIONS.md` one-page decision agenda, current PR SHA/scope and S09 outstanding gate;
- `REVIEW_HANDOFF.md` with test PASS/FAIL/NOT_RUN and recommendation for GPT-6, **not** self-signed final acceptance. Commit test-only code first, run against clean committed SHA, commit evidence/docs separately. If runtime unavailable, source review + NOT_RUN explicitly.
- No mutation of Codex/Gemini/ASTRA historical RED/evidence/gold/ledger. No real model/embedding upstream, no payment, no auto-publish, no FE PR merge/cherry-pick, no `web/` edits, no writes to `main`, no deployment, no 100k. STOP for GPT-6 independent delta review.

**Final acceptance boundary:** test fixture PASS + FE decisions packet only establishes `P123_CORE_TEST_HARNESS_CLEANED_AND_FE_HANDOFF_READY` as an executor recommendation. It **does not** certify combined FE/backend E2E, S09, product security, populated migration or production release.
