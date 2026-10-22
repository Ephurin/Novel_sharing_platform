# GPT-6 independent review — P0 CORE_DRAFT_READ_SCOPE (private unpublished draft disclosure)

**Date:** 2026-10-22 Asia/Bangkok
**Repository:** `Ephurin/Novel_sharing_platform`
**Pipeline branch:** `codex/ai-copilot-pipeline-test`
**Last reviewed HEAD/evidence-only commit:** `f221f54ebb27e0de0dc07bce9b9a2e8634c8be59`
**Unmodified production runtime source pin:** `26a6cbc4c562dd5c496ce446efb55bb297ee3dca`; last production authz source `7d1f1bed508480db84def77c75c99039a9bacd7e`.
**Reference PR #55 source:** `7b15c078c1ffe2fca96c4e66c96577e3ff007c3c` (separate unmerged tree).
**Review method:** GPT-6 read current GitHub source and ASTRA's captured executor HTTP/database evidence. GPT-6 did **not** independently execute Docker, browser, PostgreSQL or Mongo. No new production repair exists at this review HEAD.

## Verdict

**`CORE_DRAFT_READ_SCOPE_P0_CONFIRMED_SOURCE_AND_EXECUTOR_RUNTIME_RED`.**

**`P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` remains a scoped, *planning-only* prior grant; safe FE integration / merge is `BLOCKED`** until the private draft read contract is fixed and independently reviewed. Do not revoke accepted P1/P2/P3 bounded functional evidence or reopen the fixed job-resume authorization path. This is a distinct, newly verified entry-point vulnerability.

### Source root cause

1. `backend/src/modules/novels/chapters.routes.ts:28–31` wires `chaptersRoutes.get('/:chapterId', validateRequest(...), getChapterController)` without authentication or owner authorization. Other draft PATCH/revision actions already use `requireAuthor`.
2. `backend/src/modules/novels/chapters.controller.ts:getChapterController()` sends only chapterId to `getChapter()`, not authenticated `req.auth`.
3. `backend/src/modules/novels/chapters.service.ts:getChapter()` loads PG chapter then the Mongo draft, returning `draft: {title, content, wordCount, version, autosave, updatedAt}` regardless of chapter/novel publication or caller identity. `updateChapter()` already applies `assertOwner(await getNovel(...), auth)`, showing an available authorization policy.
4. PR #55's distinct, unmerged backend has `get('/:chapterId', ...requireAuthor,...)` and `getChapter(chapterId,auth)` with `assertActiveAccount` and `assertOwner`. This demonstrates a compatible guard model but is **not authority to copy PR #55's whole chapter service**, which does not include all pipeline chapter writer/revision/outbox invariants.

### Runtime RED cross-check

`Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/read-authz-red/validation.json` pins pipeline source `26a6cbc...`, `source_dirty=false` and reports:
- GET `/api/v1/chapters/:chapterId` by an **anonymous** caller → **200**;
- same GET by another **authenticated AUTHOR not owning the novel** → **200**;
- response `draft.content` contains synthetic private text `ASTRA_PRIVATE_DRAFT_FIXTURE_DO_NOT_PUBLISH` with `status='DRAFT'`.
`read-authz-red/http-trace.jsonl` retains the actual responses; project and content are test-owned synthetic. PR #55 separately returned 401/403 in `pr55-api-contract/validation.json`, so the PR observation is not an already-applied fix on pipeline. No real provider calls were made by this preflight.

**Confidence:** source-proven missing authorization and executor-reproduced private data disclosure. No penetration test by GPT-6; no claim about deployed production exposure, other endpoints or real user data.

### Minimal P0 closure requirements

- **Private author draft GET is author/admin scoped.** Owner (active AUTHOR, or authorized ADMIN per existing policy) returns complete intended draft DTO. Anonymous → 401; unrelated AUTHOR → 403; missing chapter → 404. Reject inactive/deleted user if the active-account policy can be safely and narrowly incorporated without copying unrelated PR changes. Never trust request body/query `authorId`, `novel_id` or chapter owner to authorize.
- Apply boundary checks in a way safe for both the route and direct internal service callers. A route-only guard with a service that still returns unscoped draft is inadequate if other call paths exist. Keep the existing Mongo draft version and response contract for authorized author save/IDE.
- **Reader/API distinction:** audit deliberate reader-facing routes/consumers (including `GET /novels/:novelId/chapters`, `GET /novels/:novelId`, any chapter read proxies) for DRAFT/REJECTED/PENDING moderation and VIP leakage. Do not break public published-reading semantics accidentally. If anonymous published-reader support relies on the same GET, **separate a documented public, published-only projection from private author draft access** with explicit policy and independent tests, rather than returning a draft to anonymous. Do not expand into a whole reader rewrite.
- Check `listChapters()` and its currently unauthenticated route for metadata (possibly `ChapterRecord.content`) exposure, but do **not claim a sibling exploit without a runtime proof**; stage any confirmed additional leak into this same tight security closure if ownership/scope is shared.
- No change to Chapter Writer advisory lease, Mongo CAS, snapshot/outbox, P3 controller intent, accepted revision lineage, unrelated FE service. No new unreviewed publish behavior.

### Required tests and evidence

**Before patch:** preserve untouched original ASTRA `read-authz-red/` evidence and, if reasonably feasible, rerun a fresh, isolated real HTTP A/B/anonymous reproduction on source `26a6cbc...` or equivalent exact original production SHA. Ensure private DRAFT synthetic sentinel appears in insecure response. Label `RED_REPRODUCED` only when actually reproduced on current executor environment.

**After patch (exact clean committed source SHA):**
- anonymous DRAFT GET → 401 (or a documented **non-disclosing published-only** public route if separate); foreign AUTHOR DRAFT GET → 403, DRAFT sentinel absent from body; owner AUTHOR DRAFT GET → 200 and authoritative Mongo draft version/content; missing chapter 404; ADMIN authorized case per policy; inactive/suspended account according to chosen policy.
- PUBLISHED chapter as authorized author still returns draft buffer only to owner; public READER view, if supported, never contains Mongo editor draft, unpublished revised content, private workflow or VIP locked payload. Check `DRAFT/REJECTED/PENDING_MODERATION/PUBLISHED/ARCHIVED` policy where records can be set through supported APIs.
- Identical synthetic chapter content and chapter/user ownership readbacks before/after failed GET, zero job/provider/DB mutation on denial; possible adjacent list endpoint/private metadata tested or recorded as unresolved.
- Backend controller/unit negatives, auth middleware, direct-service call test or equivalent, runtime PG/Mongo, focused backend/AI regression and typecheck/build. If no container runtime, mark `INDEPENDENT_RUNTIME_NOT_RUN`.
- Empty provider/embedding keys; loopback fake only; no real spending, no seeded production data, no auto publish.
- Source fix commit first, test exact source SHA from clean checkout, then sanitized evidence commit. Never overwrite ASTRA's prior report/RED, gold, ledgers or Docker volumes.

### Separate integration blockers (not solved here)

- PR #55 expectedVersion 428 policy vs pipeline optional; preserving P1 ordered-writer and active-baseline auto snapshot/outbox; S09 full Author IDE is still RED/not rerun (only PR55 hook fixture PASS).
- Combined backend SQL 001–017 and AI Alembic 0013 **empty DB** rehearsal executor PASS, but populated-data upgrade, combined app runtime and mixed workers NOT_RUN; SQL 017 transactional moderation evidence newly inventoried.
- PR #52/#54/#55 remain separate unmerged trees. No FE merge, production deployment or publication authorized.
- Real provider, semantic RAG, literary quality and P3 HITL 100,000–105,000 canonical words NOT_RUN.

## Decision

Issue **one narrow ASTRA Core security repair task** on `codex/ai-copilot-pipeline-test`, then stop for GPT-6 delta review. Preserve `HOLD_FE_INTEGRATION_ONLY`. **No FE editing/merging or unapproved feature expansion.**

### Source/evidence references

- `backend/src/modules/novels/{chapters.routes.ts,chapters.controller.ts,chapters.service.ts,chapters.repository.ts}` at `26a6cbc...`.
- `backend/src/core/security/auth.middleware.ts`, `backend/src/modules/novels/novels.routes.ts`, `backend/src/modules/novels/novels.service.ts`.
- `Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/{README.md,FE_BACKEND_DELTA_MATRIX.md,P123_INTEGRATION_GATE_MATRIX.md,read-authz-red/validation.json,read-authz-red/http-trace.jsonl,pr55-api-contract/validation.json,S09_FE_HANDOFF.md,MIGRATION_COLLISION_MATRIX.md}`.
- PR #55 reference `backend/src/modules/novels/{chapters.routes.ts,chapters.service.ts}` at `7b15c07...`.

**Review is source/evidence inspection only; no independent runtime tests were executed by GPT-6.**
