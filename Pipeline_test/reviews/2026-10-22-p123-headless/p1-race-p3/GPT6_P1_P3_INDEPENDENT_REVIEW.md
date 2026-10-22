# GPT-6 independent review — P1 ordered writer repair and P3 bounded controller

**Review date:** 2026-10-22 Asia/Bangkok
**Repository/branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`
**Production/harness source tested by executor:** `c34a0251dbc6d15fd2af7a8b1ead787adf892100`
**Executor evidence HEAD reviewed:** `26a99956238ec19e930b4858bee190d2a9203009`
**Review method:** GPT-6 inspected GitHub source code and committed executor evidence, **no independent Docker, test suite, PostgreSQL or Mongo execution**. CI/exit codes and HTTP/DB readbacks remain executor-generated artifacts.

## Scope verdict

| Scope | Reviewer disposition |
| --- | --- |
| P1 ordered-writer reversed two-success CAS race | **`P1_ORDERED_WRITER_BOUNDED_REPAIR_EVIDENCE_ACCEPTED`**: original code with source-pinned immutable container images reproduces RED; final committed source protects the demonstrated race under an admission lease; inverse order, outbox/revision chain and two SIGKILL seams are evidenced. Not distributed transaction or full P1 acceptance. |
| P1 general crash/reconciliation/concurrency | **LIMITED / NOT FULLY ACCEPTED**: interrupted writes can leave Mongo ahead of PostgreSQL, requiring explicit reload/retry. Lease connection failure independent of process death, mixed legacy/versioned semantics, rolling deployments and saturation are unproven. |
| P2 shared regression | **`P2_BOUNDED_HEADLESS_EVIDENCE_ACCEPTED_WITH_LIMITATIONS`** remains; executor repeated 27 checks after source changes. Not live/UI/quality PASS. |
| P3 existing-plan/no-plan bounded controller | **`P3_HAPPY_PATH_BOUNDED_EVIDENCE_ACCEPTED`**: 12 checks per run; 2 objectives and writing jobs; persisted revisions/outbox/canon and source→HTTP hashes; human review checkpoints; all chapters DRAFT. Fake-only fixture and scripted API author decisions. |
| P3 objective skip while generation in flight | **`P3_OBJECTIVE_INTENT_FENCE_BLOCKED`**: a concrete executor runtime RED, source supports its mechanism. Full `P3_CORE_OFFLINE_PASS` **NOT GRANTED**. |
| UI/provider/long run | `UI_BLOCKED_FE` (S09 RED), `REAL_PROVIDER_NOT_TESTED`, `SEMANTIC_RAG_NOT_ASSESSED`, `LITERARY_QUALITY_NOT_TESTED`, `P3_HITL_CONTROLLER_100K_NOT_RUN`. |

## P1 review — source vs evidence

1. New `backend/src/modules/novels/chapter-writer.ts` creates dedicated PostgreSQL admission pool and `pg_try_advisory_lock(hashtextextended(chapterId, 71923))` with explicit `ChapterWriterLease` and `WeakSet` validation for nested operations. `chapters.service.ts:updateChapter()` holds that lease across Mongo CAS, PG chapter metadata, immutable revision/outbox snapshot and Mongo reconciliation. `chapter-revisions.service.ts` uses the lease for snapshots and `acceptDraft()`. `draft-chapters.repository.ts:syncDraftFromRevisionConditional()` reacquires or uses valid nested lease, and rejects sync when PG latest revision differs from the requested revision. Source directly supports a serialized writer domain in the protected code paths.
2. `before-clean/validation.json`: **EXPECTED_RED** for the original immutable image, with independently preserved `before-image-source-proof.json` LF-normalized SHA evidence mapping four original files to prior commit `ee6971b...`. Both A/B returned 200 and final body/revision reverted to older A. The `tested_sha` in this pre-fix run is the **current harness SHA**, not the original production code SHA; preserve this distinction.
3. `final-writer/validation.json`: protected run PASS, both A/B eventually 200 after B conflicts and explicit reload/retry; `final-writer-readback/writer-order-proof.json` reports B parent=A, one corresponding outbox each. `inverse-order/`, `crash-post_cas.json`, `crash-post_pg.json` and delayed reconciliation receipts cover the documented bounded cases.
4. Failure semantics are important: `pg_try_advisory_lock` returns fast 409 under contention; no guaranteed waiting/replay. A SIGKILL after Mongo CAS can preserve an unmaterialized Mongo draft while PG revision remains old. A client/worker must recover via supported reload/retry. Losing the PostgreSQL admission connection while the process continues could lose lock protection; this case is **not** verified. Timestamp is still an extra guard, not the sole ordering fence.
5. No `web/` changes, FE PR merge/cherry-pick or real-provider egress is present among the six source/harness commits. All reported final tests were on source `c34a025...` before evidence-only HEAD `26a9995...`.

**Reviewer conclusion:** close the **specific ordered-writer RED** at bounded offline acceptance level; **do not close overall P1/UI or cross-database durability**.

## P3 review — source vs evidence

1. `backend/src/modules/ai/autonomous-controller.service.ts:stepRunLocked()` obtains `withAutonomousRunLock(runId)`; reads pinned plan/objective early, marks pending objective in_progress, issues real generation and polls. It validates generation/brain, then checks only `currentRun.status === 'running'` immediately before `acceptDraft()`. The `eligibleObj` and list of objectives used later are from an **earlier plan snapshot**.
2. `ai-service/api/narrative_routes.py:update_story_plan_objective()` delegates to `postgres_narrative_repository.py:update_objective_status()`; the repository assigns `obj.status = status` without expected objective state/version, controller-run intent fencing or shared admission. `StoryPlanObjectiveUpdateRequest` validates the new status string but not the expected generation intent/epoch. The run advisory lock is independent, so an authenticated author update is not serialized by it. Plan `plan_version` is not changed by the objective status update path examined.
3. `P3-negative/inflight-objective/validation.json` records `EXPECTED_RED`: objective `skipped`, **one accepted AI revision** (`AI_DRAFT_ACCEPT`) after the edit, controller step responses 200/409 for overlapping steps and canon unchanged. `accepted-after-objective-skipped.json` contains the immutable revision and generation ID. This is an **actual executor-reproduced defect** with a code-level causal path.
4. The success paths `final-p3-existing/validation.json` and `final-p3-no-plan/validation.json` each report 12 PASS, with two objectives, two real fake-upstream HTTP writing generations, deliberate API human-review checkpoints and no publication. Earlier failures in internal generation idempotency key and explicit-null stop_reason were fixed and retested; preserve historical RED.
5. Negative tests for invalid no-ending plan (422), fake 500 bounded retries, stale brain, foreign actor/cross-novel plan, step-step contention and human-checkpoint restart strengthen bounded functional claims, but they do **not** establish plan cancellation/stop/skip atomicity with accepted revision.
6. A **GET of objective status immediately before accept is not sufficient** because a skip/stop can race after the GET and before the revision transaction. Mutations and acceptance need a shared durable synchronization/fencing mechanism or a deliberately enforced `OBJECTIVE_BUSY` policy with atomic rejection and explicit stop semantics. Ensure correct behavior on both sides of the accept commit boundary; never retroactively claim an already accepted immutable revision was never written.

## Required next step

**P0: Fix and independently re-evaluate `P3_OBJECTIVE_INTENT_FENCE_BLOCKED` before aggregate P3 Core PASS.** Design a narrow backend + AI-service atomic policy for objective status changes vs controller acceptance, with an explicit cancellation semantic. Reproduce both orders, including skip/stop in-flight, old plan version, worker death around acceptance, and replay/resume. No auto-approve, no ghost revision/outbox/canon after a successfully committed cancellation; a rejected/busy update must leave objective untouched and return an explicit conflict. Preserve real READ/WRITE provenance, not test-only in-memory checks.

**P1: After P0**, rerun the two bounded P3 happy paths, P2 shared path and writer tests at exact committed source SHA on new isolated fake-only resources. The separate 100,000–105,000 canonical-word P3 acceptance remains deferred and not authorized; no live API calls.

**Safety / roles:** `HOLD_FE_INTEGRATION_ONLY`. FE developer owns frontend, S09 browser RED unchanged; zero external Gemini/OpenAI/embedding calls; fresh own Docker/PG/Mongo volumes; no merge, main writes, automatic publishing, historical evidence or gold mutation.

### Inspected sources

`backend/src/modules/novels/{chapter-writer.ts,chapters.service.ts,chapter-revisions.service.ts,draft-chapters.repository.ts}`; `backend/src/modules/ai/{autonomous-controller.service.ts,autonomous-run.repository.ts}`; `ai-service/api/{narrative_routes.py,schemas.py}`; `ai-service/infrastructure/postgres_narrative_repository.py`; reviewed executor `HANDOFF_GPT6.md`, `P1_ORDERED_WRITER_REPRO_AND_FIX.md`, `P3_FUNCTIONAL_REPORT.md`, `validation.json`, `commands-and-exits.json`, `before-image-source-proof.json`, final-writer and final-p3 validations, negative in-flight evidence.
