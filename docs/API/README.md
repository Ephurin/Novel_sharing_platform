# Ephurin API Documentation

This folder contains API documentation derived from the fragmented SRS documents in `docs/SRS`.

## Documents

| Document | Scope |
| :--- | :--- |
| `conventions.md` | Shared request/response, auth, pagination, enum, and HTTP conventions. |
| `error-codes.md` | Standard API error codes grouped by domain. |
| `auth-api.md` | Registration, login, token refresh, logout, current user identity, and password change. |
| `novel-chapter-api.md` | Novel, chapter, draft, character, timeline, plot summary, and context proposal APIs. |
| `reading-api.md` | Reader preferences, search, reading history, and library/bookmark APIs. |
| `interaction-social-api.md` | Comments, likes, follows, and notifications. |
| `content-control-api.md` | Content rule checks, user reports, moderation queue, and Admin review decisions. |
| `payment-wallet-api.md` | Mock wallet, deposits, unlocks, donations, withdraws, and transaction history. |
| `ai-copilot-api.md` | AI metadata, classification, style analysis, consistency checking, copilot suggestions, and context proposals. |
| `admin-api.md` | User management, dashboard, taxonomy, and withdraw review APIs. |
| `review-guide.md` | How to review and approve API docs before implementation. |

## Base URL

```txt
/api/v1
```

## Required Review Order

1. Review `conventions.md` and `error-codes.md`.
2. Review API files against their corresponding SRS service files.
3. Review cross-service flows: publishing, Content Control moderation, wallet unlock, comments, and Writing Copilot context proposals.
4. Freeze endpoint names before backend implementation begins.

## Current Assumptions

- Payment APIs are mock/demo-only for graduation-project scope.
- Writing Copilot may create context update proposals, but Author approval is required before official context data changes.
- Content Control owns keyword/rule filtering, user reports, and moderation reviews; AI/LLM is not used for content judgement.
- Traceability from SRS UC to API endpoint can be added after the UC set is stable.

## Implementation Handoff

- Use `docs/Implementation/roadmap.md` to decide which API group to implement first.
- Phase 1 starts with conventions, errors, health, auth, and user/profile APIs.
