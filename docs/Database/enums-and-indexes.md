# Enums, Constraints, and Indexes

## Shared Enum Style

Use `UPPER_SNAKE_CASE` for enum values stored in the database.

## Enums

### User

```txt
USER_ROLE = GUEST, READER, AUTHOR, ADMIN
USER_STATUS = ACTIVE, LOCKED, DELETED
```

### Content

```txt
NOVEL_STATUS = DRAFT, PENDING_MODERATION, PUBLISHED, REJECTED, ARCHIVED
CHAPTER_STATUS = DRAFT, PENDING_MODERATION, PUBLISHED, REJECTED, ARCHIVED
NOVEL_SERIAL_STATUS = ONGOING, COMPLETED, HIATUS
AGE_RATING = ALL, TEEN, MATURE
```

### Moderation

```txt
MODERATION_TARGET_TYPE = NOVEL, CHAPTER, COMMENT, USER
MODERATION_STATUS = PENDING, APPROVED, REJECTED, REVISION_REQUIRED
MODERATION_SOURCE = KEYWORD_FILTER, USER_REPORT
REPORT_TARGET_TYPE = NOVEL, CHAPTER, COMMENT, USER
REPORT_STATUS = OPEN, RESOLVED, REJECTED
FILTER_RULE_STATUS = ACTIVE, INACTIVE
```

### Wallet

```txt
TRANSACTION_TYPE = DEPOSIT, WITHDRAW, UNLOCK, DONATE
TRANSACTION_STATUS = PENDING, SUCCESS, FAILED
```

### Context & Copilot

```txt
CONTEXT_SOURCE = AUTHOR_MANUAL, AICOPILOT_SUGGESTION
CONTEXT_PROPOSAL_TARGET_TYPE = CHARACTER_PROFILE, STORY_TIMELINE, PLOT_SUMMARY
CONTEXT_PROPOSAL_STATUS = PENDING, APPROVED, REJECTED
PLOT_SUMMARY_SCOPE = NOVEL, ARC, CHAPTER
CHARACTER_ROLE = PROTAGONIST, ANTAGONIST, SUPPORTING, MINOR
```

### Interaction

```txt
COMMENT_STATUS = PENDING_MODERATION, APPROVED, REJECTED, DELETED
NOTIFICATION_STATUS = UNREAD, READ
NOTIFICATION_TYPE = NEW_CHAPTER, COMMENT_REPLY, MODERATION_RESULT, WALLET, SYSTEM
```

## Naming

- Tables use plural snake case: `users`, `novels`, `chapters`.
- Primary keys use `{entity}_id`.
- Foreign keys use referenced singular name: `user_id`, `novel_id`.
- Timestamps use `created_at`, `updated_at`, `deleted_at`.
- Soft-deletable tables include `deleted_at`.

## Common Constraints

- `users.email` must be unique.
- `users.username` must be unique.
- `chapters` must be unique by `(novel_id, chapter_number)`.
- `bookmarks` must be unique by `(user_id, novel_id)`.
- `likes` must be unique by `(user_id, novel_id)`.
- `follows` must be unique by `(follower_id, author_id)`.
- `wallets.user_id` must be unique.
- `reading_histories` must be unique by `(user_id, novel_id)`.
- Context proposal approval must be idempotency-safe: approved/rejected proposals cannot be approved/rejected again.
- `plot_summaries` should keep only one current official summary per smallest context unit: one per chapter, one per arc, and one per novel.

## Recommended Indexes

| Table/Collection | Index | Purpose |
| :--- | :--- | :--- |
| `users` | `email unique` | Login and uniqueness. |
| `users` | `username unique` | Profile lookup and uniqueness. |
| `novels` | `(status, updated_at)` | Public browse. |
| `novels` | `(author_id, status)` | Author dashboard. |
| `chapters` | `(novel_id, chapter_number)` unique | Chapter list ordering. |
| `chapters` | `(status, published_at)` | Public/recent chapters. |
| `bookmarks` | `(user_id, created_at)` | Library list. |
| `likes` | `(novel_id)` | Count/aggregation. |
| `follows` | `(author_id)` | Follower notification fan-out. |
| `transactions` | `(wallet_id, created_at)` | Wallet history. |
| `transactions` | `(type, status)` | Admin/payment review. |
| `context_change_proposals` | `(novel_id, status)` | Author review queue. |
| `plot_summaries` | `(novel_id, scope, arc_name, start_chapter_number)` | Arc summaries ordered by story/chapter sequence. |
| `reading_histories` | `(user_id, updated_at)` | Continue reading. |
| `content_filter_rules` | `(status, severity)` | Active rule lookup. |
| `moderation_reviews` | `(target_type, status)` | Admin moderation queue. |
| `moderation_reviews` | `(target_type, target_id)` | Find review by content/user target. |
| `reports` | `(target_type, target_id, status)` | Aggregate reports by target. |
| `comments` | `{ chapterId: 1, status: 1, paragraphOffset: 1 }` | Chapter/inline comments. |
| `notifications` | `{ userId: 1, status: 1, createdAt: -1 }` | Notification list. |
| `draft_chapters` | `{ chapterId: 1, updatedAt: -1 }` | Draft recovery. |
