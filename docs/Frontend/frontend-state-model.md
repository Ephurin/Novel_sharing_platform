# Frontend State Model

This document defines what state should live in the frontend and where it should be stored.

## 1. State Categories

| Category | Storage | Examples | Notes |
| :--- | :--- | :--- | :--- |
| Server state | TanStack Query | novels, chapters, wallet, notifications, admin lists | Source of truth is backend. |
| Session state | Zustand + localStorage | access token, current user | Restore with `GET /auth/me`. |
| UI state | Zustand or component state | active sidebar, selected tab, modal open state | Not persisted unless helpful. |
| Draft input state | Component state | form fields, editor content before save | Persist only through backend save/autosave. |
| Navigation state | Router params/search params | selected route, filters, deep links | Prefer URLs for shareable state. |
| Device state | localStorage/native storage | theme, reading preference cache | Sync with backend when applicable. |

## 2. Session Store

Recommended fields:

| Field | Type | Source |
| :--- | :--- | :--- |
| `accessToken` | `string | null` | Login/register response, localStorage. |
| `user` | `AuthUser | null` | Login/register response, `GET /auth/me`. |
| `sessionStatus` | `unknown | restoring | authenticated | guest` | Frontend derived. |

Required actions:

- `setSession(accessToken, user)`;
- `clearSession()`;
- `restoreSession()`;
- `refreshCurrentUser()`.

Rules:

- Do not assume a local token means the user is valid.
- Always clear invalid token after `GET /auth/me` fails.
- Locked users should be shown a locked-account state.

## 3. Author IDE State

| State | Suggested Location | Persist? |
| :--- | :--- | :--- |
| `activeAuthorActivity` | Zustand | Yes, localStorage optional |
| `selectedNovelId` | URL or Zustand | Yes, URL/localStorage |
| `selectedChapterId` | URL or Zustand | Yes, URL/localStorage |
| `editorContent` | Component state | Backend draft save |
| `editorDirty` | Component state | No |
| `savingStatus` | Component state | No |
| `rightPanelMode` | Zustand | Optional |
| `contextInspectorSelection` | Zustand/component | No |

Rules:

- Chapter content should not be treated as saved until `PATCH /chapters/{chapterId}` succeeds.
- Save/publish errors must remain visible until the next successful action or manual dismissal.
- AI state remains disabled before Phase 10.

## 4. Reader State

| State | Suggested Location | Persist? |
| :--- | :--- | :--- |
| `searchQuery` | URL search params | Yes |
| `filters` | URL search params | Yes |
| `selectedNovelId` | Route param | Yes |
| `selectedChapterId` | Route param | Yes |
| `readingSettings` | Server state + local cache | Yes |
| `currentParagraphIndex` | Component state | Backend history sync |
| `commentsDrawerOpen` | Component state | No |

Rules:

- Reading history sync should be debounced/throttled, not called on every scroll tick.
- VIP locked state should not be cached as permanent; refetch after unlock.
- Guest reader state should not call protected APIs.

## 5. Wallet State

| State | Suggested Location | Persist? |
| :--- | :--- | :--- |
| `wallet` | TanStack Query | Backend |
| `transactions` | TanStack Query | Backend |
| `selectedDepositPackage` | Component state | No |
| `pendingUnlockChapterId` | Route/search param or component | Optional |
| `withdrawForm` | Component state | No |

Rules:

- Always invalidate wallet and transactions after deposit/unlock/donate/withdraw.
- Wallet balance shown before mutation may be stale; refetch after success.
- All payment labels must say mock/demo.

## 6. Notifications State

| State | Suggested Location | Persist? |
| :--- | :--- | :--- |
| `notificationFilter` | Component/URL state | Optional |
| `notifications` | TanStack Query | Backend |
| `unreadCount` | TanStack Query derived | Backend |
| `deviceTokenRegistrationStatus` | Component state | No |

Rules:

- Mark-read should invalidate notification list.
- Empty notification list is a valid state.
- Device-token registration is MVP/dev utility until real push integration exists.

## 7. Admin State

| State | Suggested Location | Persist? |
| :--- | :--- | :--- |
| `activeAdminTab` | URL or component state | URL preferred |
| `userSearch` | URL search params | Optional |
| `moderationFilters` | URL search params | Optional |
| `withdrawStatusFilter` | URL search params | Optional |
| `confirmationModal` | Component state | No |

Rules:

- Admin mutations must invalidate relevant query keys.
- Approve/reject/lock actions require confirmation.
- Admin pages must handle empty queues gracefully.

## 8. Query Key Conventions

| Domain | Query Key |
| :--- | :--- |
| Current user | `['auth', 'me']` |
| Novel detail | `['novel', novelId]` |
| Novel chapters | `['chapters', novelId]` |
| Chapter detail | `['chapter', chapterId]` |
| Reader search | `['reader', 'search', filters]` |
| Reader novel | `['reader', 'novel', novelId]` |
| Reader chapter | `['reader', 'chapter', chapterId]` |
| Wallet | `['wallet']` |
| Transactions | `['wallet', 'transactions', filters]` |
| Notifications | `['notifications', filters]` |
| Admin stats | `['admin', 'stats']` |
| Admin users | `['admin', 'users', filters]` |
| Admin moderation | `['admin', 'moderation', filters]` |
| Admin withdraws | `['admin', 'withdraws', filters]` |

## 9. Error Handling Model

Frontend should extract errors from the standard API envelope:

```txt
error.code
error.message
error.details
```

Display strategy:

| Error Class | UI Behavior |
| :--- | :--- |
| Validation | Show form-level and field-level messages if available. |
| Auth | Redirect to login or show expired-session message. |
| Permission | Show permission page/card. |
| Payment | Show wallet-specific guidance. |
| Not found | Show not-found state with back action. |
| System/network | Show retry action. |

## 10. Review Checklist

- [ ] State source of truth is clear for each feature.
- [ ] Server state is not duplicated into Zustand unnecessarily.
- [ ] Protected API calls depend on valid session.
- [ ] Mutations invalidate relevant query keys.
- [ ] Error messages use backend envelope data.
