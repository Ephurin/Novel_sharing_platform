# Business Flow System Test Scenarios

Use this file as the primary handoff for Antigravity or any tester agent. The goal is to test real user journeys that cross UI, API, database, and multiple roles.

## 1. Test Mission

Validate that the Novel Sharing Platform supports the most-used business flows:

- Author creates and manages story projects, chapters, authoring context, premium settings, publishing, and AI Copilot.
- Reader browses, reads, saves, comments, reports, unlocks premium chapters, and manages wallet/history/library.
- Admin moderates content, manages users/taxonomy/withdraws, and soft-removes/restores novels.
- System preserves role boundaries and does not leak Admin/Author data to the wrong account.

## 2. Environment and Accounts

| Item | Value |
| :--- | :--- |
| Web | `http://localhost:5173` |
| API | `http://localhost:4000/api/v1` |
| Admin | `reader02` / `StrongPassword123!` / `ADMIN` |
| Author | `reader03` / `StrongPassword123!` / `AUTHOR` |
| Reader | `reader04` / `StrongPassword123!` / `READER` |

Before starting:

1. Start PostgreSQL and MongoDB.
2. Start backend and web.
3. Confirm `GET /api/v1/health` returns `200`.
4. Confirm `GET /api/v1/ai/health` returns either:
   - `200` and `data.ready = true` when ngrok LLM is online;
   - `503` with a clear message such as `Ngrok endpoint is offline` when LLM is unavailable.

## 3. Required Test Data

Use existing sample data or create it during the tests.

| Data | Requirement |
| :--- | :--- |
| Published novel | `status = PUBLISHED`, not deleted |
| Free chapter | `status = PUBLISHED`, `is_vip = false`, `price_coins = 0`, `content is not null` |
| Premium chapter | `status = PUBLISHED`, `is_vip = true`, `price_coins > 0`, `content is not null` |
| Author-owned project | Owned by `reader03`, with at least one editable chapter |
| Context data | Character profiles and timeline events for at least one author-owned story |

Suggested sample novels:

- `Ashenhold - Sample Story`
- `Thanh Van Sword Path - Sample Story`

## 4. Priority Matrix

| Priority | Meaning |
| :--- | :--- |
| `P0` | Core demo blocker if failed. |
| `P1` | Important feature, workaround possible. |
| `P2` | Edge, polish, or diagnostic flow. |

## 5. Flow A — Author Creates, Prices, Publishes, Reader Unlocks

**Priority:** `P0`  
**Roles:** Author, Admin if moderation is triggered, Reader  
**Purpose:** Prove the main author-to-reader content pipeline works.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| A1 | Author | Login as `reader03`. | Redirects to `/author`; Author sidebar includes reader routes but not admin routes. |
| A2 | Author | Create a new novel from Project Manager. | Novel card appears; backend creates `novels` row. |
| A3 | Author | Open project in Author IDE. | IDE opens with stable `novelId` URL param. |
| A4 | Author | Create or select a chapter. | Chapter appears in story tree sorted by chapter number. |
| A5 | Author | Write chapter title/content and save draft. | Draft persists after refresh; Mongo draft document exists. |
| A6 | Author | Toggle `Premium chapter`, enter `10`, click `Confirm premium settings`. | API succeeds; chapter shows `VIP 10 coins`; `chapters.is_vip = true`, `price_coins = 10`. |
| A7 | Author | Submit chapter for publish. | If clean, chapter becomes `PUBLISHED`; if flagged, goes to `PENDING_MODERATION`. |
| A8 | Admin | If pending, login as `reader02`, open moderation queue/detail, approve. | Chapter becomes published or review status updates correctly. |
| A9 | Reader | Login as `reader04`, find the novel/chapter. | Published novel/chapter visible in reader/public surfaces. |
| A10 | Reader | Open premium chapter before unlock. | Locked state appears; API returns `PAYMENT_002`. |
| A11 | Reader | Deposit mock coins if needed, unlock chapter. | Balance decreases, author balance increases, `chapter_unlocks` and `UNLOCK` transaction exist. |
| A12 | Reader | Open premium chapter after unlock. | Content is visible; no second charge on refresh. |

Evidence to capture:

- Author IDE premium panel screenshot.
- Reader locked and unlocked states.
- SQL rows for `chapters`, `chapter_unlocks`, and wallet transactions.

## 6. Flow B — Published Premium Settings Change

**Priority:** `P0`  
**Roles:** Author, Reader  
**Purpose:** Prove authors can change monetization after publication without changing content or breaking existing unlocks.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| B1 | Author | Select a `PUBLISHED` chapter in Author IDE. | Title/content are visible; premium controls remain editable. |
| B2 | Author | Change Premium → Free and click `Confirm premium settings`. | API succeeds; `is_vip = false`, `price_coins = 0`; content/title unchanged. |
| B3 | Reader | Open the chapter as a reader who has never unlocked it. | Content is visible without unlock. |
| B4 | Author | Change Free → Premium, enter `15`, confirm. | API succeeds; `is_vip = true`, `price_coins = 15`; content/title unchanged. |
| B5 | Reader | Existing unlocked reader opens chapter. | Content remains visible; no extra charge. |
| B6 | Reader | New reader or cleared unlock state opens chapter. | Locked state appears and requires unlock at current price. |
| B7 | Author | Try to set premium price to `0`. | UI clamps price to `1`; backend rejects invalid API payload if forced manually. |

Evidence to capture:

- Before/after `chapters.is_vip`, `price_coins`.
- Confirmation that `chapter_unlocks` existing row remains.
- Browser network payload for `PATCH /chapters/{chapterId}` contains only premium fields when chapter is published.

## 7. Flow C — Authoring Context and AI Copilot

**Priority:** `P1` when LLM is online, `P2` when ngrok is offline  
**Roles:** Author  
**Purpose:** Prove author-managed context is available and Copilot builds context from characters, latest timeline events, and recent prose.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| C1 | Author | Open an author-owned project with seeded characters/timeline. | Author IDE shows context counts for characters/timeline/summaries. |
| C2 | Author | Open Manage Context for the novel. | Character profiles, relationships, timeline events, and plot summaries load. |
| C3 | Author | Create or edit one character profile. | Save succeeds and appears after refresh. |
| C4 | Author | Create or edit one timeline event. | Save succeeds and ordering is stable. |
| C5 | Author | Return to IDE, write at least 500 words or paste prose. | Editor keeps prose; word count updates. |
| C6 | Author | Call `GET /api/v1/ai/health`. | If ready, `models` includes configured model such as `qwen3:8b`; if not, error message is clear. |
| C7 | Author | Click Copilot `Generate`. | If LLM ready, suggestion appears; context has characters, up to 5 timeline events, and last 500 words. If offline, user sees API error without app crash. |
| C8 | Author | Inspect network response. | `provider = openai-compatible-ngrok` when configured; `recentTextWordLimit = 500`. |

Evidence to capture:

- Context manager screenshot.
- Copilot result or offline health response.
- Response body from `POST /ai/copilot/suggestions`.

## 8. Flow D — Reader Daily Use

**Priority:** `P0`  
**Roles:** Reader  
**Purpose:** Prove the reader can use the app as a normal novel platform.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| D1 | Guest | Open `/public`, search sample title. | Published results appear without login. |
| D2 | Guest | Open free chapter. | Content visible. |
| D3 | Guest | Try comment/library/like/follow/report/VIP unlock. | UI points to login; no protected data leak. |
| D4 | Reader | Login as `reader04`, open `/reader`. | Reader home loads; no admin/author-only data. |
| D5 | Reader | Search/filter/sort published novels. | Only published and non-deleted novels appear. |
| D6 | Reader | Open novel detail. | Chapter list, author profile link, stats/actions render. |
| D7 | Reader | Add to library, like novel, follow author. | Success or friendly already-state messages; no raw stack trace. |
| D8 | Reader | Open free chapter, change reading preferences. | Preferences visually apply and persist after refresh. |
| D9 | Reader | Navigate to another chapter. | Previous/next controls work by chapter number. |
| D10 | Reader | Open `/reader/history` and `/reader/library`. | Latest read item and saved novel appear. |
| D11 | Reader | Create/edit/delete own comment. | Own comment lifecycle works; moderated states are understandable. |
| D12 | Reader | Report a novel/chapter/comment. | Report submits and moderation review is created. |

## 9. Flow E — Admin Operations

**Priority:** `P0`  
**Roles:** Admin, Author  
**Purpose:** Prove Admin can operate the platform without unsafe hard deletes.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| E1 | Admin | Login as `reader02`. | Redirects to `/admin`; admin sidebar visible. |
| E2 | Admin | Open `/admin/users`, lock/unlock a non-admin user with confirmation. | User status changes; wrong role cannot perform action. |
| E3 | Admin | Open `/admin/taxonomy`, create genre/tag. | New genre/tag appears or duplicate validation is friendly. |
| E4 | Admin | Open `/admin/moderation`. | Queue loads with filters. |
| E5 | Admin | Open review detail. | Target metadata, report count, evidence summary, and action controls render. |
| E6 | Admin | Resolve a pending review. | Review status updates; duplicate resolve is blocked or conflict-handled. |
| E7 | Admin | Open `/admin/novels`, search a novel, open detail. | Novel aggregate detail shows chapters and owner. |
| E8 | Admin | Soft-remove a novel with reason. | Novel is hidden from reader search; drafts/chapters are hidden/marked; author receives notification. |
| E9 | Author | Login as owner, open notifications. | Notification says novel was removed by admin. |
| E10 | Admin | Restore the removed novel. | Novel returns to admin/detail/search surfaces according to status. |

Evidence to capture:

- Confirmation modals.
- Notification after soft removal.
- SQL `deleted_at`/restore state for novel/chapter aggregate.

## 10. Flow F — Wallet, Donation, Withdraw

**Priority:** `P1`  
**Roles:** Reader, Author, Admin  
**Purpose:** Prove mock wallet remains internally consistent.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| F1 | Reader | Open `/wallet`. | Balance and transaction list load. |
| F2 | Reader | Create and complete mock deposit. | Balance increases exactly once; `DEPOSIT` transaction exists. |
| F3 | Reader | Donate coins to a published author. | Reader balance decreases, author balance increases, `DONATE` transaction exists. |
| F4 | Author | Request withdraw if balance sufficient. | Pending withdraw request exists. |
| F5 | Admin | Approve or reject withdraw. | Status/review metadata updates; transaction state remains consistent. |
| F5a | Author | Open `/notifications` after approve/reject. | Requester receives withdraw approved/rejected notification. |
| F6 | Reader | Try invalid deposit/donation/withdraw amounts through API if UI blocks it. | Validation/payment errors, no negative balance. |

## 11. Flow G — Role Switching, Logout, Refresh, Deep Links

**Priority:** `P0`  
**Roles:** All  
**Purpose:** Prove stale local storage/cache cannot leak previous role UI.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| G1 | Admin | Login as `reader02`, confirm admin sidebar. | Admin routes visible. |
| G2 | Admin | Click Logout. | Local/session storage and query cache clear; redirects to `/login`. |
| G3 | Author | Login as `reader03`. | Author sidebar appears; admin routes do not remain from stale cache. |
| G4 | Author | Open `/admin/users` directly. | Permission state; no admin list rendered. |
| G5 | Author | Open two IDE tabs for two projects, refresh both. | Each tab reloads its own `novelId/chapterId` from URL params. |
| G6 | Reader | Login as `reader04`, open protected reader route, refresh. | Session restores correctly. |
| G7 | Guest | Clear token and open protected route. | Redirects to `/login`. |

## 12. Flow H — Content Control and User Reports

**Priority:** `P1`  
**Roles:** Reader, Author, Admin  
**Purpose:** Prove content control uses keyword rules and user reports, not LLM.

| Step | Role | Action | Expected |
| :--- | :--- | :--- | :--- |
| H1 | Admin | Ensure at least one active banned keyword exists. | Rule appears in content-control/admin data. |
| H2 | Author | Submit chapter/comment content containing active banned keyword. | Moderation review is created; content is pending/blocked according to target type. |
| H3 | Reader | Report a published novel/chapter/comment. | Report creates/links moderation review. |
| H4 | Admin | Open moderation detail. | Evidence/report source is visible; no LLM moderation call is required. |
| H5 | Admin | Approve/reject review. | Target status changes consistently; reader/author UI reflects result. |

## 13. Negative Tests to Always Include

Run these after happy paths:

| ID | Scenario | Expected |
| :--- | :--- | :--- |
| NEG-1 | Reader calls Author/Admin mutation API. | `401/403`, no mutation. |
| NEG-2 | Author edits another author's novel/chapter/context. | `403`, no mutation. |
| NEG-3 | `isVip = true`, `priceCoins = 0` through API. | `400`, `VALIDATION_001`. |
| NEG-4 | `isVip = false`, `priceCoins > 0` through API. | `400`, `VALIDATION_001`. |
| NEG-5 | Unlock same premium chapter twice. | No double charge; idempotent/already-unlocked handling. |
| NEG-6 | Stop backend during save/generate. | UI shows error and remains usable after backend returns. |
| NEG-7 | Ngrok LLM offline. | `/ai/health` returns `503`; Copilot failure is visible but app does not crash. |

## 14. Final Evidence Package

For each flow, capture:

- account/role used;
- exact URL;
- screenshots of key UI states;
- failed network request if any;
- SQL/Mongo query evidence for important state changes;
- PASS/FAIL/BLOCKED;
- whether failure is app bug, setup/data issue, or external dependency issue such as ngrok.
