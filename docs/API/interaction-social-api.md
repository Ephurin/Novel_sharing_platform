# Interaction & Social API

Related SRS: `docs/SRS/interaction-social-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `Comment` | Chapter or paragraph-level reader comment. |
| `Like` | Reader's like on a novel. |
| `Follow` | Reader follows an author. |
| `Notification` | In-app notification and push payload log. |

## Comments

### POST /chapters/{chapterId}/comments

Create a comment for a chapter or paragraph.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "content": "This paragraph is beautiful.",
  "paragraphOffset": 12
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "commentId": "comment_123",
    "chapterId": "chapter_123",
    "status": "APPROVED"
  },
  "error": null,
  "meta": {}
}
```

**Notes**

- Interaction Service calls Content Control before public display.
- If Content Control requires Admin review, response status may be `PENDING_MODERATION`.

**Errors:** `CONTENT_001`, `COMMENT_001`, `MODERATION_001`

### GET /chapters/{chapterId}/comments

List approved comments for a chapter.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `paragraphOffset` | Optional paragraph-specific comments. |
| `page`, `limit` | Pagination conventions. |

### PATCH /comments/{commentId}

Update current user's comment if still editable.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Errors:** `COMMENT_001`, `CONTENT_001`, `AUTH_008`

### DELETE /comments/{commentId}

Delete current user's comment or admin-moderated comment.

**Auth:** Required  
**Roles:** Reader, Author, Admin

## Likes

### POST /novels/{novelId}/likes

Like a novel.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "novelId": "novel_123",
    "liked": true,
    "likesCount": 121
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `INTERACTION_001`

### DELETE /novels/{novelId}/likes/me

Unlike a novel.

**Auth:** Required  
**Roles:** Reader, Author, Admin

## Follows

### POST /authors/{authorId}/follow

Follow an author.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Errors:** `NOT_FOUND_001`, `INTERACTION_001`

### DELETE /authors/{authorId}/follow

Unfollow an author.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### GET /authors/{authorId}/followers/count

Get follower count for an author.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

## Notifications

### GET /notifications

List current user's notifications.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `status` | `READ` or `UNREAD`. |
| `type` | Notification type. |

**Notification Types**

| Type | Description |
| :--- | :--- |
| `NEW_CHAPTER` | Followed/subscribed novel has a new chapter. |
| `NOVEL_REMOVED_BY_ADMIN` | Author-owned novel was removed by Admin. |
| `NOVEL_RESTORED_BY_ADMIN` | Author-owned novel was restored by Admin after a previous removal. |

### PATCH /notifications/{notificationId}/read

Mark notification as read.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### POST /notifications/device-token

Register/update current device push token.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "provider": "FCM",
  "deviceToken": "fcm_device_token"
}
```
