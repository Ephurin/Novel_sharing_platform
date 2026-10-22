# ACTIVE GEMINI TASK — Close P123 Core job-resume authorization blocker

**Date:** 2026-10-22 (Asia/Bangkok)
**Current executor:** GEMINI (Codex quota exhaustion)
**Branch:** `codex/ai-copilot-pipeline-test` ONLY
**Independent GPT-6 review:** [GPT6_P123_CORE_FINAL_REVIEW_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_P123_CORE_FINAL_REVIEW_2026-10-22.md)
**Production source baseline:** `3f7320c9ec0c2e6d9c6c67bc75d16f4449d39c99`
**Gemini prior bounded runtime evidence HEAD:** `f296f8b56a22dd21f2615cfbf4d638171ca894b3`
**Status:** `P123_CORE_OFFLINE_INTEGRATION_REVIEW_BLOCKED_ON_JOB_RESUME_OWNERSHIP`, narrow P0 only.

## Why this task is necessary

GPT-6 accepts bounded P1/P2/P3 functional and P3 cancellation fence evidence but independently found an authorization gap in a supported mutating P1/P2 endpoint:
- `backend/src/modules/ai/ai-gateway.routes.ts` requires authentication and AUTHOR/ADMIN, but that doesn't give authorization to **another author's novel/job**;
- `backend/src/modules/ai/ai-gateway.controller.ts:resumeJobController()` calls AI Service `POST /v1/jobs/:jobId/resume` **without** `assertNovelOwnership`;
- `ai-service/api/narrative_routes.py:resume_job()` loads job by job ID and schedules `service.resume(job_id)` without verifying the initiating author's novel ownership;
- `ai-service/application/bootstrap_service.py:resume()` can requeue a failed job and execute `process(job.job_id)`; `BootstrapJob` has novel_id/tenant_id.
- The adjacent GET job controller verifies `data.novel_id` only **when present**, making absent scope a potential fail-open read path.

This is a source-proven authorization omission **not yet an HTTP reproduction**, so reproduce carefully and preserve raw failures. It does not invalidate completed P3 bounded race tests. Do not reopen broad P3 design.

## Execute in this order

1. **Baseline / test fixture.** Inspect exact current HEAD, clean/dirty working tree, backend `resumeJobController` + `getJobStatusController`, AI Service `resume_job`, `BootstrapJob` domain and route service authentication/tenant scoping. Do not reset/clean historical work. Reuse NO old identities, projects or Docker volumes.
2. **Prove before fixing:** using two authenticated, separate AUTHOR accounts **A and B within the same tenant**, create a new bootstrap job on A-owned novel through supported API (failed/runnable or controlled exception state). B requests `POST /api/v1/ai/jobs/:jobId/resume`. Preserve exact response, status transitions, job and novel IDs (sanitized), job/outbox/provider trace and whether B's request causes work or returns job metadata. The expected secure behavior is 403 before mutable forwarding; if runtime already denies, capture the authoritative gate and no-action proof and **do not modify production source unnecessarily**.
3. **Minimal backward-compatible fix if reproduced:** require resource-scope resolution and `assertNovelOwnership(auth.userId,auth.role, job.novel_id)` **before POST resume**. Fail closed for missing/invalid `novel_id`, avoid trusting user-provided novel ID; resolve from the immutable job. Missing job → 404; wrong author → 403; owner → existing 202 behavior, and authorized ADMIN according to current project ownership contract. Check exposure in `getJobStatusController` when job has no scope and consistently fail closed where appropriate. If proper defence-in-depth requires AI Service check, avoid breaking internal workers; actor headers are trusted only when service-authenticated and forwarded by backend.
4. **New tests:** backend unit/controller test that mocks gateway and verifies B's unauthorized request makes **zero mutable POST** calls; live two-account HTTP test with real PG/Mongo and fake provider for 403/no job advancement and owner-positive response; repeated job 202/idempotent/no inadvertent duplicate; GET wrong-owner/missing-scope failure; 401 unauthenticated. Check same-tenant first; distinct-tenant test only if distinct tenant provisioned honestly.
5. **Regression:** rerun focused AI/backend/unit/typecheck on exact clean committed fix SHA, plus lightweight P1/P2 bootstrap sanity and **one** P3 post-accept stop/skip sanity if shared code is affected. Not the entire 77-scenario matrix without direct impact. Observe egress=0 actual provider calls, no auto-approve, no publish.
6. **Evidence:** new directory `Pipeline_test/reviews/2026-10-22-p123-headless/gemini-job-resume-2026-10-22/` with `AUTHZ_REPRO_BEFORE_AFTER.md`, `validation.json`, commands/exit codes, backend/AI test logs, exact pre-fix/fixed tested SHA, ownership and mutation side-effect proof, egress, limitations. Preserve old RED and prior Gemini reports; source commit first, test **committed clean** SHA, then evidence commit. If no runtime available mark NOT_RUN, **do not** call source inspection a reproduced exploit.

## Stop and release decision

Hand off to GPT-6 for a **narrow delta review**; Gemini may recommend but must NOT self-grant `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW`. Once 403 and owner-positive cases are verified with no new regression, GPT-6 can upgrade the bounded Core gate to *ready for integration review*, **NOT integrated, merged, UI E2E or production-ready**.

**Hard safety:** `HOLD_FE_INTEGRATION_ONLY`, ZERO `web/` production edits, no PR #52/#54/#55 integration/cherry-pick, no main writes or merge, zero real Gemini/OpenAI/embedding calls, no live provider keys/cost, no 100k/P3 long run, no publishing or unreviewed canon approval. Fresh test-owned projects/volumes only; do not destroy history; scripted author decisions `SIMULATED_HUMAN_VIA_API`.
