# API Review Guide

Use this guide to review the API documents before backend implementation.

## Review Goals

- Ensure every endpoint maps to a real SRS use case or required support function.
- Ensure service ownership is clear.
- Ensure request/response schemas are stable enough for frontend/backend parallel work.
- Catch duplicated resources before implementation starts.

## Step 1: Review Global Rules

Review these files first:

1. `conventions.md`
2. `error-codes.md`

Checklist:

- [ ] Base URL is acceptable: `/api/v1`.
- [ ] Response envelope is acceptable: `{ success, data, error, meta }`.
- [ ] Enum casing is acceptable: `UPPER_SNAKE_CASE`.
- [ ] Pagination fields are acceptable: `page`, `limit`, `sort`, `order`.
- [ ] Error code groups cover every service.

## Step 2: Review Ownership

Use this ownership map:

| Domain | Owner |
| :--- | :--- |
| Auth tokens, roles, account identity | Auth Service |
| Public/private profile metadata | User/Profile APIs |
| Novel, chapter, draft, character, timeline, plot summary | Novel & Chapter Service |
| Copilot suggestions and context proposals | AI + Novel collaboration |
| Official context data commit | Novel & Chapter Service |
| Reading preferences, reading history, library/bookmarks | Reading Experience Service |
| Comments, likes, follows, notifications | Interaction & Social Service |
| Wallet, mock Coin ledger, deposits, unlocks, donations, withdraws | Payment & Wallet Service |
| Content filtering, user reports, moderation queue | Content Control & Moderation API |
| User lock, taxonomy, dashboard, withdraw review | Admin APIs |

Checklist:

- [ ] Bookmark/library is reviewed as Reading API, not Interaction API.
- [ ] Like/follow/comment are reviewed as Interaction API.
- [ ] Copilot can propose context changes.
- [ ] Only Author-approved proposals are committed into official context data.
- [ ] Payment endpoints are clearly mock/demo-only.
- [ ] Content Control owns moderation checks/reports; AI endpoints do not perform content judgement.

## Step 3: Review Endpoint Names

For each endpoint:

- [ ] HTTP method matches action.
- [ ] Path is resource-oriented.
- [ ] Endpoint does not duplicate another service endpoint.
- [ ] Role access is clear.
- [ ] Request body fields are enough for frontend forms.
- [ ] Response body fields are enough for frontend rendering.
- [ ] Error codes include validation, auth, not found, conflict, and business-rule failures.

## Step 4: Review Use Case Coverage

Map each SRS UC to at least one endpoint.

| SRS Area | API File |
| :--- | :--- |
| Register/Login | `auth-api.md` |
| Profile | `user-profile-api.md` |
| Publish novel/chapter | `novel-chapter-api.md` |
| Character/Timeline/Plot context | `novel-chapter-api.md` |
| Writing Copilot | `ai-copilot-api.md` |
| Reading customization/history/search | `reading-api.md` |
| Comments/likes/follows/notifications | `interaction-social-api.md` |
| Mock wallet/payment | `payment-wallet-api.md` |
| Content control/moderation/report | `content-control-api.md` |
| Admin user/taxonomy/dashboard/withdraw | `admin-api.md` |

Checklist:

- [ ] Every UC has at least one endpoint.
- [ ] Every endpoint has a visible purpose in SRS.
- [ ] Missing UCs are either added to SRS or marked as technical support endpoints.

## Step 5: Review State Transitions

Important states to verify:

| Resource | States |
| :--- | :--- |
| Novel/Chapter | `DRAFT`, `PENDING_MODERATION`, `PUBLISHED`, `REJECTED` |
| Comment | `PENDING_MODERATION`, `APPROVED`, `REJECTED` |
| Transaction | `PENDING`, `SUCCESS`, `FAILED` |
| Context Proposal | `PENDING`, `APPROVED`, `REJECTED` |
| Notification | `UNREAD`, `READ` |
| User | `ACTIVE`, `LOCKED` |

Checklist:

- [ ] State names are consistent across files.
- [ ] Invalid transitions return `CONFLICT_001` or domain-specific conflict errors.
- [ ] Admin-only transitions are protected.
- [ ] Author-only transitions require content ownership.

## Step 6: Review Example Payloads

For each file:

- [ ] Example IDs are strings.
- [ ] Date fields use ISO 8601 if present.
- [ ] Required fields are obvious.
- [ ] Sensitive fields are never returned.
- [ ] Mock payment does not include real card/bank data.

## Suggested Review Workflow for the Team

1. Assign one reviewer per service file.
2. Each reviewer comments using this format:
   - `BLOCKER`: must fix before backend implementation.
   - `QUESTION`: unclear, needs decision.
   - `NIT`: wording/style improvement.
3. Resolve all `BLOCKER` comments.
4. Freeze endpoint names.
5. Backend and frontend can implement against the frozen API docs.

## Common Things to Watch

- Duplicating bookmark endpoints in Interaction and Reading.
- Letting AI directly mutate official story context without Author approval.
- Returning password hashes, refresh tokens, or internal moderation evidence to normal users.
- Mixing mock payment wording with real-money terminology.
- Using inconsistent enum casing.
