# API Error Codes

This document extends the SRS appendix error codes into API-ready groups.

## Common

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `SYS_001` | 500 | Internal Server Error | Unhandled server error. |
| `VALIDATION_001` | 400 | Invalid request payload | Missing or malformed body/query fields. |
| `VALIDATION_002` | 422 | Business rule violation | Request is syntactically valid but violates business rules (e.g. novel submitted with fewer than 5 valid chapters; `details.readyChapters`). |
| `NOT_FOUND_001` | 404 | Resource not found | Requested resource does not exist or is not visible. |
| `CONFLICT_001` | 409 | Resource conflict | Duplicate resource or invalid state transition. |
| `RATE_LIMIT_001` | 429 | Too many requests | Rate limit exceeded. Payment routes allow `PAYMENT_RATE_LIMIT_MAX` calls per user per `PAYMENT_RATE_LIMIT_WINDOW_MS` (default 30/min); the response carries `Retry-After`. |

## Authentication & User

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `AUTH_001` | 400 | Invalid email format | Email does not match required format. |
| `AUTH_002` | 401 | Missing access token | Protected endpoint called without token. |
| `AUTH_003` | 401 | Invalid credentials | Username/email or password is incorrect. |
| `AUTH_004` | 403 | Account locked | User account is locked by Admin. |
| `AUTH_005` | 401 | Access token expired | Access token is expired. |
| `AUTH_006` | 401 | Invalid refresh token | Refresh token is missing, expired, or revoked. |
| `AUTH_008` | 403 | Unauthorized action | Role has insufficient permission. |
| `USER_004` | 409 | Username already exists | Username is already used. |
| `USER_005` | 409 | Email already exists | Email is already used. |

## Content

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `CONTENT_001` | 404 | Content not found | Novel/chapter/comment does not exist. |
| `CONTENT_002` | 422 | Invalid novel metadata | Title, synopsis, genre, or cover validation failed. |
| `CONTENT_003` | 422 | Invalid chapter content | Chapter title/content validation failed (e.g. publishing a chapter under 500 characters). |
| `CONTENT_004` | 409 | Invalid content state | Operation is not allowed in the current state. |
| `CONTENT_005` | 403 | Content ownership required | User is not the owner of the content. |

## AI & Copilot

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `AI_001` | 503 | AI Service Unavailable | Timeout or service down. `details.reason`: `not_configured`, `timeout`, `unreachable`, `provider_http_<status>`, `empty_response`, `token_limit`. |
| `AI_002` | 422 | Insufficient context | Not enough text/context to generate reliable result. |
| `AI_003` | 409 | Proposal already resolved | Context proposal has already been approved/rejected. |
| `AI_004` | 403 | Context proposal ownership required | User cannot approve/reject this proposal. |
| `AI_005` | 422 | Consistency check unavailable | Draft/context is not suitable for consistency analysis. |

## Interaction & Notification

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `COMMENT_001` | 422 | Invalid comment content | Comment is empty or too long. |
| `COMMENT_002` | 409 | Comment pending moderation | Comment is not publicly visible yet. |
| `INTERACTION_001` | 409 | Already liked/bookmarked/followed | Duplicate interaction. |
| `INTERACTION_002` | 404 | Interaction not found | Like/bookmark/follow does not exist. |
| `NOTIFICATION_001` | 404 | Notification not found | Notification does not exist or is not visible. |

## Payment & Wallet

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `PAYMENT_001` | 422 | Invalid mock package | Deposit package is not supported. |
| `PAYMENT_002` | 422 | Insufficient balance | Wallet balance is not enough. |
| `PAYMENT_003` | 409 | Chapter already unlocked | Reader already has permanent access. |
| `PAYMENT_004` | 409 | Transaction already processed | Mock webhook or transaction cannot be processed twice. |
| `PAYMENT_005` | 422 | Withdraw minimum not met | Withdraw amount is below minimum. |
| `PAYMENT_006` | 403 | Wallet owner required | User cannot access this wallet/transaction. |

## Admin

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `ADMIN_001` | 404 | Review item not found | Moderation item does not exist. |
| `ADMIN_002` | 409 | Review item already resolved | Item was already approved/rejected. |
| `ADMIN_003` | 422 | Rejection reason required | Admin rejects content without reason. |

## Content Control & Moderation

| Code | HTTP | Message | Condition |
| :--- | :---: | :--- | :--- |
| `MODERATION_001` | 503 | Content Control unavailable | Content Control check cannot complete. |
| `MODERATION_002` | 409 | Invalid moderation transition | Review decision is not allowed in current status. |
| `MODERATION_003` | 404 | Report not found | Report does not exist or is not visible. |
| `MODERATION_004` | 422 | Invalid report reason | Report reason is missing or unsupported. |
