# Novel and chapter comments

Comments are distinct from 1–10 ratings and text reviews. They reuse the existing
MongoDB comments collection and PostgreSQL content-control workflow.

## Endpoints

All paths use the existing `/api/v1` prefix and standard response envelope.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /novels/:novelId/comments | Novel-level discussion, excluding chapter comments |
| POST | /novels/:novelId/comments | Create a novel-level comment |
| GET | /chapters/:chapterId/comments | Comments for this chapter only |
| POST | /chapters/:chapterId/comments | Create a chapter comment; optional paragraphOffset retained |
| PATCH | /comments/:commentId | Owner edits content; reruns moderation |
| DELETE | /comments/:commentId | Owner or admin soft-deletes; returns 204 |

POST/PATCH body: `{ "content": "Your comment" }`. Content is trimmed and must
contain 1–2,000 characters. Whitespace-only and oversized submissions return 400.
GET supports page (default 1), limit (default 20, maximum 100), and optional
paragraphOffset for chapter comments. The web UI uses 10 comments per page.
Sorting is newest creation first with comment ID as a stable tie breaker.

## Permissions and visibility

- Public reads require the novel and, if applicable, chapter to be published and
  nondeleted. Private/unpublished targets return 404, including for owners.
- Writes require a registered, active, nondeleted account. Its current database
  role must match the JWT; stale/locked/deleted accounts receive 403. Reader,
  author and admin accounts may participate. Guests receive 401 on writes.
- Only the owner may edit text. Admins may delete others' comments through the
  existing moderation policy; authors cannot edit or delete readers' comments.
- Guests/other readers see APPROVED comments only. The active owner also sees
  their own PENDING_MODERATION and REJECTED comments and may edit or delete them.
- Comments on VIP chapters do not grant access to chapter prose. Existing chapter
  unlock rules and reader page access remain unchanged.

List items include commentId, novelId, chapterId (null for novel-level comments),
userId, displayName, avatarUrl, paragraphOffset, content, status, createdAt and
updatedAt. Public responses omit account emails and internal moderation IDs.
Deleted account profiles use a neutral fallback name. Metadata includes page,
limit, totalItems and totalPages; totals reflect the caller's visible comments.

## Storage and moderation

Existing chapter documents remain compatible. Novel comments use the same
collection with `chapterId: null`. A compound novel/chapter/status/date index
is ensured during MongoDB startup; no PostgreSQL migration or data reset is needed.

Unflagged text is approved automatically. Filter matches enter the existing
moderation queue; approval/rejection works for both comment scopes. Editing
reruns the filter. Older moderation decisions cannot replace a newer clean edit,
and moderation updates cannot restore soft-deleted comments.

The UI reuses the existing POST /reports endpoint for reporting comments, with a
required reason. Existing admin decisions can remove reported comments and notify
the affected accounts. No new moderation workflow or author privilege is added.

## Verification

The opt-in `comments.integration.test.ts` uses isolated PostgreSQL and MongoDB
test stores and cleans them up. It verifies HTTP auth, validation, names/avatar
fields, scope separation, draft exclusion, pagination, locked/deleted/stale-role
accounts, ownership, pending/rejected visibility, stale moderation, report
resolution and soft deletion.

From backend:

```powershell
$env:RUN_COMMENT_TESTS='1'
node --env-file=.env.example --import tsx --test src/modules/interactions/comments.integration.test.ts
```

Browser checks covered real create/edit/delete at both scopes, guest read-only
access, author permissions, report form, and Light/Dark mobile layouts. Temporary
QA comments were deleted through the application API after verification.
