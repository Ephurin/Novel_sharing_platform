# Web E2E System Test Checklist

Use this checklist after backend and web are running locally.

Recommended browser URL:

- `http://localhost:5173`

Recommended API URL:

- `http://localhost:4000/api/v1`

## 1. Global Smoke

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-SMOKE-001 | Open `/login`. | Login/register card renders. |
| WEB-SMOKE-002 | Open `/public` while logged out. | Public library renders without redirect to login. |
| WEB-SMOKE-003 | Open `/reader` while logged out. | Redirects to `/login`. |
| WEB-SMOKE-004 | Open `/admin` while logged out. | Redirects to `/login`. |
| WEB-SMOKE-005 | Refresh any protected route after login. | Session restores if token is valid. |

## 2. Public/Guest Flow

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-PUBLIC-001 | Logout, open `/public`. | Guest public library page appears. |
| WEB-PUBLIC-002 | Search by known sample title or keyword. | Published novel cards update. |
| WEB-PUBLIC-003 | Open a novel detail from public card. | `/public/novels/:novelId` shows synopsis, author, tags/stats, chapter list. |
| WEB-PUBLIC-004 | Open a free chapter. | `/public/chapters/:chapterId` shows chapter content. |
| WEB-PUBLIC-005 | Open a VIP chapter as guest. | Shows locked state and login-to-unlock prompt. |
| WEB-PUBLIC-006 | Attempt protected action from public view. | UI points to `/login`; no protected API call should be required. |
| WEB-PUBLIC-007 | From `/login`, click guest browse button. | Navigates to `/public`. |

## 3. Reader Flow

Login:

- username/email: `reader04`
- password: `StrongPassword123!`

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-READER-001 | Login as Reader. | Redirects to `/reader`; sidebar shows Reader routes only, no Author/Admin data routes. |
| WEB-READER-002 | Search/filter Reader Home by q/genre/tag/status/sort. | Results update and remain published-only. |
| WEB-READER-003 | Open novel detail. | Shows synopsis, author, stats, chapter list, library/like/follow/report actions. |
| WEB-READER-004 | Click `Add library`. | Shows success or friendly already-saved notice. |
| WEB-READER-005 | Click `Like`, then click again if possible. | Shows success or friendly already-liked notice; no raw stack/error. |
| WEB-READER-006 | Click `Follow`, then `Unfollow`. | Shows success/friendly conflict handling. |
| WEB-READER-007 | Open free chapter. | Chapter content loads; previous/next controls render correctly. |
| WEB-READER-008 | Change reading preferences. | Font size/family/background/line-height visibly update and persist after refresh. |
| WEB-READER-009 | Open chapter and navigate away. | Reading history auto-syncs without manual `Sync history`. |
| WEB-READER-010 | Open `/reader/history`. | Latest read novel/chapter appears with Continue button. |
| WEB-READER-011 | Open `/reader/library`. | Saved novel appears; remove action works. |
| WEB-READER-012 | Create clean comment. | Comment appears if approved by content filter. |
| WEB-READER-013 | Edit own comment. | Comment update succeeds or returns expected moderation pending state. |
| WEB-READER-014 | Delete own comment. | Comment disappears from list. |
| WEB-READER-015 | Report chapter/novel. | Shows no crash; backend creates report/moderation review. |

## 4. Wallet/VIP Flow

Login as `reader04`.

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-WALLET-001 | Open `/wallet`. | Shows balance, mock deposit, unlock, donate, withdraw, transaction list. |
| WEB-WALLET-002 | Create mock deposit. | Mock deposit session is created; UI labels it as mock/demo. |
| WEB-WALLET-003 | Complete mock deposit. | Balance increases; deposit transaction appears. |
| WEB-WALLET-004 | Try reading locked VIP chapter before unlock. | Reader chapter page shows `PAYMENT_002`/locked state. |
| WEB-WALLET-005 | Unlock VIP chapter from reader locked state or wallet action. | Unlock succeeds if balance is sufficient. |
| WEB-WALLET-006 | Open VIP chapter after unlock. | Chapter content is visible. |
| WEB-WALLET-007 | Donate to author with valid author ID. | Donation transaction appears. |
| WEB-WALLET-008 | Request withdraw as Author/Admin with sufficient balance. | Pending withdraw appears for Admin review. |

## 5. Author Flow

Login:

- username/email: `reader03`
- password: `StrongPassword123!`

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-AUTHOR-001 | Login as Author. | Redirects to `/author`, not directly to IDE. |
| WEB-AUTHOR-002 | Confirm sidebar includes Reader Home. | Author can switch to reader UI with same account. |
| WEB-AUTHOR-003 | Create a new novel from Project Manager. | New project card appears. |
| WEB-AUTHOR-004 | Open `Metadata`. | `/author/novels/:novelId` loads title/synopsis/cover editor and project health. |
| WEB-AUTHOR-005 | Edit metadata and save. | Metadata persists after refresh. |
| WEB-AUTHOR-006 | Open IDE from project card. | Opens `/author/ide?novelId=...` in a new tab/window. |
| WEB-AUTHOR-007 | Create a chapter in IDE. | Chapter appears in story tree. |
| WEB-AUTHOR-008 | Edit chapter title/content and save draft. | Save succeeds and content persists after refresh. |
| WEB-AUTHOR-009 | Use chapter deep link `/author/novels/:novelId/chapters/:chapterId`. | Redirects to IDE with stable URL params. |
| WEB-AUTHOR-010 | Submit chapter/novel for publish. | Status feedback updates; moderation/publish state is visible. |
| WEB-AUTHOR-011 | Click Entities/Timeline/Graph/Tasks/Settings activities. | Context placeholders explain deferred backend/AI persistence. |
| WEB-AUTHOR-012 | Click AI suggestion/consistency buttons. | Buttons are disabled; no AI backend call happens. |

## 6. Profile and Notification Flow

Login as any role.

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-UTILITY-001 | Open `/profile/me`. | Current profile loads. |
| WEB-UTILITY-002 | Update profile display fields. | Save succeeds and survives refresh. |
| WEB-UTILITY-003 | Open public author profile from a novel detail. | Author profile and published novels render. |
| WEB-UTILITY-004 | Open `/notifications`. | Notification list loads or empty state appears. |
| WEB-UTILITY-005 | Mark unread notification as read. | Status changes and button disables. |

## 7. Admin Flow

Login:

- username/email: `reader02`
- password: `StrongPassword123!`

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-ADMIN-001 | Login as Admin. | Redirects to `/admin`; Admin sidebar routes are visible. |
| WEB-ADMIN-002 | Open `/admin/users`. | User list loads; lock/unlock actions require confirmation. |
| WEB-ADMIN-003 | Open `/admin/taxonomy`. | Genres/tags load; create genre/tag works or shows validation/duplicate error. |
| WEB-ADMIN-004 | Open `/admin/moderation`. | Moderation queue loads with filters. |
| WEB-ADMIN-005 | Open moderation detail. | Target metadata, target ID, source/status, evidence summary/report count render. |
| WEB-ADMIN-006 | Resolve pending moderation review. | Confirmation appears; status updates after action. |
| WEB-ADMIN-007 | Open `/admin/reports`. | Shows moderation reviews filtered by `USER_REPORT`. |
| WEB-ADMIN-008 | Open `/admin/withdraws`. | Pending withdraw requests load; approve/reject requires confirmation. |
| WEB-ADMIN-009 | Open `/admin` dashboard. | Stats cards load and do not crash when counts are zero. |

## 8. Role and Permission Flow

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-PERM-001 | Login as Reader and open `/admin`. | Permission state appears; no admin data renders. |
| WEB-PERM-002 | Login as Reader and open `/author`. | Permission state appears; no author project data renders. |
| WEB-PERM-003 | Login as Author and open `/admin`. | Permission state appears; no admin data renders. |
| WEB-PERM-004 | Login as Admin and open Reader routes. | Reader routes are allowed. |
| WEB-PERM-005 | Logout from any protected route. | Local session clears and protected routes redirect to `/login`. |

## 9. Responsive and UI State Checks

| ID | Steps | Expected |
| :--- | :--- | :--- |
| WEB-UI-001 | Resize browser to narrow desktop/tablet width. | Sidebar/content stacks without horizontal clipping. |
| WEB-UI-002 | Temporarily stop backend, refresh a data page. | Error state renders with retry option. |
| WEB-UI-003 | Use filters that return no result. | Empty state renders clearly. |
| WEB-UI-004 | Load a slow page. | Loading state renders before data. |
| WEB-UI-005 | Trigger unauthorized route. | Permission state explains required role. |

## 10. Evidence to Capture

For each failed test, capture:

- screenshot;
- route URL;
- logged-in role;
- browser console error;
- Network request method/URL/status/body if relevant;
- expected vs actual result;
- whether the failure blocks demo.
