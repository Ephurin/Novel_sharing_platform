# ACTIVE CODEX TASK — P1 ORDERED-WRITER TEST/REPAIR → P3 HEADLESS CONTROLLER

**Updated:** 2026-10-22 Asia/Bangkok. **Branch:** `codex/ai-copilot-pipeline-test` ONLY.

**SINGLE EXECUTABLE TASK:** [P123_HEADLESS_P1_RACE_P3_TASK_2026-10-22.md](P123_HEADLESS_P1_RACE_P3_TASK_2026-10-22.md). Project instruction [../promt.md](../promt.md) §0, contract [WORKFLOW_CONTRACT.md](WORKFLOW_CONTRACT.md) v1.4.

**GPT-6 independent review:** [GPT6_P1_P2_INDEPENDENT_REVIEW.md](reviews/2026-10-22-p123-headless/next-slice/GPT6_P1_P2_INDEPENDENT_REVIEW.md), based on code SHA `1dc7dfa38267c9eb176f56f070380930d1887d85` and executor evidence HEAD `4158e8600a4e3b76df6eaab4073235aa5fc4537a`. Source/evidence review ONLY; GPT-6 did not independently rerun Docker, PostgreSQL, Mongo or pytest.

**Current verdict:** P1 bounded executor headless function evidence accepted **with blocker**: same-version Mongo CAS 409 works, but reversed cross-store side effect order after two individually valid CAS writes may create stale Postgres revision/outbox and/or timestamp-based Mongo overwrite. This is a **static race hypothesis not yet runtime reproduced**. P1 full Core PASS is BLOCKED pending deterministic two-success interleaving test and safe repair/explicit blocker. P2 bounded headless 27/27 executor evidence is accepted WITH LIMITATIONS, not UI/provider/quality PASS; P2 need not be repeated absent shared regression impact.

**Next work:** P0 reproduce/fix the P1 Mongo v1→2 A then Mongo v2→3 B, B commits PG, then A resumes PG/Mongo sync. Use fresh isolated test-owned DB and evidence. P1 safety test needs latest Mongo body, PG immutable latest, outbox, and restart readback. After P0 bounded handoff, implement bounded P3 controller with/without Story Plan, true HITL pause/resume via simulated-author API, draft-only generate/accept/analysis/canon/objective, failure/idempotency/terminal. P3 100k NOT_RUN and not authorized live.

**Scope:** Backend/AI/API/headless only, no `web/` edits, FE PR cherry-pick/merge or main writes. Historical browser S09 RED remains. `HOLD_FE_INTEGRATION_ONLY` persists. ZERO external real provider or embeddings. Preserve evidence/ledgers/gold and use fresh isolated env. All `SIMULATED_HUMAN_VIA_API` decisions must be labeled, no unattended claim.

Previous [P123_HEADLESS_NEXT_SLICE_2026-10-22.md](P123_HEADLESS_NEXT_SLICE_2026-10-22.md) completed its executor scope. The old full-stack FE plan remains PARKED. Everything below is historical.

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
