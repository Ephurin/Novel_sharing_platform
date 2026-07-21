# Database Side-Effect Verification

Use this checklist after API/Web actions pass to confirm state is persisted in the expected storage.

Do not mutate data in this checklist unless the step explicitly says to perform the UI/API action first.

## 1. PostgreSQL Query Tips

Use pgAdmin Query Tool or terminal `psql`.

Example terminal pattern:

```powershell
psql "postgresql://USER:PASSWORD@localhost:5432/DATABASE"
```

Useful read-only pattern:

```sql
select * from table_name order by created_at desc limit 20;
```

## 2. MongoDB Query Tips

Use MongoDB Compass.

Common collections:

- `comments`;
- `draft_chapters` or project-specific draft collection if configured;
- `moderation_evidence`.

Use filters like:

```json
{ "chapterId": "PASTE_CHAPTER_UUID" }
```

## 3. Auth/User/Profile Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-AUTH-001 | Register user. | PostgreSQL `users` | New user row exists with expected email/username/role/status. |
| DB-AUTH-002 | Register user. | PostgreSQL `user_profiles` | Profile row exists for same `user_id`. |
| DB-AUTH-003 | Register user. | PostgreSQL `wallets` | Wallet row exists for same `user_id`. |
| DB-AUTH-004 | Update profile in UI. | PostgreSQL `user_profiles` | Changed display/bio/avatar fields persisted. |

Example:

```sql
select user_id, email, username, role, status, created_at
from users
where username in ('reader02', 'reader03', 'reader04')
order by username;
```

## 4. Author Novel/Chapter Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-AUTHOR-001 | Create novel. | PostgreSQL `novels` | Row exists with `author_id`, title, status. |
| DB-AUTHOR-002 | Update metadata. | PostgreSQL `novels` | Title/synopsis/cover fields updated. |
| DB-AUTHOR-003 | Create chapter. | PostgreSQL `chapters` | Row exists with correct `novel_id`, `chapter_number`. |
| DB-AUTHOR-004 | Save draft. | MongoDB draft storage and/or PostgreSQL chapter metadata | Draft content/title visible in author reload. |
| DB-AUTHOR-005 | Submit chapter publish. | PostgreSQL `chapters` | Status changes according to moderation/publish workflow. |

Example:

```sql
select novel_id, author_id, title, status, serial_status, updated_at
from novels
order by updated_at desc
limit 20;
```

```sql
select chapter_id, novel_id, chapter_number, title, status, is_vip, price_coins, updated_at
from chapters
where novel_id = 'PASTE_NOVEL_UUID'
order by chapter_number asc;
```

## 5. Reader Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-READER-001 | Save reading preferences. | PostgreSQL `reading_preferences` | Font/background/line-height match UI. |
| DB-READER-002 | Open chapter as logged-in reader. | PostgreSQL `reading_histories` | Latest `chapter_id` stored for `(user_id, novel_id)`. |
| DB-READER-003 | Add library item. | PostgreSQL `bookmarks` | Row exists for `(user_id, novel_id)`. |
| DB-READER-004 | Remove library item. | PostgreSQL `bookmarks` | Row removed. |
| DB-READER-005 | Like novel. | PostgreSQL likes table | Row exists; novel like count changes if maintained. |
| DB-READER-006 | Follow author. | PostgreSQL follows table | Row exists for follower/author pair. |

Example:

```sql
select *
from reading_histories
where user_id = 'PASTE_READER_USER_UUID'
order by updated_at desc;
```

```sql
select *
from bookmarks
where user_id = 'PASTE_READER_USER_UUID'
order by created_at desc;
```

## 6. Comment/Report/Moderation Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-MOD-001 | Create clean comment. | MongoDB `comments` | Comment exists and status is approved/visible as designed. |
| DB-MOD-002 | Create flagged comment. | MongoDB `comments` | Comment status becomes pending/rejected as designed. |
| DB-MOD-003 | Create flagged comment/report. | PostgreSQL `moderation_reviews` | Review row exists with target type/id/source/status. |
| DB-MOD-004 | Keyword filter hit. | MongoDB `moderation_evidence` | Evidence document exists with matched rules/categories/highlights. |
| DB-MOD-005 | User report. | PostgreSQL `reports` | Report row exists and links to review. |
| DB-MOD-006 | Admin resolve review. | PostgreSQL `moderation_reviews` | Status/reviewed_by/reviewed_at/reason updated. |

Example:

```sql
select review_id, target_type, target_id, source, status, evidence_id, reviewed_by, reviewed_at, reason
from moderation_reviews
order by created_at desc
limit 20;
```

```sql
select report_id, reporter_id, target_type, target_id, review_id, reason, created_at
from reports
order by created_at desc
limit 20;
```

## 7. Wallet Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-WALLET-001 | Register user. | PostgreSQL `wallets` | Wallet created with non-negative balance. |
| DB-WALLET-002 | Mock deposit success. | PostgreSQL wallet transaction table | `DEPOSIT` transaction exists. |
| DB-WALLET-003 | Mock deposit success. | PostgreSQL `wallets` | Balance increased exactly once. |
| DB-WALLET-004 | Unlock VIP chapter. | PostgreSQL `chapter_unlocks` | Row exists for `(user_id, chapter_id)`. |
| DB-WALLET-005 | Unlock VIP chapter. | PostgreSQL wallet transaction table | `UNLOCK` transaction exists with correct amount. |
| DB-WALLET-006 | Donate to author. | PostgreSQL wallet transaction table | `DONATE`/donation transaction exists. |
| DB-WALLET-007 | Withdraw request. | PostgreSQL withdraw table | Pending request exists. |
| DB-WALLET-008 | Admin review withdraw. | PostgreSQL withdraw table | Status/review metadata updated. |

Example:

```sql
select *
from chapter_unlocks
where user_id = 'PASTE_READER_USER_UUID'
order by created_at desc;
```

```sql
select *
from wallet_transactions
where user_id = 'PASTE_USER_UUID'
order by created_at desc
limit 50;
```

If the table names differ in the current schema, inspect `docs/Database/postgresql-schema.md` and use the equivalent wallet transaction/withdraw table.

## 8. Notification Side Effects

| ID | Action | Storage | Verification |
| :--- | :--- | :--- | :--- |
| DB-NOTI-001 | Trigger notification-producing action if available. | PostgreSQL/Mongo notification storage | Notification row/document exists. |
| DB-NOTI-002 | Mark notification read. | Notification storage | Status changes from unread to read. |
| DB-NOTI-003 | Register device token. | Device token storage | Token row/document exists for user. |

## 9. Final DB Verification Result

Record:

- action;
- expected table/collection;
- query/filter used;
- expected state;
- actual state;
- PASS/FAIL;
- screenshot/export if useful.
