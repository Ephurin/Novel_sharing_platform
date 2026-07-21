# API Screen Matrix

This document maps frontend screens to backend APIs.

Use it to detect missing endpoints, outdated endpoint names, or screens that still depend on mock/static data.

## 1. Auth and Profile

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Login | `POST /auth/login` | Yes | Returns access token and user. |
| Register | `POST /auth/register` | Yes | Creates wallet as backend side effect. |
| Session Restore | `GET /auth/me` | Yes | Needed for refresh-safe route guards. |
| Logout | `POST /auth/logout` | Yes | Frontend also clears local token. |
| My Profile | `GET /users/me/profile` | Yes | Phase 8.4 profile page. |
| My Profile Edit | `PATCH /users/me/profile` | Yes | Phase 8.4 profile page. |
| Public Author Profile | `GET /authors/{authorId}/profile` | Yes | Phase 7 backend. |

## 2. Author Novel and Chapter

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Author Project Manager | `GET /novels/me` | Yes | Returns only current author's writing projects. |
| Create Novel | `POST /novels` | Yes | Author/Admin only. |
| Novel Detail/Edit | `GET /novels/{novelId}` | Yes | Owner checks in backend. |
| Novel Edit | `PATCH /novels/{novelId}` | Yes | Metadata editing. |
| Submit Novel | `POST /novels/{novelId}/submit-publish` | Yes | Moderation status feedback. |
| Chapter Tree | `GET /novels/{novelId}/chapters` | Yes | Group by arc later when arc model exists. |
| Create Chapter | `POST /novels/{novelId}/chapters` | Yes | Backend assigns chapter number. |
| Chapter Editor | `GET /chapters/{chapterId}` | Yes | Loads draft/content. |
| Save Draft | `PATCH /chapters/{chapterId}` | Yes | Editor save action. |
| Submit Chapter | `POST /chapters/{chapterId}/submit-publish` | Yes | Content Control integration in backend. |

## 3. Author Context and AI Placeholders

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Entities | Context endpoints in `novel-chapter-api.md` | Later | May remain placeholder until context backend is implemented. |
| Timeline | Context endpoints in `novel-chapter-api.md` | Later | Important for Phase 10. |
| Plot Summary | Context endpoints in `novel-chapter-api.md` | Later | Important for Phase 10. |
| Copilot Suggestion | `POST /ai/copilot/suggestions` | Phase 10 | Disabled in Phase 8.x. |
| Consistency Check | `POST /ai/copilot/consistency-check` | Phase 10 | Disabled in Phase 8.x. |
| Context Proposal Approval | AI/context proposal endpoint | Phase 10 | Disabled in Phase 8.x. |

## 4. Reader

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Reader Home/Search | `GET /reading/search` | Yes | Current backend endpoint for public browse/search. |
| Reader Novel Detail | `GET /reading/novels/{novelId}` | Yes | Published novel detail. |
| Reader Chapter | `GET /reading/chapters/{chapterId}` | Yes | Handles locked VIP response. |
| Reading Preferences | `GET /reading/preferences/me` | Yes | Authenticated. |
| Save Preferences | `PUT /reading/preferences/me` | Yes | Authenticated. |
| Sync History | `PUT /reading/history/me` | Yes | Authenticated. |
| List History | `GET /reading/history/me` | Yes | Authenticated. |
| Novel History | `GET /reading/history/me/{novelId}` | Optional | Useful for continue button. |
| List Library | `GET /reading/library/me` | Yes | Authenticated. |
| Add Library | `POST /reading/library/me` | Yes | Authenticated. |
| Remove Library | `DELETE /reading/library/me/{novelId}` | Yes | Authenticated. |

## 5. Social and Comments

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Like Novel | `POST /novels/{novelId}/likes` | Yes | Authenticated. |
| Unlike Novel | `DELETE /novels/{novelId}/likes/me` | Yes | Authenticated. |
| Follow Author | `POST /authors/{authorId}/follow` | Yes | Authenticated. |
| Unfollow Author | `DELETE /authors/{authorId}/follow` | Yes | Authenticated. |
| Follower Count | `GET /authors/{authorId}/followers/count` | Optional | Public display. |
| List Comments | `GET /chapters/{chapterId}/comments` | Yes | Reader chapter comments. |
| Create Comment | `POST /chapters/{chapterId}/comments` | Yes | Authenticated; moderation may mark pending. |
| Update Comment | `PATCH /comments/{commentId}` | Yes | Owner/admin. |
| Delete Comment | `DELETE /comments/{commentId}` | Yes | Owner/admin. |
| Report Content | `POST /reports` | Yes | Authenticated. |

## 6. Wallet

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Wallet Balance | `GET /wallet/me` | Yes | Authenticated. |
| Transactions | `GET /wallet/transactions` | Yes | Authenticated. |
| Create Deposit | `POST /wallet/deposit-sessions` | Yes | Mock only. |
| Complete Deposit | `POST /wallet/mock-webhook/deposit-success` | Yes | Demo/test action. |
| Unlock Chapter | `POST /chapters/{chapterId}/unlock` | Yes | Authenticated. |
| Donate Author | `POST /authors/{authorId}/donations` | Yes | Authenticated. |
| Withdraw Request | `POST /wallet/withdraw-requests` | Yes | Author/Admin with sufficient balance. |

## 7. Notifications

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Notification List | `GET /notifications` | Yes | Authenticated. |
| Mark Read | `PATCH /notifications/{notificationId}/read` | Yes | Authenticated. |
| Register Device Token | `POST /notifications/device-token` | MVP tool | Real push delivery later. |

## 8. Admin

| Screen | API | Required | Notes |
| :--- | :--- | :--- | :--- |
| Dashboard Stats | `GET /admin/dashboard/stats` | Yes | Admin only. |
| Moderation Queue | `GET /admin/moderation/reviews` | Yes | Admin only. |
| Moderation Detail | `GET /admin/moderation/reviews/{reviewId}` | Yes | Admin only. |
| Resolve Moderation | `POST /admin/moderation/reviews/{reviewId}/resolve` | Yes | Admin only. |
| User List | `GET /admin/users` | Yes | Admin only. |
| Lock User | `PATCH /admin/users/{userId}/lock` | Yes | Admin only, confirmation required. |
| Unlock User | `PATCH /admin/users/{userId}/unlock` | Yes | Admin only. |
| Taxonomy List | `GET /admin/taxonomy` | Yes | Admin only. |
| Create Genre | `POST /admin/taxonomy/genres` | Yes | Admin only. |
| Create Tag | `POST /admin/taxonomy/tags` | Yes | Admin only. |
| Withdraw List | `GET /admin/withdraw-requests` | Yes | Admin only. |
| Approve Withdraw | `POST /admin/withdraw-requests/{withdrawRequestId}/approve` | Yes | Admin only, confirmation required. |
| Reject Withdraw | `POST /admin/withdraw-requests/{withdrawRequestId}/reject` | Yes | Admin only, reason required. |

## 9. Known API Alignment Notes

- Use `GET /reading/search`, not the older `GET /reading/novels` wording that appears in early mockup notes.
- Use Reader-facing APIs under `/reading/*` for public published content.
- Use Author-facing APIs under `/novels/*` and `/chapters/*` for draft/owner workflows.
- Use `/admin/moderation/*` for admin review; Content Control direct check is admin/system scoped.
- AI endpoints remain documented but should not be called before Phase 10.

## 10. API Test Baseline

The frontend plan is aligned with the API collections that were reviewed and reported as passing.

| Test Collection | Covered APIs | Frontend Usage |
| :--- | :--- | :--- |
| `phase-4-content-control-interaction.postman_collection.json` | Content check, reports, comments, admin moderation review/resolve | Reader comments/report UI and Admin moderation UI. |
| `phase-5-reader-backend.postman_collection.json` | Reader search/detail/chapter, preferences, history, library, likes, follows | Reader web/mobile browse, reading, library/history, social actions. |
| `phase-6-mock-wallet-backend.postman_collection.json` | Wallet balance, mock deposit, VIP unlock, donate, withdraw, transactions | Wallet mock UI and VIP unlock flow. |
| `phase-7-profile-notification-admin.postman_collection.json` | Author profile, notifications, admin users/taxonomy/withdraw/stats | Profile, Notifications, and Admin UI. |

Notes:

- Phase 8.x should prioritize APIs that are already covered by these passing collections.
- Author context and AI/Copilot endpoints are documented but not part of the passing non-AI API baseline yet.
- If a frontend screen needs behavior outside these collections, add or update API tests before treating the screen as final.

## 11. Review Checklist

- [ ] Every implemented screen has a mapped API.
- [ ] No screen uses outdated endpoint names.
- [ ] Guest/authenticated behavior is explicit.
- [ ] Admin-only APIs are behind admin route guards.
- [ ] AI endpoints are disabled until Phase 10.
