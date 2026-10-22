# GPT-6 independent delta acceptance — private chapter/list read authorization

**Review date:** 2026-10-22 Asia/Ho_Chi_Minh  
**Repo/branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`  
**Previously confirmed P0 review:** [GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md](GPT6_CORE_DRAFT_READ_SCOPE_INDEPENDENT_REVIEW_2026-10-22.md)  
**Original task authority:** `7191016fcf67150b332a1d64551d105d2c91d75e`
**First production fix:** `f2e04287c3c35b0e0297d09e0f30348e74a97150`
**Follow-up test/harness commits:** `9cd8787caa45d29e8cc20013349769ee3e5176b5`, `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`
**Last clean tested source (production unchanged from first fix):** `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`
**ASTRA evidence HEAD before review:** `b094e9a3c7574f3a029445f69a5b125df017bec7`
**Method:** GPT-6 independently inspected current GitHub source, code differences, raw committed sanitized HTTP traces, JSON validations, test commands/logs and test source; GPT-6 **did not independently run** Docker/PG/Mongo/Node. All fresh HTTP runtimes and command exit codes are executor ASTRA evidence.

## Scoped verdict

**`CORE_DRAFT_READ_SCOPE_CLOSED_BOUNDED_SOURCE_AND_EXECUTOR_RUNTIME_EVIDENCE` — ACCEPTED.**

The two confirmed P0 read exposures on the pipeline branch have a minimal production change and traceable before/after fake-only HTTP evidence:
- `GET /api/v1/chapters/:chapterId` previously returned unpublished Mongo `draft.content` to anonymous and unrelated authors;
- `GET /api/v1/novels/:novelId/chapters` previously exposed unpublished chapter titles/status/IDs and, in a VIP case, canonical locked content through its public ChapterRecord projection.

Astra independently reproduced both in isolated RED source/fixtures, then captured GREEN using the exact clean committed source. This closes these **specific** entry points, **not** a claim of platform-wide private data certification.

### Source-level checks

1. `backend/src/modules/novels/chapters.routes.ts` now applies `...requireAuthor` (JWT `requireAuth` + AUTHOR/ADMIN role) to private GET, consistent with existing PATCH/revision routes.
2. `backend/src/modules/novels/novels.routes.ts` applies `...requireAuthor` to private chapter list; `GET /novels/:novelId` remains public and is evaluated separately as a metadata policy question.
3. `backend/src/modules/novels/chapters.controller.ts` passes only trusted `requireRequestAuth(request)` to `getChapter` / `listChapters`, not client body/query actor IDs.
4. `backend/src/modules/novels/chapters.service.ts` adds `assertDraftReader(auth)`: checks caller role, live `findAuthUserById` non-deleted account, ACTIVE status and token-current-role equality **before** accessing private chapter or draft; then enforces `assertOwner(getNovel(...), auth)` on actual parent. Non-owner rejection precedes Mongo draft fetch. Existing ADMIN override applies only after active/current ADMIN identity check. The returned authorized draft DTO including `version` is unchanged. Existing chapter writer lease, CAS, revision/outbox, P3 and AI service were not changed.
5. Existing `/reading/chapters/:id` and `/reading/novels/:id` use their separate published/readable projections and VIP entitlement checks. Their production code was not rewritten. The service `getReaderChapter` still checks unlock before returning VIP content.

### Executor runtime evidence, with provenance limits

- `astra-draft-read-2026-10-22/red/validation.json` and sanitized `red/http-trace.jsonl` show anonymous/foreign DRAFT GET 200, public chapter list DRAFT metadata exposure and bypass of the VIP body gate. The new RED harness was untracked during execution and subsequently committed; baseline backend production tree is reported identical to authority `7191016f`. Original preflight RED is preserved untouched.
- `green/validation.json` `passed=true` and `green/http-trace.jsonl` show anonymous GET/list 401, foreign AUTHOR/READER GET/list 403, owner AUTHOR 200 with intended Mongo content/version, nonexisting chapter 404, role/active-account/soft-delete checks, forged query IDs denied, and ADMIN 200 only under authorized status. `DRAFT`, `REJECTED`, `PENDING_MODERATION`, `PUBLISHED`, `ARCHIVED` private draft matrix performed. Denied GET snapshots for PG/Mongo agree before/after; provider calls zero.
- Published reading checks: unpublished chapter via `/reading` 404, published free canonical body 200, locked VIP 402, API-unlocked VIP 200, no returned Mongo draft in public reader body. Some successful reader GETs intentionally update view counters; the no-mutation assertion applies to denied private reads, not every reader call.
- `source-provenance.json` records `source_dirty=false` for final clean tested `d7d9651...`, backend tree SHA, original source and separated evidence commit. Some tests mutate *synthetic* fixture rows to force statuses, ADMIN role and chapter unlocks; this is **not** publication/payment integration acceptance.
- `regression-final-logs.txt` records 54 PASS, 0 FAIL for selected backend authz, revision, outbox, controller intent and PG persistence suites. Typecheck/build exits 0. The broader backend suite was **not** run/accepted. These are executor results not repeated by GPT-6.

### Pre-existing known regression gap, NOT hidden

`backend/src/modules/novels/mongo-reconciliation.live.test.ts` has **three pre-existing failing tests**: its `live-test-chap-<time>` synthetic IDs are non-UUID while `findLatestRevisionByChapterId` now queries a PostgreSQL UUID column. The same three failures, PostgreSQL `22P02`, were reproduced on a byte-identical original baseline backend snapshot. The fix did not modify the offending test or `syncDraftFromRevisionConditional`; this is a **test-fixture gap**, **not** a demonstrated new production regression. No `FULL_BACKEND_PASS` verdict until addressed and rerun. Use a *test-only* repair and fresh isolated PG/Mongo; do not relax production UUID validation.

### Residual product/security gates

- `GET /api/v1/novels/:novelId` still returns public **DRAFT novel metadata** (title/synopsis/author/status), but no chapter body in observed fixtures. This is an **unresolved product discovery/privacy policy**, **not** a confirmed additional private chapter content exploit; request product-owner decision separately rather than silently changing it.
- Active-role/owner mutations concurrent with a chapter read are not stress-tested; cross-tenant/ownership transfer and general account permission certification are not established.
- Private author GET/LIST are now author/admin-only; frontend consumer compatibility and full IDE browser are **not** yet validated against the combined Core tree. Existing reader `/reading/*` is a separate public API. No FE branch merge or frontend modifications occurred.
- The 18-row FE/API conflict report remains actionable. Critical convergence choices include `expectedVersion` required+428 vs pipeline optional, 409/idempotency, ordered writer lease, active-baseline autosave→revision/outbox, publication state, active account, and P3 HITL. Combined **empty DB** migration 18 backend SQL files + AI Alembic 0013 executor PASS; populated DB, mixed workers, concurrent migrations and downgrades **NOT_RUN**.
- Historical full AuthorWritingIde S09 remains RED / unverified; PR #55 isolated hook fixture PASS is **not** full S09 PASS. PR #52/#54/#55 unmerged and FE-owned; no integrated FE/Core runtime.
- Real providers/embeddings, semantic RAG, novel quality, complete P3 100,000–105,000-word canon run **NOT_RUN**.

## Decision and next finite handoff

**Close `CORE_DRAFT_READ_SCOPE` P0 at the bounded source/executor evidence gate.** Preserve the prior **`P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW`** as a **planning/compatibility** grant, never as merge/release acceptance. Safe FE integration remains separately blocked on FE-owned S09, API/version/ordered-writer reconciliation and operational schema/cutover signoff.

The only near-term Core executor work justified here is a **finite, test-only fix for the 3 stale Mongo reconciliation fixtures** and an exact **FE/Core contract decision handoff** derived from the preflight matrix — not another broad P1/P2/P3 implementation phase. Commit test-only source, run at its exact clean SHA, produce separate evidence and stop for GPT-6 review. If genuinely new production failure is uncovered, preserve RED and stop before broad changes.

**Reviewer runtime limitation:** no GPT-6 Docker/test re-execution.
