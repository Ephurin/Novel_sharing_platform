# Phase 2 Auth + User + Core Content Checklist

Use this checklist after Phase 1 is approved.

Phase 2 is split into smaller reviewable slices:

- Phase 2A: Auth + User Profile + registration wallet creation.
- Phase 2B: Novel CRUD + author ownership checks.
- Phase 2C: Chapter CRUD + draft save abstraction.
- Phase 2D: Publish state transitions.

## 1. Phase 2A Auth + User Profile

Implemented:

- [x] PostgreSQL migration runner.
- [x] Auth/User/Wallet initial migration.
- [x] `users` table.
- [x] `user_profiles` table.
- [x] `refresh_tokens` table.
- [x] `wallets` table.
- [x] Password hashing for register/change password.
- [x] Register endpoint: `POST /api/v1/auth/register`.
- [x] Login endpoint: `POST /api/v1/auth/login`.
- [x] Refresh endpoint: `POST /api/v1/auth/refresh-token`.
- [x] Logout endpoint: `POST /api/v1/auth/logout`.
- [x] Current user endpoint: `GET /api/v1/auth/me`.
- [x] Change password endpoint: `PATCH /api/v1/auth/change-password`.
- [x] Public profile endpoint: `GET /api/v1/users/{userId}/profile`.
- [x] Private profile endpoint: `GET /api/v1/users/me/profile`.
- [x] Update profile endpoint: `PATCH /api/v1/users/me/profile`.
- [x] User settings endpoints: `GET/PATCH /api/v1/users/me/settings`.
- [x] Create default wallet during registration.

Validated:

- [x] `npm.cmd --prefix backend run typecheck`.
- [x] `npm.cmd --prefix backend run build`.
- [x] `npm.cmd --prefix backend run db:migrate`.
- [x] Register + authenticated `/auth/me` works against local PostgreSQL.
- [x] Refresh token cookie can issue a new access token.
- [x] Logout revokes refresh token and clears cookie.
- [x] MongoDB and PostgreSQL connect on startup with `DB_CONNECT_ON_START=true`.

## 2. Phase 2A Review Guide

Run migration:

```txt
npm.cmd --prefix backend run db:migrate
```

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Register test user:

```http
POST http://localhost:4000/api/v1/auth/register
Content-Type: application/json

{
  "email": "reader@example.com",
  "username": "reader01",
  "password": "StrongPassword123!"
}
```

Then use returned `accessToken`:

```http
GET http://localhost:4000/api/v1/auth/me
Authorization: Bearer <accessToken>
```

Review expectations:

- [x] Response format follows standard success/error envelope.
- [x] Password is stored as hash, not raw text.
- [x] Refresh token is stored as hash, not raw text.
- [x] New registered user has role `READER`.
- [x] New registered user has profile row.
- [x] New registered user has wallet row.
- [x] Locked users cannot login.
- [x] Duplicate email returns `USER_005`.
- [x] Duplicate username returns `USER_004`.

## 3. Phase 2B Novel CRUD

- [x] Add `novels`, `genres`, `tags`, `novel_tags` migration.
- [x] Add novel create/update/get/list endpoints.
- [x] Enforce Author/Admin role for authoring endpoints.
- [x] Enforce ownership checks for updates.
- [x] Generate unique slug.

Validated:

- [x] `npm.cmd --prefix backend run db:migrate` applies `002_novels.sql`.
- [x] Author can create a novel draft.
- [x] Public/detail fetch can read a novel by ID.
- [x] Author can update own novel metadata.
- [x] Author can submit own draft novel for moderation.

Review note:

- Current registration creates `READER` users by default.
- Until an author upgrade/admin flow exists, local Phase 2B testing can update a test user's role to `AUTHOR` directly in PostgreSQL, then login again to receive an access token with role `AUTHOR`.

## 4. Phase 2C Chapter + Draft

- [x] Add `chapters` migration.
- [x] Add MongoDB `draft_chapters` repository.
- [x] Add chapter create/update/get/list endpoints.
- [x] Save editable draft content in MongoDB.
- [x] Keep latest approved/published content in PostgreSQL.

## 5. Phase 2D Publish State

- [x] Submit novel/chapter for review.
- [x] Set publish/moderation status correctly.
- [x] Keep full draft version history deferred.

## 6. Phase 2 Done Criteria

- [x] Phase 2A reviewed and approved.
- [x] Phase 2B reviewed and approved.
- [x] Phase 2C reviewed and approved.
- [x] Phase 2D reviewed and approved.
- [x] Phase 2 fully approved.

If approved, continue to Phase 3: Web Author AI Writing IDE integration.
