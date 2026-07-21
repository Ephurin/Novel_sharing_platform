# Phase 8.1 Frontend Foundation Hardening Checklist

Use this checklist after Phase 8 functional MVP is available.

Phase 8.1 stabilizes frontend routing, session restore, role guards, API error handling, and shared UI states before polishing individual screens.

## 1. Implemented Scope

- [x] Add standard frontend API error extraction from response envelopes.
- [x] Add session status to auth store.
- [x] Restore current user through `GET /auth/me` after refresh.
- [x] Redirect invalid/expired token sessions back to login.
- [x] Add protected `AuthGate`.
- [x] Add role-aware `RoleGuard`.
- [x] Add role home redirect:
  - `ADMIN` -> `/admin`;
  - `AUTHOR` -> `/author/ide` temporarily until Phase 8.2 adds Author Project Manager;
  - `READER` -> `/reader`.
- [x] Split `/author/ide` into a protected full-screen route.
- [x] Keep general web shell for Reader, Wallet, Notifications, and Admin screens.
- [x] Show navigation items according to current user role.
- [x] Add shared loading, empty, error, and permission UI states.
- [x] Add confirmation modal before sensitive admin actions.

## 2. Validation

- [x] `npm.cmd --prefix web run typecheck` passes.
- [x] `npm.cmd --prefix web run build` passes.
- [x] Build warnings from Mantine/React Router `"use client"` directives are non-blocking.
- [x] Large bundle warning is accepted for MVP; code splitting can be handled in Phase 8.5.

## 3. Manual Review Guide

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Run web:

```txt
npm.cmd --prefix web run dev
```

Open:

```txt
http://localhost:5173
```

### 3.1 Session Restore

Steps:

1. Login with `reader03` as `AUTHOR`.
2. Open `/author/ide`.
3. Refresh the browser.

Expected:

- page shows a short "Restoring session..." state;
- app calls `GET /auth/me`;
- user remains logged in if token is valid;
- invalid token redirects to `/login`.

### 3.2 Role Redirect

Steps:

1. Login with each account:
   - `reader02` as `ADMIN`;
   - `reader03` as `AUTHOR`;
   - `reader04` as `READER`.
2. Open `/`.

Expected:

- admin goes to `/admin`;
- author currently goes to `/author/ide`;
- after Phase 8.2, author should go to `/author` Project Manager;
- reader goes to `/reader`.

### 3.3 Role Navigation

Expected:

- `ADMIN` sees Admin and general utility screens.
- `AUTHOR` sees Author IDE and general utility screens, but not Admin.
- `READER` sees Reader, Wallet, Notifications, but not Admin or Author IDE.

### 3.4 Permission Guard

Steps:

1. Login as `READER`.
2. Open `/admin`.
3. Open `/author/ide`.

Expected:

- permission message appears;
- protected screen content does not render.

### 3.5 API Error Handling

Steps:

1. Stop backend or use an invalid token.
2. Trigger an API-backed screen.

Expected:

- UI shows a meaningful error message;
- raw stack traces are not shown.

### 3.6 Admin Confirmation

Steps:

1. Login as `ADMIN`.
2. Open `/admin`.
3. Try lock/unlock user, approve/reject moderation, approve/reject withdraw.

Expected:

- confirmation modal appears before mutation;
- cancel closes modal without API mutation;
- confirm runs the API mutation.

## 4. Done Criteria

- [ ] User confirms refresh session restore works.
- [ ] User confirms role redirects work.
- [ ] User confirms role navigation/guards work.
- [ ] User confirms admin confirmations work.
- [ ] User confirms no major Phase 8 screen regressed.
