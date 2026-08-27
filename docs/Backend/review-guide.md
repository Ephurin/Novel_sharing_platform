# Backend Architecture Review Guide

Use this guide to review backend architecture before implementation.

## Review Goals

- Confirm backend architecture matches API and database docs.
- Confirm module ownership is clear.
- Confirm cross-cutting rules are agreed.
- Confirm approved database decisions are reflected in repositories.
- Confirm implementation phases are realistic for the team.

## Step 1: Review Architecture Style

Read:

1. `README.md`
2. `overview.md`

Checklist:

- [ ] Modular monolith is acceptable for MVP.
- [ ] Modules match API/SRS service boundaries.
- [ ] Future microservice extraction remains possible.
- [ ] Approved storage decisions are isolated behind repositories.

## Step 2: Review Module Structure

Read `module-structure.md`.

Checklist:

- [ ] Folder structure is understandable to the team.
- [ ] Controller/service/repository layering is acceptable.
- [ ] Route ownership is clear.
- [ ] No module directly owns another module's database tables.
- [ ] Shared code has a clear home in `core` or `shared`.

## Step 3: Review Cross-Cutting Concerns

Read `cross-cutting-concerns.md`.

Checklist:

- [ ] Auth uses access token + HTTP-only refresh token.
- [ ] RBAC and ownership checks are both required.
- [ ] Response envelope matches API docs.
- [ ] Error handling maps to `docs/API/error-codes.md`.
- [ ] Wallet operations use safe transaction/concurrency strategy.
- [ ] AI/Copilot logs avoid storing sensitive full temporary context unless approved.
- [ ] Redis is treated as cache only.

## Step 4: Review Service Flows

Read `service-flows.md`.

Checklist:

- [ ] Login flow is correct.
- [ ] Publish flow calls Content Control and handles `PASS`/`NEED_ADMIN_REVIEW`.
- [ ] Wallet unlock flow is transactional and idempotent.
- [ ] Reading history sync can work with or without Redis in MVP.
- [ ] Comment moderation calls Content Control and mirrors Mongo comment status correctly.
- [ ] Copilot suggestions do not mutate official context directly.
- [ ] Context proposal approval commits official context transactionally.
- [ ] Content Control moderation can target novels, chapters, and comments.

## Step 5: Review Implementation Plan

Read `implementation-plan.md`.

Checklist:

- [ ] Phase order is reasonable.
- [ ] Each phase has testable deliverables.
- [ ] Team split is realistic.
- [ ] AI/Copilot is not blocking core CRUD MVP.
- [ ] Admin/payment mock can be built after core content flow.

## Approved Decisions to Verify

| Decision | Impact |
| :--- | :--- |
| Framework choice: Express + TypeScript | Affects route, middleware, and module conventions. |
| Approved chapter content in PostgreSQL `chapters.content` | Affects `ChapterContentRepository`. |
| Draft/autosave content in MongoDB `draft_chapters` | Affects `DraftRepository` and editor UX. |
| Latest draft plus numeric `version`; no full draft history in MVP | Keeps editor implementation simple. |
| Mongo comments include UUID `commentId` | Affects moderation joins and admin APIs. |
| Moderation evidence and Copilot logs retained 90 days | Affects privacy, storage, and cleanup jobs. |
| Rejected context proposals retained 180 days | Affects audit and cleanup policy. |

## Suggested Comment Format

- `BLOCKER`: Must resolve before coding.
- `QUESTION`: Clarification needed without reopening approved decisions.
- `NIT`: Style/wording improvement.

Examples:

- `BLOCKER: Wallet unlock flow does not lock wallet balance before decrement.`
- `QUESTION: Clarify whether cleanup jobs run in the API process for demo.`
- `NIT: Rename context.service.ts to story-context.service.ts for clarity.`

## Freeze Criteria

Backend architecture is ready for implementation when:

- [ ] Express + TypeScript is confirmed.
- [ ] Module names are frozen.
- [ ] Response/error conventions are frozen.
- [ ] Data access abstractions reflect approved DB decisions.
- [ ] Phase 1 and Phase 2 deliverables are agreed.
