# Database Review Guide

Use this guide to review the database design before implementation.

## Review Goals

- Confirm that each API resource has a database home.
- Confirm that source-of-truth ownership is clear.
- Confirm that table/collection fields are enough for MVP implementation.
- Catch missing relationships, invalid constraints, and over-complicated schema before coding.

## Step 1: Review Storage Split

Read:

1. `overview.md`
2. `enums-and-indexes.md`

Checklist:

- [ ] PostgreSQL is the source of truth for relational business data.
- [ ] MongoDB is used only for flexible/high-volume document data and logs.
- [ ] Redis is cache-only.
- [ ] Vector DB is future/optional, not required for MVP.

## Step 2: Review Ownership

| Data | Expected Owner |
| :--- | :--- |
| `users`, `refresh_tokens` | Auth Service |
| `user_profiles` | User/Profile APIs |
| `novels`, `chapters` | Novel & Chapter Service |
| `character_profiles`, `story_timeline_events`, `plot_summaries` | Novel & Chapter Service |
| `context_change_proposals` | Novel & Chapter Service, proposed by AI |
| `draft_chapters` | Novel & Chapter Service |
| `reading_preferences`, `reading_histories`, `bookmarks` | Reading Experience Service |
| `likes`, `follows`, `comments`, `notifications` | Interaction & Social Service |
| `wallets`, `transactions`, `deposit_sessions`, `withdraw_requests` | Payment & Wallet Service |
| `content_filter_rules`, `moderation_reviews`, `reports`, `moderation_evidence` | Content Control & Moderation Service |

Checklist:

- [ ] Bookmark/library is not owned by Interaction Service.
- [ ] Official story context is not directly mutated by AI without Author approval.
- [ ] Each official context unit has only one current summary; history/versioning, if needed, is separated from `plot_summaries`.
- [ ] Wallet balance is not stored in `users`.
- [ ] Comments are stored in MongoDB, while moderation state can be mirrored in PostgreSQL.

## Step 3: Review PostgreSQL Schema

Read `postgresql-schema.md` by domain.

For each table:

- [ ] Primary key is clear.
- [ ] Foreign keys are clear.
- [ ] Required columns match API request/response needs.
- [ ] Status columns use enums from `enums-and-indexes.md`.
- [ ] Soft delete is present only where useful.
- [ ] Unique constraints prevent duplicate actions.
- [ ] Indexes support expected list/query endpoints.

High-priority tables to review first:

1. `users`, `user_profiles`, `refresh_tokens`
2. `novels`, `chapters`
3. `character_profiles`, `story_timeline_events`, `plot_summaries`, `context_change_proposals`
4. `wallets`, `transactions`, `chapter_unlocks`
5. `content_filter_rules`, `moderation_reviews`, `reports`

## Step 4: Review MongoDB Collections

Read `mongodb-collections.md`.

For each collection:

- [ ] Example document matches API/SRS needs.
- [ ] Indexes support primary reads.
- [ ] Logs do not retain sensitive data unnecessarily.
- [ ] If a collection references PostgreSQL IDs, ID type is documented as string.
- [ ] Retention policy is considered for logs/evidence.

High-risk review items:

- [ ] `draft_chapters.content` retention and versioning.
- [ ] `comments._id` relation to moderation reviews.
- [ ] `moderation_evidence` retention and privacy.
- [ ] `copilot_generation_logs` should not store full temporary context unless intentionally approved.

## Step 5: Review API Coverage

Use the API docs to check that each endpoint can be implemented.

| API File | Database Objects |
| :--- | :--- |
| `auth-api.md` | `users`, `refresh_tokens` |
| `user-profile-api.md` | `user_profiles`, `novels`, `follows` |
| `novel-chapter-api.md` | `novels`, `chapters`, context tables, `draft_chapters` |
| `reading-api.md` | `reading_preferences`, `reading_histories`, `bookmarks` |
| `interaction-social-api.md` | `comments`, `likes`, `follows`, `notifications`, `device_tokens` |
| `payment-wallet-api.md` | `wallets`, `transactions`, `chapter_unlocks`, `deposit_sessions`, `withdraw_requests` |
| `ai-copilot-api.md` | context tables, `context_change_proposals`, Copilot Mongo collections |
| `content-control-api.md` | `content_filter_rules`, `moderation_reviews`, `reports`, `moderation_evidence` |
| `admin-api.md` | users, taxonomy, withdraws, dashboard aggregation |

Checklist:

- [ ] Every create/update endpoint has a target table/collection.
- [ ] Every list endpoint has supporting indexes.
- [ ] Every state transition has a status column.
- [ ] Every cross-service flow has a shared reference ID.

## Step 6: Review Approved Decisions

Review the frozen decisions in `approved-decisions.md`:

- [ ] Latest approved/published chapter content is stored in PostgreSQL `chapters.content`.
- [ ] Editable draft/autosave content is stored in MongoDB `draft_chapters`.
- [ ] Full draft version history is deferred; MVP keeps latest draft plus numeric `version`.
- [ ] MongoDB comments include UUID `commentId`; API/moderation use `commentId`.
- [ ] `character_relationships` is included in MVP.
- [ ] Moderation evidence and Copilot logs are retained for 90 days.
- [ ] Rejected context proposals are retained for 180 days, then archived/deleted.

## Suggested Comment Format

Use this format during review:

- `BLOCKER`: Schema cannot support an API/UC or breaks ownership.
- `QUESTION`: Clarification needed without reopening approved decisions.
- `NIT`: Naming/style/detail improvement.

Examples:

- `BLOCKER: reading-api.md needs /reading/library/me but bookmarks table lacks created_at index.`
- `QUESTION: Clarify who owns retention cleanup implementation.`
- `NIT: Rename event_order to sequence_number?`

## Schema Freeze Criteria

The database design is ready for implementation when:

- [ ] All `BLOCKER` comments are resolved.
- [ ] Approved decisions are accepted or explicitly changed by the team.
- [ ] Table/collection names are frozen.
- [ ] Enum values are frozen.
- [ ] Critical indexes are agreed.
- [ ] API docs and DB docs use the same resource ownership.
