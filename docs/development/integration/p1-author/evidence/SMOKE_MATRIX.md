# Smoke Execution Matrix — Reader, Author & Admin Surfaces (G4)

**Branch:** `integration/p1-author`
**Tested Base Commit:** `157b71f5608558fdb2763c65b1254e3dffc77fb8`
**Date:** 2026-10-23
**Harness / Environment:** Node Test Runner + Playwright + Isolated Docker Stack (`p1_author_int_b5249`)

---

## 1. Domain Coverage & Test Invariant Matrix

| Domain / Surface | Test File / Command | Key Invariants Verified | Assertions / Status |
|---|---|---|---|
| **Reader Discovery & Reading State** | `src/modules/reading/reading-lifecycle.postgres.test.ts` | 1. Anonymous `POST /reading/library/me` returns 401<br>2. Duplicate library addition fails with 409 conflict<br>3. Non-existent bookmark removal returns 404<br>4. History sync rejects mismatched novelId/chapterId (404)<br>5. History is strictly user-scoped; readers cannot inspect another user's reading history<br>6. Non-published novel/chapter cannot be added to reading state (404) | **6/6 PASS** (118ms) |
| **Reader Social, Comments & Preferences** | `src/modules/interactions/reader-social-comment-preferences.postgres.test.ts` | 1. Anonymous like/follow/comment mutations return 401<br>2. Duplicate like returns 409 `INTERACTION_001`<br>3. Unlike without existing like returns 404 `INTERACTION_002`<br>4. Duplicate follow returns 409 `INTERACTION_001`<br>5. Unfollow without existing follow returns 404 `INTERACTION_002`<br>6. Readers cannot edit/delete another user's comment (403 `AUTH_008`)<br>7. Clean comments automatically `APPROVED`<br>8. Filtered comments enter `PENDING_MODERATION` with moderation review ID<br>9. Commenting on unpublished chapter fails closed (404)<br>10. Reading preferences are user-scoped | **10/10 PASS** (314ms) |
| **Novel & Chapter Comments** | `src/modules/interactions/comments.integration.test.ts` | 1. Guest comments return 401<br>2. Empty or overlong (>2000 chars) comments return 400<br>3. Comments on draft chapters return 404<br>4. Toxic/prohibited keyword comments enter `PENDING_MODERATION`<br>5. Moderation resolution: Approve makes visible, Reject keeps hidden<br>6. Pagination and chapter isolation verified | **1/1 Suite PASS** (2747ms) |
| **Author Publish & Admin Moderation** | `src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts` | 1. Reader/Author forbidden from Admin moderation resolve route (403)<br>2. Submitting novel triggers moderation review, returns `reviewId`, does not duplicate open reviews<br>3. Unrelated pending review cannot satisfy approval of target novel<br>4. Resolving review approves novel; duplicate resolve fails closed with 409<br>5. Already-PUBLISHED novel cannot be resubmitted via author publish flow (409) | **5/5 PASS** (130ms) |
| **Comment Reports & Admin Moderation** | `src/modules/content-control/comment-user-report-admin-moderation.postgres.test.ts` | 1. Anonymous report returns 401<br>2. Non-Admin forbidden from moderation resolve (403)<br>3. Report against nonexistent or deleted target returns 404<br>4. Report on pending/rejected/unpublished target returns 404<br>5. Same reporter duplicate unresolved report returns 409 (atomic concurrency guarded)<br>6. Distinct reporters on same comment share 1 moderation review (`reportCount=2`)<br>7. Approving report deletes comment and resolves review<br>8. Rejecting report keeps comment approved and marks review rejected<br>9. Notifications dispatched to comment owner and reporter<br>10. Duplicate review resolution returns 409 | **17/17 PASS** (295ms) |
| **Author Workflow & Scheduling** | `src/modules/interactions/author-workflow.integration.test.ts` | 1. Draft privacy: non-owner/anonymous receives 404/403<br>2. Draft updates require `expectedVersion` (428 `DRAFT_VERSION_REQUIRED`)<br>3. Concurrent edits resolve to 1 winner (200) and 1 conflict (409)<br>4. Snapshot creates immutable checkpoint without overwriting active draft<br>5. Bootstrap snapshot requires pre-baseline state and creates `BOOTSTRAP` revision with 0 outbox events<br>6. Chapter import is idempotent with `clientRequestId`<br>7. Chapter ordering enforces canonical constraints | **1/1 Suite PASS** (2670ms) |
| **Author Launch Checklist & Transactional Retry** | `src/modules/interactions/author-launch.integration.test.ts` | 1. Scheduled publication due check<br>2. Profile metadata, editorial status, and launch checklist<br>3. Notification dispatch on publication<br>4. Transactional rollback and retry on schedule commit error | **1/1 Suite PASS** (3171ms) |
| **Author Wallet Ledger & VIP Unlock** | `src/modules/wallet/author-data.postgres.test.ts` | 1. Wallet deposit session creation and completion<br>2. Reader VIP chapter unlock (coin deduction, idempotency on re-unlock)<br>3. Author free access to own VIP chapter (no transaction fee)<br>4. Reader coin donation to author with custom message<br>5. Author incoming transaction ledger reflects all unlock and donation credits | **1/1 Suite PASS** (2043ms) |
| **Frontend Wallet & Project Utilities** | `web/tests/wallet-earnings.test.mjs`, `web/tests/project-sorting.test.mjs` | 1. Calendar boundaries: 7 days, 30 days, 365 days ledger aggregation<br>2. Previous period delta and source totals calculation<br>3. Empty ledger renders 0 bars without invented earnings<br>4. Project sort choices apply without mutating cached data; predictable tie-breaking | **6/6 PASS** (151ms) |
| **Color Scheme & Theme Contrast** | `web/tests/color-scheme.test.mjs` | 1. Theme application before app rendering with system & legacy preferences<br>2. Manual toggle overrides OS; OS changes update theme when in system mode<br>3. Blocked storage fallbacks to in-memory preference<br>4. Cross-tab storage synchronization<br>5. WCAG contrast compliance for Light theme (`:root`) and Dark theme (`:root[data-theme="dark"]`) | **6/6 PASS** (149ms) |
| **Mobile Viewport Smoke** | `web/tests/draft-persistence.browser.test.mjs` (Playwright) | 1. Desktop 1440x900 viewport capture (`reviews-light-desktop.png`)<br>2. Mobile 375x812 viewport capture (`reviews-dark-mobile.png`)<br>3. Horizontal overflow check: `document.documentElement.scrollWidth <= innerWidth` | **PASS** (100% responsive, 0 horizontal scroll) |
| **Media File Inspection** | `src/modules/media/media.test.ts` | Inspects magic bytes; rejects fake extensions, SVG, and HTML uploads | **1/1 PASS** (1.6ms) |

---

## 2. Gate G4 Summary

- **Total Unit & Integration Tests Run:** 152 backend tests + 19 frontend browser/unit tests
- **Pass Rate:** 100%
- **Failures / Regressions:** 0
- **Live Provider Boundary:** Strictly preserved (0 real provider calls)
