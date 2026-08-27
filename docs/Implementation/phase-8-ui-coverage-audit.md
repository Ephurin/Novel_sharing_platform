# Phase 8 UI Coverage Audit

This audit compares current web UI coverage against `docs/Frontend/sitemap.md`, `docs/Frontend/api-screen-matrix.md`, and database documents.

## 1. Covered Enough for Current Phase

| Area | Covered UI | Notes |
| :--- | :--- | :--- |
| Auth/session | Login/register, role redirect, route guard | OAuth callback remains placeholder. |
| Author project hub | `/author` project manager | `GET /novels/me` is used. |
| Author IDE shell | `/author/ide` | Core draft save/create/submit exists, but metadata/context still shallow. |
| Reader browse/detail/read | `/reader`, `/reader/novels/:novelId`, `/reader/chapters/:chapterId` | Free/VIP read path exists. |
| Library/history | `/reader/library`, `/reader/history` | History works; auto-sync is not done yet. |
| Comments | create/list/delete | Update comment UI is missing. |
| Wallet mock | `/wallet` | Mock deposit/unlock/donate/withdraw/transactions exist. |
| Notifications | `/notifications` | List/filter/mark read/register token exist. |
| Profile | `/profile/me`, `/authors/:authorId` | Public author profile exists inside authenticated shell. |
| Admin basics | `/admin` | Dashboard/users/taxonomy/moderation list/withdraw list exist. |

## 2. Sitemap Gaps

| Sitemap Item | Current Status | Planned Phase |
| :--- | :--- | :--- |
| Public Landing | Missing | 8.8 |
| Public Novel Detail View | Auth shell reader detail exists, true guest/public route missing | 8.8 |
| OAuth Callback | Missing/placeholder | Later only if OAuth is implemented |
| Novel Metadata Editor | Missing | 8.5 |
| Chapter Editor Deep Link | Partial through `/author/ide?novelId=&chapterId=` | 8.5 |
| Character / Timeline / Plot Summary | Placeholder only | 8.5 UI placeholders, backend later |
| Author Stats | Missing | 8.5 or 8.7 depending API availability |
| Admin Reports | Missing | 8.7 |
| Admin Moderation Detail | Missing; list-card only | 8.7 |

## 3. API Gaps

| API | Current UI Usage | Gap | Planned Phase |
| :--- | :--- | :--- | :--- |
| `GET /reading/preferences/me` | Not used | Reading settings are not shown/applied | 8.6 |
| `PUT /reading/preferences/me` | Not used | Reader cannot save reading display preferences | 8.6 |
| `GET /reading/history/me/{novelId}` | Not used | Novel detail cannot show exact continue-reading state | 8.6 |
| `PATCH /comments/{commentId}` | Not used | Comment edit is missing | 8.6 |
| `GET /authors/{authorId}/followers/count` | Indirect via author profile | Standalone count not needed unless UI requires live count | Optional |
| `GET /admin/moderation/reviews/{reviewId}` | Not used | No moderation detail page | 8.7 |
| `POST /content-control/check` | Not used by normal UI | Could be admin/dev tool only; publish/comment workflows already invoke moderation | 8.7 optional |
| Context endpoints | Not implemented/used | Author context UI cannot persist data yet | 9.5 |
| AI endpoints | Disabled | Correctly deferred | 10 |

## 4. Database Visibility Gaps

| Table/Collection | Current UI Visibility | Gap | Planned Phase |
| :--- | :--- | :--- | :--- |
| `genres`, `tags`, `novel_tags` | Admin taxonomy only; seed/search uses data | Reader filters do not expose taxonomy yet | 8.6 |
| `reading_preferences` | Not visible | Missing reader settings UI | 8.6 |
| `reading_histories` | Visible in history list | Auto-sync and novel-level continue are missing | 8.6 |
| `bookmarks` | Visible in library | Good enough |
| `likes`, `follows` | Actions exist, current state not hydrated | UI cannot show already-liked/followed cleanly | 8.6 optional/backend if needed |
| `reports` | Created by reader, not visible in admin | Admin report queue missing | 8.7 |
| `moderation_reviews` | Admin list visible | Detail route/evidence missing | 8.7 |
| `content_rule_violations` | Not visible | Admin cannot inspect keyword hits | 8.7 |
| `wallet_transactions` | Visible in wallet/admin stats | Good enough |
| `chapter_unlocks` | Indirect through unlocked reading | Optional explicit unlocked chapters list missing | 8.6/8.9 optional |
| `withdraw_requests` | Wallet create/Admin review visible | Good enough |
| `device_tokens` | Register action only | Device list not necessary for MVP |
| Mongo `draft_chapters` | Visible indirectly via IDE draft version/content | Good enough for MVP |
| Mongo `comments` | Approved comments visible | Pending/rejected evidence not visible | 8.7 |
| Mongo `moderation_evidence` | Not visible | Admin evidence detail missing | 8.7 |
| Authoring context tables | Placeholder only | Character/timeline/summary CRUD is not implemented yet | 9.5 |
| AI/context proposal collections | Not visible | Correctly deferred | 10 |

## 5. Recommended Remaining Phase Order

1. Phase 8.5 - Author Workspace Deepening.
2. Phase 8.6 - Reader Experience Deepening.
3. Phase 8.7 - Admin and Moderation Deepening.
4. Phase 8.8 - Public and Guest Web Surface.
5. Phase 8.9 - Final Web QA and UI Polish.
