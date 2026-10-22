# GPT-6 delta acceptance — ASTRA job-resume authorization closure

**Review date:** 2026-10-22 Asia/Bangkok  
**Repository / branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`  
**Prior GPT-6 blocker verdict:** [GPT6_P123_CORE_FINAL_REVIEW_2026-10-22.md](GPT6_P123_CORE_FINAL_REVIEW_2026-10-22.md)  
**Original RED source baseline:** `f64f7b8b8a0009e77c17a1f14a784bb74aeee16a`  
**Verified GREEN source + tests:** `7d1f1bed508480db84def77c75c99039a9bacd7e`  
**ASTRA evidence commit:** `3791a15f5a3febe46f428bd268cd44db1449a9a4`  
**ASTRA evidence integrity seal / latest previous HEAD:** `cdffb2803f1bcac30f3daa93959240fc126055ea`  
**Review method:** independent GitHub source diff/logic, stored traces/validation/report/migration/PR metadata cross-check. GPT-6 **did not** run Docker, Mongo, PostgreSQL or backend tests. ASTRA, not Gemini, was the execution agent. No independent per-blob SHA-256 recalculation by GPT-6; `integrity-git-blobs.json` is provided by ASTRA as an audit manifest.

## Formal verdict

**`P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` — GRANTED FOR LIMITED PLANNING/CONTRACT REVIEW ONLY.**

**Previous P0 `JOB_RESUME_OWNERSHIP` — `CLOSED_BOUNDED_SOURCE_AND_EXECUTOR_EVIDENCE`.** This is not FE code integration, S09 browser PASS, provider/literary/P3-100k acceptance, general pentest, tenant security certification or production release approval. Do not change the documented separate feature gates.

### Why the P0 closure is supported

1. **Observed runtime RED:** On a newly created same-tenant A-owned bootstrap job, authenticated unrelated AUTHOR B used `POST /api/v1/ai/jobs/{jobId}/resume`; old code forwarded it, HTTP 202. `red/after-foreign-resume.json` shows `failed`→`running` and generated fake-provider requests rose from 0→3. `red/validation.json` marks `RED_REPRODUCED`; test exit 0 there means the insecure condition **was reproduced**. Historical RED `source_dirty=true` refers to an untracked test probe; `image-source-proof.json` claims pinned production sources.
2. **Minimal source repair:** `backend/src/modules/ai/ai-gateway.controller.ts:getAuthorizedJob()` calls service-token-backed job GET for trusted `novel_id`, requires valid UUID-shaped scope, calls existing `assertNovelOwnership(req.auth!.userId, req.auth!.role, novelId)`, and only then permits user-facing GET or mutable `POST .../resume`. No novel ID is trusted from the request body; absent/malformed scope fails 403 `JOB_SCOPE_INVALID`; missing job propagates 404; owner policy (including ADMIN) is reused. Service token and actor are still derived in gateway, no AI Service or P3 code changed.
3. **Observed runtime GREEN:** `green/validation.json` is PASS at committed source `7d1f1be`. Real authenticated API requests against new test-owned PG/Mongo and loopback fake show anonymous GET/POST 401, foreign A-job GET/POST 403, missing GET/POST 404, owner POST 202, owner repeated sequential POST 202 without extra fake HTTP requests or duplicate observed job/proposal/outbox counts. `green/before-foreign-resume.json` and `after-foreign-resume.json` are identical in the captured job, PG job, count-based Mongo, fake and ledger snapshot fields; no unauthorized mutable AI-service forward in captured trace.
4. **Targeted tests / regression:** `backend/src/modules/ai/job-resume-authorization.test.ts` has 34 child scenario subtests plus the parent (35 TAP PASS), checking no mutable POST for wrong-author, missing/malformed scope, missing job and deleted novel; owner and admin positives. Other recorded commands: backend 44 focused PASS, AI Service 166 PASS/2 SKIP, backend typecheck and build exits 0, all at exact source `7d1f1be`. The AI tests marked `not postgres_integration` and do not replace separate real DB HTTP checks.
5. **Commit/evidence discipline:** `7d1f1be` touches only the backend job controller, narrow TypeScript tests and test harness; no production frontend, AI Service, P3 controller, migrations, main branch or PR merge. `3791a15` adds runner results and preserved RED and GREEN artifacts; `cdffb28` adds manifest and evidence seal, explicitly distinguishing working file/line-ending hashes from committed Git blob bytes. Documented fake provider egress only, no real Gemini/OpenAI/embedding calls.

### Bounded exceptions and residual safety work

- **Not tested at HTTP runtime:** cross-tenant distinct-tenant accounts; malformed/missing novel scope on a deliberately corrupted real job; ADMIN authorization; concurrent dual resume. Unit mocks cover some of these, not equivalent to integration runs.
- **Read/POST preflight race:** metadata GET/ownership check occurs before mutation POST, across two service requests. The bounded A/B exploit is closed; a future ownership reassignment between GET and POST (TOCTOU) or direct trusted-service-token misuse is not made atomic by this repair. Reassess if multi-tenant ownership transfer, service token exposure or transfer is introduced. This is **not** grounds to repeat the whole P3 core at this stage, but must remain in operational security backlog.
- **Resume is bootstrap-specific:** API `/jobs/{id}/resume` currently resolves a bootstrap job; test-mocked `owner writing job` success in TypeScript is *mock-level only*, not proof that a writing-generation job is resumable through this endpoint. Do not promote that contract without product decision.
- **Scope proof:** Comparing Mongo collection counts does not prove every Mongo document is byte-for-byte untouched; the persisted job/PG and provider snapshots do demonstrate the core unauthorized mutation guard. Service-token topology/egress proof comes from executor-owned configuration/ledger, not a GPT-6 packet capture.
- **P1/P2/P3 status retained:** P1 versioned saves/advisory lease; P2 idea→M-FIRST; P3 transaction-fenced pre-/post-accept HITL and multi-objective execution all remain **bounded offline evidence accepted**, not independent full system live E2E. No code under those flows changed in this delta.

## Integration review gate: authorized actions and stop lines

**NOW PERMITTED:** read-only diff/contract review of PR #52/#54/#55 and pipeline; plan a sandbox *non-merged* integration rehearsal with test-owned clean DB, migration plan, S09 reproduction and FE/backend contract reconciliation. Collect gap/migration matrix and actionable FE-developer review.

**NOT PERMITTED without separate owner/FE agreement:** production `web/` edits by Core executor, cherry-pick/merge FE PRs into pipeline/main, updating protected FE branches, production deployment, using real provider, auto publishing, or claiming browser S09 green. These remain independent gates.

**Current FE integration watchpoints from existing source-based handoff:** optional `expectedVersion` in pipeline versus required-version/HTTP428 in PR #55, versioned-draft writer lease invariants, AI Alembic `0013_objective_intent` versus backend SQL 012+ and stacked #54/#55 012–016 filenames, S09 stale autosave RED/Issue #56, HITL API semantics, 409 `RUN_STEP_BUSY`, cross-store crash reconciliation.

**Separate NOT_RUN gates:** FE browser S09 (RED), combined migration rehearsal, real LLM/embedding/semantic retrieval, literary quality, P3 `P3_HITL_CONTROLLER_100K` 100,000–105,000 canonical words with ending.

**Decision:** no need for further Astra/Gemini implementation on the narrow job-resume defect. Advance to one finite FE/backend *preflight review* task, not merge or UI rewrite. Preserve RED and GREEN artifacts and all historic test data. Final product/release approval remains blocked on separately tracked FE/UI/live/long-run gates.

### Files and evidence inspected

`backend/src/modules/ai/{ai-gateway.controller.ts,ai-gateway.routes.ts,ai-gateway.service.ts,job-resume-authorization.test.ts}` at `7d1f1be`; `Pipeline_test/tools/probe_job_resume_authz.py`; ASTRA `AUTHZ_REPRO_BEFORE_AFTER.md`, `red/validation.json`, `red/after-foreign-resume.json`, `green/validation.json`, before/after foreign job snapshots, `green/owner-positive.json`, `regressions/validation.json`, `commands.json`, `source-checks.json`, `EVIDENCE_SEAL.md`, `integrity-git-blobs.json`, and prior core/FE cutover report. No independent test execution by GPT-6.
