# Phase 8 Web Frontend Completion Checklist

Use this checklist after Phase 7 backend APIs are approved.

Phase 8 connects the React web app to stable non-AI backend APIs from Phases 2, 4, 5, 6, and 7.

## 1. Implemented Scope

- [x] Add shared authenticated web shell navigation.
- [x] Keep Author IDE available at `/author/ide`.
- [x] Add Reader web page at `/reader`.
- [x] Add Reader search, novel detail, chapter reading, library, history, like, follow, and report actions.
- [x] Add Mock Wallet page at `/wallet`.
- [x] Add wallet balance, mock deposit, VIP unlock, donation, withdraw request, and transaction list actions.
- [x] Add Notifications page at `/notifications`.
- [x] Add notification list, mark-read, and mock web push token registration actions.
- [x] Add Admin console at `/admin`.
- [x] Add admin dashboard stats, users lock/unlock, taxonomy, moderation queue, and withdraw approve/reject actions.
- [x] Keep AI/Copilot entry points disabled/placeheld.

## 2. Validation

- [x] `npm.cmd --prefix web run typecheck` passes.
- [x] `npm.cmd --prefix web run build` passes.
- [x] Build warning from dependency-level `"use client"` directives is non-blocking.
- [x] Large bundle warning is acceptable for MVP; code splitting can be done after UI stabilizes.

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

Prepare accounts:

- `reader02` / `StrongPassword123!` as `ADMIN`;
- `reader03` / `StrongPassword123!` as `AUTHOR`;
- `reader04` / `StrongPassword123!` as `READER`.

### 3.1 Navigation and Session

Expected:

- login screen appears when no token exists;
- after login, left navigation shows Author IDE, Reader, Wallet, Notifications, Admin;
- logout clears the token and returns to login.

### 3.2 Author IDE

Open:

```txt
/author/ide
```

Expected:

- existing IDE shell still loads;
- author can paste/create novel and chapter;
- save draft and submit actions still call backend;
- AI panel remains disabled/placeholder.

### 3.3 Reader Web

Open:

```txt
/reader
```

Expected:

- search returns published novels;
- selecting a novel shows summary and chapters;
- selecting a non-VIP chapter shows content;
- library/history actions update backend state;
- like/follow/report actions call interaction APIs.

### 3.4 Mock Wallet

Open:

```txt
/wallet
```

Expected:

- wallet balance loads;
- mock deposit increases balance;
- VIP unlock requires a published VIP chapter ID;
- donation requires an author user ID;
- withdraw request creates a pending request;
- transaction list reflects wallet mutations.

### 3.5 Notifications

Open:

```txt
/notifications
```

Expected:

- notification list loads even when empty;
- device-token registration returns success;
- mark-read works if at least one notification exists.

### 3.6 Admin Console

Open as `ADMIN`:

```txt
/admin
```

Expected:

- dashboard stats load;
- users can be searched, locked, and unlocked;
- taxonomy genres/tags can be created;
- moderation reviews can be approved/rejected if pending reviews exist;
- pending withdraw requests can be approved/rejected.

## 4. Phase 8 Done Criteria

- [ ] User confirms Reader web flow works.
- [ ] User confirms Mock Wallet web flow works.
- [ ] User confirms Notifications web flow works.
- [ ] User confirms Admin web flow works.
- [ ] User confirms Author IDE still works after routing changes.
