# Ephurin Database Design

This folder defines the database design for the Ephurin Novel Platform, derived from `docs/SRS` and `docs/API`.

## Documents

| Document | Scope |
| :--- | :--- |
| `overview.md` | Database architecture, ownership, ERD, and storage decisions. |
| `postgresql-schema.md` | Relational schema for users, novels, chapters, wallet, interactions, reading history, content control, and authoring context. |
| `mongodb-collections.md` | Document collections for drafts, comments, notifications, activity logs, moderation evidence, and Copilot traces. |
| `enums-and-indexes.md` | Shared enums, constraints, indexes, and uniqueness rules. |
| `approved-decisions.md` | Frozen decisions for previously open database questions. |
| `review-guide.md` | Checklist for reviewing database design before implementation. |

## Review Order

1. Review `overview.md`.
2. Review `enums-and-indexes.md`.
3. Review `approved-decisions.md`.
4. Review `postgresql-schema.md`.
5. Review `mongodb-collections.md`.
6. Use `review-guide.md` to comment and freeze schema decisions.

## Current Storage Split

- **PostgreSQL:** Relational/core business data requiring integrity and transactions.
- **MongoDB:** Flexible/high-volume document data and logs.
- **Redis:** Cache only; not treated as source of truth.
- **Vector DB:** Future AI retrieval store; not required for initial schema freeze.
