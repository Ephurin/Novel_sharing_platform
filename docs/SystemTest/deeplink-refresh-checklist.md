# Deep Link and Refresh Checklist

Use this checklist to verify that direct URLs and browser refreshes keep enough state to work without hidden in-memory navigation context.

## 1. General Rules

- Test each route by pasting the URL directly into the browser address bar.
- Test each route again by pressing browser refresh.
- Test while logged in with the correct role.
- Test wrong-role access for protected routes.
- Record whether the page:
  - restores data correctly;
  - redirects correctly;
  - shows permission state correctly;
  - loses required context.

## 2. Public Routes

| ID | Route | Preconditions | Expected |
| :--- | :--- | :--- | :--- |
| LINK-PUBLIC-001 | `/public` | Logged out | Public library loads. |
| LINK-PUBLIC-002 | `/public/novels/:novelId` | Published novel exists | Novel detail loads. |
| LINK-PUBLIC-003 | `/public/chapters/:chapterId` | Published free chapter exists | Chapter content loads. |
| LINK-PUBLIC-004 | `/public/chapters/:vipChapterId` | Published VIP chapter exists | Locked/login prompt appears. |

## 3. Reader Routes

Login as `reader04`.

| ID | Route | Preconditions | Expected |
| :--- | :--- | :--- | :--- |
| LINK-READER-001 | `/reader` | Reader logged in | Reader home loads. |
| LINK-READER-002 | `/reader/novels/:novelId` | Published novel exists | Novel detail and continue state load. |
| LINK-READER-003 | `/reader/chapters/:chapterId` | Free chapter exists | Chapter loads; history syncs. |
| LINK-READER-004 | `/reader/chapters/:vipChapterId` | VIP chapter not unlocked | Locked state loads. |
| LINK-READER-005 | `/reader/chapters/:vipChapterId` | VIP chapter unlocked | Chapter content loads. |
| LINK-READER-006 | `/reader/library` | Reader logged in | Library loads or empty state. |
| LINK-READER-007 | `/reader/history` | Reader logged in | History loads or empty state. |

## 4. Author Routes

Login as `reader03`.

| ID | Route | Preconditions | Expected |
| :--- | :--- | :--- | :--- |
| LINK-AUTHOR-001 | `/author` | Author logged in | Project Manager loads. |
| LINK-AUTHOR-002 | `/author/novels/:novelId` | Author owns novel | Metadata editor loads. |
| LINK-AUTHOR-003 | `/author/novels/:novelId/chapters/:chapterId` | Author owns chapter | Redirects to `/author/ide?novelId=...&chapterId=...`. |
| LINK-AUTHOR-004 | `/author/ide?novelId=:novelId` | Author owns novel | IDE loads story tree for novel. |
| LINK-AUTHOR-005 | `/author/ide?novelId=:novelId&chapterId=:chapterId` | Author owns chapter | IDE loads selected chapter title/content. |
| LINK-AUTHOR-006 | Refresh old IDE tab after opening another project in another tab. | Both tabs have URL params | Each tab reloads its own project/chapter from URL params. |

## 5. Admin Routes

Login as `reader02`.

| ID | Route | Preconditions | Expected |
| :--- | :--- | :--- | :--- |
| LINK-ADMIN-001 | `/admin` | Admin logged in | Dashboard/users default tab loads. |
| LINK-ADMIN-002 | `/admin/users` | Admin logged in | Admin console users tab loads. |
| LINK-ADMIN-003 | `/admin/taxonomy` | Admin logged in | Admin console taxonomy tab loads. |
| LINK-ADMIN-004 | `/admin/moderation` | Admin logged in | Moderation queue loads. |
| LINK-ADMIN-005 | `/admin/moderation/:reviewId` | Review exists | Detail evidence page loads. |
| LINK-ADMIN-006 | `/admin/reports` | Admin logged in | USER_REPORT-filtered queue loads. |
| LINK-ADMIN-007 | `/admin/withdraws` | Admin logged in | Withdraw tab loads. |

## 6. Utility Routes

Login as any valid role unless route needs specific data.

| ID | Route | Expected |
| :--- | :--- | :--- |
| LINK-UTIL-001 | `/wallet` | Wallet page loads. |
| LINK-UTIL-002 | `/notifications` | Notifications page loads. |
| LINK-UTIL-003 | `/profile/me` | Current profile loads. |
| LINK-UTIL-004 | `/authors/:authorId` | Public author profile loads. |

## 7. Wrong Role Refresh

| ID | Scenario | Expected |
| :--- | :--- | :--- |
| LINK-PERM-001 | Reader directly opens `/admin/moderation`. | Permission state, no admin API data rendered. |
| LINK-PERM-002 | Author directly opens `/admin/users`. | Permission state, no admin API data rendered. |
| LINK-PERM-003 | Reader directly opens `/author/ide`. | Permission state or redirect, no author data rendered. |
| LINK-PERM-004 | Logged-out user opens protected deep link. | Redirects to `/login`. |

## 8. Evidence

For failures, capture:

- exact URL;
- role/account;
- browser refresh/direct-paste distinction;
- console error;
- failed network request if any;
- screenshot.
