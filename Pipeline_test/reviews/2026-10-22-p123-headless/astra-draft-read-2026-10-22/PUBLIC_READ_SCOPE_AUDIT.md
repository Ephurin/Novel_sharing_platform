# Public/private read scope audit

Executor ASTRA, 2026-10-22, source `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`. Runtime evidence is synthetic, isolated PG/Mongo; this is not an audit of deployed production.

| Surface | Evidence and result |
|---|---|
| GET /chapters/:id | RED anonymous and foreign AUTHOR 200 with Mongo private marker. GREEN anonymous 401, foreign AUTHOR/READER 403, owner/admin 200, missing chapter 404. Owner draft/version unchanged across DRAFT, REJECTED, PENDING_MODERATION, ARCHIVED, PUBLISHED. |
| GET /novels/:id/chapters | Second leak confirmed in NEW RED: unpublished title/id/status returned publicly; published VIP canonical body returned publicly while reader endpoint returned 402. GREEN now private author list: anonymous 401, foreign AUTHOR/READER 403, owner 200. Same service ownership/account policy as GET. |
| GET /reading/chapters/:id | PASS: unpublished parent novel yields 404; published free canonical body 200; VIP locked anonymous/reader/foreign AUTHOR 402; reader with API-created unlock 200 canonical body only. Private Mongo draft never returned. Later anonymous/other author still 402. Existing views increment on successful reader GET is intentional and outside no-mutation denial assertion. |
| GET /reading/novels/:id | PASS on published fixture: chapter catalog contains neither canonical body nor Mongo draft. Repository filters published chapters and parent detail. |
| GET /novels/:id | Observed public DRAFT novel metadata (title/synopsis/author/status), no chapter body. UNRESOLVED product policy for novel metadata privacy; unchanged to avoid a broad novel discovery/authoring rewrite. This is not claimed to be a new private chapter-body exploit. |
| FE consumers | Read-only source inspection: reader-api.ts uses /reading/*; novel-api.ts uses private author GET/list. No FE patch or integrated browser run. |

ADMIN retains existing owner bypass only after live active ADMIN account verification; missing/deleted parent novel fails 404. LOCKED/DELETED account status fails 403; soft-deleted account fails 401; token/current role mismatch fails 403 in direct-service unit test. Direct service calls require trusted AuthContext; controllers ignore body/query actor claims.

PR #55 is a reference only. No service cherry-pick, global auth rewrite, reader API rewrite, publishing change, schema migration, or FE merge. Current /reading/* route already supplies the minimal published/entitlement projection; no new route needed.

NOT_RUN: integrated FE/S09 browser, populated DB upgrades, real providers, full P1/P2/P3, 100k, production deployment. Legacy novel-metadata policy requires independent review; authorization races concurrent with account/ownership changes were not stress-tested.
