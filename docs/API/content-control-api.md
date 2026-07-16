# Content Control & Moderation API

Related SRS: `docs/SRS/content-control-moderation-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `ContentControlCheck` | Rule/list check result for novel, chapter, or comment content. |
| `ModerationReview` | Review queue item created from a rule/filter hit or user report. |
| `ModerationEvidence` | Internal rule/filter/report evidence used by Admin review. |
| `UserReport` | User-submitted report against Novel, Chapter, Comment, or User. |

## System Check Endpoints

These endpoints are called by backend modules, not directly by normal clients.

### POST /content-control/check

Check content with keyword/rule filters.

**Auth:** Required  
**Roles:** System, Admin

**Request**

```json
{
  "targetType": "CHAPTER",
  "targetId": "chapter_123",
  "content": "Content to check...",
  "submittedBy": "user_123"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "result": "PASS",
    "moderationRequired": false,
    "moderationReviewId": null
  },
  "error": null,
  "meta": {}
}
```

**Alternative Response**

```json
{
  "success": true,
  "data": {
    "result": "NEED_ADMIN_REVIEW",
    "moderationRequired": true,
    "moderationReviewId": "review_123"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `MODERATION_001`, `VALIDATION_001`

## Report Endpoints

### POST /reports

Create a user report against content or user.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "targetType": "COMMENT",
  "targetId": "comment_123",
  "reason": "HARASSMENT",
  "description": "This comment contains abusive language."
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "reportId": "report_123",
    "moderationReviewId": "review_123",
    "status": "PENDING"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `MODERATION_004`, `VALIDATION_001`

## Admin Moderation Endpoints

### GET /admin/moderation/reviews

List moderation review queue items.

**Auth:** Required  
**Roles:** Admin

**Query**

| Query | Description |
| :--- | :--- |
| `targetType` | `NOVEL`, `CHAPTER`, `COMMENT`, or `USER`. |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, or `REVISION_REQUIRED`. |
| `source` | `KEYWORD_FILTER` or `USER_REPORT`. |
| `page`, `limit` | Pagination conventions. |

### GET /admin/moderation/reviews/{reviewId}

Get a moderation review detail including safe evidence summary.

**Auth:** Required  
**Roles:** Admin

**Response**

```json
{
  "success": true,
  "data": {
    "reviewId": "review_123",
    "targetType": "CHAPTER",
    "targetId": "chapter_123",
    "status": "PENDING",
    "source": "KEYWORD_FILTER",
    "evidenceSummary": {
      "matchedRules": ["toxic_phrase_rule_001"],
      "reportCount": 0
    }
  },
  "error": null,
  "meta": {}
}
```

### POST /admin/moderation/reviews/{reviewId}/resolve

Resolve a moderation review and propagate the decision to the owner service.

**Auth:** Required  
**Roles:** Admin

**Request**

```json
{
  "decision": "REJECTED",
  "reason": "Content violates platform policy.",
  "action": "HIDE_CONTENT"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "reviewId": "review_123",
    "status": "REJECTED",
    "targetType": "CHAPTER",
    "targetId": "chapter_123"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `ADMIN_001`, `ADMIN_002`, `ADMIN_003`, `MODERATION_002`
