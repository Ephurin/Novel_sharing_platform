# ACTIVE ASTRA TASK — P0 PRIVATE UNPUBLISHED DRAFT READ AUTHORIZATION

**Date:** 2026-10-22 Asia/Bangkok. **Branch:** `codex/ai-copilot-pipeline-test` ONLY. **Current executor:** ASTRA (name actual executor correctly). **Independent reviewer:** GPT-6.

**SINGLE ACTIVE TASK:** [P123_ASTRA_CORE_DRAFT_READ_SCOPE_P0_TASK_2026-10-22.md](P123_ASTRA_CORE_DRAFT_READ_SCOPE_P0_TASK_2026-10-22.md). Read `../promt.md` §0 and `WORKFLOW_CONTRACT.md` v1.4 first. Prior [P123_FE_BACKEND_INTEGRATION_PREFLIGHT_2026-10-22.md](P123_FE_BACKEND_INTEGRATION_PREFLIGHT_2026-10-22.md) was delivered at executor evidence level; do not repeat or broaden it.

**GPT-6 confirmation:** [GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md). `CORE_DRAFT_READ_SCOPE_P0_CONFIRMED_SOURCE_AND_EXECUTOR_RUNTIME_RED`. On unchanged pipeline production source `26a6cbc4...`, GET `/api/v1/chapters/:chapterId` requires no auth, controller forwards no actor, `getChapter()` includes Mongo `draft.content` without owner check. ASTRA's isolated real HTTP proves anonymous 200 and unrelated AUTHOR 200 on an unpublished DRAFT; full private text appears in returned DTO. **Not fixed yet.** PR #55's separate auth approach is a reference only; no cherry-pick or whole-service substitution.

**Do next:** Implement narrow fail-closed authenticated author/admin + owner chapter read at route and service, preserve owner draft/version and reader public/published-only behavior. Audit `GET /novels/:novelId/chapters` because currently public list returns `ChapterRecord` fields including content; verify it with runtime before calling this a second vulnerability. Capture A/B/anonymous RED→GREEN on new test-owned PG/Mongo/fake provider, meaningful denial no-side-effect readbacks, focused auth/writer/P1 regressions, exact clean committed fix SHA and separate sanitized evidence. If public/private split needs broader product policy, fail closed and return a BLOCKED design handoff rather than bypassing authorization.

**Status and boundaries:** `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` only permits **planning**, not FE integration/merges. New security P0 blocks safe author FE integration. `HOLD_FE_INTEGRATION_ONLY`: NO `web/` changes, FE PR #52/#54/#55 merges/cherry-picks, main writes, paid/live provider/embedding calls, auto publish, long P3 100k, historical DB/evidence/volume deletion. S09 full editor RED/unverified, Issue #56 FE-owned; previous bounded P1/P2/P3 evidence not invalidated by this narrow task. **Stop for GPT-6 independent delta review** after source and new evidence commits.

Everything below is historical and is not executable as the current task.

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
