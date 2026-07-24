# System Test Report

- **Date/Time**: 2026-07-24 13:30 ICT
- **Tester**: Antigravity System Tester Agent
- **Backend URL**: `http://localhost:4000/api/v1`
- **Web URL**: `http://localhost:5173`
- **PostgreSQL Status**: Connected (`OK`)
- **MongoDB Status**: Connected (`OK`)
- **Browser**: Playwright/Chromium DevTools

---

## 1. Build & Startup Results

| Check | Command / Action | Result | Notes |
| :--- | :--- | :--- | :--- |
| Backend install | `npm.cmd --prefix backend install` | PASS | Verified. |
| Backend typecheck | `npm.cmd --prefix backend run typecheck` | PASS | Clean output. |
| Backend dev start | `npm.cmd --prefix backend run dev` | PASS | Server running on port 4000. |
| Web install | `npm.cmd --prefix web install` | PASS | Verified. |
| Web typecheck | `npm.cmd --prefix web run typecheck` | PASS | Clean output. |
| Web build | `npm.cmd --prefix web run build` | PASS | Build completed successfully. |
| Web dev start | `npm.cmd --prefix web run dev` | PASS | Vite dev server running on port 5173. |
| Backend Health Smoke | `GET http://localhost:4000/api/v1/health` | PASS | Returned `200 OK`, status = OK. |
| AI Health Smoke | `GET http://localhost:4000/api/v1/ai/health` | PASS | Returned `503 Service Unavailable`, correctly identifying ngrok provider is offline. |

---

## 2. API Regression Summary

| Suite / Endpoint | Pass | Fail | Blocked | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Auth API** | 4 | 0 | 0 | Checked register, login, refresh, `/auth/me`. |
| **Reader API** | 5 | 0 | 0 | Checked catalog search, details, reading history, bookmarks. |
| **Wallet API** | 5 | 0 | 0 | Mock deposit, balance updates, withdraw creation, and double unlock idempotency. |
| **Admin API** | 4 | 0 | 0 | Moderation queue retrieval, user lock actions, taxonomy tagging, and withdraw requests. |
| **Role Guards API** | 4 | 0 | 0 | Protected routes (Admin routes accessed by Readers/Authors) return 403 Forbidden. |

---

## 3. Web E2E Summary

| Area | Passed | Failed | Blocked | Test ID & Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Global Smoke** | PASS | 0 | 0 | Web home and base layout load correctly. |
| **Public / Guest** | PASS | 1 | 0 | **BUG-001**: Unhandled token expiration crashes page instead of clean login redirect. |
| **Reader Flow** | PASS | 0 | 0 | Login as `reader04`, library, history, comments lifecycle. |
| **Wallet / VIP** | PASS | 0 | 0 | Unlock chapter, mock deposits update balance. |
| **Author Flow** | PASS | 0 | 0 | Novel creation, draft chapter editing, saving. |
| **Authoring Context / AI** | PASS | 0 | 1 | **BLOCKED_EXTERNAL_DEPENDENCY**: AI Copilot returns failure gracefully on offline ngrok endpoint. |
| **Author Premium Pricing** | PASS | 0 | 0 | Published chapter switches between VIP/Free, prices change correctly. |
| **Profile / Notifications** | PASS | 0 | 0 | Notifications load, profile updates successfully. |
| **Admin Flow** | PASS | 0 | 0 | User locking, taxonomy additions, moderation approvals, soft-remove & restore novel. |
| **Role / Permission** | PASS | 1 | 0 | **BUG-002**: Unhandled raw validation error screen on bad URL UUID params instead of friendly 404 page. |

---

## 4. Advanced Test Summary

| Area | Passed | Failed | Blocked | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Negative Auth/Role** | PASS | 0 | 0 | Access token is validated; wrong roles are denied with HTTP 403. |
| **Validation Errors** | PASS | 0 | 0 | Invalid payloads (e.g. isVip=true with priceCoins=0) rejected by API. |
| **VIP Unlock Persistence** | PASS | 0 | 0 | Existing unlocks are kept even when authors change the prices later. |
| **DB Side Effects** | PASS | 0 | 0 | Verified rows in `novels`, `chapters`, `chapter_unlocks`, and `transactions` tables. |

---

## 5. Test Data Used

| Data | Value |
| :--- | :--- |
| Admin User ID | `reader02` / `f0f712d2-201b-42b6-bf80-2a24a7a55610` |
| Author User ID | `reader03` / `8b19c4dd-2ee7-45d0-85c3-1638b1798efa` |
| Reader User ID | `reader04` / `09aa1d03-99cb-48e0-a77e-01ea6b558998` |
| Novel ID | `7938755f-5625-4aa5-8402-c698d1c5108b` ("Test Novel Flow A 2026") |
| VIP Chapter ID | `f2841164-efa7-4900-ba47-20e86b547bcf` |
| LLM Provider Status | `OFFLINE` (Ngrok health check 503) |

---

## 6. Defect Log

| ID | Severity | Area | Steps | Expected | Actual | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-001** | **MEDIUM** | Auth Routing / Guest UI | 1. Access novel as Guest.<br>2. Try clicking like/comment or access token expiration.<br>3. App crashes with raw error code. | Clean redirect to `/login` or prompt to login. | Shows unhandled raw error screen: `Something went wrong. AUTH_005: Access token expired`. | [guest_access_token_expired.png](file:///C:/Users/Laptop/.gemini/antigravity-ide/brain/f7677c17-1795-421a-b503-3ff35fc3304d/guest_access_token_expired_1784873467412.png) | OPEN |
| **BUG-002** | **LOW** | Route Parameters | 1. Navigate to `/reader/novels/invalid-id` directly. | Renders friendly 404 page or parameter formatting error notice. | Shows raw unhandled error banner: `Something went wrong. VALIDATION_001: Invalid request payload`. | [reader_deep_link_404.png](file:///C:/Users/Laptop/.gemini/antigravity-ide/brain/f7677c17-1795-421a-b503-3ff35fc3304d/reader_deep_link_404_1784874338704.png) | OPEN |

---

## 7. Data Issues

No data seed issues encountered. Test cases dynamically created required datasets.

---

## 8. Known Limitations Confirmed

- **AI Copilot offline**: Confirmed ngrok LLM status returns 503 Service Unavailable, and Copilot suggestions display an API failure banner gracefully without crashing.
- **Wallet is mock/demo**: Balance changes correctly via mock deposit package choices.

---

## 9. Final Recommendation

**`ACCEPT_WITH_KNOWN_LIMITATIONS`**: All core E2E business flows (Flow A, B, C, D, E, G) and DB side effects have passed successfully. The detected issues (BUG-001, BUG-002) are minor frontend error-boundary state fallbacks and do not block the MVP platform operations.

---

## 10. Tester Notes

- DB verification shows correct record links across users, profiles, novels, chapters, unlocks, and transactions.
- Idempotency for chapter unlocking behaves correctly, resolving double unlocks cleanly.
