# Gemini 3.8 / Antigravity — P1 live resume, budget approved

**Priority:** ACTIVE directive for P1 Wave 1, dated **2026-10-21**.  
**Source branch ONLY:** `codex/ai-copilot-pipeline-test`.  
**Existing run:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`.  
**Baseline that received offline validation:** `fcbf945cb9acb0b849b8614fa67c29580615a26b`.  
**First preflight evidence commit:** `737007b3090fe01abf9d1abcc3700cdd69b734fd`.  
**Independent review:** `Pipeline_test/reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md` (review commit `c77167091decf7c103914b0eda2624774db4dee9`).  
**Authority:** The project owner explicitly approved the limited **P1 live** provider budget in the ChatGPT conversation on **2026-10-21**: **at most 200 provider-call attempts, USD 5.00 total, 2 hours elapsed live wall-clock**. This is **permission within all three ceilings**, not an instruction to consume them. No separate authorization is granted for P2, P3, 100k, production deployments or other branches.

## Immediate instruction: read the review before making any live call

On the named branch, read this file, `ACTIVE_GEMINI_TASK.md`, the GPT-6 independent review, `WORKFLOW_CONTRACT.md` revision 1.3, `SHORT_LOOP_TEST.md`, `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`, `NARRATIVE_MEMORY_AUDIT.md`, the current run `REPORT.md`, `NEXT_REVIEW.md`, `checkpoint.json`, `run_config.json`, `validation.json` and existing evidence logs. **Do not infer pass from historic reports.** The newly authorized budget supersedes **only** the former `LIVE_PROVIDER_BLOCKED_BUDGET` missing-approval condition; all technical guards and acceptance requirements remain.

No separate memory is shared between (a) the Gemini 3.5 Flash-Lite AI Studio API writing/extraction engine and (b) the Gemini 3.8 Antigravity tester. Use actual application/provider traces rather than assumptions about model identity.

## A. Non-negotiable isolation and provenance

1. Confirm `git branch --show-current`, `git status --porcelain`, and exact HEAD before and after. Fetch/pull fast-forward if clean and safe; do not force checkout, reset, clean, stash unknown work, rebase, merge `main`, cherry-pick, open PR or push another branch. Work **only** on `codex/ai-copilot-pipeline-test`. `main`, `UI`, `astra/*` are out of scope.
2. Inventory local containers, port bindings, Compose project `p1-live-01`, volumes, PostgreSQL/MongoDB target and recent outbox state using read-only inspection. Verify that this run actually owns those resources before reconnecting. If any owner/binding mismatches or another agent is using them, **STOP**. Never change the historical `2026-10-19-recovery-ui-01` stack or its five outboxes.
3. Reuse the existing run/novel only when state inspection proves it is clean and not partially advanced; checkpoint currently reports no novel/revision, zero provider calls. Do **not** blindly recreate or repeat a write. Retain preflight report/evidence as immutable history; add a clearly named `live-resume` appendix/new evidence within the same run with exact code/config hashes and timestamp. If isolation cannot be established, create a **separate fresh run** and mark old run blocked, without destroying the old resources.
4. Changes for this phase are limited to **test-local configurations, safe isolation/budget metering and honest run reporting** on this branch. Do not alter application logic, source fixture, gold, canonical records or unit-test expectations to make a live test pass. When a true product defect blocks a case, record reproduction and stop that case; request separate scoped fix/retest rather than silently patching during the evidence run.
5. Existing compose includes `LLM_PROVIDER: fake`, published non-loopback ports, fixed sample credentials, and a `down -v` teardown suggestion in `NEXT_REVIEW.md`. These are **not** acceptable for real-provider execution: prepare a **test-only safe override** with loopback-only host bindings (or verifiable equivalent) for database, Mongo, backend, AI and web; generate fresh ephemeral test secrets locally without committing them. Use only the credentials approved for this test. Avoid leaking secrets via `docker compose config`, commit/log output or screenshots. Prefer an untracked/private override for secrets; a sanitized checked-in override may contain nonsecret settings only.
6. Do **not** run `docker compose down -v`, unscoped `docker rm/prune`, `dropdb` or broad volume removal. No teardown until evidence is captured; then only individually proven run-owned resources, with sentinel and absence evidence. `NEXT_REVIEW.md` teardown instruction must be **superseded in an addendum**, not silently followed.

## B. Budget contract — hard STOP on the first reached limit

Record owner authorization as `approval_reference: "User explicit P1 budget authorization in ChatGPT on 2026-10-21"`, `approved_by: "project owner"`, `max_provider_calls: 200`, `max_cost_usd: 5.0`, `max_wall_clock_hours: 2`; keep the earlier preflight records intact. Apply **the same cumulative budget to ALL Google AI Studio calls** made by the whole isolated P1 run: bootstrap, entity discovery/verification, event/fact, embedding if used, planning, generation, reconciliation, consistency, **background workers and retries**. Count each external request attempt, including failed responses and retries, not just one UI action or successful response. Do not include the Antigravity agent's internal reasoning calls in the **application-provider** budget; report their costs separately if known.

**All of these must be enforced, not only written in JSON:**

- Global total external provider-call attempts: `<=200`; stop **before** issuing attempt 201. Ensure asynchronous/background worker calls count and cannot race past the cap; throttle or pause only the **new isolated test** workers if needed.
- Monetary spend: `<=USD 5.00` total for this run. Derive pricing from a verified current source for the *effective* model and actual billable units, including retries/inputs/outputs/caching/embedding if relevant; capture rate/source/date and observed provider usage. Use a cautious admission threshold (e.g. stop scheduling new work at estimated $4.50) so outstanding usage cannot breach $5.00. Provider free-tier/quota does not justify assuming zero billed cost. If accurate enough metering/enforcement is unavailable, **STOP: BUDGET_METER_UNVERIFIED**, log `UNKNOWN`, and seek guidance rather than making unbounded calls.
- Elapsed live wall-clock: `<=2 hours` from timestamp of first provider-call attempt, including pauses/restarts, not just sum of active API durations. Record `live_started_at`, monotonic or UTC deadline and `live_ended_at`. Do not reset the budget or start clock by renaming a run. Stop at or before deadline.
- Before each provider-bound phase, check counters + remaining budget, expected pending worker calls and estimated next-step spend. Enforce maximum bounded retries per action (`run_config.json` currently `3`), no infinite retry, and fail closed on missing meter or inability to stop background calls. Stop when *any one* ceiling is met even when others remain. Never split calls into another run to evade the limits.

First verify AI service actually uses the authorized **Gemini 3.5 Flash-Lite from Google AI Studio** for generation/extraction, not `LLM_PROVIDER=fake`. Inspect provider config and code to discover correct env variable names. Confirm `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`, `entity-human-review-v1`, backend and AI migration head `0012_entity_guidance` (or newer actual branch head), effective model ID/version, real external call trace, and disabled/unintended fallback paths. A declared model name, healthy endpoint or policy flag alone is not proof.

**Provider preflight gate before the first billable request:** demonstrate safe config, actual callable request-count guard, metering and clock-limit guard with non-provider/deterministic tests where feasible; record evidence, then one bounded real smoke request and its actual effective model/usage. If the smoke cannot confirm real provider, do not proceed.

## C. Correct the GPT-6 preflight findings with append-only evidence

Before the live S01–S11 test, close or explicitly block these review IDs, with exact evidence paths:

- `REV-P1-01`: fake provider in checked-in compose; verified real AI Studio test-only configuration and effective model/call trace. No committed key.
- `REV-P1-02`: budget approval now exists **but live execution remains conditional on working hard limits**, signed-off run_config and counters before first call.
- `REV-P1-03`: limit published ports to loopback or equivalent; remove static secrets from live runtime, validate ownership and network boundaries.
- `REV-P1-04`: saved backend targeted log shows **60 PASS**, not the **26 PASS** in REPORT/validation. Add a dated correction/addendum with exact invoked commands; do not rewrite historical log or conflate suites.
- `REV-P1-05`: AI-service `397 passed, 2 skipped, 42 deselected` and backend targeted tests are **not** entire system acceptance. Clearly label selection and omitted suites.
- `REV-P1-06`: current-run `memory_items.csv` and audit files contain only headers. Establish **immutable pre-output binding** to the original frozen 35 narrative gold assertions plus separate entity/mention/alias/negative sets. Record hashes, source IDs and expected-items manifest before seeing LLM output. Never change frozen gold to fit results.
- `REV-P1-07`: append missing `ISSUE-BUDGET-001` and `ISSUE-ENV-LINEEND-001` as actual issue-ledger entries, and note budget gate is now authorized but technical preflight still required.
- `REV-P1-08`: prohibit and supersede unsafe `docker compose down -v`; resource-by-resource ownership check before any cleanup.
- `REV-P1-09`: P1 S01–S11 were not run; keep `NOT_RUN/BLOCKED` evidence history, no imaginary P1 pass.

If corrections need a test-only code/script/config change, commit only that change on the named branch with a clear "pre-live config repair" boundary; save source + config hashes. Do not silently mutate the previously tested code SHA in the old report. Validation/run_config can be **versioned with an addendum** and checkpoint updated as current state (record transition from budget block), while preserving original report/logs.

## D. Run the live P1 author workflow (no P2/P3 yet)

When A–C are satisfied, execute **S01–S11** exactly per `SHORT_LOOP_TEST.md` + `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md` using browser UI for author actions and **read-only** API/SQL for verification. Start with original five source chapters and verify server readback/hash; then entity hints, entity occurrence/alias/type decisions, `waiting_entity_review`, freeze, continue event/fact, canon review, baseline, ordinary save auto-extraction, plan vs historical canon, rapid saves and stale guards, consistency and reload/resume. Never call write API as a bypass for missing UI.

Separate model raw decisions from author edits; audit M0 and M-FIRST, ensure no fabricated entity occurrences or silent identity merges; compare with frozen 35 narrative assertions and separate entity/mention/alias gold. Report missing/incorrect facts honestly, including `MEM-CRITICAL-001`, and outbox status versus downstream completion. No publication.

If provider budget/external outage/UI/backend issue prevents all steps, checkpoint exactly where stopped. Do not declare `P1_PASS` on unit or partial results.

## E. Deliver and stop for independent review

Save append-only evidence under **`Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`**, or a new uniquely marked run if isolation requires it. Include a `LIVE_RESUME_REPORT.md` with tested and running hashes, commands/results, phase-level counts, provider usage, estimated & known spend, elapsed time, stop reason and P1 S01–S11 matrix; `REVIEW_FINDINGS_CLOSURE.md` (REV-P1-01...09), and audit/evidence/screenshots/secure logs.

Update current `checkpoint.json` and run config with budget approval/counters and full provenance (do not overwrite original preflight claim without documenting revision). `REPORT.md` may link to the new addendum and preserve historic preflight verdict as dated. State P2/P3/100k = `NOT_RUN` for this wave. Log `PASS/FAIL/BLOCKED/NOT_RUN` per step with exact evidence IDs. Be truthful about claims not independently verified.

Once complete or blocked, push **only sanitized new test-local docs/config/evidence** on `codex/ai-copilot-pipeline-test`; do not create PR or merge anywhere. Return commit SHA, run path, P1 gate verdict, top blockers, totals (provider-call attempts, spend estimation/certainty, elapsed wall-clock), whether all nine review findings are closed, and next checkpoint. Final status must be either **`P1_LOCAL_EVIDENCE_READY_FOR_INDEPENDENT_REVIEW`** or **`P1_BLOCKED:<reason>`**. Do not start P2/P3 or 100k until a separate instruction.
