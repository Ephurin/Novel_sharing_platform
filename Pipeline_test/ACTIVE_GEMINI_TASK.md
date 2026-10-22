# ACTIVE CODEX TASK — P3 POST-ACCEPT SAFETY AND P123 CORE READINESS

**Date:** 2026-10-22 (Asia/Bangkok). **Branch:** `codex/ai-copilot-pipeline-test` only.

**SINGLE ACTIVE EXECUTABLE TASK:** [P123_P3_POST_ACCEPT_AND_CORE_READINESS_TASK_2026-10-22.md](P123_P3_POST_ACCEPT_AND_CORE_READINESS_TASK_2026-10-22.md). Governing direction: [../promt.md](../promt.md) §0 and [WORKFLOW_CONTRACT.md](WORKFLOW_CONTRACT.md) v1.4.

**Independent GPT-6 verdict:** [GPT6_P3_INTENT_FENCE_INDEPENDENT_REVIEW.md](reviews/2026-10-22-p123-headless/p3-intent-fence/GPT6_P3_INTENT_FENCE_INDEPENDENT_REVIEW.md) accepted the source/evidence for the original P3 **pre-accept** skip/stop race repair at tested SHA `a7081c6932e33bd5500d0ca40604afe6bb0d51e4` and evidence HEAD `a77a2451b3e590a8308f911a0eac5d614b9fa0e8`. Seven deterministic executor cases 45/45 and existing/no-plan P3 12/12 each. GPT-6 did **not** rerun Docker or pytest. This is **bounded acceptance**, not `P3_CORE_OFFLINE_PASS`.

**P0 next gate:** Determine and test whether author `skipped` / run stopped **after** accepted draft transaction yet before outbox→human review→approved canon→objective completion can result in late canon promotion or skipped objective silently becoming completed. Existing source uses stale pre-generation `eligibleObj` and run status recheck only. A new durable conditional objective/progress fence (not just GET) may be needed. Preserve already committed immutable revision and truthful history; stop automatic downstream advancement after committed cancellation, including restart/HITL. Test before coding and preserve RED if reproduced.

**P1 next gate:** No-plan background worker contention `RUN_STEP_BUSY` previously required bounded evidence-side retry; establish the production-supported caller contract or label limitation. Produce one `P123_CORE_READINESS_MATRIX` and read-only FE/backend contract/migration handoff. Check PR #55 and #54 read-only; do not integrate them.

**Ownership:** `HOLD_FE_INTEGRATION_ONLY`; backend, AI Service and fake-provider headless only. No `web/` changes, FE PR cherry-picks/merges, main writes, real Gemini/OpenAI/embedding calls, auto publishing, 100,000–105,000-word final P3 run or historical evidence edits. Human actions are `SIMULATED_HUMAN_VIA_API`. Use fresh isolated test-owned volumes/identities and test exact clean committed SHA.

Previous [P123_P3_OBJECTIVE_INTENT_FENCE_TASK_2026-10-22.md](P123_P3_OBJECTIVE_INTENT_FENCE_TASK_2026-10-22.md) is delivered; all below is historical context, not an active Codex assignment.

---

# HISTORICAL CODING AGENT TASK — P1 Wave 1G (S09 autosave, OFFLINE ONLY)

**Updated:** 2026-10-22 (Asia/Bangkok). **Permitted branch:** `codex/ai-copilot-pipeline-test`. **Single ACTIVE Codex instruction:** [P1_WAVE_1G_S09_AUTOSAVE_HANDOFF.md](P1_WAVE_1G_S09_AUTOSAVE_HANDOFF.md). This replaces the earlier Wave 1F active pointer below. **Root cause of stop:** [GitHub issue #56](https://github.com/Ephurin/Novel_sharing_platform/issues/56), reported to FE dev on [PR #55](https://github.com/Ephurin/Novel_sharing_platform/pull/55). Wave 1F source/evidence at `8db9839` shows S01–S08 functional **offline** with fake provider and S09 **real Playwright FAIL** from stale autosave. S10/S11 NOT_RUN.

**Current task:** Build an independent reproducible S09 RED test and audit the distinct PR #55 `useDraftPersistence.ts` implementation; **FE dev owns production UI patch**. Do not cherry-pick/merge entire PR #55 or modify FE production code before a reviewed compatible FE patch. Once safely available, retest S09 GREEN then S10/S11 on a **new isolated fake-provider/real-browser** run, with exact readback and issue closure evidence. If patch absent, report `BLOCKED_AWAITING_FE_PATCH`, do not fake PASS. **Zero real provider API calls**; Free Tier USD-hardcap math remains DEFERRED, quota/security and prior evidence remain protected; no P2/P3/100k.

## Historic task pointer — superseded after Wave 1F execution

# ACTIVE CODING AGENT TASK — P1 Wave 1F (OFFLINE ONLY)

**Updated:** 2026-10-21 (Asia/Bangkok). **Branch:** `codex/ai-copilot-pipeline-test` only.  
**Execution agent:** Codex (or whichever agent is working locally; record actual executor).  
**ACTIVE INSTRUCTION:** **[P1_WAVE_1F_OFFLINE_WORKFLOW_COMPLETION_TASK.md](P1_WAVE_1F_OFFLINE_WORKFLOW_COMPLETION_TASK.md)**. This single file supersedes ALL earlier Wave 1A–1E active pointers. Read it FIRST.

**Independent Wave 1E verdict:** [GPT6_INDEPENDENT_REVIEW.md](reviews/2026-10-21-p1-wave-1e/GPT6_INDEPENDENT_REVIEW.md). Last executor completed Wave 1E with source SHA `b5fa332e85dc328100fba93c5b696fac2e80dbee` and evidence commit `4b607b5eb4246a51feadc016cc954efdfd02540d`: 5 chapters correctly imported through real Playwright, bounded mixed HITL review of chapter 1, three pending proposals and empty official canon; **OFFLINE acceptance only**, not full P1.

## Current execution priorities

1. **S03** on a NEW isolated offline fake-provider/Playwright run: process required remaining chapter entity gates; source-grounded nonempty fake downstream event/fact; perform real browser canon review and baseline activation; capture P1-M0 raw, human, approved and context phases. If any UI step is missing, report BLOCKED with route/screenshot, **never writable API rescue**.
2. After S03, exercise **S04–S11 in contract order**, with S07 ordinary editor save→outbox and S08 new revision HITL/M-FIRST high priority. Record actual per-step channels/verdict/evidence. Never infer quality of real Gemini from canned responses.
3. Test existing patch and new integration; preserve all historical runs, ledgers, evidence, gold and Docker resources. Always report actual tested SHA, exit codes and any skipped tests.

## Hard boundaries

- **ZERO external Google AI Studio/Gemini/OpenAI/embedding calls.** The former live window expired. User's Free Tier budget deferral **does not** authorize new provider calls. No production secrets, no key leaks, no cross-project network egress.
- **USD paid-tier hard cap math DEFERRED** by [owner decision](FREE_TIER_BUDGET_PRIORITY_DECISION_2026-10-21.md). Preserve existing safe quota/retry/call and fail-closed boundaries. Do not spend another wave refactoring the budget gateway.
- **No commits to main, UI branches or other branches.** No merge/PR, destructive reset/clean/stash, old volume/database cleanup, fixture edits, rewrites of old reports, arbitrary live migration or auto publish.
- Canonical behavioral authority: [WORKFLOW_CONTRACT.md v1.4](WORKFLOW_CONTRACT.md), [SHORT_LOOP_TEST.md](SHORT_LOOP_TEST.md), [NARRATIVE_MEMORY_AUDIT.md](NARRATIVE_MEMORY_AUDIT.md). API/architecture docs are not evidence of live acceptance.
- **P1 provider-backed S01–S11**, P2, P3 and 100k terminal artifact remain NOT_ACCEPTED/NOT_RUN.

## Required handoff

Commit source-only fixes if genuinely needed and sanitized evidence **to test branch only**. Write `Pipeline_test/reviews/2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md`, `validation.json` and per-step S01–S11 matrix. Stop with SHA and `P1_WAVE_1F_OFFLINE_READY_FOR_GPT6_REVIEW` or a concrete BLOCKED reason. Don't claim full P1 PASS on fake model.

**Previous active pointer text:** [Archived Wave 1A–1E task pointer](archive/ACTIVE_GEMINI_TASK_PRE_WAVE_1F_2026-10-21.md), preserved for provenance. Earlier detailed task files remain in the repo as historical instructions.
