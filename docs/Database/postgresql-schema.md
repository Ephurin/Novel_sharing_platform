# PostgreSQL Schema

This document defines the relational source-of-truth schema for core business data.

## 1. Auth & User Profile

### users

Stores account identity and role metadata.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | PK | Internal user ID. |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Login email. |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Public handle. |
| `password_hash` | TEXT | NULL | Null for OAuth-only accounts. |
| `role` | USER_ROLE | NOT NULL | `READER`, `AUTHOR`, `ADMIN`. |
| `status` | USER_STATUS | NOT NULL, default `ACTIVE` | Account state. |
| `oauth_provider` | VARCHAR(50) | NULL | Google/Facebook/etc. |
| `oauth_subject` | VARCHAR(255) | NULL | Provider subject ID. |
| `last_login_at` | TIMESTAMPTZ | NULL | Last successful login. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |

**Indexes**

- `UNIQUE(email)`
- `UNIQUE(username)`
- `INDEX(role, status)`

### user_profiles

Stores profile metadata separate from authentication credentials.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | PK, FK `users.user_id` | One-to-one profile. |
| `display_name` | VARCHAR(100) | NULL | Display name. |
| `bio` | TEXT | NULL | Public profile bio. |
| `avatar_url` | TEXT | NULL | Avatar image URL. |
| `language` | VARCHAR(10) | NOT NULL, default `vi` | User language setting. |
| `notification_enabled` | BOOLEAN | NOT NULL, default true | In-app/push preference. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

### refresh_tokens

Stores refresh-token sessions for revocation/logout.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `refresh_token_id` | UUID | PK | Token row ID. |
| `user_id` | UUID | FK `users.user_id`, NOT NULL | Token owner. |
| `token_hash` | TEXT | UNIQUE, NOT NULL | Hash only, never raw token. |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Expiry. |
| `revoked_at` | TIMESTAMPTZ | NULL | Logout/revocation. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

**Indexes**

- `INDEX(user_id, expires_at)`

## 2. Novel & Chapter

### novels

Stores novel metadata and public counters.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `novel_id` | UUID | PK | Novel ID. |
| `author_id` | UUID | FK `users.user_id`, NOT NULL | Author. |
| `title` | VARCHAR(255) | NOT NULL | Less than 255 characters. |
| `slug` | VARCHAR(255) | UNIQUE, NOT NULL | SEO/public URL slug. |
| `synopsis` | TEXT | NOT NULL | Minimum length rule in service layer. |
| `cover_image_url` | TEXT | NULL | Cover image URL. |
| `genre_id` | UUID | FK `genres.genre_id`, NULL | Main genre. |
| `serial_status` | NOVEL_SERIAL_STATUS | NOT NULL, default `ONGOING` | Ongoing/completed/hiatus. |
| `status` | NOVEL_STATUS | NOT NULL, default `DRAFT` | Publication state. |
| `age_rating` | AGE_RATING | NOT NULL, default `TEEN` | Age classification. |
| `likes_count` | INTEGER | NOT NULL, default 0 | Denormalized count. |
| `views_count` | INTEGER | NOT NULL, default 0 | Denormalized count. |
| `chapters_count` | INTEGER | NOT NULL, default 0 | Denormalized count. |
| `published_at` | TIMESTAMPTZ | NULL | First published time. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |

**Indexes**

- `INDEX(author_id, status)`
- `INDEX(status, updated_at)`
- `INDEX(genre_id, status)`

### chapters

Stores chapter metadata and latest approved/published content snapshot. Editable draft/autosave content lives in MongoDB `draft_chapters`.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `chapter_id` | UUID | PK | Chapter ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `title` | VARCHAR(100) | NOT NULL | Chapter title. |
| `chapter_number` | INTEGER | NOT NULL | Ordering inside novel. |
| `content` | TEXT | NULL | Published/latest approved content. |
| `word_count` | INTEGER | NOT NULL, default 0 | Derived count. |
| `is_vip` | BOOLEAN | NOT NULL, default false | Paid chapter flag. |
| `price_coins` | INTEGER | NOT NULL, default 0 | Required if VIP. |
| `status` | CHAPTER_STATUS | NOT NULL, default `DRAFT` | Publication state. |
| `published_at` | TIMESTAMPTZ | NULL | Published time. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |

**Constraints**

- `UNIQUE(novel_id, chapter_number)`
- `CHECK(price_coins >= 0)`

**Indexes**

- `INDEX(novel_id, chapter_number)`
- `INDEX(status, published_at)`

### genres

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `genre_id` | UUID | PK | Genre ID. |
| `name` | VARCHAR(100) | UNIQUE, NOT NULL | Display name. |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL/API slug. |
| `description` | TEXT | NULL | Optional description. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

### tags

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `tag_id` | UUID | PK | Tag ID. |
| `name` | VARCHAR(100) | UNIQUE, NOT NULL | Display name. |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | URL/API slug. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

### novel_tags

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Novel. |
| `tag_id` | UUID | FK `tags.tag_id`, NOT NULL | Tag. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

**Primary Key**

- `(novel_id, tag_id)`

## 3. Authoring Context & Writing Copilot

### character_profiles

Official character data. May be created manually or from approved Copilot proposals.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `character_id` | UUID | PK | Character ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `name` | VARCHAR(120) | NOT NULL | Character name. |
| `role` | CHARACTER_ROLE | NOT NULL | Story role. |
| `personality` | TEXT | NULL | Personality notes. |
| `description` | TEXT | NULL | Appearance/backstory. |
| `notes` | TEXT | NULL | Author notes. |
| `source` | CONTEXT_SOURCE | NOT NULL | Manual or AI-approved. |
| `source_proposal_id` | UUID | FK `context_change_proposals.proposal_id`, NULL | Approved proposal. |
| `created_by` | UUID | FK `users.user_id`, NOT NULL | Creator. |
| `updated_by` | UUID | FK `users.user_id`, NOT NULL | Last updater. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete. |

**Indexes**

- `INDEX(novel_id, name)`

### character_relationships

Optional structured relationship graph between characters.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `relationship_id` | UUID | PK | Relationship ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `source_character_id` | UUID | FK `character_profiles.character_id`, NOT NULL | Source character. |
| `target_character_id` | UUID | FK `character_profiles.character_id`, NOT NULL | Target character. |
| `relationship_type` | VARCHAR(80) | NOT NULL | Mentor, sibling, rival, etc. |
| `description` | TEXT | NULL | Relationship notes. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

### story_timeline_events

Official timeline events.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `event_id` | UUID | PK | Timeline event ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `chapter_id` | UUID | FK `chapters.chapter_id`, NULL | Related chapter. |
| `title` | VARCHAR(255) | NOT NULL | Event title. |
| `event_order` | INTEGER | NOT NULL | Ordering in story timeline. |
| `summary` | TEXT | NOT NULL | Event summary. |
| `source` | CONTEXT_SOURCE | NOT NULL | Manual or AI-approved. |
| `source_proposal_id` | UUID | FK `context_change_proposals.proposal_id`, NULL | Approved proposal. |
| `created_by` | UUID | FK `users.user_id`, NOT NULL | Creator. |
| `updated_by` | UUID | FK `users.user_id`, NOT NULL | Last updater. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(novel_id, event_order)`

### plot_summaries

Official compressed plot memory.

Each smallest context unit should have only one current official summary:

- one `CHAPTER` summary for each chapter;
- one `ARC` summary for each arc name within a novel;
- one `NOVEL` summary for the whole novel.

If summary history/versioning is needed later, use a separate revision/history table instead of storing multiple active summaries for the same unit.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `summary_id` | UUID | PK | Summary ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `chapter_id` | UUID | FK `chapters.chapter_id`, NULL | Required for chapter scope. |
| `scope` | PLOT_SUMMARY_SCOPE | NOT NULL | Novel, arc, chapter. |
| `arc_name` | VARCHAR(120) | NULL | Required for arc scope if used. |
| `start_chapter_number` | INTEGER | NULL | First chapter covered by this summary, useful for arc ordering. |
| `end_chapter_number` | INTEGER | NULL | Last chapter covered by this summary. |
| `summary` | TEXT | NOT NULL | Summary content. |
| `source` | CONTEXT_SOURCE | NOT NULL | Manual or AI-approved. |
| `source_proposal_id` | UUID | FK `context_change_proposals.proposal_id`, NULL | Approved proposal. |
| `created_by` | UUID | FK `users.user_id`, NOT NULL | Creator. |
| `updated_by` | UUID | FK `users.user_id`, NOT NULL | Last updater. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(novel_id, scope, arc_name, start_chapter_number)`
- `INDEX(chapter_id)`

**Uniqueness Rules**

- `UNIQUE(chapter_id)` for rows where `scope = CHAPTER`.
- `UNIQUE(novel_id, arc_name)` for rows where `scope = ARC`.
- `UNIQUE(novel_id)` for rows where `scope = NOVEL`.

### context_change_proposals

AI-generated proposals waiting for Author approval/rejection.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `proposal_id` | UUID | PK | Proposal ID. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Parent novel. |
| `chapter_id` | UUID | FK `chapters.chapter_id`, NULL | Source chapter. |
| `target_type` | CONTEXT_PROPOSAL_TARGET_TYPE | NOT NULL | Target context type. |
| `target_id` | UUID | NULL | Existing target row if proposal updates one. |
| `proposed_payload` | JSONB | NOT NULL | Proposed change payload. |
| `reason` | TEXT | NULL | AI explanation. |
| `confidence_score` | NUMERIC(5,4) | NULL | 0-1 score. |
| `status` | CONTEXT_PROPOSAL_STATUS | NOT NULL, default `PENDING` | Review state. |
| `created_by_ai` | BOOLEAN | NOT NULL, default true | Proposal source marker. |
| `reviewed_by` | UUID | FK `users.user_id`, NULL | Author reviewer. |
| `reviewed_at` | TIMESTAMPTZ | NULL | Review time. |
| `rejection_reason` | TEXT | NULL | Reason if rejected. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(novel_id, status)`
- `INDEX(chapter_id)`

## 4. Reading Experience

### reading_preferences

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | PK, FK `users.user_id` | Reader. |
| `font_family` | VARCHAR(80) | NULL | Font preference. |
| `font_size` | INTEGER | NOT NULL, default 18 | Font size. |
| `background` | VARCHAR(30) | NOT NULL, default `LIGHT` | Theme/background. |
| `line_height` | NUMERIC(3,2) | NOT NULL, default 1.60 | Reading line height. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

### reading_histories

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `reading_history_id` | UUID | PK | History row. |
| `user_id` | UUID | FK `users.user_id`, NOT NULL | Reader. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Novel. |
| `chapter_id` | UUID | FK `chapters.chapter_id`, NOT NULL | Last chapter. |
| `paragraph_index` | INTEGER | NOT NULL, default 0 | Last paragraph. |
| `page_offset` | NUMERIC(5,4) | NULL | 0-1 progress. |
| `read_at` | TIMESTAMPTZ | NOT NULL | Last read time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Constraints**

- `UNIQUE(user_id, novel_id)`

## 5. Interactions

### bookmarks

Reader library.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | FK `users.user_id`, NOT NULL | Reader. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Bookmarked novel. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

**Primary Key**

- `(user_id, novel_id)`

### likes

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | FK `users.user_id`, NOT NULL | Reader. |
| `novel_id` | UUID | FK `novels.novel_id`, NOT NULL | Liked novel. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

**Primary Key**

- `(user_id, novel_id)`

### follows

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `follower_id` | UUID | FK `users.user_id`, NOT NULL | Reader following. |
| `author_id` | UUID | FK `users.user_id`, NOT NULL | Followed author. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |

**Primary Key**

- `(follower_id, author_id)`

## 6. Wallet & Mock Transactions

### wallets

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `wallet_id` | UUID | PK | Wallet ID. |
| `user_id` | UUID | FK `users.user_id`, UNIQUE, NOT NULL | Owner. |
| `coins_balance` | INTEGER | NOT NULL, default 0 | Available mock Coins. |
| `locked_coins` | INTEGER | NOT NULL, default 0 | Locked for withdraw. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Constraints**

- `CHECK(coins_balance >= 0)`
- `CHECK(locked_coins >= 0)`

### transactions

Wallet ledger. All wallet changes should create a transaction row.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `transaction_id` | UUID | PK | Transaction ID. |
| `wallet_id` | UUID | FK `wallets.wallet_id`, NOT NULL | Primary wallet. |
| `counterparty_wallet_id` | UUID | FK `wallets.wallet_id`, NULL | Author/reader wallet for transfer. |
| `type` | TRANSACTION_TYPE | NOT NULL | Deposit/withdraw/unlock/donate. |
| `status` | TRANSACTION_STATUS | NOT NULL | Pending/success/failed. |
| `amount_coins` | INTEGER | NOT NULL | Positive amount. |
| `reference_type` | VARCHAR(50) | NULL | Chapter, author, deposit session, withdraw. |
| `reference_id` | UUID | NULL | Referenced resource. |
| `metadata` | JSONB | NULL | Mock payment metadata. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

### chapter_unlocks

Permanent unlock relation for VIP chapters.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `user_id` | UUID | FK `users.user_id`, NOT NULL | Reader. |
| `chapter_id` | UUID | FK `chapters.chapter_id`, NOT NULL | Unlocked chapter. |
| `transaction_id` | UUID | FK `transactions.transaction_id`, NOT NULL | Unlock transaction. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Unlock time. |

**Primary Key**

- `(user_id, chapter_id)`

### deposit_sessions

Mock deposit sessions.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `deposit_session_id` | UUID | PK | Session ID. |
| `wallet_id` | UUID | FK `wallets.wallet_id`, NOT NULL | Target wallet. |
| `package_code` | VARCHAR(50) | NOT NULL | Mock package. |
| `amount_coins` | INTEGER | NOT NULL | Coins to credit. |
| `status` | TRANSACTION_STATUS | NOT NULL, default `PENDING` | Mock payment state. |
| `transaction_id` | UUID | FK `transactions.transaction_id`, NULL | Completed transaction. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

### withdraw_requests

Author withdraw requests for mock payout.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `withdraw_request_id` | UUID | PK | Request ID. |
| `wallet_id` | UUID | FK `wallets.wallet_id`, NOT NULL | Author wallet. |
| `amount_coins` | INTEGER | NOT NULL | Requested amount. |
| `bank_account_label` | VARCHAR(255) | NOT NULL | Demo label only, no real bank data. |
| `status` | TRANSACTION_STATUS | NOT NULL, default `PENDING` | Review state. |
| `transaction_id` | UUID | FK `transactions.transaction_id`, NOT NULL | Pending transaction. |
| `reviewed_by` | UUID | FK `users.user_id`, NULL | Admin reviewer. |
| `reviewed_at` | TIMESTAMPTZ | NULL | Review time. |
| `rejection_reason` | TEXT | NULL | Rejection reason. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

## 7. Content Control, Reports, and Moderation

### content_filter_rules

Rules used by Content Control to detect toxic/sensitive terms without LLM/AI moderation.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `rule_id` | UUID | PK | Rule ID. |
| `name` | VARCHAR(255) | NOT NULL | Human-readable rule name. |
| `pattern` | TEXT | NOT NULL | Keyword, phrase, or regex-like pattern. |
| `category` | VARCHAR(100) | NOT NULL | Policy category. |
| `severity` | VARCHAR(50) | NOT NULL | LOW/MEDIUM/HIGH. |
| `status` | FILTER_RULE_STATUS | NOT NULL, default `ACTIVE` | Whether rule is active. |
| `created_by` | UUID | FK `users.user_id`, NULL | Admin creator. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(status, severity)`
- `INDEX(category)`

### moderation_reviews

Tracks Content Control review queue items and Admin decisions for novels, chapters, comments, and users.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `review_id` | UUID | PK | Review row. |
| `target_type` | MODERATION_TARGET_TYPE | NOT NULL | Novel/chapter/comment/user. |
| `target_id` | TEXT | NOT NULL | UUID or commentId string. |
| `source` | MODERATION_SOURCE | NOT NULL | Keyword filter or user report. |
| `status` | MODERATION_STATUS | NOT NULL | Pending/approved/rejected/revision required. |
| `evidence_id` | TEXT | NULL | Mongo `moderation_evidence` document ID. |
| `reviewed_by` | UUID | FK `users.user_id`, NULL | Admin reviewer. |
| `reviewed_at` | TIMESTAMPTZ | NULL | Review time. |
| `reason` | TEXT | NULL | Rejection/review reason. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(target_type, status)`
- `INDEX(target_type, target_id)`
- `INDEX(source, status)`

### reports

User reports against content or users.

| Column | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `report_id` | UUID | PK | Report ID. |
| `reporter_id` | UUID | FK `users.user_id`, NOT NULL | Reporter. |
| `target_type` | REPORT_TARGET_TYPE | NOT NULL | Novel/chapter/comment/user. |
| `target_id` | TEXT | NOT NULL | Target ID. |
| `review_id` | UUID | FK `moderation_reviews.review_id`, NULL | Linked moderation review. |
| `reason` | TEXT | NOT NULL | Report reason. |
| `status` | REPORT_STATUS | NOT NULL, default `OPEN` | Review state. |
| `resolved_by` | UUID | FK `users.user_id`, NULL | Admin resolver. |
| `resolved_at` | TIMESTAMPTZ | NULL | Resolution time. |
| `resolution` | TEXT | NULL | Resolution note. |
| `created_at` | TIMESTAMPTZ | NOT NULL | Creation time. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Update time. |

**Indexes**

- `INDEX(target_type, target_id, status)`
- `INDEX(reporter_id, created_at)`

## Approved Decisions Applied

- Latest approved/published chapter content is stored in `chapters.content`.
- Editable draft/autosave content is stored in MongoDB `draft_chapters`.
- Full draft version history is deferred; MVP keeps latest draft plus numeric `version`.
- `character_relationships` is included in MVP as a simple structured relationship table.
- MongoDB comments include a UUID `commentId`; API and Content Control moderation should use `commentId`.
