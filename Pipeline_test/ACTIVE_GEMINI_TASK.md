# ACTIVE GEMINI TASK — P1 live functional acceptance (Wave 1)

> **Documentation synchronization — 2026-10-21:** `WORKFLOW_CONTRACT.md` is now **revision 1.4**, defining P3 terminal 100k and distinct HITL/unattended claims. This changes **no Wave 1D testing authorization**: Wave 1D remains **offline-only** and P2/P3/100k NOT_RUN until gate review. Read current [architecture](../ai-service/docs/ARCHITECTURE.md), [API source matrix](../ai-service/docs/CURRENT_API_IMPLEMENTATION_MATRIX.md) and [P3 protocol](P3_100K_EVALUATION_PROTOCOL.md) as context, but **execute Wave 1D repair first**. Earlier wave notices below are preserved as history; the latest Wave 1D notice still governs operational work.

> **LATEST ACTIVE TASK — 2026-10-21, WAVE 1D (OFFLINE INTEGRATION REPAIR).** Read and execute [P1_WAVE_1D_INTEGRATION_REPAIR_TASK.md](P1_WAVE_1D_INTEGRATION_REPAIR_TASK.md) **first**, grounded in [GPT-6 independent Wave 1C findings](reviews/2026-10-21-p1-wave-1d/INDEPENDENT_FINDINGS.md). The Wave 1C tests passed their *offline* scopes but source review found: no functioning Gemini Native dispatch via gateway, untrusted `X-Budget-Ticket` bypass, synthetic browser driver, absent hash/credential guards and unproven cost liability. **P1 remains BLOCKED; no provider-live calls.** Previous 2-hour approval is expired. Use branch `codex/ai-copilot-pipeline-test` exclusively; preserve old runs and resources; new isolated fake upstream/actual browser trace only; no P2/P3/100k, no PR/merge. This assignment overrides the older Wave 1C priority, not its safety rules.

> **CURRENT ACTIVE ASSIGNMENT — 2026-10-21, WAVE 1C (OFFLINE ONLY).** Gemini must FIRST read and execute [P1_WAVE_1C_PRELIVE_HARDENING_TASK.md](P1_WAVE_1C_PRELIVE_HARDENING_TASK.md), grounded in [GPT-6 Wave 1B independent verdict](reviews/2026-10-21-p1-s02-gpt6/WAVE_1B_INDEPENDENT_VERDICT.md). The previous Wave 1B patch on `45bf06c` is **OFFLINE_ACCEPTED_WITH_GATES**; P1 overall remains BLOCKED. Fix (a) mandatory cross-container pre-provider-dispatch limits, (b) authentic browser UI evidence, (c) partial import/replay safety, plus test credentials. **Zero additional Google AI Studio calls**: the 2-hour authorization expired. Preserve all past reports, checkpoints, calls, databases, and Docker resources. Branch ONLY `codex/ai-copilot-pipeline-test`. Do not run P2/P3/100k or self-approve P1. This supersedes prior task priorities but not safety/isolation conditions. Return a narrow patch plus offline evidence for GPT-6 review.

> **CURRENT ACTIVE ASSIGNMENT — 2026-10-21 (Wave 1B / OFFLINE ONLY):** P1 live run is **BLOCKED at S02** by `ISSUE-PIPELINE-VERIFY-001`. The 2-hour approved provider window **expired at 12:47:52 UTC+7**. **DO NOT make new AI Studio calls under the old budget.** Read and execute [P1_S02_REPAIR_TASK_2026-10-21.md](P1_S02_REPAIR_TASK_2026-10-21.md), grounded in [GPT-6 S02 independent review](reviews/2026-10-21-p1-s02-gpt6/REVIEW.md), *before* prior live-resume directives. Work only on `codex/ai-copilot-pipeline-test`. This is a separate, narrow **code-fix + deterministic regression** cycle; no live P1, P2/P3, 100k, PR or merge. Preserve failed-run evidence/DB and return patch/test SHA for independent review.

> **ACTIVE RESUME NOTICE — 2026-10-21:** The project owner has now explicitly approved a **maximum of 200 application-provider attempts, USD 5.00, and 2 hours elapsed wall-clock** for the **P1** live run only. Read and execute [P1_LIVE_RESUME_APPROVED_2026-10-21.md](P1_LIVE_RESUME_APPROVED_2026-10-21.md) **first**, together with [GPT-6 independent preflight review](reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md). That directive supersedes only the old missing-budget-approval block below; **provider=fake, incomplete metering, unsafe networking/credentials and missing gold linkage are still blockers until fixed**. Execute on `codex/ai-copilot-pipeline-test` only. Do not advance P2/P3 or the 100k novel in this wave. Preserve original preflight evidence and other branches/stack data.

**Assigned:** Gemini 3.8 running inside Antigravity as a **testing/execution agent**.  
**Writer/extractor under test:** Gemini 3.5 Flash-Lite through the product's Google AI Studio API, not the Antigravity agent. They have **separate sessions and no shared memory**.  
**Repository:** `Ephurin/Novel_sharing_platform`  
**ONLY authorized source branch:** `codex/ai-copilot-pipeline-test`  
**Baseline at assignment (2026-10-21):** `56b0805c8ba3cc4753f205c6f2d0c818026808c6`. If HEAD changes on the SAME branch, record the new exact SHA; do not assume the baseline still matches.
**Owner of remote evidence review:** ChatGPT/GPT-6, by reading the submitted reports and evidence on this branch.

## 0. Mission and boundaries

Goal: prove the actual **P1/P2/P3 functional behavior** using the existing `Pipeline_test/` scenarios. This is **Wave 1: P1 live Human Entity Review + S01–S11 only**. P2 and P3 are separate later gates, not covered by this run. The **P3 terminal acceptance** is a complete, saved and read-back novel of **95,000–105,000 Vietnamese whitespace-counted words (target 100,000)** with an actual ending. The 100k artifact is ultimately a fair comparative test against other writing systems for the graduation defense; **do not start it now or redefine it as an optional stress test**.

Priority today: demonstrate UI and provider-backed P1 control flow, including correct data provenance and fail-closed behavior. This is not a model-quality comparison. Semantic checks are still needed where incorrect facts, identities or stale context invalidate functional correctness.

**Isolation is mandatory.** All implementation, handoff, and evidence changes must remain on the branch above. Do not checkout/write/merge/rebase/push to `main`, `UI`, other `astra/*` branches, or open/update a PR. Do not cherry-pick other branches. Keep legacy evidence and test runs intact. The shared machine's running services/databases are not disposable test infrastructure.

## 1. Git and source preflight — stop on mismatch

At repo root:

```sh
git fetch origin
git branch --show-current
git status --porcelain
git rev-parse HEAD
git rev-parse origin/codex/ai-copilot-pipeline-test
```

If worktree is dirty, preserve and report it; **never** discard/reset/clean/stash unknown work to force a checkout. Switch to `codex/ai-copilot-pipeline-test` only if safe; use `git pull --ff-only origin codex/ai-copilot-pipeline-test` only if safe. Confirm exact branch and SHA before proceeding. Do **not** merge `origin/main`. Check `git status` again before each intended commit.

Read in this order, *without assuming prior chat memory*:

1. `Pipeline_test/WORKFLOW_CONTRACT.md` (revision 1.4 = current behavioral source of truth; Wave 1D remains OFFLINE ONLY).
2. `Pipeline_test/SHORT_LOOP_TEST.md`.
3. `Pipeline_test/GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`.
4. `Pipeline_test/runs/2026-10-20-human-entity-review/REPORT.md` (offline implemented, live not yet passed).
5. `Pipeline_test/NARRATIVE_MEMORY_AUDIT.md`, `TASK.md`, `AGENT_GUIDE.md`, `EVALUATION.md`, `PROMPT_RUN_TEST.md`.
6. `Pipeline_test/architecture/AI_PIPELINE_MAP.md` and map README; compare snapshot SHA against actual code.

Do not silently use old reports or map statuses as a current runtime PASS. Record current git SHA, contract revision and source/fixture hashes.

## 2. Runtime isolation & provider guard

Before running anything that changes data, inventory active Docker Compose projects, containers, published ports, volumes, databases, and service configuration using **read-only** commands. Record what belongs to the new run. Do not print or commit API keys/JWTs/cookies/entire environment dumps. Do not log sensitive headers.

- Create a **new uniquely named run ID, Compose project, test databases, Docker volumes, test users and novels**; no reuse of prior live run/project data, no default/shared database migration. Prefer fresh nonconflicting ports defined through a test-local override; do not terminate or change other stacks to free ports.
- Never run `docker compose down -v`, broad `docker rm/prune`, `dropdb`, volume deletion, forced branch resets, or unscoped cleanup. Cleanup is allowed **only** for resources confirmed as created and owned by the new run, with preserved sentinels and teardown evidence. If ownership is uncertain, leave them and report it.
- In particular **preserve** `Pipeline_test/runs/2026-10-19-recovery-ui-01/` and its five prior durable outboxes. Do not restart its old workers, repair its DB by hand, or migrate it just to run the new mode. Preserve all prior `runs/` reports, checkpoint and gold.
- Build AI service, backend and web **from the same branch snapshot**. Run backend migrations and Alembic `0012_entity_guidance` (or newer head from this same branch) **only on the new isolated databases**. Verify `story_brains.entity_guidance` and `analysis_runs.entity_candidate_audit`.
- Enable `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` **only** for this new test AI service. Verify effective runtime flag, `entity-human-review-v1`, `entity-candidates-v1` and effective model; `/health` alone is insufficient. Avoid silent fallback and report any deviation.
- Use the already-authorized provider setup but **do not infer spend authorization or budget from the existence of an API key**. Check explicit available limit/approval for live calls. Without it, complete isolated offline preflight, record `LIVE_PROVIDER_BLOCKED_BUDGET`, and stop before paid/live calls.
- First run `python Pipeline_test/tools/task_tool.py verify`; then initialize a NEW run under `Pipeline_test/runs/<NEW_RUN_ID>/`. Do not alter source fixture or frozen gold.

## 3. P1 live test — actual author journey

Use browser/UI for every author action and review step. API/SQL are **read-only evidence** channels, not substitutes for missing UI. Do not edit product code, DB records, prompts or gold to make a test pass. Reproducible defects => capture evidence and stop the affected scenario.

Complete **S01–S11** following the exact current `SHORT_LOOP_TEST.md` and Human Review retest, including:

- **S01/S02:** import/readback ch01–ch05 with chapter/revision/content hashes; save optional hints and verify reload; hints do not become canon; start source-backed extraction with real provider.
- **Human entity gate:** verify `waiting_entity_review` *before* events/facts, inspect candidate occurrences, absolute offsets, context and raw LLM verdicts. Negative examples include **An** versus **an toàn**, missing names, explicit/misleading aliases, lowercase names, **CV-04**, chunk-boundary and Unicode cases. Review keep/reject/type/canonical name/alias per evidence; record author interventions separately from raw model decisions.
- **Freeze/continue:** check `entities_reviewed` persistence, no official canon changes merely from entity approval, optional hints rerun **only entity stage**, valid checkpoints resume without rediscovery; stale version/source and unresolved decisions fail closed; direct author-declared entity has no fabricated occurrence/quote.
- **Event/fact/canon:** continue after review using only validated inventory; review group proposals and activate baseline; verify database official memory and context readback, no plan leakage, no false identity merge and no partial group on downstream failure.
- **S04–S06:** memory tabs/reload, event suggestion, author selection/edit and plan save; planned future events remain plans rather than historical facts.
- **S07–S09:** write/save chapter normally; **saved new revision** must automatically enqueue/extract when brain is active, with correct immutable source. Re-review new extraction. Test rapid saves, idempotency and stale evidence rejection; never approve old proposal by modifying DB.
- **S10/S11:** consistency check with grounded contradiction, author correction in UI, reload/resume; validate post-reload official memory and actual generation context when generation is executed. No public publish.

Also probe fail-safe paths for P1: malformed verifier output, previously observed reconciliation/subject/grounding gaps, 503/422 and retries (only when safe, bounded and supported). Reconcile with frozen narrative gold and separate entity/mention/alias gold. **Prior known issue remains `MEM-CRITICAL-001` until new live evidence establishes otherwise.**

Never confuse a successful HTTP response, zero pending queue, outbox `COMPLETED`, a higher brain_version or a test assertion count with demonstrated semantic correctness. Treat `SOURCE_CODE`, `AUTOMATED_TEST`, `LIVE_UI`, and `LIVE_API` as distinct evidence classes.

## 4. Evidence + reporting — do not self-approve

Save every new artifact **only** under `Pipeline_test/runs/<NEW_RUN_ID>/` (or a new subordinate review folder when explicitly needed). Required:

- `REPORT.md`: P1 S01–S11 with PASS / FAIL / BLOCKED / NOT_RUN per step, and P2/P3/100k explicitly `NOT_RUN`; exact tested SHA, versions, migrations, provider/model/flag and test scope.
- `checkpoint.json` + `run_config.json`, action/issue logs, UI screenshots, requests/responses stripped of secrets, safe runtime and test logs; chapter/revision IDs, content hashes, evidence path for each assertion.
- Raw extraction and candidate metrics **before human corrections** versus after review; name/mention/alias false positives, false merges, unresolved and intervention count; separately evaluate fixed 35 narrative assertions (these are **not** 35 entities).
- P1 narrative memory audit for M0/M-FIRST and every other reached checkpoint; actual packed context if exercised, distinguishing preview from real generation. Report unmeasured values `UNKNOWN` rather than estimated success.
- Provider calls/latency/token usage and bounded budgets. Do not make up fees or latency data.
- A clear `NEXT_REVIEW.md`: tested code SHA, coverage matrix, most serious failures and precise reproduction, resource ownership/cleanup status, whether P1 can advance and what gates P2/P3 still require.

**Do not start P2, P3 or the 100k run in this wave.** This assignment ends at **`P1_LOCAL_EVIDENCE_READY_FOR_INDEPENDENT_REVIEW`** (not an unconditional PASS). If blocked, deliver a checkpointed `P1_BLOCKED` report with the exact blocker. Do not mask problems with code/DB fixes in the same run.

After finishing local test and verifying no secret or unrelated file is included, **commit and push only the newly created, sanitized P1 run evidence and report on `codex/ai-copilot-pipeline-test`** so GPT-6 can inspect it via GitHub. If a commit would include a change outside the allowlisted new run directory, stop and request review. Do not open PR or merge. Provide the run path, commit SHA, verdict, blockers and next step.

**End condition:** leave unrelated services, branches and existing evidence untouched; hand over actual evidence, not an assurance of success.
