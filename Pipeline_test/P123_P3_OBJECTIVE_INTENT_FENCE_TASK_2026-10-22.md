# ACTIVE CODEX TASK — P3 objective intent/accept atomicity and bounded regression

**Assigned:** 2026-10-22 Asia/Bangkok
**Execution:** `codex/ai-copilot-pipeline-test` ONLY
**Independent review:** `Pipeline_test/reviews/2026-10-22-p123-headless/p1-race-p3/GPT6_P1_P3_INDEPENDENT_REVIEW.md`
**Contract:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4
**Priority:** P3 in-flight objective skip/stop safety P0; preserve accepted bounded P1/P2 and re-run shared regressions. No frontend.
**Active policy:** `HOLD_FE_INTEGRATION_ONLY`; 0 live model/embedding calls; 0 paid charges; no historical data, volumes or evidence mutations.

## Current precise finding

Source `c34a0251dbc6d15fd2af7a8b1ead787adf892100` demonstrates:
- `autonomous-controller.service.ts:stepRunLocked()` reads the active objective, generates a draft and checks only `currentRun.status` before `acceptDraft()`. It uses a stale `eligibleObj` plan snapshot.
- `ai-service/api/narrative_routes.py` allows `PATCH /story-plans/:plan/objectives/:objective` to write `status=skipped` while a controller step is executing, without an objective generation fence or expected transition version. Per-run step lock does not cover this author edit.
- Real offline negative evidence `P3-negative/inflight-objective/` records objective skipped **before** completion of generation yet one later accepted `AI_DRAFT_ACCEPT` immutable revision. Canon did not advance; nevertheless this is a real P3 consistency blocker.
- Source/evidence review accepts the bounded P1 ordered-writer fix and P3 happy paths **only in their stated scopes**. Do not repeat broad context architecture analysis or call this P3 Core PASS.

## P0 — Define and implement safe minimal objective intent semantics

Choose and document one safe behavior for explicit author skip/stop while generation is in flight, then make it **atomic** with the accept boundary:
1. **Preferred semantic:** If author skip/stop commits before draft acceptance, the associated generation becomes superseded, cannot create an AI_DRAFT_ACCEPT revision/outbox or advance canon/objective; late output may be retained **only** as unaccepted diagnostic/draft candidate with clear source/job provenance. If the accepted revision commits first, later author skip/stop must not erase/pretend it never existed; make state and UI-facing result explicit and durable.
2. A narrow fallback policy can reject skip with an explicit 409 `OBJECTIVE_BUSY` while active generation is outstanding **provided rejection and acceptance share a DB-backed atomic exclusion and the objective status remains unchanged**. Do not report "cancellation succeeded" for a rejected edit. Stop must have a defined analogous policy.
3. Implement a durable shared synchronization/fence for objective status/intent vs revision acceptance, not just `GET` immediately before accept. Accept must validate `run_id`, `plan_id`, `objective_id`, pinned plan/objective intent version and allowable status at the same effective commit boundary as the immutable revision/outbox; verify race at both seams. Consider conditional state transition, row lock under transaction, persisted objective attempt token/epoch or a correctly scoped shared lock across mutations and acceptance. Keep author ownership/novel authorization and read-only UI contract compatibility.
4. Do not create ghost accepted revisions on skip, or auto-approve entities/canon, or publish chapters. Avoid lock inversion with the existing chapter writer lock, run lock and plan objective updates. Do not keep a DB transaction open over provider network generation unless explicitly bounded and justified.
5. Ensure retry/idempotency/restart handles a superseded job. A restart after a committed cancellation must not accept a previously generated result. If no safe backward-compatible method is available, document `P3_OBJECTIVE_FENCE_ARCHITECTURE_BLOCKED` with real RED and a concrete minimal API/schema design, and stop before claiming PASS.

## Required deterministic tests — NOT just the happy path

Use a fresh isolated project per meaningful scenario, including self-owned real PostgreSQL/Mongo, supported authenticated API, actual backend/AI controller and loopback fake provider. Preserve old failure artifacts:
- `skip_commits_before_accept`: delay generation after genuine outbound receipt; skip succeeds before accept, **zero** accepted AI revision/outbox from skipped objective and unchanged canon. If the approved MVP contract uses busy-409 instead, assert exact 409 and objective unchanged.
- `accept_commits_before_skip`: accepted revision first; later skip/stop records truthful history and cannot erase/duplicate canon/revision. State/response must be coherent.
- `stop_during_generation`: author stop before acceptance, late generation cannot be silently accepted; verify persisted run state and no additional step after stop. If stop returns conflict, document contract.
- `stale_attempt_or_objective_version`: old objective/run intent/replaced or skipped objective cannot satisfy accept preconditions; compare objective/plan versions and whole run status.
- `two_step_workers`: existing 409 RUN_STEP_BUSY and no duplicate generation accept; objective mutation must share protection with real worker.
- `kill_or_restart_at_boundary`: crash before/after acceptance transaction, then replay/resume without ghost revision/canon, duplicate events or hidden auto-resume.
- `HITL_checkpoint`: only simulated authenticated author entity-review/continue may allow canon advance; preserve future-plan != historical canon.
- Regression of existing-plan and no-plan **two-objective** journeys; each chapter DRAFT and correct final state. Re-run P1 ordered-writer, P2 idea→M-FIRST core tests after shared changes, AI/backend focused suites, migrations on new DB, typecheck/build where applicable.

When writing test barriers, keep instrumentation confined to owned offline harness/test-only preload, not permanent production bypass. Show precise before/after HTTP responses, plan/objective status and version, run, job/generation, PG latest revision/outbox counts, Mongo draft version/hash, memory and actual transmitted fake provider context hashes. Maintain human actor labels `SIMULATED_HUMAN_VIA_API`.

## Safety and evidence discipline

- NO `web/` changes, FE PR #52/#54/#55 cherry-pick/merge, new frontend work, direct main/FE branch writes or publishing. Historical S09 browser RED remains.
- NO real Gemini/OpenAI/embedding API calls or real spend; fake provider only, guarded egress and empty keys. Preserve existing source gold, reports, ledgers and all RED evidence.
- New isolated test-owned Compose/PG/Mongo/account/novel/run IDs and volumes; no destructive cleanup of previous sessions. SQL fixtures limited to test-owned isolation; **author plan decisions through supported API**, not direct DB canon writes.
- Report scoped `P3_OBJECTIVE_FENCE_BOUNDED_OFFLINE_EXECUTOR_PASS` only if **all mandatory cancellation/stop interleavings** and no-ghost-revision invariants pass. Otherwise `P3_CORE_PARTIAL/BLOCKED` with exact negative evidence and unrun matrix. Still no full P3/UI/live/literary/100k acceptance.

## Deliverables / review stop

Save under `Pipeline_test/reviews/2026-10-22-p123-headless/p3-intent-fence/`:
- `P3_INTENT_FENCE_REPORT.md` — accepted semantic, comparison against prior RED, fixed source file/line, atomic boundary and remaining limitations.
- `P3_FUNCTIONAL_MATRIX.md` — existing-plan, no-plan, cancellation/skip/stop, version races, entity checkpoint, retries/restart, 2+ objectives and ending gate; PASS/FAIL/BLOCKED/NOT_RUN.
- `validation.json`, `commands-and-exits.json`, deterministic REPRO RED/GREEN traces, provider containment/ledger, read-only DB/HTTP hashes, exact tested source SHA/clean status.
- Source fix commit first; test exactly that clean SHA; separate sanitized evidence commit. Hand off for GPT-6 independent source/evidence review. **Do not automatically run P3 100,000–105,000-word final or provider live without separate new approval**.
