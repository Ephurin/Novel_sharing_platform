# Independent review — P1 preflight / Wave 1 (GPT-6)

Date: 2026-10-21 (Asia/Bangkok). Scope: remote GitHub source/evidence audit only; **no access to the local live stack or its database**, no browser test and no provider calls by reviewer.

- Review branch: `codex/ai-copilot-pipeline-test`.
- Tested implementation SHA reported by Gemini: `fcbf945cb9acb0b849b8614fa67c29580615a26b`.
- Evidence commit examined: `737007b3090fe01abf9d1abcc3700cdd69b734fd`.
- Run: `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`.
- Governing document: `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3.
- Original task: `Pipeline_test/ACTIVE_GEMINI_TASK.md`.

## Verdict

**PREFLIGHT_PARTIAL — LIVE_NOT_AUTHORIZED / P1_BLOCKED.** This is a good-faith STOP at the explicit provider-budget gate, **not** functional acceptance of S01–S11. P2/P3/100k: NOT_RUN. No live provider outcome or literary quality verdict can be inferred from the reported offline results.

The supplied logs substantiate the following limited facts: AI-service pytest printed **397 passed, 2 skipped, 42 deselected**; entity audit printed **66 passed**; backend targeted log printed **60 tests passed**; TypeScript check and Vite build logs were produced (Vite reports success but warnings). The isolated stack and schema claims are supported by checked-in configuration and local observation logs, **but were not independently queried at runtime by this reviewer**.

## Findings to address BEFORE paid/provider-backed live testing

| ID | Severity | Finding | Evidence / action |
|---|---|---|---|
| REV-P1-01 | BLOCKER | **Real provider is not configured in the committed stack.** `docker-compose.isolated.yml` sets `LLM_PROVIDER: fake` while `LLM_MODEL: gemini-3.5-flash-lite` only names a model. `run_config.json` has `requested_generation_model=null`, `observed_generation_model=null`; runtime-verification log only checks endpoint/flag and reports no effective external provider. | Prepare a private, test-only override with Gemini through AI Studio, inject credentials locally, verify **effective** model/provider and record an actual safe provider trace after authorization. Do not commit secrets. Flag `entity-human-review-v1` alone is insufficient. |
| REV-P1-02 | BLOCKER | **No explicit budget approval.** `run_config.json` contains null call, cost and time caps, and zero calls. | Only project owner can approve the live-call budget; reviewer neither grants spending nor treats an API key as permission. Enforce runtime counts, retries, hard stop, and bounded cost/time once approved. Until then, no live provider calls. |
| REV-P1-03 | HIGH | **Isolation claim exceeds proven network boundary.** Committed compose publishes ports without `127.0.0.1:` host binding, including PostgreSQL with a static sample password and MongoDB without app authentication, and uses fixed example JWT/service tokens. Project/volume isolation is not equivalent to port isolation. | Before live data, bind test ports to loopback or prove equivalent access controls; inject new ephemeral secrets outside Git; ensure no sensitive data is exposed or used on shared services. Keep unique Compose project/DB/volumes. |
| REV-P1-04 | MEDIUM | **Backend test count is inconsistent.** `REPORT.md`, `NEXT_REVIEW.md` and `validation.json` claim targeted **26 PASS**, while committed `evidence/backend-targeted-tests.txt` ends with **tests 60 / pass 60 / fail 0**. | Reconcile exact command, selected tests and final count in a follow-up evidence addendum; avoid changing old logs or retrospectively assigning PASS. |
| REV-P1-05 | MEDIUM | **“Full suite” wording overclaims coverage.** AI-service log has **42 deselected** and backend's saved log is targeted, not full-suite evidence. | Identify skip/deselection filters, label coverage precisely; do not conflate offline/unit gates with E2E and don't claim complete backend regression. |
| REV-P1-06 | HIGH | **Frozen gold is not materialized in this run's audit files.** `memory_items.csv`, `memory_checkpoints.csv` and `memory_probes.csv` have only headers, although the report says 35 assertions “loaded and frozen in memory_items.csv”. Historical gold might exist elsewhere, but current-run binding/expected hash is not shown. | Before inspecting live extraction, bind the unchanged existing gold to a source/hash/manifest, generate a separate immutable expected-items reference for this run, clearly separate 35 narrative assertions from entity/mention/alias gold. Do not modify historical gold. |
| REV-P1-07 | MEDIUM | **Issue ledger missing entries.** `issues.csv` has only its header although `REPORT.md` lists ISSUE-BUDGET-001 and ISSUE-ENV-LINEEND-001. | Append explicit issue records to this run only, preserving original evidence; do not rewrite history without a logged correction. |
| REV-P1-08 | HIGH | **Unsafe teardown instruction.** `NEXT_REVIEW.md` proposes `docker compose ... down -v`, despite `ACTIVE_GEMINI_TASK.md` prohibiting blanket `down -v` and requiring verified ownership. | Do not execute that command. At final teardown, preserve unknown resources; remove only individually verified run-owned resources with sentinel/absence evidence. A scoped project name alone does not establish authorization to remove all volumes. |
| REV-P1-09 | INFO | **All S01–S11 are unexecuted, not observed product failures.** The report uniformly labels them BLOCKED by budget. `checkpoint.json` has no novel/chapter/revisions. | Keep no-functional-verdict and don't accidentally treat a blocked S01 (which might be performed with no provider calls) as an import defect. Resume after safe preflight and approval. |

## Correct boundaries for the next Gemini round

1. Remain **only** on `codex/ai-copilot-pipeline-test`. Do not modify `main`, `UI`, other `astra/*` branches, or old runs and databases. No PR, cherry-pick, reset, shared migrations, or broad cleanup.
2. Before authorization, perform only **no-provider** remediation of test-local configuration and evidence accuracy. Do not silently switch models or use paid API calls. Use a new or properly logged addendum/commit rather than falsifying the tested code/evidence SHA. If modifying the compose or scripts, report tested config/hash separately from prior implementation SHA.
3. Require an explicit user-approved budget and instrument hard limits for provider calls, estimated/observed cost and time. Unmeasurable cost must be `UNKNOWN`; stop on call/time ceilings and seek guidance, not unlimited retries.
4. Execute P1 S01–S11 with browser UI actions; read-only APIs/SQL only for independent verification. Observe `waiting_entity_review` before event/fact, checkpoint freeze and resume, source identity/offsets/aliases, event/fact/canon approval, save-triggered extraction, stale/idempotency handling, context, and actual persisted readback. Preserve raw model decisions separate from author decisions. Fail closed on errors.
5. For this wave, stop at `P1_LOCAL_EVIDENCE_READY_FOR_INDEPENDENT_REVIEW` or a specific `P1_BLOCKED`, with auditable checkpoints, model trace, direct UI evidence and one sanitized report commit. **No P2/P3 and no 100k until a later assigned gate.**

## Independent reviewer boundary

This review concerns **evidence integrity and readiness only**. Local runtime health, DB isolation, access control, effective provider and UI results remain **NOT_INDEPENDENTLY_VERIFIED** from GitHub alone. It neither approves external spending nor certifies P1 functionality. `main` and other branches must remain unchanged.
