# Web Screen Details

This document expands the web screens into implementation-ready UI details.

## 1. Login/Register

| Item | Details |
| :--- | :--- |
| Route | `/login` |
| Roles | Guest |
| APIs | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` after login/refresh |
| Primary Goal | Start a valid session. |

UI:

- email/username input;
- password input;
- login/register mode switch;
- submit button with loading state;
- API error alert;
- redirect after success by role.

States:

- loading: disable submit and show button loading;
- error: show backend error message;
- success: persist access token, fetch/keep user, redirect.

## 2. Author Project Manager

| Item | Details |
| :--- | :--- |
| Route | `/author` |
| Roles | `AUTHOR`, `ADMIN` |
| APIs | `GET /novels/me?q=&status=DRAFT|PENDING_MODERATION|PUBLISHED|REJECTED` |
| Primary Goal | Manage novel projects like a programmer manages code projects before opening one in the IDE. |

UI:

- project grid/list for novels the author is writing or has written;
- filters: all, draft, pending moderation, published, rejected;
- project cards: title, synopsis snippet, status, chapter count, updated time;
- quick actions: create project, open in IDE, edit metadata, continue last chapter;
- project health summary: draft chapters, pending moderation, published chapters;
- switch action: go to Reader Home without logout.
- AI/Copilot actions remain disabled until Phase 10.

States:

- empty: prompt author to create first novel;
- error: show API error and retry button.

## 3. Author IDE

| Item | Details |
| :--- | :--- |
| Route | `/author/ide` |
| Roles | `AUTHOR`, `ADMIN` |
| APIs | `GET /novels/{novelId}`, `PATCH /novels/{novelId}`, `GET /novels/{novelId}/chapters`, `POST /novels/{novelId}/chapters`, `GET /chapters/{chapterId}`, `PATCH /chapters/{chapterId}`, `POST /chapters/{chapterId}/submit-publish`, `POST /novels/{novelId}/submit-publish` |
| Primary Goal | Write and manage chapters without leaving the workspace. |

Required layout:

- top toolbar;
- left activity bar;
- dynamic sidebar;
- center editor;
- right context/assistant panel;
- bottom status bar.

Story activity:

- project selector;
- create novel;
- edit novel metadata;
- chapter tree;
- create chapter;
- select chapter;
- status badges.

Editor:

- chapter title input;
- content editor;
- word count;
- save draft;
- submit chapter;
- moderation status feedback.

Right panel:

- current context chips;
- AI actions disabled until Phase 10;
- consistency placeholder disabled until Phase 10.

States:

- no novel selected: show create/select prompt;
- no chapter selected: show chapter creation prompt;
- saving: show status bar update;
- publish pending: show moderation status;
- validation error: show actionable message.

## 4. Reader Home/Search

| Item | Details |
| :--- | :--- |
| Route | `/reader` |
| Roles | Public read, authenticated actions |
| APIs | `GET /reading/search`, `GET /reading/history/me`, `GET /reading/library/me` |
| Primary Goal | Discover published novels and continue reading. |

UI:

- search input;
- filters: genre, tag, serial status, sort;
- continue reading section for authenticated user;
- results grid/list;
- empty state with clear filters.

Actions:

- open novel detail;
- continue latest chapter;
- add to library if authenticated.

## 5. Reader Novel Detail

| Item | Details |
| :--- | :--- |
| Route | `/reader/novels/:novelId` |
| Roles | Public read, authenticated actions |
| APIs | `GET /reading/novels/{novelId}`, `POST /reading/library/me`, `POST /novels/{novelId}/likes`, `POST /authors/{authorId}/follow`, `POST /reports` |
| Primary Goal | Decide whether to read, follow, like, or save a novel. |

UI:

- cover/placeholder;
- title, author, genre/tags;
- synopsis;
- stats: views, likes, chapters;
- chapter list with VIP labels;
- action bar: read first/continue, add library, like, follow, report.

States:

- no chapters: show "No published chapters yet";
- guest action: redirect to login;
- VIP chapter: show lock/price.

## 6. Reader Chapter Screen

| Item | Details |
| :--- | :--- |
| Route | `/reader/chapters/:chapterId` |
| Roles | Public/Auth depending chapter access |
| APIs | `GET /reading/chapters/{chapterId}`, `PUT /reading/history/me`, `GET /chapters/{chapterId}/comments`, `POST /chapters/{chapterId}/comments`, `POST /chapters/{chapterId}/unlock`, `POST /reports` |
| Primary Goal | Read chapter content comfortably. |

UI:

- top chapter bar;
- prose reading surface;
- reading settings drawer;
- comments drawer;
- report action;
- VIP locked panel when blocked.

States:

- locked VIP: show price and unlock CTA;
- insufficient balance: link to wallet mock deposit;
- content loading: skeleton/placeholder;
- comment pending moderation: visible to author of comment with pending label.

## 7. Library and History

| Item | Details |
| :--- | :--- |
| Routes | `/reader/library`, `/reader/history` |
| Roles | Authenticated |
| APIs | `GET /reading/library/me`, `DELETE /reading/library/me/{novelId}`, `GET /reading/history/me`, `GET /reading/history/me/{novelId}` |
| Primary Goal | Resume or manage saved reading. |

UI:

- list of novels;
- latest chapter/progress when available;
- remove from library action;
- continue reading action.

## 8. Mock Wallet

| Item | Details |
| :--- | :--- |
| Route | `/wallet` |
| Roles | Authenticated |
| APIs | `GET /wallet/me`, `GET /wallet/transactions`, `POST /wallet/deposit-sessions`, `POST /wallet/mock-webhook/deposit-success`, `POST /chapters/{chapterId}/unlock`, `POST /authors/{authorId}/donations`, `POST /wallet/withdraw-requests` |
| Primary Goal | Demonstrate coin flow without real payment provider. |

UI:

- balance card;
- mock deposit packages;
- VIP unlock form/CTA;
- donate author form;
- withdraw form for authors;
- transaction table.

Rules:

- label all payment actions as mock/demo;
- do not collect real card or bank secrets;
- withdraw uses a display label only.

## 9. Notifications

| Item | Details |
| :--- | :--- |
| Route | `/notifications` |
| Roles | Authenticated |
| APIs | `GET /notifications`, `PATCH /notifications/{notificationId}/read`, `POST /notifications/device-token` |
| Primary Goal | Show user notification inbox. |

UI:

- unread/read/all filter;
- notification cards with type/status;
- mark-read action;
- empty state;
- device-token registration section as dev/MVP tool.

## 10. Profile

| Item | Details |
| :--- | :--- |
| Routes | `/profile/me`, `/authors/:authorId` |
| Roles | `/profile/me` authenticated, author profile public |
| APIs | `GET /users/me/profile`, `PATCH /users/me/profile`, `GET /authors/{authorId}/profile` |
| Primary Goal | Manage current profile and view public author profile. |

UI:

- my profile form;
- avatar URL field;
- bio/display name;
- reading preferences if available;
- public author header;
- published novel list;
- follower count.

## 11. Admin Console

| Item | Details |
| :--- | :--- |
| Routes | `/admin`, `/admin/moderation`, `/admin/users`, `/admin/taxonomy`, `/admin/withdraws` |
| Roles | `ADMIN` |
| APIs | `GET /admin/dashboard/stats`, `GET /admin/moderation/reviews`, `GET /admin/moderation/reviews/{reviewId}`, `POST /admin/moderation/reviews/{reviewId}/resolve`, `GET /admin/users`, `PATCH /admin/users/{userId}/lock`, `PATCH /admin/users/{userId}/unlock`, `GET /admin/taxonomy`, `POST /admin/taxonomy/genres`, `POST /admin/taxonomy/tags`, `GET /admin/withdraw-requests`, `POST /admin/withdraw-requests/{withdrawRequestId}/approve`, `POST /admin/withdraw-requests/{withdrawRequestId}/reject` |
| Primary Goal | Operate moderation, users, taxonomy, and mock withdraw review. |

UI:

- dashboard stat cards;
- moderation queue table;
- moderation detail/evidence panel;
- resolve decision actions;
- user search and lock/unlock;
- taxonomy forms/lists;
- withdraw request queue;
- approve/reject confirmation.

Safety:

- confirmation required for lock, reject, and withdraw decisions;
- display target IDs and reason fields clearly;
- never hide failed admin mutations.
