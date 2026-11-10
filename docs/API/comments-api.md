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
text. Otherwise whitespace-only submissions return 400. User-uploaded GIFs are
paused until staged media moderation is available. Uploads and comment writes
with a local GIF attachment return 400 with `GIF_UPLOAD_DISABLED`; existing local
GIF URLs return 404 with `Cache-Control: no-store`. Emoji use
ordinary Unicode text. The UI supports bold and italic formatting.

The editor displays formatting while composing and serializes to the existing
Markdown-compatible content field. The 2,000-character limit includes stored marks.
GIPHY attachments store an alphanumeric `gifId`, with a maximum length of 80,
and a null `imageUrl`. The backend verifies the ID through GIPHY's Get GIF by ID
endpoint and accepts provider ratings `g`, `pg` and `pg-13`. Missing, malformed,
unrated and restricted GIFs return 400. Provider failures or missing credentials
return 503. Metadata requests time out after five seconds.
Legacy edits preserve omitted attachment fields and repeat validation and review.
Owners of legacy local GIF comments can remove the attachment to edit or repost.

### GIPHY search configuration

Set `GIPHY_PUBLIC_API_KEY` in the root `.env` for Docker Compose or in
`backend/.env` for local development, then restart the backend. This credential is
explicitly public and is returned by `GET /media/giphy-config` as nullable
`apiKey` with caching disabled. Use a dedicated browser credential, set provider
quotas and referrer restrictions where supported, and monitor usage in GIPHY's
dashboard. Search and display requests go directly from the browser to GIPHY.

`GIPHY_API_KEY` is an optional private credential used only by backend validation.
It is never included in the configuration response. The backend falls back to the
public credential when a private credential is absent. Use the private credential
when browser-key restrictions block server lookups. Each GIF write and manual
approval performs one metadata lookup, which consumes provider quota. Choose
dashboard quotas and production access for the expected traffic before release.

Authenticated image uploads are limited to 20 attempts per account per ten
minutes, including invalid uploads. Responses return 429 and `Retry-After` at the
limit. GIF writes and approval checks also share a 60-lookups-per-account limit per ten
minutes and return 429 when exhausted. Quotas count invalid IDs and provider errors.
Both bounded limiters operate per backend process. A deployment with
multiple processes needs a shared quota at its gateway. Retained GIF files are
blocked by the application. Purge previously cached local GIF responses when
deploying because earlier versions served them with long-lived cache headers.

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

Unflagged text-only comments are approved automatically. Every GIF comment,
reply and edit enters the existing moderation queue, including GIF-only posts
and clean text with a GIF. Administrators see the submitted GIF in review details
and the server verifies its provider metadata again before approval. Guests and
other users see the attachment only after manual approval. An internal media
approval flag also hides legacy attachments that were automatically approved.

Edits and review decisions serialize through a per-comment PostgreSQL advisory
lock. Attachment edits supersede earlier pending reviews and create a new review
with a submitted-content snapshot. An older review returns 409, and conditional
MongoDB updates prevent its result from approving a newly edited attachment.
Removing an attachment restores the ordinary text moderation policy.

For keyword-filter/GIF comment reviews, PostgreSQL retains the committed decision
if the subsequent MongoDB update fails. An active content administrator can retry
`POST /admin/moderation/reviews/{reviewId}/resolve` with the same decision and the
same review ID to finish that update. The retry preserves the original reviewer,
reason, timestamp and audit event; it cannot change the committed decision.
It takes the comment lock, rereads the stored review, and conditionally updates
only a nondeleted pending comment still linked to that review ID. An edited,
deleted or superseded comment returns 409. GIF approval retries revalidate provider
metadata and remain hidden if validation fails. Repeating an already applied
decision returns success without resetting notifications or comment timestamps.
This bounded recovery is request-driven; no automatic reconciliation worker is
added, and other publication/report workflows keep their existing retry rules.

The UI reuses the existing POST /reports endpoint for reporting comments, with a
required reason. Existing admin decisions can remove reported comments and notify
the affected accounts. No new moderation workflow or author privilege is added.

## Verification

The opt-in `comments.integration.test.ts` uses isolated PostgreSQL and MongoDB
test stores and cleans them up. It verifies HTTP auth, validation, names/avatar
fields, scope separation, draft exclusion, pagination, locked/deleted/stale-role
accounts, ownership, pending/rejected visibility, stale moderation, report
resolution and soft deletion. Media cases use fixture provider metadata and cover
unsafe/unrated/unknown IDs, provider outages, pending GIF-only posts, reply
visibility, repeated and concurrent attachment edits, stale approvals and legacy
file access. Media unit tests also cover private-key handling and upload quotas.
Failure-injection tests interrupt the MongoDB projection after the PostgreSQL
decision commits, then recover approval/rejection with the same review ID.
They also cover simultaneous retries, provider failure during recovery, unchanged
audit/notification state, and rejection of retries after comment edits or deletion.

From backend:

```powershell
$env:RUN_COMMENT_TESTS='1'
node --env-file=.env.example --import tsx --test src/modules/interactions/comments.integration.test.ts
```

Browser checks covered real create/edit/delete at both scopes, guest read-only
access, author permissions, report form, and Light/Dark mobile layouts. Temporary
QA comments were deleted through the application API after verification.
