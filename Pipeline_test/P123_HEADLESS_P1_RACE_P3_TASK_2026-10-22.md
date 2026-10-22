# ACTIVE CODEX TASK — P1 ordered-writer safety + P3 bounded headless controller

**Date:** 2026-10-22 Asia/Bangkok
**Branch:** `codex/ai-copilot-pipeline-test` only.
**Source authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4
**Review authority:** `Pipeline_test/reviews/2026-10-22-p123-headless/next-slice/GPT6_P1_P2_INDEPENDENT_REVIEW.md`
**Priority:** P1 ordered-write race reproducibility/repair FIRST; then bounded P3 headless controller functional. P2 bounded fake-only evidence was accepted with limitations and need not be rerun until shared code changes require regression.

## P0 — Reproduce and resolve versioned draft ordering across Mongo and PostgreSQL

The reviewer found a **source-derived, not yet runtime-reproduced interleaving**:

`PATCH chapters.service.ts`: Mongo CAS of A v1→v2 succeeds; A pauses before PostgreSQL metadata/revision/outbox. B reads v2, CAS v2→v3 and finishes PostgreSQL/revision/outbox for B. Then A resumes PG snapshot and later Mongo reconciliation uses snapshot timestamp rather than original CAS version. This may replace newer body B with old A in Mongo and/or leave older body A as latest canonical revision/outbox. Existing tests only race same expectedVersion (one 200, one 409), and cannot disprove this two-success ordering.

**Required work:**
1. Re-read `backend/src/modules/novels/{chapters.service.ts,draft-chapters.repository.ts,chapter-revisions.service.ts,chapters.repository.ts}`. Verify actual call order, lock lifetime, revision/outbox and Mongo sync logic. Compare latest PR #55 read-only for expectedVersion/428/409 semantics; do not cherry-pick or edit FE.
2. In a fresh test-owned Docker project, write a deterministic **two-success interleaving test**, using distinct valid versions. Force A to pause after its CAS before PG side effects; B proceeds to commit; resume A. If actual runtime rejects the interleaving safely, capture the mechanism and update the review verdict with reproducible negative evidence. Otherwise preserve RED evidence with Mongo and PostgreSQL before/after snapshots, immutable latest revision, outbox and readback after restart.
3. If RED reproduced, apply the **smallest compatible backend-only** fix ensuring final newer version/body B cannot be overwritten by a stale A; every materialized revision and corresponding outbox has correct fenced/order provenance, and no silent rollback of fresh Mongo. Consider per-chapter serialized mutation, durable version-fenced outbox/saga, or equivalent. Do not treat locking PG alone, timestamps alone or a same-version 409 as adequate. Test B before A and A before B, including crashes after Mongo CAS/before PG commit and after PG commit/before Mongo reconciliation if feasible. If safe resolution requires larger product contract choice, mark `P1_ORDERED_WRITER_BLOCKED` with concrete options instead of hacky patch.
4. Preserve optional legacy PATCH compatibility unless an explicit contract change is approved. Record limits with unversioned and mixed clients. Add backend tests and actual HTTP/Mongo/PG evidence; run P1/P2 regression on new resources. Do not falsely promote S09 browser: still FE owned and RED.
5. Preserve all prior historical evidence, source fixtures, gold and ledgers. No code changes under `web/`, no FE branch writes, no merges, no production DB changes.

## P1 — P3 functional headless controller (after P0 bounded handoff)

Do NOT start a 100k novel or call real provider. Use newly initialized test-owned PG/Mongo/identity/ledger and a fake upstream scenario separate from historic P1/P2 artifacts. Follow `Pipeline_test/reviews/2026-10-22-p123-headless/next-slice/P3_NEXT_GATE.md`.

- **Existing-plan entry:** approved baseline from source or idea → owned versioned active Story Plan → controller create/start/step/run → durable planned objectives with correct scope/versions.
- **No-plan entry:** no active plan; controller proposes and activates a future Story Plan through actual supported production service. Fake scenarios must include chapter progression and explicit ending target; reject an invalid/backward/missing-ending generated plan. Do not preinsert plan in DB or claim no-plan PASS via a preexisting plan.
- **HITL gate:** run with human entity review ON. On new source occurrences, status must pause at `waiting_for_entity_review`. No controller automatic entity/official canon approval while blocked; resume only after authenticated API decisions clearly marked `SIMULATED_HUMAN_VIA_API`, then materialize source-scoped canon and resume objective. No UNATTENDED claim.
- **Bounded multi-objective loop:** generate through real backend/AI Service → fake HTTP upstream → validated draft accept → immutable revision/outbox/analysis → entity review → canon update → objective completion and terminal criteria. Require more than a one-step smoke; durable readback including parent revision and context hashes. All chapters remain DRAFT, never publish.
- **Failure safety:** test fake upstream 5xx, stale brain/plan, duplicate step/retry, interrupted worker and restart, objective mutation during in-flight generation, wrong-owner and cross-novel plan. Accept only what the actual product contract supports; make missing safeguards explicit BLOCKED with negative evidence.
- **Telemetry and claims:** preserve actual failed attempts; no silent resets. Report `P3_CORE_BOUNDED_OFFLINE_EXECUTOR_PASS` only for fully run cases; otherwise `P3_CORE_PARTIAL` or `BLOCKED` with exact unmet gates. `P3_HITL_CONTROLLER_100K` remains NOT_RUN.

## Evidence and handoff

Put new sanitized reports under `Pipeline_test/reviews/2026-10-22-p123-headless/p1-race-p3/`:
- `P1_ORDERED_WRITER_REPRO_AND_FIX.md`: source analysis, failing/protected exact interleavings, replay, version/revision/outbox/ledger readback, legacy and cross-store limits.
- `P3_FUNCTIONAL_REPORT.md`: matrix for existing/no plan, HITL, objective, terminal, idempotency, faults, publication safety; exact run IDs, hashed fake HTTP and DB evidence.
- `validation.json`, commands/exit codes/tested SHA, source/fixture/gateway containment, failures and skips.
- Separate code commit, test exact clean SHA, then evidence commit; no claims from dirty/uncommitted source. Independent GPT-6 review of both scopes before calling full P1/P3 PASS.

**Safety:** 0 actual Gemini/OpenAI/embedding/provider calls and 0 paid spend; offline fake only, no live API keys, owned isolated volumes and service auth. No frontend/Author IDE changes, no PR merging, no publishing, no main branch writes, no modification of past evidence. `HOLD_FE_INTEGRATION_ONLY` remains active. Work may proceed on P3 independently if P1 reproduction is demonstrated but resolution honestly BLOCKED by interface/architecture, yet aggregate P1 core safety cannot be marked PASS.
