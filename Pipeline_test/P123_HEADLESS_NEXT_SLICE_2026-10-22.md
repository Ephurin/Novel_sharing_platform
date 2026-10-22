# ACTIVE CODEX TASK — P1 core safety closure, then P2 headless idea bootstrap

**Date:** 2026-10-22 (Asia/Bangkok)
**Branch:** `codex/ai-copilot-pipeline-test` ONLY.
**Decision:** `HOLD_FE_INTEGRATION_ONLY` remains in force.
**Review input:** `Pipeline_test/reviews/2026-10-22-p123-headless/GPT6_P1_CORE_INDEPENDENT_REVIEW.md` (source/evidence accepted for next development, **P1 full PASS not granted**).
**Supersedes as single executable task:** `P123_HEADLESS_CORE_DELIVERY_TASK_2026-10-22.md`'s first bounded P1 slice, now delivered. Use that document and `WORKFLOW_CONTRACT.md` v1.4 for product definitions. Do not rewrite historical task/evidence.

## Priorities, not another document-only review

**First goal: reduce outstanding P1 core blockers with tests and minimal compatible backend/AI-service fixes.** Once the bounded set is executed or honestly BLOCKED, continue **P2 core headless idea→first chapter** on a fresh project. P3 remains queued after P2. No UI/React work or waiting for FE PR approvals for independent core tasks.

### P1-A: optimistic concurrency / stale-write, test before change

- Inspect the current production `PATCH /chapters/:id` path, draft Mongo version handling, PostgreSQL metadata transaction and immutable revision/outbox creation. Capture current schema/behavior for `expectedVersion`, `draftVersion` and 409. Existing branch currently does **not** provide a versioned PATCH compare-and-swap; the existence of `draftVersion` is not a stale-write guarantee.
- On new test-owned DB/novel, reproduce two authenticated updates targeting the same prior draftVersion, including rapid B→A→B equivalent *at HTTP/core level only* and both concurrency orderings. Ensure failure evidence remains preserved.
- Consult PR #55's related backend contracts **read-only**, distinguish patch-compatible changes from stacked migrations. If a narrow **backwards-compatible backend-only** version guard is implementable safely on this branch, implement it with bounded tests (only one competing writer succeeds, loser gets precise 409; no stale revision/outbox/canon). If API semantics require an unresolved cross-branch contract decision, do **not** fabricate an API and do **not** touch `web/`; instead document `P1_CONCURRENCY_BLOCKED_PENDING_CONTRACT` and proceed with other independent core gates/P2.
- Preserve valid repeated-identical-save idempotence, existing clients and authorization. Production FE/browser S09 remains RED, never label it fixed from API tests.

### P1-B: actual accept-generated-draft integration

- On new isolated project, invoke supported generation through backend→AI Service→fake gateway, then **POST /chapters/:id/revisions/accept-draft** with actual job ID. Test immutable revision source/metadata, draft state, outbox idempotency, subsequent entity checkpoint, proposal review, approved canonical readback and failure/retry. This is separate from the already verified ordinary PATCH save.
- Use provider scripted payload only for flow test; no model quality claim. If blocked by stale/empty generation, preserve raw sanitized artifacts and state.
- Guard that controller/accept logic cannot publish automatically.

### P1-C: real DB crash/transaction and context edges

- Inject one failure at a meaningful **real DB/worker** boundary (e.g. after revision commit before outbox finalization or before canon materialization) and demonstrate bounded retry without duplicate revision/event/fact and no premature brain/objective advance. Do not damage other runs, no global reset. If impossible to inject safely, report exact technical blocker and narrower tests honestly.
- Seed an actual locked rule and enough context to trigger pruning/overflow through supported API and capture fake HTTP request, with locked rule retained or an explicit fail-closed route. Observe explicit retrieval-disabled metadata; don't call embeddings.
- Re-test current temporal cutoff and explore legacy/declared entity unknown `first_chapter`. Establish policy without assigning invented chronological origins. Report bounded vs unknown-state behavior.
- Re-run AI + backend focused regressions and the existing 33-check headless baseline on **fresh new run-owned resources** only if it is safe; preserve all previous evidence and sample gold. No need to run the whole suite on every micro-commit; final tested SHA must be exact.

### P2: first independent headless journey

- On its **own new test-owned** author/tenant/novel, start with `bootstrap/from-idea` in explicit `mode=extract` using setup containing unambiguous entity mentions. Capture raw machine propositions and `SIMULATED_HUMAN_VIA_API` review, then approve baseline and durable M0. Must not replace extraction with creative blueprint output or silently canonize invented lore.
- Create/activate/read versioned future Story Plan and prove planned events remain absent from historical events. Generate first chapter through supported API and **accept or ordinary-save** into immutable revision (label the branch used); run entity checkpoint→event/fact proposals→canon, M-FIRST readback and memory continuity into a second writing request.
- Verify same-owner/wrong-owner isolation, genuine HTTP gateway→fake upstream payload and persisted hash; inject one P2-specific failure, resume safely and record provenance. Record source/idea input hash and actual accepted revision hashes. No UI PASS inferred.
- **Do not wait for FE:** P2 may advance when P1 concurrency is documented BLOCKED, provided the shared persistence flow is not silently claimed safe.

### P3 next handoff, not an automatic live run

After bounded P1/P2 evidence is complete, prepare exact P3 functional core checklist: existing-plan and no-plan entry, HITL pause/resume without auto approving, idempotency/failure guards, no auto publish, objective completion. Do not launch 100k or external provider until separately authorized.

## Evidence & handoff

Write distinct `Pipeline_test/reviews/2026-10-22-p123-headless/next-slice/` artifacts:
- `P1_REMAINING_GATES.md` and `P2_CORE_REPORT.md` with supported APIs/actual results, explicit PASS/FAIL/BLOCKED/NOT_RUN, not an updated historical M0 claim.
- `validation.json`, sanitized request/capture hashes, immutable revision/outbox/canon/proposal IDs, DB migration/rollback and tests commands/exits, concrete failing before/after artifacts.
- Updated `FE_BACKEND_CONTRACT_HANDOFF_NEXT.md` **without changing FE code**, especially versioned PATCH behavior vs PR #55.
- `P3_NEXT_GATE.md` listing unattempted P3 requirements.

Push code on **this branch only**, test exact committed source SHA, then push sanitized evidence commit. Do not modify old reports, projects, ledgers, historic run fixtures or source gold. No direct `main`/FE writes, no PR merges, no publishing, no external Gemini/OpenAI/embedding calls, no paid provider spend. Use new isolated Docker Compose project/PG/Mongo volumes and empty real API keys.

Return exact tested code SHA, evidence SHA, commands, run IDs, counts, leak checks, negative test results, declared skipped steps, and stage verdicts `P1_CORE_...`, `P2_CORE_...`, `UI_BLOCKED_FE`, `REAL_PROVIDER_NOT_TESTED`. Stop with a genuine bounded handoff for GPT-6 source/evidence review; do not upgrade P1 or P2 from fake-only tests to live/UI acceptance.
