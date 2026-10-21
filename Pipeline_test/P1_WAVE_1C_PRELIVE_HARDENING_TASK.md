# ACTIVE GEMINI TASK — P1 Wave 1C, offline pre-live hardening

**Assigned to:** Gemini 3.8 in Antigravity (testing/coding agent; NO shared memory with the Gemini 3.5 Flash-Lite writing/extraction API).  
**Branch ONLY:** `codex/ai-copilot-pipeline-test`; **baseline source/fix:** `45bf06c3fba92aee77c2054ef42bd91340d06302`.  
**Read first:** `Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/WAVE_1B_INDEPENDENT_VERDICT.md`, `Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/GEMINI_FIX_REPORT.md`, `Pipeline_test/WORKFLOW_CONTRACT.md` rev 1.3, `SHORT_LOOP_TEST.md`, `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`, `ACTIVE_GEMINI_TASK.md`.  
**Historic failed run:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/` — preserve intact.  
**Scope:** Fix three remaining pre-live blockers + credential hygiene with deterministic offline evidence. Then STOP for GPT-6 independent review. **No Google AI Studio calls in this wave.**

## 0. Boundaries

1. Confirm branch/HEAD and clean or consciously preserved worktree before touching anything. `git fetch`, `git branch --show-current`, `git status --porcelain`, `git rev-parse HEAD`. Fast-forward only when safe. Do not reset/clean/stash unknown changes, merge/rebase/cherry-pick, open PR, or push any branch other than `codex/ai-copilot-pipeline-test`. `main`, `UI`, `astra/*` and unrelated features are NOT authorized.
2. **OFFLINE ONLY. No live paid/provider Google AI Studio requests, including smoke requests, incidental worker calls or retries.** The original 2-hour approval expired `2026-10-21T05:47:52Z` despite 8 of 200 calls consumed. Do not reset/reuse `budget_state.json`, rename the run to bypass time limit or assume unused budget is authorization. Disable all provider egress and old workers before running offline probes. Local fake/stub provider is acceptable on *new isolated test-only resources*.
3. Preserve all failed evidence, five older 2026-10-19 outboxes, existing DB and Docker volumes. No `docker compose down -v`, `dropdb`, unscoped container cleanup or migrations on shared DB. No real credentials or session cookies in committed evidence.
4. Separate product changes (e.g. `verification.py` already patched in Wave 1B) from **test-only infrastructure changes**. Avoid broad refactors to deployed product. If a global budget limiter requires altering existing LLM client seams, limit it to small, opt-in, test-scoped wiring and tests on THIS branch; preserve unchanged default production behavior. Do not modify story gold, model outputs, validator strictness or acceptance criteria to get green.
5. Each distinct acceptance claim needs a path to real evidence, an exact code/config SHA, command, exit status, and clearly recorded limitations. Never mark E2E PASS from Python mock or HTTP API writes.

## 1. P0 — Global mandatory provider pre-dispatch budget gate

**Problem:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/budget_guard.py` protects only in-process callers. `ai-service/core/llm_service.py` and `ai-service/core/llm_client.py` issue provider requests from AI-service container, while `backend` has an independent direct-model path (inspect the actual call sites; do not assume). `execute_p1_journey.py::sync_new_provider_calls` parses Docker logs **after requests finish**. Neither local `threading.RLock` nor `check_admission(next_calls=5)` ensures app-wide 200-call, $5 and 2h ceilings.

**Assignment:** Inspect and document all *actual* outgoing provider paths, provider keys and fallback paths in isolated stack (Gemini direct and OpenAI-compatible backend included). Implement the **smallest verifiable test-only, fail-closed guard** such that every actual provider request must reserve **once, immediately before network dispatch**, through **one shared authoritative ledger** across processes and containers. Reasonable implementation options include a test-only guarded gateway with **enforced egress route + no credential bypass**, or common opt-in provider-client interception backed by a transactional shared store. Pick the least invasive provably complete one and document its trade-offs. **Do not just add a guard to the host runner; do not rely on post-call logs as enforcement; do not merely claim that a sidecar/proxy covers outbound traffic without demonstrating no direct bypass.**

Hard requirements:

- Atomic reserve across **independent processes**, not merely threads, including crash/restart; count every external attempt incl. retries, errors and timeouts. Use stable invocation IDs to prevent retrying the ledger update itself from accidentally double-counting; do not dedupe separate provider retry attempts.
- Strictly enforce **max 200 total requests**, **max USD 5.00 estimated/observed billable cost** (conservative admission cutoff below ceiling, account for concurrent outstanding reservations), and **2 hours elapsed from first call attempt**. The clock is absolute across restart; an elapsed/expired window cannot be reset by reinitializing counters.
- Handle streaming/async/outbox/background workers, fallback provider and backend direct calls. If any route cannot be intercepted and cannot be safely disabled in isolated run, fail closed and report `BUDGET_EGRESS_UNGUARDED`. Do not leak keys to unguarded containers.
- Reserve estimated worst-case spend before dispatch, reconcile actual usage after. If published pricing, token caps, billable categories or usage details are unknown or impossible to bound, record `UNKNOWN` and **do not permit live test**. Do not confuse the existing estimated USD 0.007379 with invoice truth.
- Ledger corruption/availability failure MUST DENY dispatch. Ensure durable-write behavior (no unsafe JSON save fallback which rewrites corrupt files); zero side effects after denial. Avoid clock race at deadline and overspend via parallel in-flight calls.
- **Offline fault injection:** stub provider counts received requests. Prove exactly no dispatch of 201st request; no dispatch past 2h or cost cap; 2+ independent processes race for the last slot; async retry and failed request count; crash/restart; backend and AI-service both use same ledger; container egress cannot bypass guard (or prove their provider-facing routes are disabled). Produce code-level wiring map and exact screenshots/logs or artifacts.

**Important:** If an unavoidable guard requires large production cross-service changes or can't be reliably implemented during this round, stop and deliver a minimal architecture gap/design review; label `BLOCKED:BUDGET_EGRESS_UNGUARDED`, not `PASS`. A truthful blocker is preferable to a fake green gate.

## 2. P0 — Browser E2E evidence must be authentic

- Existing `execute_p1_journey.py` uses Python `urllib` writes but used to label them `LIVE_UI`. Those remain **`S01_API_INTEGRATION_PASS_ONLY`**.
- New filename-based check in `record_action()` currently accepts the mere string `evidence/browser.png` without checking that a browser was used. Remove/replace this loophole. Require actual browser automation session evidence: action kind (click/type/upload), application URL, timestamp, screenshot/DOM or trace artifact **exists**, correlating run/novel/user IDs, and appropriate read-only server verification. Mere presence of an image without an action trace is insufficient.
- Prepare an executable **browser-driven** S01–S02 test path for later authorized live round, preferably Playwright or Antigravity browser controls, using app's real UI. A local browser against an *isolated stub-provider test stack* may be used for offline smoke if it does not touch historical DB/old workers and does not call AI Studio. Do not call it provider-backed PASS.
- For S03–S11, leave actions ready in scenario; no fabricated `LIVE_UI` rows, never substitute HTTP POST scripts for the author journey. If UI doesn't implement a step, state `BLOCKED_UI_MISSING` with screenshots and exact route, rather than bypassing it with backend APIs.
- Offline tests must intentionally pass fake paths, nonexistent screenshot files, mismatched run/novel, fake DOM string, and orphaned action to prove `LIVE_UI` rejected; a real recorded browser interaction with readback can qualify only if actually run in isolated offline stack.

## 3. P0 — Partial import/replay idempotency

- Current code returns to `POST /novels` if checkpoint `main_novel_id` exists but chapter count is not exactly 5. This is a destructive replay/duplication risk. Test cases: existing novel at **0/1/3/4/5 chapters**, extra duplicate chapter, inconsistent or absent revision/hash, corrupt checkpoint, duplicate title belonging to another user.
- If any existing owned novel is found, NEVER create a second one as a fallback. Either do a source-/revision-hash verified incremental resume by missing chapters through the **author UI** on later live run, or **fail closed** with clear `S01_PARTIAL_IMPORT_REQUIRES_RECOVERY`, preserving original state. When ambiguous, stop, do not infer novel identity from title.
- Distinguish chapter ID from revision ID; use actual canonical server hash not placeholder. Verify both chapter and latest canonical revision against fixture hash before deciding the import is complete. Five chapters alone is insufficient.
- Offline negative tests: repeat runner twice and confirm zero additional writes; partial set, stale revision/hash, mismatched owner/title; unrecognized/corrupted checkpoint; crash between create-chapter and snapshot. Must show no extra novel POSTs and no overwriting existing authors' work.
- Patch only test runner/harness and its tests unless actual product code is proven defective; report product issues separately.

## 4. P1 — Credential and evidence hygiene

- The script still defaults to the literal demo password in its code and isolated Compose contains fixed Postgres/JWT/service-token example secrets. Stop checking these credentials into **current executable configurations**; use required local environment variables or secret files outside Git and fail closed when absent. Do not print, screenshot, log or commit their values. Rotate isolated test credentials at next dedicated run if any were ever exposed; do not modify credentials for unrelated services.
- Preserve historical evidence commits as history; do not rewrite Git history or erase existing evidence. Add a date-stamped correction/addendum to `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/NEXT_REVIEW.md` only if needed; do not rewrite its original S02 failure/call record.
- Explicitly forbid self-destructing/deleting any historical test evidence scripts unless independently approved. Keep audit files stable.

## 5. Verification, status and handoff

Execute **OFFLINE tests only** in a new run/review evidence directory, recording command + timestamp + code SHA:

- `AI-service` entity regression (ensure 76+ scoped tests still pass) and meaningful selected suite, with exact skip/deselect counts.
- provider egress guard tests across container boundaries or, if impossible, a reproducible `BUDGET_EGRESS_UNGUARDED` issue (not a mock-only green);
- UI evidence validator negative tests and real UI smoke only on a new isolated **fake provider** stack if safely possible; no real AI Studio calls;
- replay/idempotency 0/1/3/4/5/duplicate/stale scenarios; backend regressions, typecheck, web build as applicable.
- integrity check of `Pipeline_test/input/` gold/fixture hashes before/after; no changes to old `budget_state.json`, reports, canonical DB or evidence trace.

Store artifacts **under** `Pipeline_test/reviews/2026-10-21-p1-wave-1c/` (new report/tests/evidence) or a new subordinate `repair-wave-1c/` folder; never overwrite Wave 1B logs. Required `GEMINI_WAVE_1C_REPORT.md`: changed paths, precise guard deployment routes, fake traffic test evidence, browser action provenance and UI coverage, partial-resume state matrix, secret audit, per-suite exact numbers, unresolved blockers and live authorization status.

**Final verdict:**
- `P1_WAVE_1C_OFFLINE_READY_FOR_INDEPENDENT_REVIEW` only if test-local cross-container guard genuinely prevents bypass, UI evidence provenance validation and replay safety work, all key offline regressions pass; **not P1_PASS**.
- Otherwise `P1_WAVE_1C_BLOCKED:<specific_blocker>`, with exact architectural gap and least-invasive fix recommendation.

Commit/push ONLY approved scoped changes and sanitized evidence on `codex/ai-copilot-pipeline-test`. No PR/merge. Return tested SHA, evidence path, PASS/FAIL/BLOCKED by sub-gate, and explicit statement **zero new live provider calls**.

**Stop after evidence submission.** GPT-6 review precedes any new owner authorization. No P2, P3 or 100k in Wave 1C.
