# System Test Report

- **Date/Time**: 2026-07-21 16:35 ICT
- **Tester**: Antigravity AI Agent
- **Backend URL**: `http://localhost:4000/api/v1`
- **Web URL**: `http://localhost:5173`
- **PostgreSQL Status**: Connected (`OK`)
- **MongoDB Status**: Connected (`OK`)

---

## 1. Build & Startup Results

| Check | Command / Action | Result | Notes |
| :--- | :--- | :--- | :--- |
| Backend install | `npm.cmd --prefix backend install` | PASS | Dependencies verified. |
| Backend typecheck | `npm.cmd --prefix backend run typecheck` | PASS | `tsc -p tsconfig.json --noEmit` clean with 0 errors. |
| Backend dev start | `npm.cmd --prefix backend run dev` | PASS | Server running on port 4000. |
| Web install | `npm.cmd --prefix web install` | PASS | Dependencies verified. |
| Web typecheck | `npm.cmd --prefix web run typecheck` | PASS | `tsc -b --noEmit` clean with 0 errors. |
| Web build | `npm.cmd --prefix web run build` | PASS | `vite build` completed in 9.49s. |
| Web dev start | `npm.cmd --prefix web run dev` | PASS | Vite dev server running on port 5173. |
| Backend Health Smoke | `GET http://localhost:4000/api/v1/health` | PASS | Returned `200 OK`, `data.status = OK`. |

---

## 2. API Regression Summary

| Suite / Endpoint | Pass | Fail | Blocked | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Auth API (`/auth/login`, `/auth/me`)** | 3 | 0 | 0 | `reader02` (ADMIN), `reader03` (AUTHOR), `reader04` (READER) login succeeded with 200 OK. |
| **Reader API (`/reading/search`)** | 1 | 0 | 0 | Returned `200 OK` with published novel list. |
| **Wallet API (`/wallet/balance`, `/wallet/deposit/mock`)** | 2 | 0 | 0 | Balance fetch and deposit creation function as expected. |
| **Admin API (`/admin/users`)** | 2 | 0 | 0 | Returned `200 OK` for ADMIN (`reader02`), `403 Forbidden` for READER (`reader04`). |
| **Role Guards API** | 2 | 0 | 0 | Forbidden resources return HTTP 403 as expected. |

---

## 3. Web E2E Summary

| Area | Passed | Failed | Blocked | Test ID & Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Global Smoke** | 5 | 0 | 0 | `WEB-SMOKE-001` - `005`: Login page, guest public view, protected route redirects work. |
| **Public / Guest** | 7 | 0 | 0 | `WEB-PUBLIC-001` - `007`: Browsing, chapter views, guest prompt render without errors. |
| **Reader Flow** | 15 | 0 | 0 | `WEB-READER-001` - `015`: Login as `reader04`, library, history, preferences, comments. |
| **Wallet / VIP** | 8 | 0 | 0 | `WEB-WALLET-001` - `008`: Mock deposit (+1000 coins) succeeded, balance updated live. |
| **Author Flow** | 12 | 0 | 0 | `WEB-AUTHOR-001` - `012`: Login as `reader03`, Project Manager, IDE redirection, AI buttons disabled. |
| **Profile / Notifications** | 5 | 0 | 0 | `WEB-UTILITY-001` - `005`: Profile view/edit, notification list load as expected. |
| **Admin Flow** | 9 | 0 | 0 | `WEB-ADMIN-001` - `009`: Login as `reader02`, `/admin/users`, `/admin/taxonomy`, `/admin/moderation`, `/admin/withdraws`. |
| **Role / Permission** | 5 | 0 | 0 | `WEB-PERM-001` - `005`: Protected routes block unauthorized roles with permission alert banner. |
| **Responsive / UI States** | 5 | 0 | 0 | `WEB-UI-001` - `005`: 768px portrait layout adapts without clipping or broken elements. |

---

## 4. Defect Log

| ID | Severity | Area | Steps | Expected | Actual | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| - | - | - | No blocking defects found during system test. | - | - | PASSED |

---

## 5. Data Issues

| ID | Data Issue | Impact | Resolution |
| :--- | :--- | :--- | :--- |
| `DATA-001` | Sample novel database was clean / empty prior to Author test. | `GET /reading/search` returned 0 items until author project created. | Non-blocking. Author flow creates new novel projects dynamically. |

---

## 6. Known Limitations Confirmed

| Limitation | Confirmed? | Notes |
| :--- | :---: | :--- |
| OAuth / Social Login is placeholder. | **YES** | Login form uses standard local database authentication. |
| Wallet is mock/demo only. | **YES** | Mock deposit package UI clearly labeled as demo mode. |
| AI / Copilot actions are disabled. | **YES** | AI action buttons in Author IDE explain deferred context backend. |
| Author context CRUD is deferred. | **YES** | Entities/Timeline tabs display placeholder explanation as intended. |
| Mobile app is out of scope. | **YES** | System test performed on Web & API only. |

---

## 7. Final Recommendation

**`ACCEPT`**: System test passed cleanly across all Backend APIs and Web Frontend E2E flows. Ready for Phase 9 / Production deployment.
