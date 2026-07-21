# Ephurin System Test Plan

## 1. Objective

Validate that the completed non-AI MVP works end-to-end across backend APIs and the web frontend.

The tester should verify:

- backend service starts and connects to PostgreSQL/MongoDB;
- web app starts and can call backend APIs;
- Public/Guest, Reader, Author, Wallet, Admin, Profile, and Notification flows work;
- role guards prevent unauthorized access;
- mock wallet behavior is clearly demo-only;
- AI/Copilot actions remain disabled and do not call AI endpoints.

## 2. Out of Scope

- Real payment gateway integration.
- Real email/OAuth/social login.
- Mobile app before Phase 9 is implemented.
- FastAPI AI service and real LLM calls.
- Character/timeline/plot-summary CRUD persistence before the backend context phase.
- Load/performance/security penetration testing.

## 3. Source References

| Area | Reference |
| :--- | :--- |
| API contracts | `docs/API/README.md` |
| API-screen mapping | `docs/Frontend/api-screen-matrix.md` |
| Web final QA | `docs/Implementation/phase-8-final-web-qa-report.md` |
| Implementation roadmap | `docs/Implementation/roadmap.md` |
| Database design | `docs/Database/README.md` |
| Frontend sitemap | `docs/Frontend/sitemap.md` |

## 4. Environment

Recommended local URLs:

| Service | URL |
| :--- | :--- |
| Backend API | `http://localhost:4000/api/v1` |
| Web app | `http://localhost:5173` |
| PostgreSQL | From `backend/.env` |
| MongoDB | From `backend/.env` |

Required local files:

- `backend/.env`
- `backend/package.json`
- `web/package.json`

Recommended startup:

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

Validation commands:

```powershell
npm.cmd --prefix backend run typecheck
npm.cmd --prefix web run typecheck
npm.cmd --prefix web run build
```

## 5. Test Accounts

Use or create these accounts before testing. If an account already exists, login instead of registering.

| Username | Password | Role | Purpose |
| :--- | :--- | :--- | :--- |
| `reader02` | `StrongPassword123!` | `ADMIN` | Admin/moderation/system operation tests. |
| `reader03` | `StrongPassword123!` | `AUTHOR` | Author project and IDE tests. |
| `reader04` | `StrongPassword123!` | `READER` | Reader, wallet, library/history/comment tests. |

If role assignment cannot be done through UI/API, seed or update roles directly in PostgreSQL for local testing.

## 6. Test Data

Expected sample data:

- at least one published novel;
- at least one published free chapter;
- at least one published VIP chapter with:
  - `is_vip = true`;
  - `price_coins > 0`;
  - `status = PUBLISHED`;
  - `content is not null`;
  - parent novel status `PUBLISHED`;
- optional sample stories from `docs/Assets/teststory` and `docs/Assets/teststory2`.

Known seeded sample titles may include:

- `Ashenhold - Sample Story`;
- `Thanh Van Sword Path - Sample Story`.

## 7. Test Levels

| Level | Tool | Goal |
| :--- | :--- | :--- |
| Smoke | Browser + health endpoint | Confirm services are running. |
| API Regression | Postman | Confirm backend endpoints still match collections. |
| Web E2E | Browser | Confirm UI can complete flows without Postman. |
| Role/Permission | Browser + Postman | Confirm protected resources reject wrong roles. |
| Data Verification | pgAdmin/Mongo Compass/SQL terminal | Confirm key side effects are persisted. |

## 8. Entry Criteria

- Backend starts without connection errors.
- Web starts and loads in browser.
- PostgreSQL and MongoDB are reachable.
- Sample users and at least one published novel/chapter exist.
- Phase 8.9 checklist is marked complete.

## 9. Exit Criteria

System test can be accepted when:

- all critical smoke tests pass;
- all current Postman collections pass or failures are explained as data/setup issues;
- all P0 web E2E flows pass;
- no role can access unauthorized Admin/Author protected data;
- no AI endpoint is called from Phase 8 UI;
- known limitations are recorded in the final report.

## 10. Severity Definitions

| Severity | Meaning | Example |
| :--- | :--- | :--- |
| `BLOCKER` | Prevents core demo from continuing. | Login fails for all roles. |
| `HIGH` | Core feature broken but workaround exists. | Reader can browse but cannot open chapter. |
| `MEDIUM` | Important behavior incorrect outside happy path. | Duplicate like shows raw error instead of friendly notice. |
| `LOW` | Cosmetic/copy/responsive issue. | Badge text is confusing. |

## 11. General Test Rules

- Prefer testing through UI first, then verify with API/DB only when needed.
- Do not change source code while executing system tests.
- Do not use real payment credentials.
- Do not seed sensitive or copyrighted story content.
- Capture screenshots for UI failures.
- Capture request/response bodies for API failures.
- Record exact route, account, test data IDs, and timestamp for each defect.
