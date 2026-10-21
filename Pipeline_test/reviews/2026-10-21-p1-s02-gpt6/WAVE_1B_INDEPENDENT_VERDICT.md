# GPT-6 independent verdict — Wave 1B, commit 45bf06c

**Review date:** 2026-10-21 (Asia/Bangkok). **Branch:** `codex/ai-copilot-pipeline-test`.  
**Reviewed HEAD:** `45bf06c3fba92aee77c2054ef42bd91340d06302`.  
**Review method:** remotely examined changed source, offline logs, run checkpoint and `GEMINI_FIX_REPORT.md` on GitHub; **did not execute the test environment or call the real provider**. Do not attribute this review to direct local runtime verification.

## Verified scoped results

- **S02 prompt/schema contradiction: FIXED_IN_SOURCE, OFFLINE_PASS.** `ai-service/services/entity_pipeline/verification.py` now gives verdict-specific guidance to Gemini for `not_entity` and `unresolved`: empty `canonical_name`/`canonical_entity_id`, null `entity_type`, unknown status, empty quotes; bounded repair explicitly names offending fields, and `_validate()` retains strict rejection. Regression log includes prompt-driven RED-vs-GREEN simulation and downstream reject/alias checks. **The corrected prompt has NOT yet passed a new real Google AI Studio call.**
- **Evidence honesty: IMPROVED.** Historical S01 used HTTP POST/urllib, not browser interaction. New correction rows mark `S01_API_INTEGRATION_PASS_ONLY`, `S01_LIVE_UI_NOT_VERIFIED`. The harness still has no actual browser automation for author actions.
- **Offline logs checked:** entity-review regression **76 passed**; AI-service selected suite **407 passed, 2 skipped, 42 deselected**; backend targeted **62 passed**; budget guard tests **7 passed**; replay/channel tests **3 passed**; backend typecheck and web build logged successful. These do not imply a live S01–S11 PASS.
- **Historical run preserved:** S02 `ISSUE-PIPELINE-VERIFY-001` failed, 8 reported calls and USD 0.007379 estimated, prior time deadline `2026-10-21T05:47:52Z` expired. S03–S11, P2, P3, 100k = `NOT_RUN`.

## Required changes before next provider-backed test

**V1C-01 — BLOCKER, cross-container enforcement.** `budget_guard.py` has local `threading.RLock` and `reserve_dispatch()`, but outbound calls from Dockerized `ai-service` and `backend` are not necessarily dispatched through it. Containerized traffic remains outside test host guard. Thread tests do NOT prove process/container safety, and log-parsing after dispatch is not a cap. Need a single unavoidable fail-closed gate covering all approved application provider routes, including retries, concurrent workers, fallback, and backend direct LLM calls; no credentials or network bypass. Offline simulate 200/201, 2h, cost, failures, crash and multiple-process contention.

**V1C-02 — HIGH, UI evidence authenticity.** `record_action()` calls an action `LIVE_UI` if `response_evidence` merely ends in `.png`/`.html` or contains the word `browser`/`dom`; actual file existence, action provenance and server correlation are not checked. Prepare a browser-driven author journey or enforce `LIVE_UI_NOT_VERIFIED` until actual interaction evidence exists. No HTTP POST as substitute.

**V1C-03 — HIGH, safe partial resume.** `execute_p1_journey.py` skips writes only when exactly five chapters already exist; an incomplete chapter set or stale/corrupt checkpoint can fall through to `POST /novels`. Add fail-closed partial-import handling and a direct regression verifying no extra writes in 0/1/3/4/5 chapter cases with novel already created; do not silently find a different novel by matching title alone.

**V1C-04 — HIGH, historical/credential hygiene.** Current runner still contains a committed demo-password fallback and test compose has fixed database/JWT/service-token literals. Do not reuse historical credentials for any later live run. Replace defaults in current executable/test configuration with locally supplied secrets; preserve old evidence without Git history rewriting or destructive cleanup. A file path bearing a `browser` label is never enough evidence.

**V1C-05 — HIGH, live window expired.** 200 provider attempts and USD 5 ceilings do not reopen the original **2-hour elapsed** authorization. Zero new provider calls until user explicitly approves a new live window with enforced caps.

## Current reviewer verdict

**`WAVE_1B_OFFLINE_FIX_ACCEPTED_WITH_GATES`**, **P1 overall `BLOCKED`**. Proceed to Wave 1C OFFLINE ONLY on the same branch. Do NOT approve P1 or launch P2/P3/100k yet. Hold new live provider activity until cross-container metering and UI/replay evidence are independently reviewed.
