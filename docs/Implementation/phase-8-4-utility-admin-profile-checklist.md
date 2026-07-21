# Phase 8.4 - Utility, Profile, and Admin UI Checklist

Goal: make wallet, notifications, profile/settings, public author profile, and admin operations usable from the web UI without Postman for normal demo flows.

## 1. Wallet

- [x] Show current mock coin balance from `GET /wallet/me`.
- [x] Create and auto-complete mock deposit through wallet APIs.
- [x] Unlock VIP chapter by chapter ID.
- [x] Donate mock coins to an author by author user ID.
- [x] Create author withdraw request with demo bank label.
- [x] Show wallet transaction history with loading, empty, and error states.

## 2. Notifications

- [x] List notifications from `GET /notifications`.
- [x] Filter by `ALL`, `UNREAD`, and `READ`.
- [x] Mark notification as read.
- [x] Register mock web push token as an MVP/dev tool.
- [x] Show loading, empty, and error states.

## 3. My Profile and Settings

- [x] Add `/profile/me` route.
- [x] Load private profile from `GET /users/me/profile`.
- [x] Update display name, avatar URL, and bio through `PATCH /users/me/profile`.
- [x] Load account settings from `GET /users/me/settings`.
- [x] Update language and notification preference through `PATCH /users/me/settings`.
- [x] Link Author/Admin users to their public author profile.

## 4. Public Author Profile

- [x] Add `/authors/:authorId` route.
- [x] Load author profile from `GET /authors/{authorId}/profile`.
- [x] Show bio, follower count, and published novel list.
- [x] Link published novels to reader detail pages.

## 5. Admin

- [x] Keep `/admin` guarded for `ADMIN` only.
- [x] Show dashboard stats.
- [x] Search users and lock/unlock with confirmation.
- [x] Manage genre/tag taxonomy.
- [x] Review moderation queue and resolve decisions with confirmation.
- [x] Review pending withdraw requests and approve/reject with confirmation.

## 6. Review Guide

1. Login as `reader04`.
2. Open `/profile/me`, edit display name/bio/settings, save, and refresh.
3. Open `/wallet`, create mock deposit, and confirm balance/transactions update.
4. Open `/notifications`, change filters, register a mock token, and mark a notification read if one exists.
5. Login as `reader03` or an `AUTHOR`, open `/profile/me`, then open public author profile.
6. Confirm public author profile lists published sample novels if the selected author has published novels.
7. Login as `reader02` or an `ADMIN`, open `/admin`, and review users/taxonomy/moderation/withdraw tabs.
8. Login as non-admin and manually visit `/admin`; confirm permission screen and no admin data render.

## 7. Known Limitations

- Wallet remains mock/demo only and must not collect real payment credentials.
- Public author profile is implemented inside the authenticated web shell for now; true guest web browsing can be opened later if needed.
- Admin moderation detail is still list-card based, not a dedicated detail route.
- Like/follow current-state hydration remains a later UI polish item.
