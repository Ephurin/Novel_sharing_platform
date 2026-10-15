# Acceptance Report: Gate READER-DISCOVERY-READING-STATE-E2E

**Verdict**: `READER_DISCOVERY_READING_STATE_PASS`  
**Tested Base Main SHA**: `5fa1c929a4f5eb8c27d4e2b5ca0ccac0720b68c8`  
**Tested Code SHA**: `97ef253b544cba9376ed9b491cd3064c05c56647`  
**Working Branch**: `astra/reader-discovery-reading-state-e2e`  
**Date**: `2026-10-15 07:11:57Z`  
**Driver**: Microsoft Edge CDP over WebSocket (real browser automation)

---

## 1. Executive Summary

This report documents the hardened end-to-end execution and verification of the canonical reader discovery and reading lifecycle:
```text
Reader Logs In via Rendered UI Form (/login)
  -> Navigation to /reader with role READER
  -> Reader Searches Published Novel Catalog (/reading/search?q=Ashenhold)
  -> Detail Opened for Deterministic Target Novel (/reader/novels/:novelId)
  -> Reader Clicks 'Add library' -> Captured POST /api/v1/reading/library/me
  -> DB Correlation: Exactly 1 row in PostgreSQL bookmarks table
  -> Reader Navigates to /reader/library via Shell Navigation -> Reloads page
  -> Persisted Novel Verified in DOM & Response; 'Open detail' link verified
  -> Free Published Chapter Opened (/reader/chapters/:chapterId)
  -> Captured GET /api/v1/reading/chapters/:chapterId: HTTP 200, isVip=false, non-empty content
  -> Chapter Auto-Syncs History -> Captured PUT /api/v1/reading/history/me
  -> DB Correlation: Exactly 1 row in PostgreSQL reading_histories table
  -> Reader Navigates to /reader/history via Shell Navigation -> Reloads page
  -> History State Rendered; Click 'Continue' -> Navigates back to exact chapter
  -> Reader Returns to /reader/library -> Clicks 'Remove'
  -> Captured DELETE /api/v1/reading/library/me/:novelId
  -> Reload Library: Target novel absent from DOM & GET /reading/library/me
  -> DB Correlation: Bookmark row deleted (count=0), Reading history retained (count=1)
```

All mutations originated strictly in the rendered user interface. Credential hygiene is strictly enforced: no password literals or auth tokens are committed in code or generated evidence. API and PostgreSQL queries were used exclusively for correlation, invariant validation, and contract verification.

---

## 2. Tested Entities & Deterministic Fixtures

| Field | Value | Notes |
|---|---|---|
| **Reader User ID** | `077e20a2-e26d-466a-bf3a-1811d037df50` | Fixture Reader Account |
| **Reader Email** | `reader04@example.com` | Role: `READER` |
| **Novel ID** | `81b923d7-5507-48ea-9a84-5303fd1de5f4` | Deterministic published novel |
| **Novel Title** | `Ashenhold - Sample Story` | Published sample novel |
| **Chapter ID** | `c660bede-0493-4a46-97f2-6d01c8ddd3db` | Free published chapter |
| **Chapter Number** | `1` | Chapter 1 |
| **Chapter Title** | `Chương 1: Tàn Tro Của Ashenhold` | Free published chapter |
| **Chapter isVip** | `False` | Must be `false` (no VIP substitution) |
| **Login Request ID** | `10372.222` | Captured via CDP `/auth/login` |
| **Search Request ID** | `10372.224` | Captured via CDP `/reading/search` |
| **Add Library Request ID** | `10372.227` | Captured via CDP `POST /reading/library/me` |
| **Library Reload Request ID** | `10372.360` | Captured via CDP `GET /reading/library/me` |
| **Chapter Request ID** | `10372.364` | Captured via CDP `GET /reading/chapters/:id` |
| **History Sync Request ID** | `10372.367` | Captured via CDP `PUT /reading/history/me` |
| **History List Request ID** | `10372.500` | Captured via CDP `GET /reading/history/me` |
| **Remove Library Request ID** | `10372.507` | Captured via CDP `DELETE /reading/library/me/:id` |

---

## 3. Checkpoint Verification Matrix

| Checkpoint | Description | UI Action | Assertion / Evidence | Result |
|---|---|---|---|:---:|
| **Reader-A** | Reader logs in via rendered UI form | Enter credentials, click "Login" | HTTP 200, redirects to `/reader`, shell displays `READER` role | **PASS** |
| **Reader-B** | Search novel and open detail | Type `Ashenhold` in search input, click "Open detail" | `/reading/search` returns target; novel detail renders title & chapter list | **PASS** |
| **Reader-C** | Add to library & DB bookmark proof | Click "Add library" button | `POST /reading/library/me` returns 200/201. DB: 1 row in `bookmarks` table | **PASS** |
| **Reader-D** | Library navigation & reload persistence | Click "Library" nav link, reload page | `GET /reading/library/me` contains target; rendered DOM proves title; Open detail link verified | **PASS** |
| **Reader-E** | Open exact free chapter | Click "Read" for Chapter 1 | `GET /reading/chapters/:id`: HTTP 200, `isVip=false`, rendered title/content verified | **PASS** |
| **Reader-F** | Auto-sync history & DB history proof | Auto-triggered on chapter mount | `PUT /reading/history/me` returns 200. DB: 1 row in `reading_histories` table pointing to chapter 1 | **PASS** |
| **Reader-G** | History navigation, reload & Continue | Click "History" nav link, reload, click "Continue" | `GET /reading/history/me` returns novel/chapter; Continue returns to `/reader/chapters/:id` | **PASS** |
| **Reader-H** | Remove bookmark & DB deletion proof | Click "Remove" button in Library, reload | `DELETE /reading/library/me/:id` returns 200. DB: 0 bookmarks. History row retained | **PASS** |

---

## 4. Phase C Negative and Idempotency Suite

All 6 Phase C invariants are dynamically verified by executing the production-path test suite:
- **Suite Command**: `npx tsx --test --test-reporter=tap src/modules/reading/reading-lifecycle.postgres.test.ts`
- **Test File**: `backend/src/modules/reading/reading-lifecycle.postgres.test.ts`
- **Exit Code**: `0`
- **Result**: `PASS` (6 passed, 0 failed)

Covered Invariants:
1. **Anonymous Rejection (401)**: Anonymous `POST /reading/library/me` is rejected with `AUTH_002` (HTTP 401).
2. **Duplicate Bookmark Conflict (409)**: Duplicate addition of novel to library fails closed with `INTERACTION_001` (HTTP 409).
3. **Remove Non-Existent Bookmark (404)**: Removing a non-existent bookmark fails closed with `INTERACTION_002` (HTTP 404).
4. **Mismatched Novel/Chapter History (404)**: History sync with mismatched `novelId` and `chapterId` fails closed with `CONTENT_001` (HTTP 404).
5. **User-Scoped History Isolation**: Reader 2 cannot read or list Reader 1's history state.
6. **Non-Published Rejection (404)**: Non-published (DRAFT) novel/chapter cannot create accepted library bookmarks or reading history.

---

## 5. Local Validation Manifest

| `web_typecheck` | `npm run typecheck` | `4.34` | **PASS** |
| `web_build` | `npm run build` | `13.64` | **PASS** |
| `backend_typecheck` | `npm run typecheck` | `2.86` | **PASS** |
| `reading_lifecycle_postgres_test` | `npx tsx --test --test-reporter=tap src/modules/reading/reading-lifecycle.postgres.test.ts` | `1.55` | **PASS** |
| `backend_all_unit_and_integration_tests` | `npm test` | `1.97` | **PASS** |
| `browser_reader_flow` | `CDP browser automation` | `-` | **PASS** |

---

## 6. Artifact Inventory

All screenshots captured at 1440x900 viewport via Microsoft Edge CDP:

- `Reader-A`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-a-login.png`
- `Reader-B`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-b-search-detail.png`
- `Reader-C`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-c-add-library.png`
- `Reader-D`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-d-library-persisted.png`
- `Reader-E`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-e-chapter-reading.png`
- `Reader-F`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-f-history-sync.png`
- `Reader-G`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-g-history-continue.png`
- `Reader-H`: `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-h-library-removed.png`

Canonical evidence JSON:
- `docs/development/READER-DISCOVERY-READING-STATE-E2E/reader-discovery-reading-state-e2e-evidence.json`

---

## 7. Stop Boundary State

- **Gate Status**: `LOCAL_PASS_CI_PENDING`
- **Branch**: `astra/reader-discovery-reading-state-e2e`
- **Working Tree**: Clean (`git status --porcelain` is empty)
- **Tested Code Commit**: `97ef253b544cba9376ed9b491cd3064c05c56647`
- **Evidence Push**: Complete
- **No PR or merge to main attempted** (owned by ChatGPT).
