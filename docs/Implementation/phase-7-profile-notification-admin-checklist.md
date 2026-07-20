# Phase 7 Profile, Notification, and Admin Backend APIs Checklist

Use this checklist after Phase 6 is approved.

Phase 7 implements non-AI backend APIs for public author profile, MVP notifications, and admin operations.

## 1. Implemented Scope

- [x] Add `GET /api/v1/authors/{authorId}/profile`.
- [x] Add MongoDB `notifications` indexes.
- [x] Add MongoDB `device_tokens` indexes.
- [x] Add `GET /api/v1/notifications`.
- [x] Add `PATCH /api/v1/notifications/{notificationId}/read`.
- [x] Add `POST /api/v1/notifications/device-token`.
- [x] Add `GET /api/v1/admin/users`.
- [x] Add `PATCH /api/v1/admin/users/{userId}/lock`.
- [x] Add `PATCH /api/v1/admin/users/{userId}/unlock`.
- [x] Add `GET /api/v1/admin/taxonomy`.
- [x] Add `POST /api/v1/admin/taxonomy/genres`.
- [x] Add `POST /api/v1/admin/taxonomy/tags`.
- [x] Add `GET /api/v1/admin/withdraw-requests`.
- [x] Add `POST /api/v1/admin/withdraw-requests/{withdrawRequestId}/approve`.
- [x] Add `POST /api/v1/admin/withdraw-requests/{withdrawRequestId}/reject`.
- [x] Add `GET /api/v1/admin/dashboard/stats`.

## 2. Validation

- [x] `npm.cmd --prefix backend run typecheck` passes.
- [x] `npm.cmd --prefix backend run build` passes.
- [x] Smoke test validates public author profile with published novel summary.
- [x] Smoke test validates notification list and mark-read.
- [x] Smoke test validates device-token registration.
- [x] Smoke test validates admin user list, lock, and unlock.
- [x] Smoke test validates taxonomy genre/tag create and list.
- [x] Smoke test validates withdraw list, approve, and reject.
- [x] Smoke test validates dashboard stats.

## 3. Manual Review Guide

Postman collection:

```txt
docs/API/postman/phase-7-profile-notification-admin.postman_collection.json
```

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Prepare:

- one `ADMIN` token;
- one `AUTHOR` token;
- one `READER` token;
- one published novel owned by the author;
- one pending withdraw request if testing withdraw approval/rejection manually.

### 3.1 Author Profile

```http
GET http://localhost:4000/api/v1/authors/{authorId}/profile
```

Expected:

- response includes author metadata;
- response includes `followersCount`;
- response includes published novel summary list.

### 3.2 Notifications

```http
GET http://localhost:4000/api/v1/notifications?status=UNREAD
Authorization: Bearer <USER_TOKEN>
```

```http
PATCH http://localhost:4000/api/v1/notifications/{notificationId}/read
Authorization: Bearer <USER_TOKEN>
```

```http
POST http://localhost:4000/api/v1/notifications/device-token
Authorization: Bearer <USER_TOKEN>
Content-Type: application/json

{
  "provider": "FCM",
  "platform": "ANDROID",
  "deviceToken": "demo_device_token_for_phase_7"
}
```

Expected:

- list returns the current user's notifications;
- mark-read changes `status` to `READ`;
- device token is stored as a hash, not raw token.

### 3.3 Admin Users

```http
GET http://localhost:4000/api/v1/admin/users?page=1&limit=20
Authorization: Bearer <ADMIN_TOKEN>
```

```http
PATCH http://localhost:4000/api/v1/admin/users/{userId}/lock
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "reason": "Repeated policy violations."
}
```

```http
PATCH http://localhost:4000/api/v1/admin/users/{userId}/unlock
Authorization: Bearer <ADMIN_TOKEN>
```

Expected:

- admin can list users;
- lock changes user `status` to `LOCKED`;
- unlock changes user `status` to `ACTIVE`.

### 3.4 Taxonomy

```http
GET http://localhost:4000/api/v1/admin/taxonomy
Authorization: Bearer <ADMIN_TOKEN>
```

```http
POST http://localhost:4000/api/v1/admin/taxonomy/genres
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "Fantasy",
  "description": "Fantasy stories."
}
```

```http
POST http://localhost:4000/api/v1/admin/taxonomy/tags
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "academy"
}
```

Expected:

- admin can list genres and tags;
- genre/tag creation is idempotent by slug.

### 3.5 Withdraw Review

```http
GET http://localhost:4000/api/v1/admin/withdraw-requests?status=PENDING
Authorization: Bearer <ADMIN_TOKEN>
```

```http
POST http://localhost:4000/api/v1/admin/withdraw-requests/{withdrawRequestId}/approve
Authorization: Bearer <ADMIN_TOKEN>
```

```http
POST http://localhost:4000/api/v1/admin/withdraw-requests/{withdrawRequestId}/reject
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "reason": "Demo payout information is incomplete."
}
```

Expected:

- approve changes withdraw and transaction to `SUCCESS`;
- approve deducts permanently from `lockedCoins`;
- reject changes withdraw and transaction to `FAILED`;
- reject returns locked Coins back to available balance.

### 3.6 Dashboard Stats

```http
GET http://localhost:4000/api/v1/admin/dashboard/stats
Authorization: Bearer <ADMIN_TOKEN>
```

Expected:

- response includes `totalUsers`;
- response includes `totalNovels`;
- response includes `pendingModerationItems`;
- response includes `mockRevenueCoins`.

## 4. Phase 7 Done Criteria

- [ ] Public author profile is available without auth.
- [ ] Notifications can be listed and marked read.
- [ ] Device token registration stores only token hash.
- [ ] Admin can list, lock, and unlock users.
- [ ] Admin can manage taxonomy.
- [ ] Admin can review withdraw requests.
- [ ] Admin dashboard stats are available.
- [ ] Phase 7 reviewed and approved.

If approved, continue to Phase 8: Web Frontend Completion.
