# ACTIVE ASTRA TASK — P1/P2/P3 Core ↔ FE Integration Preflight (READ-ONLY / ISOLATED)

**Date:** 2026-10-22 Asia/Bangkok
**Repository:** `Ephurin/Novel_sharing_platform`
**Source branch:** `codex/ai-copilot-pipeline-test` only; verify latest HEAD first.
**Executor:** ASTRA (previous authorization closure executor; if Gemini executes, label actual executor)
**GPT-6 acceptance:** [GPT6_JOB_RESUME_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_JOB_RESUME_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md)
**Accepted production source:** `7d1f1bed508480db84def77c75c99039a9bacd7e`, with evidence HEAD `cdffb2803f1bcac30f3daa93959240fc126055ea` and later review-only commits.
**New gate:** `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` is approved for **preflight/planning ONLY**. `HOLD_FE_INTEGRATION_ONLY` remains: DO NOT merge or edit the frontend.

## Outcome: finite, actionable owner-facing FE/backend integration preflight

Deliver a concrete **contract conflict register and prioritized owner task map**, with optional non-merged disposable migration/API rehearsals, then stop for GPT-6 review. Do not start broad P1/P2/P3 features, real providers, narrative 100k, new FE screens or production migration.

### T0 — Rebase facts without changing branches

- Trace exact current refs/SHAs for pipeline, `main`, PR #52, #54 and #55 including #55 stacked base #54 (not an independent direct-main merge). Capture update timestamps and state; inspect GitHub PR bodies/diffs/files read-only.
- Read `Pipeline_test/reviews/2026-10-22-p123-headless/core-readiness/FE_BACKEND_CUTOVER_CONTRACT.md`, `P123_CORE_READINESS_MATRIX.md`, `WORKFLOW_CONTRACT.md` v1.4, the new GPT-6 delta acceptance, current source and PR code. Treat prior contract report as a hypothesis until reconciled against **current** PR SHAs.
- Do not reset/clean any dirty worktree, overwrite historical evidence or clone over existing volume; use detached temporary analysis worktrees when helpful. Never push to main or PR branches.

### T1 — Concrete FE ↔ API compatibility matrix

Audit actual consuming FE hooks/components AND route/backend schema/error semantics in the proper PR head versus the pipeline branch; **quote file path and line or immutable SHA**. Cover:
1. Chapter GET/PATCH autosave: draft `version`/optional `expectedVersion` (pipeline) vs PR #55 required `expectedVersion` + HTTP 428 for title/content, stale 409, local recoveries, version 0 bootstrap, ABA/save collision and S09 historical RED.
2. Immutable revision `accept-draft`, accepted replay, snapshot/restore and outbox/latest chapter, writer lease ordering across Mongo CAS + PG. Prevent replacing the P1 ordered-writer regression fix with a simpler untested FE-branch save service.
3. Auth/ownership and active account: new `GET /ai/jobs/:id` and `POST .../resume` ownership enforcement from `7d1f1be`; 401/403/404 contract, no direct AI internal service; entity HITL API actor/tenant scope.
4. P2 idea/setup, explicit author review, plan/story-brain data, no-plan first chapter, future-plan != canon.
5. P3 run/step/stop, `waiting_for_entity_review`, stale `OBJECTIVE_INTENT_SUPERSEDED`, `RUN_STEP_BUSY` 409, terminal, delayed canon/proposal review and draft-only/publish states.
6. Reader/admin/author metadata, import, chapter publication/moderation and notifications only to the extent PR #54/#55 create collisions with pipeline Core. Tag unrelated FE feature scope as owner-follow-up, not Core bug.

For each contract row: `pipeline source/path`, `PR source/path`, `compatibility PASS / CHANGE_REQUIRED / NOT_TESTED`, exact HTTP/DTO and affected test, **owner FE vs Core**, severity, and a minimal approved repair direction **without implementing FE**. Do not claim UI tested merely because a hook is present.

### T2 — Migration conflict rehearsal, strictly isolated

- Inventory the **exact migration file names and ordering** of both trees. Pipeline has backend SQL `012_reports_unique_open.sql`; stacked #54/#55 includes `012_novel_engagement.sql`, `013_novel_review_text.sql`, `014_novel_editorial_metadata.sql`, `015_author_workflow.sql`, `016_author_launch_checklist.sql`; AI Alembic `0013_objective_intent` is a different revision system. Do not assume both 012 files are interchangeable.
- Audit how runner tracks full filename vs numeric prefix, schema idempotency, foreign keys/data backfills, order/downgrade and concurrency. Produce a **proposed combined migration order** with collision check and dry-run plan; any renaming requires owner review.
- If local Docker and source for both trees available, perform migration rehearsal on **new empty isolated** DB in temporary non-merged composite working tree, recording source SHA for each file and exact results. Do **not** create a merge commit, push combined branch, or mutate historic DB. If unavailable, explicitly mark `COMBINED_MIGRATION_RUNTIME_NOT_RUN`; no fabricated PASS.

### T3 — S09 browser and FE issue handoff

- Check PR #55 latest Playwright/Author IDE autosave state and Issue #56 from current GitHub evidence. If a browser/Playwright environment exists, run a **read-only, isolated** reproduction against PR source and fresh backend fixtures without editing `web/`; retain exact failing trace and clean source SHA.
- If unavailable, explicitly retain `S09_BROWSER_RED_UNVERIFIED_THIS_RUN`, cite last proven RED and assign FE developer follow-up; do not treat PR review, mockup or screenshot as S09 success.
- Give FE developer clear integration check order: mount revision/draft API against finalized Core, preserve local autosave buffer and expectedVersion, simulate stale 409 and missing-version 428 choices, then browser S09, then publication/notifications smoke. Core owner separately covers schema/migration/privilege compatibility.

### T4 — Handoff artifacts and STOP

New directory `Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/`:
- `FE_BACKEND_DELTA_MATRIX.md` with file/line and current immutable PR SHAs.
- `MIGRATION_COLLISION_MATRIX.md` including runner behavior, proposed order and actual disposable runtime log or NOT_RUN.
- `S09_FE_HANDOFF.md` with issue/PR status, repro status and exact FE-owned next actions.
- `P123_INTEGRATION_GATE_MATRIX.md`: Core bounded accepted vs remaining blockers; `READY_FOR_FE_DEV_WORK` is not `MERGE_ALLOWED`. Separate P1/P2/P3 FE E2E, S09 browser, combined migration, security/tenant, provider, semantic RAG, prose quality and 100k.
- `commands-and-exits.json` for commands actually run; source checks, redaction, environment and SHA/read-only assertion. If no runtime, no shell command fabrication.

Only documentation/new test evidence on pipeline branch, no production source edits unless a **new high-severity Core bug** is verified and separately isolated with owner-level instructions; do not silently patch cross-branch code. Request final GPT-6 review. **Do not merge any PR, deploy, spend live provider credits, publish novel content, or start a 100k run.**

## Safety and scope

`HOLD_FE_INTEGRATION_ONLY`, zero production `web/` modifications, no direct writes to PR #52/#54/#55 or `main`, no frontend implementation, no live Gemini/OpenAI/embedding API/credits, no deployment, no automated canon approval, no historical data/volume cleanup. Preserve Codex, Gemini and ASTRA evidence (including RED), perform only read-only PR checks and test-owned isolated experiments, report limitations honestly.
