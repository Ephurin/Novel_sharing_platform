# Mobile Screen Details

This document defines Phase 9 mobile reader screen details.

Mobile is the primary Reader client, but it should reuse backend contracts validated by web Phase 8.x.

## 1. Splash / Bootstrap

| Item | Details |
| :--- | :--- |
| Screen | Splash |
| APIs | `GET /auth/me` when token exists |
| Goal | Decide whether to enter app as guest or authenticated user. |

Behavior:

- check local token;
- if valid, load user and go to Home;
- if invalid, clear token and continue as guest or show Login depending entry action.

## 2. Login/Register

| Item | Details |
| :--- | :--- |
| Screen | Auth |
| APIs | `POST /auth/login`, `POST /auth/register` |
| Goal | Create/restore user session. |

UI:

- email/username;
- password;
- mode switch;
- submit loading;
- error alert.

## 3. Home Feed

| Item | Details |
| :--- | :--- |
| Screen | Home |
| APIs | `GET /reading/search`, `GET /reading/history/me` |
| Goal | Start reading quickly. |

UI:

- search bar;
- genre chips;
- continue reading card;
- trending/recent novels;
- bottom navigation.

States:

- guest: hide continue reading;
- no results: show discovery empty state.

## 4. Search / Filter

| Item | Details |
| :--- | :--- |
| Screen | Search |
| APIs | `GET /reading/search` |
| Goal | Find public novels. |

UI:

- query input;
- genre/tag/status filters;
- sort selector;
- paginated/infinite results;
- result cards with title, author, stats.

## 5. Novel Detail

| Item | Details |
| :--- | :--- |
| Screen | Novel Detail |
| APIs | `GET /reading/novels/{novelId}`, `POST /reading/library/me`, `POST /novels/{novelId}/likes`, `POST /authors/{authorId}/follow` |
| Goal | Inspect and start reading. |

UI:

- cover;
- title/author;
- synopsis;
- stats;
- action row: read, library, like, follow;
- chapter list with VIP labels.

## 6. Reader Screen

| Item | Details |
| :--- | :--- |
| Screen | Reader |
| APIs | `GET /reading/chapters/{chapterId}`, `PUT /reading/history/me`, `POST /reports` |
| Goal | Read with minimal distraction. |

UI:

- top chapter bar;
- prose content;
- bottom toolbar;
- settings drawer;
- report action;
- comments entry.

Reading settings:

- font size;
- background: light/dark/sepia;
- line height;
- save preferences through `PUT /reading/preferences/me`.

## 7. Comments

| Item | Details |
| :--- | :--- |
| Screen | Chapter Comments |
| APIs | `GET /chapters/{chapterId}/comments`, `POST /chapters/{chapterId}/comments`, `PATCH /comments/{commentId}`, `DELETE /comments/{commentId}` |
| Goal | Discuss chapter/paragraph content. |

UI:

- comment list;
- pending moderation badge;
- create input;
- edit/delete own comments;
- paragraph offset indicator when available.

## 8. Library

| Item | Details |
| :--- | :--- |
| Screen | Library |
| APIs | `GET /reading/library/me`, `DELETE /reading/library/me/{novelId}` |
| Goal | Manage saved novels. |

UI:

- saved novel list;
- continue/read action;
- remove action;
- empty state.

## 9. Wallet Mock

| Item | Details |
| :--- | :--- |
| Screen | Wallet |
| APIs | `GET /wallet/me`, `GET /wallet/transactions`, `POST /wallet/deposit-sessions`, `POST /wallet/mock-webhook/deposit-success`, `POST /chapters/{chapterId}/unlock` |
| Goal | Demonstrate coin deposit and VIP unlock. |

UI:

- balance;
- package list;
- mock deposit action;
- transactions;
- unlock confirmation from VIP chapter.

Rules:

- clearly show "Mock payment";
- no real payment credential fields.

## 10. Notifications

| Item | Details |
| :--- | :--- |
| Screen | Notifications |
| APIs | `GET /notifications`, `PATCH /notifications/{notificationId}/read`, `POST /notifications/device-token` |
| Goal | Show inbox and read state. |

UI:

- notification cards;
- unread filter;
- mark read;
- empty state.

## 11. Profile / Settings

| Item | Details |
| :--- | :--- |
| Screen | Profile |
| APIs | `GET /users/me/profile`, `PATCH /users/me/profile`, `GET /reading/preferences/me`, `PUT /reading/preferences/me`, `POST /auth/logout` |
| Goal | Manage account display and reading settings. |

UI:

- display name;
- avatar URL;
- bio;
- reading preferences;
- logout.

## 12. Mobile Review Checklist

- [ ] Reader can browse without login.
- [ ] Protected actions redirect to login.
- [ ] Reader can read free chapter.
- [ ] VIP chapter shows unlock path.
- [ ] Comments show pending moderation state correctly.
- [ ] Wallet is clearly mock/demo.
- [ ] Reading settings are comfortable on small screens.
