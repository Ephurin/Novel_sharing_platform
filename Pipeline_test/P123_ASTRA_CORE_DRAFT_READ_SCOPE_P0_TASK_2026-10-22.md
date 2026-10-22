# ACTIVE ASTRA TASK — P0 private DRAFT chapter read authorization closure

**Assigned:** 2026-10-22 Asia/Bangkok
**Repository:** `Ephurin/Novel_sharing_platform`
**Only permitted branch:** `codex/ai-copilot-pipeline-test`
**Executor:** ASTRA. GPT-6 is independent delta reviewer.
**Last pre-task evidence HEAD:** `f221f54ebb27e0de0dc07bce9b9a2e8634c8be59`
**Baseline production source with RED:** `26a6cbc4c562dd5c496ce446efb55bb297ee3dca` (unchanged after `7d1f1be` job auth production fix).
**Independent GPT-6 review:** [GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md).
**Operating boundary:** `HOLD_FE_INTEGRATION_ONLY`. No FE edits/merges. P1/P2/P3 Core bounded functional evidence accepted, safe FE integration **BLOCKED** on new private draft exposure.

## P0 — Exact confirmed problem

`GET /api/v1/chapters/:chapterId` in the pipeline is unauthenticated, `getChapterController()` passes no auth context and `chapters.service.ts:getChapter()` returns Mongo `draft.content` regardless of ownership. ASTRA's actual fresh-runtime preflight `read-authz-red/http-trace.jsonl` reports:
- owner A's unpublished synthetic DRAFT content delivered HTTP **200** to anonymous request;
- **200** to unrelated authenticated AUTHOR B; the private marker appeared in both bodies;
- PR #55 separate backend returns **401/403**, but that branch is not integrated and its broader chapter service does not preserve the pipeline's writer lease, snapshots and analysis outbox.
This is a **source-confirmed/executor-reproduced P0** and currently unpatched. Do not mark it as merely a hypothesis. The prior job-resume authorization P0 is already closed; do not repeat it.

## Execution steps (bounded; implement and test, not another architecture planning phase)

### A. Preserve and reproduce

1. Pull current pipeline HEAD; compare to `f221f54`. Preserve any dirty local worktree; **no destructive reset/clean**. Identify source changes after `26a6cbc` before applying a patch. Never edit FE PR branches.
2. Read [the GPT-6 review](reviews/2026-10-22-p123-headless/gpt6-final/GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md), preflight `FE_BACKEND_DELTA_MATRIX.md` / `read-authz-red`, and source `backend/src/modules/novels/{chapters.routes.ts,chapters.controller.ts,chapters.service.ts,chapters.repository.ts,novels.routes.ts,novels.service.ts}`. Identify current reader dependencies and confirmed private DTO exposure. Treat PR #55 as *read-only reference*, never blanket cherry-pick.
3. Preserve old RED immutable. If possible reproduce with fresh test-owned A/B accounts, one DRAFT chapter and synthetically distinct sentinel via supported authenticated API; anonymous GET and B GET should demonstrate the old exposure. Capture HTTP, DB readbacks and source SHA. If unavailable, rely on preserved RED with exact provenance, and label `NEW_RED_NOT_RUN` rather than fabricating a rerun.

### B. Implement minimal fail-closed Core fix

1. **Require authentication and AUTHOR/ADMIN role for the private author chapter GET**, plus service-level novel ownership check (same existing `assertOwner` pattern used by `updateChapter`). Pass a trusted `AuthContext` from request to service; scope cannot be taken from client-supplied `novel_id`, `author_id`, query/body.
2. Anonymous private GET must return **401**, foreign author **403**, owner **200** with same `draft` DTO including authoritative Mongo `version`; missing chapter **404**. ADMIN behavior should follow existing consistent policy and fail closed for absent novel. If active/suspended/deleted-account validation can be safely reused from current backend, test it; do not copy all PR #55 auth changes without understanding dependencies. Do not return internal draft fields to an unauthorized caller even on PUBLISHED chapter.
3. Investigate the route `GET /api/v1/novels/:novelId/chapters` and `listChapters()` because it is public and returns `ChapterRecord` with `content`, potentially exposing unpublished metadata or canonical content. **This is a source-derived sibling risk, not yet a reproduced secondary leak.** If demonstrated on isolated fixture, resolve it in the narrow shared access policy (or create explicit blocker evidence for GPT-6 if scope cannot be contained); do not claim that protecting the single GET eliminates all public exposure. Check public `GET /novels/:novelId` and any reader routes for similar private projection, but avoid a platform-wide authorization rewrite.
4. Separate **intentional published reader access** from **private author draft editing**. Do not silently break paid/VIP reader functionality. If existing public reader calls the same GET, decide minimal published-only DTO route/projection under current rights policy, with test; no anonymous draft, unpublished revision or locked VIP content disclosure. The FE owner still implements consumer changes later.
5. Preserve all chapter writer advisory lock ordering, Mongo version CAS, immutable revision/outbox, active-baseline M-FIRST, accepted generation replay and P3 objective intent. No AI service, frontend, global auth policy, migrations or publishing changes unless narrow tests prove an unavoidable dependency; document any such dependency before modifying.

### C. Verification — exact clean source SHA, new owned fixture

Use new isolated PostgreSQL/Mongo, tenant/accounts/novel/chapter, no historical volumes, real authenticated backend HTTP and fake/closed AI upstream. Preserve ordered RED and GREEN receipts; record exact status and response structure:
- unauthenticated DRAFT GET **401**, foreign AUTHOR **403**, owner AUTHOR **200** with correct draft/version, unknown chapter **404**, owner/admin appropriate, wrong novel/chapter scope **403/404**.
- A's `DRAFT`, `REJECTED`, `PENDING_MODERATION`, `PUBLISHED`, `ARCHIVED` if available: private draft never leaked to anonymous or unrelated author. Test **published reader** projection separately if implemented, and `VIP` locked content remains gated.
- Verify public chapter LIST for metadata/body leak; show exact fixture and status/fields, not merely route source. Confirm rejected requests cause no observed PG/Mongo state changes, no provider calls, no outbox/canon mutation or publication.
- Unit tests for route/controller/service authorization and direct non-route callers. Owner status reading must not disrupt previously passing P1/P2/P3 Core tests. Focused backend tests (including the prior job resume auth tests and writer/revision tests), typecheck/build; AI focused only if its code or shared contract is impacted.
- If making an existing owner-based service method required-auth, find/update legitimate internal callsites with secure context or a clearly scoped internal accessor; no accidental bypass or broken existing API compatibility. Ensure tests are runnable without a test-only production bypass.

### D. Evidence / stop

Create NEW `Pipeline_test/reviews/2026-10-22-p123-headless/astra-draft-read-2026-10-22/`:
- `DRAFT_READ_AUTHZ_REPRO_FIX_REPORT.md` with root cause, actual file/line fix, limited policy, known public/private behavior, comparison against PR55 and other reader routes.
- `validation.json`, `commands-and-exits.json`, red and green HTTP trace, owner/foreign/anonymous/auth/DB/provider snapshots; `PUBLIC_READ_SCOPE_AUDIT.md` (explicit PASS/FAIL/NOT_RUN for chapter GET and LIST, novels GET and VIP).
- `source-provenance.json`, hash/secret audit; exact immutable source SHA clean at test start. Source+tests commit **first**, test that SHA, then evidence commit separately. Preserve all historic RED, ledgers, gold and volumes; make no retroactive edits.
- If unable to satisfy the secure public/private contract without a larger reader API change, **STOP with `CORE_DRAFT_READ_SCOPE_BLOCKED`** and actionable smaller interface design. Never claim green on unit mocks alone.

Return handoff and STOP for GPT-6 independent source/evidence delta review. **Do not self-grant integration/merge/product PASS** or begin a new phase.

## Hard constraints

`HOLD_FE_INTEGRATION_ONLY`: NO `web/` changes, no merges/cherry-picks/branch writes to PR #52/#54/#55 or main, no publishing/auto-approval or production deployment. No real Gemini/OpenAI/embedding model egress, no API keys, zero paid spend, no 100k generation. Use clean test-owned resources, no deletion/reuse of prior data or evidence. Prior `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` is a **planning-only** grant, NOT actual safe integration while P0 is RED.
