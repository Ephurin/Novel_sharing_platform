# Frontend Routes and Guards

This document defines planned frontend routes and access rules for the Ephurin web and mobile clients.

## 1. Principles

- Web is primary for Author and Admin workflows.
- Mobile is primary for Reader workflows.
- Web can provide Reader fallback screens for demo and testing.
- AI/Copilot routes may be visible as disabled entry points before Phase 10.
- Protected screens must restore session through `GET /auth/me` after refresh.

## 2. Web Route Map

| Route | Screen | Roles | Phase | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | Login/Register | Guest | 8.1 | Redirect authenticated users to role home. |
| `/` | Role Redirect | Authenticated | 8.1/8.2 | Admin -> `/admin`, Author -> `/author`, Reader -> `/reader`. |
| `/author` | Author Project Manager | `AUTHOR`, `ADMIN` | 8.2 | Project-style dashboard for novels the author is writing or has written. |
| `/author/ide` | Author Writing IDE | `AUTHOR`, `ADMIN` | 8.2 | Main desktop writing workspace. |
| `/author/novels` | My Writing Projects | `AUTHOR`, `ADMIN` | 8.2 | List/create/manage author novels as writing projects. |
| `/author/novels/:novelId` | Novel Metadata Editor | `AUTHOR`, `ADMIN` | 8.2 | Edit title, synopsis, cover, genre, tags, status. |
| `/author/novels/:novelId/chapters/:chapterId` | Chapter Editor Deep Link | `AUTHOR`, `ADMIN` | 8.2 | Opens Author IDE with selected chapter. |
| `/author/context/:novelId` | Story Context Manager | `AUTHOR`, `ADMIN` | 9.5 | Entities/timeline/summaries UI; Phase 8.x may show placeholder, Phase 9.5 adds persistence. |
| `/reader` | Reader Home/Search | `READER`, `AUTHOR`, `ADMIN` | 8.3 | Web fallback for reader browse. |
| `/reader/novels/:novelId` | Reader Novel Detail | `READER`, `AUTHOR`, `ADMIN`, Guest optional | 8.3 | Public data; actions require auth. |
| `/reader/chapters/:chapterId` | Reader Chapter Screen | `READER`, `AUTHOR`, `ADMIN`, Guest optional | 8.3 | VIP content may require unlock/auth. |
| `/reader/library` | Library | `READER`, `AUTHOR`, `ADMIN` | 8.3 | Current user's saved novels. |
| `/reader/history` | Reading History | `READER`, `AUTHOR`, `ADMIN` | 8.3 | Current user's reading progress. |
| `/wallet` | Mock Wallet | `READER`, `AUTHOR`, `ADMIN` | 8.4 | Deposit mock, transactions, unlock, donate, withdraw. |
| `/notifications` | Notifications | Authenticated | 8.4 | Notification inbox and read state. |
| `/profile/me` | My Profile/Settings | Authenticated | 8.4 | Profile, reading preferences, account display settings. |
| `/authors/:authorId` | Public Author Profile | Public | 8.4 | Published novel list and follower count. |
| `/admin` | Admin Dashboard | `ADMIN` | 8.4 | Stats and operational overview. |
| `/admin/novels` | Admin Novel Management | `ADMIN` | 9.6 | List platform novels, inspect detail, and soft-delete/restore a novel aggregate after confirmation. |
| `/admin/novels/:novelId` | Admin Novel Detail | `ADMIN` | 9.6 | Show owner/chapter detail and removal/restore confirmation. |
| `/admin/moderation` | Moderation Queue | `ADMIN` | 8.4 | Pending reviews and filters. |
| `/admin/moderation/:reviewId` | Moderation Detail | `ADMIN` | 8.4 | Evidence, target metadata, resolve action. |
| `/admin/users` | User Management | `ADMIN` | 8.4 | Search, lock, unlock. |
| `/admin/taxonomy` | Genre/Tag Management | `ADMIN` | 8.4 | Add/list genres and tags. |
| `/admin/withdraws` | Withdraw Review | `ADMIN` | 8.4 | Approve/reject mock withdraw requests. |

## 3. Mobile Route Map

| Route | Screen | Auth | Phase | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Splash` | Splash/Bootstrap | Public | 9 | Check token and load app config. |
| `Login` | Login/Register | Guest | 9 | Same backend auth APIs. |
| `Home` | Home Feed | Public/Auth | 9 | Featured/search/history entry. |
| `Search` | Search/Filter | Public/Auth | 9 | Public novel discovery. |
| `NovelDetail` | Novel Detail | Public/Auth | 9 | Actions require auth. |
| `Reader` | Reader Screen | Public/Auth | 9 | VIP/auth checks. |
| `Comments` | Chapter Comments | Auth for write | 9 | Read may be public depending policy. |
| `Library` | Library/Bookmarks | Auth | 9 | Current user only. |
| `Wallet` | Mock Wallet | Auth | 9 | Reader-oriented unlock/deposit. |
| `Notifications` | Notifications | Auth | 9 | Inbox. |
| `Profile` | Profile/Settings | Auth | 9 | Account and reading preferences. |

## 4. Guard Rules

| Condition | Behavior |
| :--- | :--- |
| No token on protected route | Redirect to `/login`. |
| Token exists but `GET /auth/me` fails | Clear token, redirect to `/login`. |
| User role lacks permission | Show `403` permission page with role requirement. |
| User status is `LOCKED` | Show locked-account message and logout action. |
| Guest opens public route | Allow read-only view. |
| Guest attempts protected action | Redirect to `/login` with return path. |
| AI route before Phase 10 | Show disabled placeholder, no API call. |

## 5. Role Home Rules

| Role | Default Route |
| :--- | :--- |
| `ADMIN` | `/admin` |
| `AUTHOR` | `/author` |
| `READER` | `/reader` |

Authors are still readers. The authenticated web navigation should let `AUTHOR` users move between `/reader` and `/author` without changing accounts.

## 6. Review Checklist

- [ ] Refreshing protected routes restores session correctly.
- [ ] Role-ineligible screens show a clear permission message.
- [ ] Navigation hides or disables role-ineligible actions.
- [ ] Public reader routes do not require login until the user performs a protected action.
- [ ] AI/Copilot entry points do not call backend before Phase 10.
