# System Test Report Template

Copy this file into a dated report when executing system tests.

Suggested filename:

- `docs/SystemTest/reports/YYYY-MM-DD-system-test-report.md`

## 1. Test Session

| Field | Value |
| :--- | :--- |
| Tester/Agent | |
| Date/time | |
| Git branch/commit | |
| Backend URL | `http://localhost:4000/api/v1` |
| Web URL | `http://localhost:5173` |
| PostgreSQL status | |
| MongoDB status | |
| Browser | |
| Postman version | |

## 2. Build and Startup Results

| Check | Command/Action | Result | Notes |
| :--- | :--- | :--- | :--- |
| Backend install | `npm.cmd --prefix backend install` | PASS/FAIL | |
| Backend typecheck | `npm.cmd --prefix backend run typecheck` | PASS/FAIL | |
| Backend dev start | `npm.cmd --prefix backend run dev` | PASS/FAIL | |
| Web install | `npm.cmd --prefix web install` | PASS/FAIL | |
| Web typecheck | `npm.cmd --prefix web run typecheck` | PASS/FAIL | |
| Web build | `npm.cmd --prefix web run build` | PASS/FAIL | |
| Web dev start | `npm.cmd --prefix web run dev` | PASS/FAIL | |

## 3. API Regression Summary

| Collection | Pass | Fail | Blocked | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `phase-4-content-control-interaction.postman_collection.json` | | | | |
| `phase-5-reader-backend.postman_collection.json` | | | | |
| `phase-6-mock-wallet-backend.postman_collection.json` | | | | |
| `phase-7-profile-notification-admin.postman_collection.json` | | | | |

## 4. Web E2E Summary

| Area | Passed | Failed | Blocked | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Global smoke | | | | |
| Public/Guest | | | | |
| Reader | | | | |
| Wallet/VIP | | | | |
| Author | | | | |
| Profile/Notifications | | | | |
| Admin | | | | |
| Role/Permission | | | | |
| Responsive/UI states | | | | |

## 5. Advanced Test Summary

| Area | Passed | Failed | Blocked | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Negative auth/token | | | | |
| Negative role/ownership | | | | |
| Validation errors | | | | |
| Interaction edge cases | | | | |
| VIP/wallet edge cases | | | | |
| Moderation edge cases | | | | |
| Network/error states | | | | |
| Deep-link/refresh | | | | |
| DB side effects | | | | |

## 6. Test Data Used

| Data | Value |
| :--- | :--- |
| Admin user ID | |
| Author user ID | |
| Reader user ID | |
| Published novel ID | |
| Free chapter ID | |
| VIP chapter ID | |
| Author-owned novel ID | |
| Author-owned chapter ID | |
| Comment ID | |
| Moderation review ID | |
| Withdraw request ID | |

## 7. Defect Log

| ID | Severity | Area | Steps | Expected | Actual | Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BUG-001 | BLOCKER/HIGH/MEDIUM/LOW | | | | | screenshot/log/link | OPEN |

## 8. Data Issues

Record stale/missing local test data separately from app bugs.

| ID | Data issue | Impact | Resolution |
| :--- | :--- | :--- | :--- |
| DATA-001 | | | |

## 9. Known Limitations Confirmed

| Limitation | Confirmed? | Notes |
| :--- | :--- | :--- |
| OAuth is placeholder. | YES/NO | |
| Wallet is mock/demo only. | YES/NO | |
| AI/Copilot actions are disabled. | YES/NO | |
| Author context CRUD is deferred. | YES/NO | |
| Mobile app is not in Phase 8. | YES/NO | |

## 10. Final Recommendation

Choose one:

- `ACCEPT`: System test passed; proceed to Phase 9.
- `ACCEPT_WITH_KNOWN_LIMITATIONS`: Proceed to Phase 9; listed non-blocking issues remain.
- `RETEST_REQUIRED`: Fix listed issues and rerun selected tests.
- `REJECT`: Blocking defects prevent demo.

Recommendation:

```text

```

## 11. Tester Notes

```text

```
