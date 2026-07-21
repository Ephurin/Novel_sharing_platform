# API Regression Checklist

Use this checklist to validate backend behavior before or alongside web E2E testing.

## 1. Preconditions

- Backend is running at `http://localhost:4000/api/v1`.
- PostgreSQL and MongoDB are connected.
- Test accounts exist:
  - `reader02` / `StrongPassword123!` / `ADMIN`;
  - `reader03` / `StrongPassword123!` / `AUTHOR`;
  - `reader04` / `StrongPassword123!` / `READER`.
- At least one published novel and chapter exist.
- At least one VIP published chapter exists for wallet unlock tests.

## 2. Health Smoke

| ID | Request | Expected |
| :--- | :--- | :--- |
| API-SMOKE-001 | `GET /health` | `200`, response envelope, `data.status = OK`. |

## 3. Postman Collections

Import and run these collections from `docs/API/postman`.

| ID | Collection | Purpose | Expected |
| :--- | :--- | :--- | :--- |
| API-REG-001 | `phase-4-content-control-interaction.postman_collection.json` | Content Control, reports, comments, moderation. | All tests pass. |
| API-REG-002 | `phase-5-reader-backend.postman_collection.json` | Reader search/detail/chapter/preferences/history/library/social. | All tests pass. |
| API-REG-003 | `phase-6-mock-wallet-backend.postman_collection.json` | Wallet balance, mock deposit, VIP unlock, donate, withdraw, transactions. | All tests pass. |
| API-REG-004 | `phase-7-profile-notification-admin.postman_collection.json` | Profile, notifications, admin stats/users/taxonomy/withdraw. | All tests pass. |

If a test fails because collection variables still contain placeholders, replace them with actual UUIDs from the local database or from earlier collection responses.

## 4. Required Collection Variables

Typical variables:

| Variable | Meaning |
| :--- | :--- |
| `baseUrl` | `http://localhost:4000/api/v1` |
| `adminToken` | JWT for `reader02`. |
| `authorToken` | JWT for `reader03`. |
| `readerToken` | JWT for `reader04`. |
| `novelId` | Published novel UUID. |
| `chapterId` | Published free chapter UUID. |
| `vipChapterId` | Published VIP chapter UUID with `priceCoins > 0`. |
| `authorUserId` | User ID of an author account. |
| `commentId` | Existing comment UUID from create/list comment steps. |
| `reviewId` | Existing moderation review UUID. |

## 5. Auth and Permission API Tests

| ID | Steps | Expected |
| :--- | :--- | :--- |
| API-AUTH-001 | Login as all three roles. | All return `200`, access token, correct role. |
| API-AUTH-002 | Call `GET /auth/me` with each token. | Returns current user matching token. |
| API-AUTH-003 | Call Admin endpoint with Reader token. | Returns `403` or standard unauthorized error. |
| API-AUTH-004 | Call Author-owned novel update with another user. | Returns `403` or ownership error. |
| API-AUTH-005 | Call protected endpoint without token. | Returns `401`. |

## 6. Reader API Tests

| ID | Steps | Expected |
| :--- | :--- | :--- |
| API-READ-001 | `GET /reading/search?page=1&limit=20&sort=updatedAt&order=desc`. | Returns published novels only. |
| API-READ-002 | `GET /reading/novels/{novelId}`. | Returns metadata and published chapters sorted by `chapterNumber`. |
| API-READ-003 | `GET /reading/chapters/{chapterId}` for free chapter. | Returns `content` as string. |
| API-READ-004 | `GET /reading/chapters/{vipChapterId}` before unlock as Reader. | Returns `402` with `PAYMENT_002`. |
| API-READ-005 | `PUT /reading/preferences/me`, then `GET /reading/preferences/me`. | Saved values are returned. |
| API-READ-006 | `PUT /reading/history/me`, then list/get history. | History points to latest chapter. |
| API-READ-007 | Add/remove library. | Add returns created/saved; remove returns `204`. |

## 7. Interaction and Moderation API Tests

| ID | Steps | Expected |
| :--- | :--- | :--- |
| API-INT-001 | Create clean comment. | Comment becomes visible in list if approved. |
| API-INT-002 | Create comment containing active banned keyword. | Creates moderation review and hides/pends comment as designed. |
| API-INT-003 | Update own comment. | Returns updated moderation status. |
| API-INT-004 | Delete own comment. | Returns `204`; no longer visible. |
| API-INT-005 | Report novel/chapter/comment. | Returns report and moderation review ID. |
| API-INT-006 | Admin lists moderation reviews. | Report/filter review appears. |
| API-INT-007 | Admin opens moderation detail. | Evidence summary/report count visible. |
| API-INT-008 | Admin resolves pending review. | Status changes; duplicate resolve returns conflict. |

## 8. Wallet API Tests

| ID | Steps | Expected |
| :--- | :--- | :--- |
| API-WALLET-001 | Get wallet balance. | Returns numeric balance. |
| API-WALLET-002 | Create mock deposit session. | Returns session and mock payment URL. |
| API-WALLET-003 | Complete mock deposit success. | Balance increases; deposit transaction exists. |
| API-WALLET-004 | Unlock VIP chapter. | Creates `chapter_unlocks` row and unlock transaction. |
| API-WALLET-005 | Read VIP chapter after unlock. | Returns `200` and chapter content. |
| API-WALLET-006 | Donate coins to author. | Creates donation transaction. |
| API-WALLET-007 | Author requests withdraw. | Creates pending withdraw request. |
| API-WALLET-008 | Admin approves/rejects withdraw. | Status changes and review metadata is saved. |

## 9. Database Side-Effect Verification

Use SQL/Mongo tools only for verification, not as the primary test path.

| Flow | PostgreSQL/Mongo object to verify |
| :--- | :--- |
| Register user | `users`, `user_profiles`, `wallets`. |
| Save draft | Mongo draft collection and/or related chapter draft state. |
| Publish submission | `novels.status` or `chapters.status` becomes pending/published as designed. |
| Comment | Mongo `comments`; PostgreSQL moderation rows if flagged. |
| Report | `reports`, `moderation_reviews`. |
| Keyword moderation | `content_filter_rules`, `moderation_reviews`, Mongo `moderation_evidence`. |
| Reading history | `reading_histories`. |
| Library | `bookmarks`. |
| VIP unlock | `chapter_unlocks`, `wallet_transactions`. |
| Notification | `notifications`. |

## 10. API Regression Result

Record:

- collection name;
- pass/fail count;
- failed request name;
- request URL/method;
- response status/body;
- suspected cause:
  - app bug;
  - stale test data;
  - placeholder variable;
  - environment setup issue.
