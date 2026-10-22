# ACTIVE EXECUTOR TASK — FE/BACKEND INTEGRATION PREFLIGHT (ASTRA)

**Date:** 2026-10-22 Asia/Bangkok. **Permitted branch:** `codex/ai-copilot-pipeline-test` only. **Executor:** ASTRA (correctly identify another agent if executing). **Final review:** GPT-6.

**SINGLE CURRENT TASK:** [P123_FE_BACKEND_INTEGRATION_PREFLIGHT_2026-10-22.md](P123_FE_BACKEND_INTEGRATION_PREFLIGHT_2026-10-22.md). Read [../promt.md](../promt.md) §0 and [WORKFLOW_CONTRACT.md](WORKFLOW_CONTRACT.md) v1.4 first.

**GPT-6 verdict:** [GPT6_JOB_RESUME_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_JOB_RESUME_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md) closes the cross-author job-resume blocker at bounded source and executor evidence level, tested source `7d1f1bed508480db84def77c75c99039a9bacd7e`, ASTRA evidence `3791a15` sealed by `cdffb28`. `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` is GRANTED for **planning/compatibility review only**, not FE merge, UI PASS or deployment. The narrow authz remediation is done; do not repeat it. GPT-6 independently inspected GitHub source/evidence, did not run Docker.

**Next scope:** check current PR #52/#54/#55 heads and source-based API/DTO differences, perform read-only FE and migration inventory, optionally use fresh isolated temporary composite test DB (no Git merges), document S09 browser status and hand off prioritized FE-vs-Core owner decisions. Create reports under `reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/`. Stop for GPT-6 review. Do NOT implement FE code or treat a dry-run as a merged deployment.

**Hard boundaries:** `HOLD_FE_INTEGRATION_ONLY`. No `web/` edits, FE/main branch writes, PR merge/cherry-pick, real Gemini/OpenAI/embedding calls, paid spend, publishing, P3 100k run or historical evidence/database/volume destruction. S09 browser RED remains FE-owned. Existing bounded P1/P2/P3 tests retain acceptance only within their proven offline scope.

All text below is historical and not an active executable instruction.

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
