# CODEX ACTIVE TASK — Wave 1F: full P1 workflow closure, OFFLINE / fake provider

**Task date:** 2026-10-21 (Asia/Bangkok). **Executor:** Codex or active coding agent, identify actual executor in results.  
**Branch only:** `codex/ai-copilot-pipeline-test`. **Last reviewed Wave 1E HEAD:** `4b607b5eb4246a51feadc016cc954efdfd02540d` (plus review/handoff documentation commits).  
**Read first:** `Pipeline_test/reviews/2026-10-21-p1-wave-1e/GPT6_INDEPENDENT_REVIEW.md`, `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4, `Pipeline_test/SHORT_LOOP_TEST.md`, `Pipeline_test/NARRATIVE_MEMORY_AUDIT.md`, `Pipeline_test/AGENT_GUIDE.md`, `Pipeline_test/reviews/2026-10-21-p1-wave-1e/EXECUTOR_WAVE_1E_REPORT.md`. Read only applicable API/architecture documents, and keep historical results unchanged.

## 0. Operational boundaries — binding

1. Check current branch, HEAD, `git status --porcelain`, protected fixtures and old run ownership; safe fast-forward when appropriate, no destructive reset, stash, clean, rebase, force push, PR or merge. Only push `codex/ai-copilot-pipeline-test`, not `main`, UI branches, or others. Respect uncommitted changes.
2. **OFFLINE ONLY**: use **a new isolated test-owned Docker Compose project**, DB/volumes, author user, run ID, fake upstream/LLM and a real Playwright browser. Never start old workers with credentials, use old ledger, overwrite `runs/2026-10-21-p1-wave1e-functional-01`, or modify prior provider failed-run outboxes/evidence. Verify isolation before writes. Do not `docker compose down -v`, prune unowned resources or alter frozen seed source/gold.
3. **Zero Google AI Studio, real Gemini, OpenAI or other external AI provider calls**. Last live window expired. Free Tier intended but the specific project tier is not verified; user did NOT authorize a new paid/Free Tier provider-backed execution by saying “tiếp tục đi”. Do not configure, probe or accidentally fallback to real providers.
4. **Paid-tier mathematical $5 cap remains DEFERRED**, per `FREE_TIER_BUDGET_PRIORITY_DECISION_2026-10-21.md`. No more budget architecture work unless safety-critical regression discovered. Retain call-attempt accounting, quota stops, retry limits, fail-closed egress, no provider key leaks.
5. Source changes should be **minimal and evidence-driven**. Do not modify production application code/FE, strict entity verifier, writer model or gold to force a pass. For confirmed app/UI defect, produce repro and a separate narrow patch proposal / blocker. Only test harness changes and its deterministic tests are pre-approved.

## 1. Primary goal: finish S03 end-to-end (existing five chapters)

**Wave 1E completion boundary:** five title/body-correct canonical revisions via Playwright and a complete *first-chapter entity* HITL fake checkpoint only; **three pending proposals, official memory empty, fake downstream event/facts empty**. This is NOT S03 canon/baseline PASS.

Use a new run with five chapters imported again via real UI and the versioned `markdown-h1-title-body-nfc-lf-v1` mapping. Use fake provider output that is **nonempty and source-grounded**, at least one source-backed entity/alias, factual event, uncertainty or belief correctly attributed, and state/relationship changes only when prose proves them. Keep these **scripted labels** visibly `FAKE_PROVIDER_OUTPUT`, never “model extracted correctly” or 35-gold recall. Test negative/unresolved evidence and the current author review UI as in Wave 1E.

- Iterate the actual multi-chapter bootstrap/analysis queue **without skipping chapters**. For each actual `waiting_entity_review`, use the real UI to keep/reject/correct and `continue` with exactly the corresponding `chapter_id`/`revision_id`/hash. Record every run/checkpoint, raw machine verdicts BEFORE human changes, author decisions, frozen `entities_reviewed`, proposals and receipts. Do not automatically accept an entity gate in a test backend. Do not presume that the initial UI import of five chapters made five chapters' analysis complete.
- Verify **idempotent continue** and that no event/fact materialization or official memory changes before the appropriate human checkpoint; check no rediscovery on an already-valid checkpoint and safe rejection of a stale source/review/guidance version.
- After downstream proposals are ready, exercise **real canon review UI** (entity/alias/event/fact proposals and dependency groups), including at least one keep, one reject/correction when the UI supports it. Read back source revision IDs/offsets/quotes, group decision and official memory through read-only application API. Mixed scripted response must not fabricate canon in contradiction with source or mark future plan events as occurred.
- Activate baseline through **actual author UI**, inspect job/memory/readback, reload and confirm persisted `brain_version`, approved entities/events/facts, and that rejected/unresolved candidates did not silently appear as canon. If a needed UI step is missing, STOP that step with `BLOCKED_UI_MISSING` and screenshot/route — NO writable API substitution for UI PASS.
- **P1-M0 gate:** freeze expected assertions from `CANON_AT_START.md` and actual source revisions **before examining machine output**; preserve sample and all failures. Separate five layers: gold/immutable sources; fake machine output; human-reviewed decisions; officially accepted memory; retrieval/context. Since fake model can't establish extraction recall, report **functional/provenance M0** and mark real `llm_execution`, `raw_extraction_quality`, semantic retrieval quality as `NOT_ASSESSED`. Never re-label 35 narrative assertions as 35 entity mentions.
- Record novel/chapter cutoffs, source SHA, transformation version, author ownership and per-stage timestamps. No source-hash mismatch, duplicated revision, missing chapter or manual DB bypass.

**S03 PASS (OFFLINE)** only if all five chapters' required review/checkpoint/canon/baseline steps that the contract needs actually complete in UI with correct state/readback; else bounded `S03_PARTIAL` or `BLOCKED` with precise gap. **Do not silently shrink to chapter 1 and claim S03 full PASS.**

## 2. Subsequent goal: real UI S04–S11 as supported (prioritized)

After stable S03 and M0, execute `Pipeline_test/SHORT_LOOP_TEST.md` in order. Do not attempt later stages if a mandatory prior gate is blocked; still return diagnostics for blockers and preflight readiness.

| Step | Real author/UI action | Minimum read-only verification |
|---|---|---|
| S04 | Reload and inspect character/location/item/event/memory tabs | UI state matches approved official Story Brain; no pending proposal shown as approved |
| S05 | Ask for event suggestion; edit one, reject one | Suggested/planned provenance preserved, no automatic official history mutation |
| S06 | Review/activate plan and reload context | Future plan distinct from confirmed events, no premature state/knowledge changes |
| S07 | Write/extend chapter in normal editor and save | New **immutable** revision created via app's normal flow; outbox triggers incremental extraction without test-side writable API/snapshot rescue |
| S08 | New revision HITL gate → author review → downstream canon approval | Correct fresh source/hash, no old-inventory bypass; approved fact is source-grounded; P1-M-FIRST audit |
| S09 | Two quick successive saves and retry | No double materialization, no stale revision overwrite; latest selected source wins |
| S10 | Add known contradiction in draft, trigger consistency check, then correct via UI | Evidence-backed finding; no automatic canonical repair; retest re-evaluates the newest revision |
| S11 | Reload and continue editing | Tab/context/official memory consistent; draft remains unpublished; end-of-run evidence/memory audit |

- Do not turn absent FE controls into artificial PASS by making direct POSTs. Where needed, a **separate API-only diagnostic** may narrow root cause, but label `LIVE_API_DIAGNOSTIC_FAKE_PROVIDER` and leave UI verdict BLOCKED.
- If fake provider cannot meaningfully simulate S05/S10 content quality, test the routing, provenance, editable suggestions and state transitions only; `MODEL_SEMANTIC_QUALITY` remains `NOT_ASSESSED`. Do not claim continuity/canon detection accuracy from canned text.
- Limit test scope to the short P1 novel; **no P2, P3, 100k trial, no actual provider paid/free calls**.

## 3. Regression / failure honesty

Continue running relevant **offline deterministic** test suite, at least Wave 1E 101-test tooling suite plus affected AI/backend tests, and actual isolated browser. Preserve RED evidence from failures and exact resolution SHA. Source fixture hashes, old run ledgers and old feedback reports remain untouched; use new run-specific snapshots. Validate all new E2E evidence bundles: Playwright events + real screenshots, browser action IDs, owner/novel/revision readback, chronological state, fake-upstream operation receipts and gateway accounting. Reject empty/assertion-failure browser results, version mismatch and missing evidence rather than let a green report hide errors.

Run-time artifacts must store no API secrets/tokens/passwords or sensitive browser cookies. Preserve correct stage provenance and user intervention counts. No manual DB writes to certify features.

## 4. Output / stop criteria

Create `Pipeline_test/reviews/2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md` and `validation.json`, logs, evidence/manifests and per-step S01–S11 matrix with channel, actual actions, IDs, source SHA, evidence path and exact verdict `PASS/FAIL/BLOCKED/NOT_RUN/NOT_ASSESSED`.

Return:
- Code-tested SHA and evidence commit SHA; exact changed paths.
- S03 five-chapter checkpoint matrix; canon/baseline and P1-M0 **functional** status, raw vs human vs official memory/canonical revision evidence.
- S04–S11 honest individual results; S07/S08/M-FIRST prioritized once prior gate passes.
- Regression numbers and failures/retries; fake provider call counts, operational quota/guard outcomes; **external real provider calls exactly zero**.
- Whether UI is missing or architectural backend defect observed, with precise reproducible location and recommended smallest fix. Don't modify FE branch.
- Status `P1_WAVE_1F_OFFLINE_READY_FOR_GPT6_REVIEW` only for genuinely exercised scope; `P1_WAVE_1F_BLOCKED:<reason>` otherwise. **Never `P1_PASS` from fake provider.**

Commit/push sanitized changes **only on `codex/ai-copilot-pipeline-test`**, preserve all previous runs, **STOP** for independent GPT-6 review and a separate future Free Tier live owner authorization.

## 5. Efficiency / engineering discipline

This is primarily **test execution of existing features**, not a mandate to design a new AI harness. Prefer reusing Wave 1E Playwright/fake upstream infrastructure and only extend it enough to reach actual S03 canon, M0 and S07/S08. **Do not spend another wave polishing the USD budget gateway**. If UI or model-simulation limitations block an acceptance step, surface the blocker quickly with evidence instead of building speculative new frameworks.
