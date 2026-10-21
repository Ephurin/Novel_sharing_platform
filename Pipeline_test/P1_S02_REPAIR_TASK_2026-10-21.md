# Gemini 3.8 / Antigravity — P1 S02 repair and offline regression (Wave 1B)

**Assigned:** 2026-10-21 (UTC+7). **ONLY branch:** `codex/ai-copilot-pipeline-test`. **Baseline for this task:** `901321a6228a419b78dcac8fa264d263dad8ee4d` (before GPT-6 review addition). Work from current HEAD after `git fetch`, with clean/understood worktree; do not overwrite other contributors' changes.
**Mandatory independent review:** `Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/REVIEW.md`. Read this FIRST.
**Governing contract:** `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3.
**Historical failed run (PRESERVE):** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`, S01=API-integrated only; S02 failed `ISSUE-PIPELINE-VERIFY-001`; 8 model calls reported.
**Run status of next phase:** `P1_S02_OFFLINE_REPAIR`. Do not mark P1 PASS. Keep P2/P3/100k NOT_RUN.

## 0. Absolute restrictions

- Do not touch `main`, `UI`, `astra/*`, other repositories/branches, old run resources, previously accepted canon or historical evidence. No PR, merge, rebase or cherry-pick. All commits only to the branch above.
- **NO LIVE/PAID Google AI Studio calls in this wave.** Prior owner-approved P1 limits were **200 calls, USD 5, 2 elapsed hours**, beginning `2026-10-21T03:47:52Z`, ending `2026-10-21T05:47:52Z`. The **time ceiling expired**; neither unused calls nor dollars permit another request. Do not restart the clock, reset `budget_state.json` or create a run to evade it. Separate user authorization is required for a new live window after reviewer acceptance.
- Run deterministic fake/mock and local/offline tests only. Do not start/restart old workers, write to old DB, scrub the previous failed outbox, run live browser UI against an old DB, run destructive cleanup, leak API keys or commit private credentials.
- This is an explicit **separate code-fix cycle** after the failed evidence run, so the narrow code patch below is authorized. Do not pretend the fix was present at failed-run SHA.

## 1. Deterministic S02 contract fix (P0)

Review `ai-service/services/entity_pipeline/verification.py` and `tests/test_entity_candidates.py`, as well as saved `evidence/s02-verification-unresolved-reproduction.json`.

Root cause: the *system prompt* says `canonical_name must be ... known canonical name or supplied surface` for all verdicts; `_validate()` correctly forbids canonical identity fields for `not_entity`/`unresolved`. Real Flash-Lite gave `{"verdict":"not_entity","canonical_name":"Chương","entity_type":null}` and failed both normal and bounded repair attempts.

**Fix:**
1. Make schema/prompt verdict-specific: for `entity`, use evidence-grounded canonical name and valid type/id; for `not_entity`/`unresolved`, **`canonical_name=""`, `canonical_entity_id=""`, `entity_type=null`, `initial_status="Unknown"`, `status_quote=""`**; avoid unsupported identity/alias fields. Preserve candidate_id and full decision inventory.
2. Make the **bounded repair instruction actionable** on this exact class of validator error, explicitly naming the offending field(s) and required corrected form; it must not turn `not_entity` into `entity` merely to pass.
3. Keep `_validate` strict, attempts bounded, source quotes/alias identity guarded, status certainty guarded, duplicates/missing candidate IDs rejected. Do not silently wipe malformed model fields or accept invalid output.
4. Add offline regression based on the captured real-provider decision shapes, including negative surfaces `Chương`, `Bến`, `Chiếc`, valid alias `Linh -> Mai Linh`, false positive `An` in `an toàn`, correct unresolved semantics, malformed batch and evidence failures. First demonstrate **RED** with original prompt/repair behavior and then **GREEN** with patch; mock must model prompt-driven behavior, not return fixed empty fields for all nonentities. Prove valid negative verdicts do not cause failure while genuinely malformed output still fails closed.

Deliver clear file-level diff and test output without live API.

## 2. Correct P1 testing methodology and truthful evidence (P0)

The current `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/execute_p1_journey.py` makes direct POST requests in S01/S02 and records `channel="LIVE_UI"`. This **does not** meet `SHORT_LOOP_TEST.md` which requires the author journey in browser. Do not delete historical API evidence.

- Add **append-only correction** explicitly distinguishing `S01_API_INTEGRATION_PASS`, `S01_LIVE_UI_NOT_VERIFIED`, `S02_PROVIDER_FAIL`, `S03–S11_NOT_RUN`. Update latest handoff pointer to current blocker; old preflight snapshot remains identifiable.
- Harden runner/evidence so it cannot label `LIVE_UI` without actual browser interaction evidence (browser action, path and screenshots/DOM/server correlation), or carve it into explicitly diagnostic `LIVE_API` probes. No fake/browser-by-HTTP success. Do not generate fabricated screenshots.
- Prevent S01 duplication on restart: inspect checkpoint and server state, use a non-destructive resume or refuse with `ALREADY_STARTED`/actionable reason; do **not** automatically create a new novel and snapshots when same run exists. Regression test repeat invocation with fake API ensuring zero extra POSTs.
- Do not attempt a real UI rerun now. A later separately authorized run must prove S01 using genuine browser actions, and S02–S11 thereafter, on a verified isolated environment with frozen gold.

## 3. Provider budget safety and replay-proof guards (P0)

Review `budget_guard.py`, `execute_p1_journey.py`, the AI service external-call entry points and worker retries. Existing `sync_new_provider_calls()` parses Docker logs **after** the bootstrap call; this is retrospective metering, not a global hard limit. `check_admission(next_calls=5)` before bootstrap cannot guarantee budget if worker issues more calls.

- Design and implement a **test-only, mandatory pre-dispatch accounting boundary** for ALL external application-provider request attempts (including background workers, retries, failed calls and provider calls from backend if enabled). Enforce atomic/concurrency-safe reservation, live deadline, total calls and conservative cost admission **before network request**. Failed/timeout attempts consume attempts. Don't rely only on parsing logs, best-effort polling or a per-UI-action guess.
- Use **offline** deterministic/fault-injection tests: calls 200/201, concurrent requests against last slot, 5 USD admission with pending work, expiry at exactly 2h, failures/retries, restart persistence and unavailable/corrupt meter. Verify zero external dispatch after denial. Validate that backend and AI worker routes cannot bypass the gate.
- If mandatory global interception cannot be implemented within test-local scope without risky broad production architecture changes, **do not implement a deceptive guard**. Produce a fail-closed design/gap report, leave live blocked `BUDGET_METER_UNVERIFIED` and request reviewer decision. Do not call provider to test limits.
- Cost shown in current evidence is estimated and may omit billable categories/rates; avoid claims of actual billed expenditure without verifiable usage and dated price reference. Preserve original 8-call ledger, don't reset/reuse its 2-hour approval.

## 4. Evidence hygiene / access (P1)

The previous `NEXT_REVIEW.md` describes `READY`/no blocker and contains local credentials; it is stale. Do not copy real tokens, session cookies, private keys or passwords into new committed files. Keep test secrets in untracked local environment variables. If any committed demo password/token is shared externally, remove references from *current configuration* and rotate/revoke on this isolated stack as feasible **without affecting other stacks**; historical Git cannot be rewritten as part of this task.

Add latest audit note with exact SHA, sanitized test commands and fixture hashes. Preserve `2026-10-21-gemini-p1-live-01` original reports, `evidence/s02-verification-unresolved-reproduction.json`, API fixture readback, `budget_state.json`, and the still-failed job. No deletion of old evidence or volumes. No `docker compose down -v`.

## 5. Offline acceptance and deliverables

Run: target AI candidate tests, all impacted entity-review/reconciliation/regression tests, relevant backend/test-runner tests, AI-service test suite within locally available environment, backend typecheck and web build **as applicable**; preserve failures and `deselected` counts. Tests must NOT connect to AI Studio. Include smoke of no-provider hard-stop if safe and deterministic. Record exact commands and exits.

Write a **new** report at `Pipeline_test/reviews/2026-10-21-p1-s02-gpt6/GEMINI_FIX_REPORT.md` or `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/repair-offline/` (do not overwrite failed-run records), with:
- branch HEAD, product/test-runner SHA, changed files, test stdout/stderr, old versus new prompt/schema contract, defect reproduction, RED→GREEN evidence, snapshot/gold preservation;
- verified coverage and gaps for `LIVE_UI` versus `LIVE_API`, budget pre-dispatch gate and expiration, remaining P1 blockers;
- P1 verdict `P1_S02_LOCAL_FIX_READY_FOR_REMOTE_REVIEW` **only** if the narrow fix and deterministic regressions pass; otherwise `P1_S02_BLOCKED:<reason>`.
- a precise `NEXT_ACTION`: reviewer to inspect branch patch and evidence, then request new time-limited live owner authorization. **Do not run P2, P3 or 100k.**

Commit/push only scope-appropriate source/test/harness and sanitized report files on `codex/ai-copilot-pipeline-test`. Verify no unrelated changes, no secrets, no PR/merge. Return commit SHA, changed paths, TEST PASS/FAIL/BLOCKED, whether S02 prompt mismatch closed by offline tests, whether hard budget guard is proven or blocked, and exact local checkpoint.

**The task is complete when independent reviewer can inspect a small truthful patch and offline proof, not when an agent says “done”.**
