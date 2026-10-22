# ACTIVE GEMINI TASK — take over Codex post-accept handoff, independently verify P1/P2/P3 core

**Date:** 2026-10-22 (Asia/Bangkok)  
**Repository/branch:** `Ephurin/Novel_sharing_platform` / **`codex/ai-copilot-pipeline-test` ONLY**  
**Execution agent:** **Gemini** (Codex quota exhausted per owner; do not ask Codex to resume).  
**Previous authority before Codex wave:** `0582f0528f80740c17f0caa75ccc541fb3080e69`  
**Last fully committed production/harness source tested by Codex:** `3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99`  
**Codex final evidence/docs HEAD before handoff:** `c55b2f4d0b8e7f6895e70a48845f08a37c3b8bd2`  
**Contract authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4.  
**Operating mode:** `HOLD_FE_INTEGRATION_ONLY` — backend/AI-Service/core tests allowed, **FE production code and FE PR integration blocked**.

## Zero-work-repeat handoff: what Codex ALREADY delivered

Codex's six commits after `0582f05`:
1. `7d2f067`: deterministic post-accept cancellation test harness (test-only preload, compose).
2. `c2cddff`: code to fence controller-approved canon and completed objectives.
3. `c2af76d`: per-request authenticated actor propagation instead of incorrectly using repository default actor.
4. `3f7320c`: generation provenance bound as VARCHAR text, not UUID, for `public.chapter_revisions.source_generation_id`.
5. `1ac4010`: extensive executor report, final scenario traces and regression evidence.
6. `c55b2f4`: P1/P2/P3 core readiness matrix and **read-only** #54/#55 backend/FE cutover analysis.

**Do not reimplement this feature based on the old ACTIVE_GEMINI_TASK text or re-run the entire pipeline without cause.** The previous Codex executable task `P123_P3_POST_ACCEPT_AND_CORE_READINESS_TASK_2026-10-22.md` is DONE **at executor-delivery level**, not independently accepted.

Read first:
- `Pipeline_test/reviews/2026-10-22-p123-headless/post-accept/HANDOFF_GPT6.md`
- `.../post-accept/P3_POST_ACCEPT_REPORT.md`
- `.../post-accept/green-03/` individual scenario validations and readbacks
- `.../post-accept/RED-pre-progress-skip/` original runtime RED
- `.../core-readiness/P123_CORE_READINESS_MATRIX.md`
- `.../core-readiness/FE_BACKEND_CUTOVER_CONTRACT.md`
- `Pipeline_test/reviews/2026-10-22-p123-headless/p3-intent-fence/GPT6_P3_INTENT_FENCE_INDEPENDENT_REVIEW.md` (older **pre-accept** review, NOT acceptance of this new post-accept code).

### Important verifier corrections (not new runtime allegations)

- Final `green-03` has **11 post-accept/ABA/HITL/plan/cancellation scenario `validation.json` files totaling exactly 77 recorded PASS checks**: 6+6+7+7+9+8+7+7+7+6+7. Do not propagate a previous conversational **84/84** summary; it was miscounted. Separately `p3-existing` 12 PASS, `p3-no-plan` 12 PASS, `p2` 27 PASS and `p1-writer` bounded PASS. These are executor-generated artifacts at `3f7320c` and **not independent runtime PASS**.
- `HANDOFF_GPT6.md` / core-readiness document refer to `post-accept/validation.json` aggregate, but **that exact file is absent on latest HEAD**. `green-03` individual `validation.json` exist. A reproducible aggregated **manifest must be generated from committed files** with accurate totals, SHA, scenarios, historical FAILs, source/evidence distinction and missing evidence; never fabricate an exit code.
- Codex reported AI-focused **166 PASS / 2 SKIP**, backend-focused **44 PASS**, typecheck/build PASS; comprehensive full backend suite and independent test execution are **not demonstrated**.
- Codex preserved failed intermediate source versions `c2cddff` (actor mismatch), `c2af76d` (UUID-to-VARCHAR SQL comparison) and failed initial test/infrastructure attempts. Do **not** delete/mislabel these; only final tested SHA can support final limited verdict.
- Native background worker can return 409 `RUN_STEP_BUSY`; final no-plan success used an **evidence-side bounded client retry**, not a production scheduling fix.
- Migration `ai-service/migrations/versions/0013_objective_intent.py` belongs to the **AI Alembic chain**, not backend SQL 013; #54/#55 stacked SQL migrations conflict/overlap with pipeline filenames and have **not** been applied to the same combined DB.

## Gemini work scope (finite)

### G0 — Snapshot / no accidental loss
1. Fetch/pull latest branch HEAD, capture exact SHA and working-tree status; inspect commit sequence `0582f05..c55b2f4`. If there are newer commits, report them and rebase review scope to **current latest source** before writing. Preserve dirty local changes: **NO `reset --hard`, `git clean`, destructive checkout or reusing/dropping any prior Docker volume/ledger**.
2. Enumerate GitHub/checked-out `post-accept` evidence tree, verify **all 11 final post-accept scenario validations** and hashes, absence/presence of aggregate `validation.json`, final SHA, and reconcile intermediate fails. Build read-only evidence manifest and note missing fields. Do not modify Codex's historical evidence or reports.
3. Record `GEMINI_EXECUTOR`, local OS, versions and whether independent Docker/PostgreSQL/Mongo tests are feasible. If unavailable, do **source/evidence-only review** and explicitly label `INDEPENDENT_RUNTIME_NOT_RUN`.

### G1 — Independent code / security / architecture inspection
Review final source `3f7320c` (not the erroneous intermediates):
- `ai-service/infrastructure/controller_intent.py`, `postgres_narrative_repository.py`, `api/narrative_routes.py`, `application/narrative_service.py`, `api/schemas.py`, `domain/repositories.py`, `infrastructure/in_memory_narrative_repository.py`;
- `backend/src/modules/ai/autonomous-controller.service.ts`, `backend/src/modules/novels/{controller-intent.ts,chapter-revisions.service.ts,chapter-writer.ts}`;
- migration 0013, trusted X-Actor-Id forwarding from authenticated backend, generated-key provenance and revision `source_generation_id` CHAR/VARCHAR comparison.

**Verify these invariants, citing exact file/line in report:**
- Pre-accept: `run→plan→objective→chapter` row/admission locks and epoch, no provider network inside PG transaction.
- Post-accept: automatic proposal-group approval and objective `completed` acquire the SAME run/plan/objective row locks, validate persisted generation, owner/tenant/novel, pinned epoch, active plan, revision/job, and commit in their respective SQL transaction. User skip/stop commits first ⇒ no later automatic canon/promote/completed. Progress commits first ⇒ accepted historic canon/revision not silently rolled back.
- Human explicit author group approval **without controller_intent** is a distinct intentional decision, not evidence of automatic leak. Multi-group partial commit remains possible; unknown global ACID must not be claimed.
- Backend actor header cannot be injected by arbitrary browser callers to impersonate the author; verify actual ingress/security and distinguish any untested direct AI-service exposure risk.
- Confirm latest execution is **not** automatically accepting an old generation after ABA, restart, or replaced plan. Repeatable already-accepted idempotency returns same immutable revision; no duplicate outbox.
- The tested negative cases require real PG and Mongo; inspect output receipts and actual readback, not only `validation.verdict`.

If finding a material production bug, **reproduce before patch** and label it with severity and expected/actual. Repair only safe, narrowly scoped backend/AI-core issues, with new tests; do not silently expand P1/P2 or reinvent FE.

### G2 — Minimum fresh independent runtime rerun, if local tools available

Use **new isolated** test-owned Compose project, PostgreSQL/Mongo volumes, author/tenant/novel/run IDs and loopback fake provider; no reuse of Codex's 13+ stopped projects. Read the committed `--help`/driver source for the exact invocation: `Pipeline_test/tools/run_p3_post_accept.py`, `run_post_accept_matrix.py`, `run_p3_headless.py`, `run_ordered_writer.py`, `run_p123_next.py`, and `prepare_p123_next.py`. Test-only preload only in dedicated `compose.p123-post-accept-test.yml`. The source pins exact SHA `3f7320c` for reproducing Codex's final run; **if Gemini patches source, commit it first and test that new clean SHA**.
- First, one cancellation-first `pre_progress-skip` (expected accepted revision retained, no auto `completed`); one `pre_approval-stop` (no auto canon); one `pre_approval-advance_first` (prior committed approval retained); and one ABA replay `pre_approval-ABA-02` equivalent with *barrier installed before author continue*.
- Then fresh bounded `p3-existing` and `p3-no-plan` (native `RUN_STEP_BUSY` must be logged and, if retried, **document exact consumer policy**); P1 ordered writer sanity, P2 idea→M-FIRST sanity and focused tests/typecheck.
- Kill/restart/HITL/replacement runs can be added where time allows or if a code change touches them; if omitted mark `NOT_RERUN`, **not** independently PASS.
- Validate status, objective epoch, official canon version, immutable revision/outbox counts, actor/ownership 401/403, late replay error, fake HTTP context hash and post-restart DB readback. Preserve negative attempts and elapsed commands/exits. If networking allocator is exhausted, allocate verified unused subnets only; no deletion of old project resources. **Never rerun against historical DB.**
- **Zero real Gemini/OpenAI/embedding API calls and zero payment**. Disable external egress, use fake provider; no provider keys. No publish action and no 100k generation.

### G3 — Final Gemini handoff; stop for GPT-6 gate decision

Create **new** `Pipeline_test/reviews/2026-10-22-p123-headless/gemini-takeover-2026-10-22/`:
- `GEMINI_INDEPENDENT_REVIEW.md`: source code findings, actual reviewed/tested SHA, exact differences from Codex evidence, newly reproduced/fixed defects and explicit verdict recommendation;
- `EVIDENCE_MANIFEST.json`: enumerate 11 scenario validations & 77 bounded checks with accurate SHA/hashes, FAIL/NOT_RUN, missing aggregate file, E2E evidence refs, Codex vs Gemini-origin flags. Optionally create NEW `validation.json` **in Gemini's directory only** if actually synthesized/verified from files; don't backfill Codex's supposedly missing aggregate and pretend Codex wrote it.
- `RUNTIME_REPRO_REPORT.md` and `commands-and-exits.json` if independently executed, else `INDEPENDENT_RUNTIME_NOT_RUN.md`;
- `P123_CORE_INTEGRATION_READINESS_RECOMMENDATION.md`: proposal only for `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` or `BLOCKED`, with unresolved safety/CI/UI/provider/100k gates; reference Codex's FE cutover contract read-only.

Commit any minimal source/test fix separately, run tests at its exact clean SHA, then commit sanitized evidence. Push ONLY to the pipeline branch and provide source SHA, evidence SHA, test project IDs, exact commands/exits, egress audit, provenance, verdict and residual risks for GPT-6 to **independently review**. Do **not** self-sign GPT-6 acceptance, merge PRs, or mark S09 browser GREEN.

## Hard ownership / safety boundaries

`HOLD_FE_INTEGRATION_ONLY`. **No `web/` changes**, Author IDE autosave, FE PR #52/#54/#55 cherry-pick/merge, `main` writes, secret leak, automatic publishing, direct author canon SQL writes, semantic embedding real calls, provider live run, literary quality or final P3 100,000–105,000 words. Keep all historical RED/Green evidence/ledger/gold/fixtures and stopped volumes. No GitHub PR review submission without owner direction. This task is verification and tightly scoped closure, **not** another broad architecture phase.
