# ACTIVE ASTRA TASK — LEGACY MONGO RECONCILIATION FIXTURE + FE CUTOVER DECISIONS

**Date:** 2026-10-22 Asia/Ho_Chi_Minh. **Only branch:** `codex/ai-copilot-pipeline-test`. **Current executor:** ASTRA. **Independent reviewer:** GPT-6.

**SINGLE EXECUTABLE TASK:** [P123_ASTRA_MONGO_FIXTURE_AND_FE_CUTOVER_HANDOFF_2026-10-22.md](P123_ASTRA_MONGO_FIXTURE_AND_FE_CUTOVER_HANDOFF_2026-10-22.md), governed by [../promt.md](../promt.md) §0 and [WORKFLOW_CONTRACT.md](WORKFLOW_CONTRACT.md) v1.4. Earlier [P123_ASTRA_CORE_DRAFT_READ_SCOPE_P0_TASK_2026-10-22.md](P123_ASTRA_CORE_DRAFT_READ_SCOPE_P0_TASK_2026-10-22.md) has been executed and accepted at bounded source/evidence level. **Do not repeat authz implementation or rerun broad P3.**

**GPT-6 delta:** [GPT6_DRAFT_READ_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_DRAFT_READ_AUTHZ_DELTA_ACCEPTANCE_2026-10-22.md) closes `CORE_DRAFT_READ_SCOPE` P0 **for the two tested chapter GET/LIST entry points only**; source `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`, ASTRA evidence `b094e9a3c7574f3a029445f69a5b125df017bec7`. RED anon/foreign 200, GREEN anon401/foreign403, owner200, published/VIP `/reading/*` still gated; 54 focused backend tests PASS, typecheck/build PASS. GPT-6 inspected GitHub source and evidence **without running Docker**.

**Workstream A:** fix three pre-existing `mongo-reconciliation.live.test.ts` failures from non-UUID `live-test-chap-*` fixtures hitting PG UUID `22P02`. Baseline also failed, so this is not a new P0 regression. Test-only fixture changes and explicit exact test-ID cleanup only, no production PG/Mongo/lock workaround; isolated DB, preserved historical logs, rerun three live tests plus focused regression at exact clean SHA. Do not overstate if test semantics/PG seed makes 3 PASS impossible.

**Workstream B:** prepare ONE concise FE/Core owner decision handoff from existing FE integration preflight, not a duplicate 18-row investigation. Surface `expectedVersion` optional versus 428 required, stale409/ordered writer/outbox, full Author IDE S09 FE-owned, SQL 012 collisions and 017/Alembic 0013, P2/P3 HITL consumers, public DRAFT novel metadata privacy policy. No implementation in `web/`, no merge or branch writes outside pipeline. Record actual current PR SHAs, separate pending decisions and their owners.

**Hard boundaries:** `HOLD_FE_INTEGRATION_ONLY`: NO `web/` edits, PR #52/#54/#55 merge/cherry-pick, `main` writes, live model/embedding calls or spend, publishing, 100k. Preserve historical RED/GREEN, volumes and ledgers. Actual frontend+Core integration, S09 green, populated migration, provider quality, novel 100k and deployment are NOT_RUN. Commit test-only source first, run real fresh PG/Mongo and focused checks, then separate evidence commit. **Stop for GPT-6 delta review**; do not self-approve release.

Everything below this boundary is historical and not active execution guidance.

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
