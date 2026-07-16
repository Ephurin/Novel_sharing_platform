# Cross-Cutting Concerns

This document defines shared backend behavior across modules.

## 1. Authentication

Access token:

- JWT;
- sent in `Authorization: Bearer <accessToken>`;
- short-lived.

Refresh token:

- stored in HTTP-only cookie;
- stored as hash in `refresh_tokens`;
- revoked on logout.

Middleware:

```txt
authenticateRequest -> attach currentUser -> next
```

`currentUser` should include:

```json
{
  "userId": "user_123",
  "role": "AUTHOR",
  "status": "ACTIVE"
}
```

## 2. RBAC and Ownership

Use two layers:

1. **Role guard:** checks `Reader`, `Author`, `Admin`.
2. **Ownership guard/service check:** checks if user owns the resource.

Examples:

| Action | Role Check | Ownership Check |
| :--- | :--- | :--- |
| Update own novel | Author | `novel.author_id == currentUser.userId` |
| Resolve moderation review | Admin | None |
| Approve context proposal | Author | proposal belongs to author's novel |
| View wallet | Reader/Author/Admin | wallet belongs to current user unless Admin |

## 3. Validation

Validate all input at the boundary.

Recommended places:

- route params;
- query parameters;
- request body;
- enum values;
- pagination fields.

Validation errors should return:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_001",
    "message": "Invalid request payload",
    "details": {
      "field": "title"
    }
  },
  "meta": {}
}
```

## 4. Response Format

Follow `docs/API/conventions.md`.

Success:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CONTENT_001",
    "message": "Content not found",
    "details": {}
  },
  "meta": {}
}
```

## 5. Error Handling

Use typed application errors.

Suggested error class fields:

| Field | Description |
| :--- | :--- |
| `code` | API error code from `docs/API/error-codes.md`. |
| `httpStatus` | HTTP status. |
| `message` | Safe public message. |
| `details` | Optional validation/business context. |

The global error handler should:

- hide stack traces from users;
- log full error internally;
- map unknown errors to `SYS_001`.

## 6. Transactions

Use ORM transactions for multi-table writes.

Required transaction flows:

- register user + profile + wallet;
- unlock chapter;
- donate Coins;
- create withdraw request;
- approve/reject withdraw request;
- approve context proposal;
- resolve moderation review.

Wallet operations must prevent race conditions:

- lock wallet rows if ORM supports it;
- or use conditional update: decrement only where `coins_balance >= amount`;
- or use raw SQL `SELECT ... FOR UPDATE` inside transaction.

## 7. Idempotency

Idempotency is important for:

- mock deposit webhook;
- chapter unlock;
- context proposal approval/rejection;
- Content Control moderation approval/rejection.

Recommended rules:

- duplicate mock webhook should return existing transaction result;
- unlocking already-unlocked chapter returns `PAYMENT_003`;
- approving already-resolved proposal returns `AI_003`;
- resolving already-resolved moderation item returns `ADMIN_002`.

## 8. Logging and Audit

Log:

- auth failures;
- admin actions;
- wallet transactions;
- content publish/reject;
- moderation review and AI context proposal creation;
- unexpected errors.

Use `activity_logs` for audit-relevant events.

Do not log:

- raw passwords;
- raw refresh tokens;
- full temporary Copilot `additionalContextText` unless explicitly approved.

## 9. Caching

Redis is optional for MVP but recommended for:

- reading position cache;
- search result cache;
- rate limit counters;
- hot/trending list cache.

Rules:

- cache is not source of truth;
- cache keys must include user ID for private data;
- invalidate novel search/list cache after publish/update.

## 10. Background Jobs

Recommended jobs:

| Job | Purpose |
| :--- | :--- |
| `reading-history-sync` | Flush Redis reading positions to PostgreSQL. |
| `notification-dispatch` | Send push notifications after chapter publish/follow events. |
| `cleanup-expired-tokens` | Remove/revoke expired refresh tokens. |
| `moderation-evidence-retention` | Delete/archive moderation evidence after 90 days. |
| `ai-log-retention` | Delete/truncate Copilot generation logs after 90 days. |
| `context-proposal-retention` | Archive/delete rejected context proposals after 180 days. |

For MVP, jobs can run inside the same backend process. Later, they can move to worker processes.

## 11. Event Style

Use internal domain events to decouple modules:

```txt
chapter.published
comment.pending_moderation
wallet.transaction_success
context_proposal.created
moderation.resolved
```

For MVP, these can be synchronous service calls or in-process events. Future versions can use a queue.

## 12. Security Defaults

- Use HTTPS in deployment.
- Hash passwords with bcrypt or argon2id.
- Store refresh tokens as hashes only.
- Use HTTP-only cookie for refresh token.
- Enforce role and ownership checks.
- Apply rate limits to auth, payment mock, and AI endpoints.
- Sanitize user-generated content where rendered.
