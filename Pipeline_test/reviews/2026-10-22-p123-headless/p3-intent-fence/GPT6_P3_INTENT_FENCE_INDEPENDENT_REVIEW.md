# GPT-6 independent review — P3 objective-intent acceptance fence

**Review date:** 2026-10-22 (Asia/Bangkok)
**Repository / branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`
**Reviewed implementation source SHA:** `a7081c6932e33bd5500d0ca40604afe6bb0d51e4`
**Codex evidence HEAD before this review:** `a77a2451b3e590a8308f911a0eac5d614b9fa0e8`
**Authority before implementation:** `fee928f46448f8b1cd84652d06b7c36ca6481828`
**Review method:** independent GitHub source inspection and cross-check of committed executor HTTP/DB/validation artifacts. Reviewer **DID NOT** independently rerun Docker, pytest, PostgreSQL or MongoDB. Claims about live execution remain qualified as executor-reported.

## Formal scoped verdict

**`P3_OBJECTIVE_FENCE_BOUNDED_SOURCE_EVIDENCE_ACCEPTED_WITH_POST_ACCEPT_GATE`.**

Accept Codex's specific remedy for the **previously reproduced** cancellation-before-accept defect, within the seven deterministic offline interleavings and fixed two-objective flows reported at the exact tested SHA. The source directly shows shared PostgreSQL row locks and a monotone objective intent epoch checked in the same revision/outbox transaction. The success records support an executor-only bounded PASS.

**Do NOT upgrade to `P3_CORE_OFFLINE_PASS`, product P1/P2/P3 integration PASS, `P3_HITL_CONTROLLER_100K`, live-model, real-human UI or literary quality acceptance.** An important **post-accept / pre-memory-and-objective-advance** author cancellation boundary has not been tested and must be resolved or explicitly limited before aggregate P3 Core signoff.

### What source actually establishes

1. `backend/src/modules/novels/controller-intent.ts` parses `auto-<run>-obj-<objective>-intent-<epoch>-plan-<version>-iter-<iteration>-try-<retry>` into durable attempt identity. It rejects recognizable legacy controller keys with `OBJECTIVE_INTENT_REQUIRED`; ordinary P1/P2 generation keys do not use this fence. The transaction validates the run is `running`, current objective/chapter/generation and iteration/retry match, and the pinned plan is active. SQL `FOR UPDATE` locks **run → plan → objective** and compares objective `status=in_progress` and `intent_version`. A mismatch fails with 409 `OBJECTIVE_INTENT_SUPERSEDED`.
2. `backend/src/modules/novels/chapter-revisions.service.ts` calls `assertControllerIntent()` *inside* `withPostgresTransaction`, before chapter row lock and immutable revision/outbox inserts. Network generation/validation finishes before this DB transaction. Existing immutable acceptance replay fast-path precedes rechecking changed intent intentionally: an already committed revision is historical fact, not an unaccepted candidate.
3. `ai-service/infrastructure/postgres_narrative_repository.py:update_objective_status()` obtains `FOR UPDATE` on the objective row and increments `intent_version` on every status update (including status cycles). The domain, ORM/in-memory counterpart and Alembic `0013_objective_intent` supply a non-null default-zero version. `update_autonomous_run()` locks the run row and rejects terminal revival; `stop_autonomous_run` updates that same run row.
4. `backend/src/modules/ai/autonomous-controller.service.ts` now persists target objective/chapter and `last_generation_id` before accept. It uses an attempt key with run/objective/epoch/plan/iteration/retry. An earlier `GET run.status` is a non-atomic preliminary check; the correctness-critical fence is in the accept DB transaction.
5. The PostgreSQL admission chapter-writer lock from the prior P1 repair still guards snapshot/accept, separate from the row locks. The direct code path does not hold run/plan/objective SQL transaction locks during provider network latency.

### Source/evidence consistency checks

- `validation.json` asserts 7 racing/crash cases **45/45 executor checks**: skip-first (6), stop-first (6), accept-first (8), ABA (6), replaced-plan (6), SIGKILL precommit (6) and postcommit (7). `skip_first/step-result.json` and `stop_first/step-result.json` both show HTTP 409 `OBJECTIVE_INTENT_SUPERSEDED`. `ABA/author-edits-before-accept.json` demonstrates epoch 1 → 4 through skipped→pending→in_progress; old generation cannot match. All these fixtures are at tested source SHA `a7081c6...`.
- `accept_first/after.json` captures an immutable accepted revision and one outbox while the author subsequently moves objective to `skipped`. That is coherent with a **commit-order** policy; revision must not be erased. It also shows `run.status=running` and `stop_reason=waiting_for_entity_review` while objective is skipped (see post-accept gate below).
- `kill_post_commit/late-replay.json` returns same accepted revision ID, consistent with no duplicate accept. Precommit kill with subsequent cancellation has zero accepted revision/outbox. Executor-owned process kills and readbacks are documented, no independent reproduction by GPT-6.
- Two P3 success paths `p3-existing/validation.json` and `p3-no-plan-03/validation.json` each list 12 passing checks; 2 objectives, HITL gate and draft-only completion in separate runs. A real background `RUN_STEP_BUSY` interrupted earlier no-plan attempt; the accepted final no-plan run used a **bounded evidence-side retry adapter**, NOT a production scheduler fix. Earlier failures are preserved.
- P1 ordered writer regression and P2 27-check regression are reported PASS on the tested source, AI focused suite 162 PASS / 2 SKIP, backend focused 44 PASS, typecheck/build PASS. These are focused suites, **not** the full backend test suite. `commands-and-exits.json` records errors and recovery attempts. The source SHA is one production/harness commit after authority `fee928f...`; the subsequent HEAD commit is evidence-only.
- All provider/embedding calls claimed to be loopback fake, zero actual spend. Evidence-based assertion only; no independently observed network egress or runtime by GPT-6.

### Important remaining gates and risks

**P0 — Post-accept intent mutation before memory/plan progress.**

`autonomous-controller.service.ts` validates objective intent atomically **only at draft acceptance**. After accept it re-reads `run.status` but not objective `intent_version/status`; later work invokes outbox processing, `approveAutonomousMemory()`, objective evaluator and `PATCH ... objectives/:id` to `completed` using the **pre-generation `eligibleObj` snapshot**. An author can change objective to `skipped` **after the accept transaction commits but before downstream review/memory/progress finishes**. This is a **source-derived race hypothesis, NOT a reproduced defect**, and its correct product outcome must be specified:
- An already accepted immutable revision must remain attributable and immutable.
- A newly committed skip/stop must not silently be overwritten as `completed`, or trigger automatic canonical/plan advancement for the superseded objective.
- Pre-skip approved canon and post-accept review decisions need precise eligibility rules, including HITL resume and worker restart. Tests must force both orders with accurate DB readback and no ghost outbox/canon progress.
- Merely doing a final GET before completing objective does not atomically close this race. Use an appropriate durable fence/conditional transition for downstream status/progress and review checkpoints, or document explicit BLOCKED design choice.

**P1 — No-plan worker scheduling/contention:** `p3-no-plan` preflight failed and `p3-no-plan-02` hit real `RUN_STEP_BUSY`; `p3-no-plan-03` PASS used a 30-second bounded adapter that retries only the busy response. Do not assert production controller scheduling is contention-free or that the harness is passable without this adapter.

**P1 — Runtime/operations compatibility:** Migration `0013` must be applied before backend requiring `intent_version`; rolling deployments with older code and previous controller jobs need staged cutover, possibly fail-closed retry and no forced resurrection. Writer lock lease loss, cross-store reconciliation after committed PG crash, significant load/stress and automatic replay are NOT_ACCEPTED.

**P1/P2 historical limitations persist:** S09 browser still RED and FE-owned, published chapters and user experience untested, legacy unknown-origin narrative entities remain policy-bound. Provider quality, semantic retrieval, unattended policy and P3 final 100,000–105,000 canonical words remain NOT_RUN/NOT_ASSESSED.

## Decision and next handoff

Grant `P3_OBJECTIVE_FENCE_BOUNDED_SOURCE_EVIDENCE_ACCEPTED` **only**, preserving `P3_CORE_PARTIAL`. Proceed to one **targeted P3 post-accept cancel/stop→memory→objective-progress safety slice** plus a single combined core-to-FE integration readiness matrix. Do not start fresh broad rewrites or the 100k/live evaluation. Update API/migration compatibility with PR #55 **read-only**; coordinate FE branch separately after FE review.

### Files inspected

`backend/src/modules/novels/{controller-intent.ts,controller-intent.test.ts,chapter-revisions.service.ts,chapter-writer.ts}`; `backend/src/modules/ai/autonomous-controller.service.ts`; `ai-service/api/{narrative_routes.py,schemas.py}`; `ai-service/infrastructure/{postgres_narrative_repository.py,in_memory_narrative_repository.py,orm_models.py}`; `ai-service/migrations/versions/0013_objective_intent.py`; `Pipeline_test/tools/run_p3_intent_fence.py`; `Pipeline_test/reviews/2026-10-22-p123-headless/p3-intent-fence/{HANDOFF_GPT6.md,P3_INTENT_FENCE_REPORT.md,P3_FUNCTIONAL_MATRIX.md,validation.json,commands-and-exits.json,prior-red-references.json}`, scenario validation/step-result/readback artifacts, `regressions-01/validation.json`, resource lifecycle artifacts.

**Reviewer did not execute tests; this is independent source/evidence review only.**
