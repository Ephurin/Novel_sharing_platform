# Admin API

Related SRS: `docs/SRS/README.md`, `docs/SRS/content-control-moderation-service.md`, `docs/SRS/admin-novel-management-service.md`, `docs/SRS/payment-wallet-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `UserAdminView` | Admin-managed user account summary. |
| `Taxonomy` | Genres and tags configuration. |
| `DashboardStats` | Operational dashboard statistics. |
| `WithdrawRequest` | Author withdraw request awaiting Admin decision. |
| `AdminNovelView` | Admin-facing novel catalog item/detail. |

## Moderation

Moderation queue, user reports, and content decisions are owned by `docs/API/content-control-api.md`.

Admin Dashboard should call:

- `GET /admin/moderation/reviews`
- `GET /admin/moderation/reviews/{reviewId}`
- `POST /admin/moderation/reviews/{reviewId}/resolve`
- `POST /reports`

## User Management

### GET /admin/users

List users.

**Auth:** Required  
**Roles:** Admin

**Query:** `role`, `status`, `q`, pagination fields.

### PATCH /admin/users/{userId}/lock

Lock a user account.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Repeated policy violations."
}
```

### PATCH /admin/users/{userId}/unlock

Unlock a user account.

**Auth:** Required  
**Roles:** Admin

## Novel Management

### GET /admin/novels

List novels for Admin catalog management.

**Auth:** Required  
**Roles:** Admin

**Query:** `q`, `authorId`, `status`, pagination fields.

**Response**

```json
{
  "success": true,
  "data": [
    {
      "novelId": "novel_123",
      "title": "The Moonlit Archive",
      "authorId": "user_author_1",
      "authorUsername": "liora_writer",
      "status": "PUBLISHED",
      "chaptersCount": 12,
      "updatedAt": "2026-07-23T10:00:00Z",
      "deletedAt": null
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 1
  }
}
```

### GET /admin/novels/{novelId}

Get Admin novel detail before Admin removal/restoration actions.

**Auth:** Required  
**Roles:** Admin

**Response**

```json
{
  "success": true,
  "data": {
    "novelId": "novel_123",
    "title": "The Moonlit Archive",
    "authorId": "user_author_1",
    "authorUsername": "liora_writer",
    "status": "PUBLISHED",
    "chaptersCount": 12,
    "deletedAt": null,
    "chapters": [
      {
        "chapterId": "chapter_123",
        "chapterNumber": 1,
        "title": "Archive Door",
        "status": "PUBLISHED"
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

### DELETE /admin/novels/{novelId}

Soft-delete a novel aggregate after Admin confirmation.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Policy violation confirmed by Admin review.",
  "confirm": true
}
```

**Behavior**

- Sets `novels.deleted_at`.
- Sets `chapters.deleted_at` for chapters under the novel.
- Marks MongoDB `draft_chapters` linked to the novel/chapter IDs as deleted/archived, instead of physically deleting them.
- Excludes the novel from public/reader/author default queries.
- Creates a notification for the owning Author with type `NOVEL_REMOVED_BY_ADMIN`.
- Returns `204 No Content` when removal succeeds.

### POST /admin/novels/{novelId}/restore

Restore a novel soft-deleted by Admin.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Admin removal was reversed after review."
}
```

**Behavior**

- Clears `novels.deleted_at`.
- Clears `chapters.deleted_at` for chapters under the novel when appropriate.
- Marks MongoDB `draft_chapters` linked to the novel/chapter IDs as active again.
- Optionally creates a notification for the owning Author with type `NOVEL_RESTORED_BY_ADMIN`.

**Errors**

| Code | Condition |
| :--- | :--- |
| `AUTH_008` | Caller is not Admin. |
| `VALIDATION_001` | `confirm` is not `true`. |
| `CONTENT_001` | Novel does not exist or is already deleted. |

## Taxonomy

### GET /admin/taxonomy

List genres and tags.

**Auth:** Required  
**Roles:** Admin

### POST /admin/taxonomy/genres

Create a genre.

**Auth:** Required  
**Roles:** Admin

### POST /admin/taxonomy/tags

Create a tag.

**Auth:** Required  
**Roles:** Admin

## Withdraw Review

### GET /admin/withdraw-requests

List author withdraw requests.

**Auth:** Required  
**Roles:** Admin

### POST /admin/withdraw-requests/{withdrawRequestId}/approve

Approve mock withdraw request.

**Side effects**

- Marks the request and related withdraw transaction as `SUCCESS`.
- Sends a notification to the requester.

**Auth:** Required  
**Roles:** Admin

### POST /admin/withdraw-requests/{withdrawRequestId}/reject

Reject mock withdraw request.

**Side effects**

- Marks the request and related withdraw transaction as `FAILED`.
- Returns locked Coins to the requester wallet.
- Sends a notification to the requester with the rejection reason.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "reason": "Demo payout information is incomplete."
}
```

## Dashboard

### GET /admin/dashboard/stats

Get operational dashboard statistics.

**Auth:** Required  
**Roles:** Admin

**Response**

```json
{
  "success": true,
  "data": {
    "totalUsers": 1200,
    "totalNovels": 300,
    "pendingModerationItems": 12,
    "mockRevenueCoins": 150000
  },
  "error": null,
  "meta": {}
}
```
