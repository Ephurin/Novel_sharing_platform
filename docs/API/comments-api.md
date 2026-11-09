# Novel and chapter comments

Comments are distinct from 1–10 ratings and text reviews. They reuse the existing
MongoDB comments collection and PostgreSQL content-control workflow.

## Endpoints

All paths use the existing `/api/v1` prefix and standard response envelope.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /novels/:novelId/comments | General discussion by default, with published chapter comments included using `scope=ALL` |
| POST | /novels/:novelId/comments | Create a novel-level comment |
| GET | /chapters/:chapterId/comments | Comments for this chapter only |
| POST | /chapters/:chapterId/comments | Create a chapter comment; optional paragraphOffset retained |
| PATCH | /comments/:commentId | Owner edits content; reruns moderation |
| DELETE | /comments/:commentId | Owner or admin soft-deletes; returns 204 |
| POST | /comments/:commentId/replies | Active accounts reply to an approved root comment |
| GET | /comments/:commentId/replies | Paginated replies in creation order |
| PUT | /comments/:commentId/reaction | Set `reaction` to `LIKE`, `DISLIKE`, or `null` |

POST/PATCH accepts `content`, optional `isSpoiler`, and optional nullable `imageUrl` or `gifId`.
Content is trimmed and limited to 2,000 characters. An attachment allows empty
text. Otherwise whitespace-only submissions return 400. GIF URLs use the local
`/api/v1/media/{uuid}.gif` path returned by the authenticated media upload endpoint.
Uploads inspect the image signature and accept GIF files up to 1 MB. Emoji use
ordinary Unicode text. The UI supports bold and italic formatting.

The editor displays formatting while composing and serializes to the existing
Markdown-compatible content field. The 2,000-character limit includes stored marks.
GIPHY attachments store an alphanumeric `gifId`, with a maximum length of 80,
and a null `imageUrl`. An uploaded GIF uses `imageUrl` and a null `gifId`.
Legacy edits preserve omitted attachment fields. Each comment accepts one GIF.

### GIPHY search configuration

Set `GIPHY_API_KEY` in the root `.env` for Docker Compose or in `backend/.env`
for local backend development, then recreate/restart the backend. The browser
reads the public client key from `GET /media/giphy-config`, which returns a
nullable `apiKey` and disables response caching. Search and media requests go
directly to GIPHY. Provider responses and URLs remain transient in the browser.

The picker supports Trending, keyword Search, and pagination. GIF lookup by ID
resolves the current provider URL when displaying a saved attachment. Missing
configuration produces a setup message. Provider errors offer retry.

The attribution images in `web/public/giphy` are the static marks from the
[official attribution archive](https://media.giphy.com/giphy-attribution-marks.zip).
Integration follows the [GIPHY API documentation](https://developers.giphy.com/docs/api/).

Existing comments default to `isSpoiler=false` and `imageUrl=null`. Legacy edits
that omit these fields preserve their stored values. Replies inherit the parent
spoiler flag. The UI conceals spoiler text and GIF content until explicitly opened.
GIF playback requires an explicit action when reduced motion is enabled.
GET supports page (default 1), limit (default 20, maximum 100), and optional
paragraphOffset for chapter comments. The web UI uses 10 comments per page.
Sorting is newest creation first with comment ID as a stable tie breaker.

## Permissions and visibility

- Public reads require the novel and, if applicable, chapter to be published and
  nondeleted. Private/unpublished targets return 404, including for owners.
- Writes require a registered, active, nondeleted account. HTTP authentication
  uses its current database role. Locked/deleted accounts receive 403. Reader,
  author and admin accounts may participate. Guests receive 401 on writes.
- Only the owner may edit text. Entitled admins and the novel's author can delete
  comments through the existing policy. All active accounts can reply to approved root comments.
- Guests/other readers see APPROVED comments only. The active owner also sees
  their own PENDING_MODERATION and REJECTED comments and may edit or delete them.
- Comments on VIP chapters do not grant access to chapter prose. Existing chapter
  unlock rules and reader page access remain unchanged.

List items include commentId, novelId, chapterId (null for novel-level comments),
userId, displayName, avatarUrl, paragraphOffset, content, status, createdAt and
updatedAt. Public responses omit account emails and internal moderation IDs.
They also include `chapterNumber`, `chapterTitle`, `parentCommentId`, `repliesCount`,
`isSpoiler`, `imageUrl`, `likesCount`, `dislikesCount`, and the caller's nullable
`myReaction`. General discussion has a null `chapterId`. The public combined feed
excludes unpublished and deleted chapters. Chapter feeds remain chapter-scoped.

Each active account can hold one reaction per approved comment or reply. Repeating
the same PUT is idempotent. Switching reactions updates both counts. Sending null
removes the reaction. Guests can read counts. Pending, deleted, and unpublished
targets reject reactions. Author and administrator deletion permissions still apply.
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
