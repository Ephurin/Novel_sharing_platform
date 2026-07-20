# Phase 4 Content Control + Interaction Checklist

Use this checklist after Phase 3 is approved.

Phase 4 implements rule/list based moderation and basic chapter comments. It does not use LLM/AI for moderation.

## 1. Implemented Scope

- [x] Add `content_filter_rules` table.
- [x] Add `moderation_reviews` table.
- [x] Add `reports` table.
- [x] Add report `description` column for user-provided report details.
- [x] Seed demo keyword rules: `badword`, `harassment`.
- [x] Add MongoDB `moderation_evidence` writes.
- [x] Add `POST /api/v1/content-control/check`.
- [x] Add `POST /api/v1/reports`.
- [x] Add `GET /api/v1/admin/moderation/reviews`.
- [x] Add `GET /api/v1/admin/moderation/reviews/{reviewId}`.
- [x] Add `POST /api/v1/admin/moderation/reviews/{reviewId}/resolve`.
- [x] Add MongoDB `comments` collection.
- [x] Add UUID `commentId` for comments.
- [x] Add `POST /api/v1/chapters/{chapterId}/comments`.
- [x] Add `GET /api/v1/chapters/{chapterId}/comments`.
- [x] Add `PATCH /api/v1/comments/{commentId}`.
- [x] Add `DELETE /api/v1/comments/{commentId}`.
- [x] Integrate comment create/update with Content Control rule scan.
- [x] Propagate admin moderation decision back to comment status.

## 2. Validation

- [x] `npm.cmd --prefix backend run typecheck` passes.
- [x] `npm.cmd --prefix backend run build` passes.
- [x] `npm.cmd --prefix backend run db:migrate` applies `004_content_control.sql` and `005_reports_description.sql`.
- [x] Clean comment returns `APPROVED`.
- [x] Comment containing demo keyword returns `PENDING_MODERATION`.
- [x] Only approved comments are visible in public comment list.
- [x] User report creates or links a moderation review.
- [x] Admin can list pending moderation reviews.
- [x] Admin can inspect moderation evidence summary.
- [x] Admin can resolve a pending review.

## 3. Manual Review Guide

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Postman collection:

```txt
docs/API/postman/phase-4-content-control-interaction.postman_collection.json
```

Create or reuse:

- `reader02` with role `ADMIN`;
- `reader03` with role `AUTHOR`;
- `reader04` with role `READER`;
- password for all three accounts: `StrongPassword123!`;
- one existing `chapterId` from Phase 2/3.

If needed, update role in PostgreSQL:

```sql
update users
set role = 'ADMIN',
    updated_at = now()
where email = 'admin@example.com';
```

### 3.1 Clean Comment

```http
POST http://localhost:4000/api/v1/chapters/{chapterId}/comments
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "content": "Lovely chapter.",
  "paragraphOffset": 1
}
```

Expected:

- `status = APPROVED`.

### 3.2 Flagged Comment

```http
POST http://localhost:4000/api/v1/chapters/{chapterId}/comments
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "content": "This contains badword.",
  "paragraphOffset": 1
}
```

Expected:

- `status = PENDING_MODERATION`;
- `moderationReviewId` is not null;
- MongoDB `moderation_evidence` contains the matched rule summary.

### 3.3 Public Comment List

```http
GET http://localhost:4000/api/v1/chapters/{chapterId}/comments
```

Expected:

- approved comments are visible;
- pending comments are hidden from the public list.

### 3.4 User Report

```http
POST http://localhost:4000/api/v1/reports
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "targetType": "COMMENT",
  "targetId": "{commentId}",
  "reason": "HARASSMENT",
  "description": "Report description."
}
```

Expected:

- response includes `reportId`;
- response includes `moderationReviewId`;
- `status = PENDING`.

### 3.5 Admin Review Queue

```http
GET http://localhost:4000/api/v1/admin/moderation/reviews?status=PENDING
Authorization: Bearer <ADMIN_TOKEN>
```

Expected:

- pending keyword/report reviews are listed.

### 3.6 Review Detail

```http
GET http://localhost:4000/api/v1/admin/moderation/reviews/{reviewId}
Authorization: Bearer <ADMIN_TOKEN>
```

Expected:

- response includes `evidenceSummary`;
- keyword reviews include matched rules;
- user report reviews include report count.

### 3.7 Resolve Review

```http
POST http://localhost:4000/api/v1/admin/moderation/reviews/{reviewId}/resolve
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "decision": "REJECTED",
  "reason": "Content violates demo policy.",
  "action": "HIDE_CONTENT"
}
```

Expected:

- review status changes from `PENDING` to `REJECTED`;
- if target is a comment, comment status is also updated.

## 4. Phase 4 Done Criteria

- [x] Content Control uses keyword/rule filtering only.
- [x] Content Control does not call LLM/AI.
- [x] Clean comments become `APPROVED`.
- [x] Flagged comments become `PENDING_MODERATION`.
- [x] Reports create/link moderation reviews.
- [x] Admin can list/detail/resolve moderation reviews.
- [x] Admin resolve updates moderated comment status.
- [x] Mongo comments use UUID `commentId`.
- [x] Phase 4 reviewed and approved.

If approved, continue to Phase 5: Reader Experience.
