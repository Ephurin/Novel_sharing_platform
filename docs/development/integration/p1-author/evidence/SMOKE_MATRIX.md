# Smoke & Integration Execution Matrix — Reader, Author & Admin Surfaces (G4)

**Branch:** `integration/p1-author`  
**Date:** 2026-10-23  
**Harness / Environment:** Node Test Runner + Playwright (Microsoft Edge headless) + Isolated Docker Stack (`p1_author_int_b5249`)  
**Separation Policy:** Strictly partitioned into Backend Integration Tests, Frontend Unit Tests, and Executed Browser Smoke Runs.

---

## 1. Part A: Backend Domain Lifecycle & Integration Tests (Database / API Level)

All tests executed against isolated PostgreSQL (`55432`) and MongoDB (`28017`) instances.

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
| **Media File Inspection** | `src/modules/media/media.test.ts` | Inspects magic bytes; rejects fake extensions, SVG, and HTML uploads | **1/1 PASS** (1.6ms) |

*Subtotal Backend Integration:* 152 test cases passed with exit code 0.

---

## 2. Part B: Frontend Unit & Calculation Tests (Node Test Runner)

Executed in isolation with `@tanstack/react-query` and TypeScript without browser overhead.

| Module / Scope | Test File / Command | Key Assertions / Invariants Verified | Status |
|---|---|---|---|
| **Author Wallet Ledger Aggregation** | `web/tests/wallet-earnings.test.mjs` | 1. Calendar boundaries: 7 days, 30 days, 365 days ledger aggregation<br>2. Previous period delta and source totals calculation<br>3. Empty ledger renders 0 bars without invented earnings | **3/3 PASS** (118ms) |
| **Author Project Sorting** | `web/tests/project-sorting.test.mjs` | 1. Project sort choices apply without mutating cached data<br>2. Predictable tie-breaking by title, chapter count, update time | **3/3 PASS** (33ms) |
| **Color Scheme & WCAG Contrast** | `web/tests/color-scheme.test.mjs` | 1. Theme application before app rendering with system & legacy preferences<br>2. Manual toggle overrides OS; OS changes update theme when in system mode<br>3. Blocked storage fallbacks to in-memory preference<br>4. Cross-tab storage synchronization<br>5. WCAG contrast compliance for Light theme (`:root`) and Dark theme (`:root[data-theme="dark"]`) | **6/6 PASS** (149ms) |

*Subtotal Frontend Unit:* 12 test cases passed with exit code 0.

---

## 3. Part C: Executed Headless Browser Smoke & E2E Acceptance Tests (Playwright)

Executed via Playwright driving Microsoft Edge (`PLAYWRIGHT_CHANNEL=msedge`) against real bundled frontend applications and isolated backend servers.

| Suite / Test Name | Test Entrypoint | Viewport & Surface Driven | Verified UI Behavior & Evidence Traces | Status |
|---|---|---|---|---|
| **Reader Reviews & Multi-Viewport Theme Smoke** | `web/tests/draft-persistence.browser.test.mjs` | Desktop `1440x900` + Mobile `375x812` | 1. Reader reviews rating aggregation renders correctly (7/10 average, progress bar at 10%)<br>2. Desktop screenshot captured: `docs/development/PR-54-55-REVIEW/reviews-light-desktop.png`<br>3. Theme switched to Dark mode in browser DOM (`document.documentElement.dataset.theme = 'dark'`)<br>4. Mobile screenshot captured: `docs/development/PR-54-55-REVIEW/reviews-dark-mobile.png`<br>5. Horizontal overflow assertion: `document.documentElement.scrollWidth <= innerWidth` strictly verified | **PASS** (12.57s) |
| **Real AuthorWritingIde UI, S10 & S11** | `web/tests/author-ide.browser.test.mjs` | Desktop `1440x900` | 1. Full `AuthorWritingIde` mounted with router, Mantine, and QueryClient<br>2. Initial load: editor content `'B'`, breadcrumbs `'Browser draft'` & `'Draft'`, autosave status `'Đã lưu • Mới nhất'` (`author-ide-initial.png`)<br>3. **S10 Contradiction Injection:** Author typed contradictory detail into `.sc-manuscript`; autosave triggered; opened Story Brain drawer (`btn-story-brain`); switched to tab "Sự kiện"; clicked "Kiểm tra nhất quán"; finding displayed with quoted evidence (`s10-consistency-findings.png`)<br>4. **S10 Remediation:** Author fixed contradictory detail in editor; autosave completed; re-checked consistency; findings list cleared with confirmation message (`s10-consistency-clean.png`)<br>5. **S11 Continuity:** Verified chapter status remains `DRAFT` in backend; page remounted; draft content preserved; author continued writing; autosave updated MongoDB draft; Story Bible modal tabs loaded cleanly (`s11-continuity-reload.png`) | **PASS** (11.16s) |

---

## 4. Gate G4 Summary

- **Backend Integration Tests:** 152 / 152 passed (0 failures)
- **Frontend Unit Tests:** 12 / 12 passed (0 failures)
- **Browser Smoke & E2E Tests:** 2 complete suites passed (0 failures)
- **Screenshots Generated:**
  - `docs/development/PR-54-55-REVIEW/reviews-light-desktop.png`
  - `docs/development/PR-54-55-REVIEW/reviews-dark-mobile.png`
  - `docs/development/integration/p1-author/evidence/screenshots/author-ide-initial.png`
  - `docs/development/integration/p1-author/evidence/screenshots/s10-consistency-findings.png`
  - `docs/development/integration/p1-author/evidence/screenshots/s10-consistency-clean.png`
  - `docs/development/integration/p1-author/evidence/screenshots/s11-continuity-reload.png`
- **Verdict:** **GATE G4 PASS**
