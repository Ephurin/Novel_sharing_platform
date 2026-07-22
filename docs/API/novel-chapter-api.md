# Novel & Chapter API

Related SRS: `docs/SRS/novel-chapter-service.md`

## Resource Summary

| Resource | Owner | Description |
| :--- | :--- | :--- |
| `Novel` | Novel & Chapter Service | Story metadata and publication state. |
| `Chapter` | Novel & Chapter Service | Chapter metadata, content, pricing, and publication state. |
| `DraftChapter` | Novel & Chapter Service | Auto-saved chapter draft. |
| `CharacterProfile` | Novel & Chapter Service | Character context for long-form writing and Copilot. |
| `StoryTimeline` | Novel & Chapter Service | Ordered plot events. |
| `PlotSummary` | Novel & Chapter Service | Compressed narrative context. |
| `ContextChangeProposal` | Novel & Chapter Service | AI-generated context update pending Author approval. |

## Novel Endpoints

### POST /novels

Create a new novel draft.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "title": "The Moonlit Archive",
  "synopsis": "A long synopsis of at least 500 characters...",
  "genre": "FANTASY",
  "tags": ["magic", "academy"],
  "coverImageUrl": "https://example.com/cover.png"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "novelId": "novel_123",
    "title": "The Moonlit Archive",
    "status": "DRAFT",
    "authorId": "user_author_1"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_002`, `VALIDATION_001`, `AUTH_008`

### GET /novels

Search/browse public novels.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `q` | Keyword. |
| `genre` | Genre filter. |
| `status` | `ONGOING`, `COMPLETED`, etc. |
| `tag` | Tag filter. |
| `page`, `limit`, `sort`, `order` | Pagination conventions. |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "novelId": "novel_123",
      "title": "The Moonlit Archive",
      "authorId": "user_author_1",
      "status": "PUBLISHED",
      "likesCount": 120,
      "chaptersCount": 10
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### GET /novels/me

List novels owned by the current author for the Author Project Manager.

**Auth:** Required  
**Roles:** Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `q` | Search in own novel title/synopsis. |
| `status` | `DRAFT`, `PENDING_MODERATION`, `PUBLISHED`, or `REJECTED`. |
| `page`, `limit` | Pagination conventions. |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "novelId": "novel_123",
      "title": "The Moonlit Archive",
      "authorId": "user_author_1",
      "status": "DRAFT",
      "chaptersCount": 3
    }
  ],
  "error": null,
  "meta": {
    "page": 1,
    "limit": 50,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**Notes**

- This endpoint is author-facing and returns only the authenticated author's non-deleted novels.
- It is separate from public reading/search APIs so Author Project Manager never depends on global browse data.

### GET /novels/{novelId}

Get novel details.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Response:** Novel metadata, chapter summary list, author summary, and public counters.

**Errors:** `CONTENT_001`

### PATCH /novels/{novelId}

Update own novel metadata.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "title": "Updated Title",
  "synopsis": "Updated long synopsis...",
  "genre": "FANTASY",
  "tags": ["magic", "mystery"]
}
```

**Errors:** `CONTENT_001`, `CONTENT_002`, `CONTENT_005`

### DELETE /novels/{novelId}

Delete own draft novel or request deletion of published novel.

**Auth:** Required  
**Roles:** Author, Admin

**Response:** `204 No Content`

**Errors:** `CONTENT_001`, `CONTENT_004`, `CONTENT_005`

### POST /novels/{novelId}/submit-publish

Submit novel for Content Control check and publication/moderation.

- If keyword filtering passes, the novel is published immediately.
- If keyword filtering matches a rule, the novel moves to Admin moderation.

**Auth:** Required  
**Roles:** Author

**Response**

```json
{
  "success": true,
  "data": {
    "novelId": "novel_123",
    "status": "PENDING_MODERATION",
    "moderationRequired": true,
    "moderationReviewId": "review_123"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `CONTENT_004`, `CONTENT_005`

## Chapter Endpoints

### POST /novels/{novelId}/chapters

Create a chapter draft.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "title": "Chapter 1: The Door",
  "content": "Chapter content with at least 500 characters...",
  "isVip": false,
  "priceCoins": 0
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "chapterId": "chapter_123",
    "novelId": "novel_123",
    "title": "Chapter 1: The Door",
    "status": "DRAFT"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `CONTENT_003`, `CONTENT_005`

### GET /novels/{novelId}/chapters

List chapters for a novel.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Notes**

- Public users see only readable/published chapters.
- Author sees own drafts and moderation states.

### GET /chapters/{chapterId}

Get chapter content.

**Auth:** Optional for free chapters, required for VIP chapters  
**Roles:** Guest, Reader, Author, Admin

**Errors:** `CONTENT_001`, `PAYMENT_002`, `PAYMENT_003`

### PATCH /chapters/{chapterId}

Update own draft or rejected chapter.

**Auth:** Required  
**Roles:** Author

**Errors:** `CONTENT_001`, `CONTENT_003`, `CONTENT_004`, `CONTENT_005`

### POST /chapters/{chapterId}/submit-publish

Submit chapter for Content Control check and publication/moderation.

- If keyword filtering passes, the latest draft is copied into the published chapter content and the chapter is published immediately.
- If keyword filtering matches a rule, the chapter moves to Admin moderation.

**Auth:** Required  
**Roles:** Author

**Response**

```json
{
  "success": true,
  "data": {
    "chapterId": "chapter_123",
    "status": "PENDING_MODERATION",
    "moderationRequired": true,
    "moderationReviewId": "review_123"
  },
  "error": null,
  "meta": {}
}
```

## Context Endpoints

These endpoints are part of non-AI Authoring Context Core. They let Authors manage story data directly. AI/Copilot may read this data later, but AI-generated context proposals are separate Phase 10 endpoints.

### GET /novels/{novelId}/characters

List character profiles for a novel.

**Auth:** Required  
**Roles:** Author

### POST /novels/{novelId}/characters

Create a character profile.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "name": "Liora",
  "role": "PROTAGONIST",
  "description": "Archive-born protagonist with a hidden memory.",
  "personality": "Curious, stubborn, loyal",
  "notes": "Has a hidden memory of the archive.",
  "source": "AUTHOR_MANUAL"
}
```

Relationships are managed through the dedicated character relationship endpoints.

### PATCH /characters/{characterId}

Update a character profile.

**Auth:** Required  
**Roles:** Author

### DELETE /characters/{characterId}

Delete a character profile.

**Auth:** Required  
**Roles:** Author

### GET /novels/{novelId}/character-relationships

List character relationships for a novel.

**Auth:** Required  
**Roles:** Author

### POST /novels/{novelId}/character-relationships

Create a relationship between two characters in the same novel.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "sourceCharacterId": "character_123",
  "targetCharacterId": "character_456",
  "relationshipType": "MENTOR",
  "description": "Cael teaches Liora how to read archive glyphs."
}
```

MVP note: `character_relationships` currently stores `relationshipType` and `description`; relationship `status` and `source` are deferred until the database schema is expanded.

### PATCH /character-relationships/{relationshipId}

Update a character relationship.

**Auth:** Required  
**Roles:** Author

### DELETE /character-relationships/{relationshipId}

Delete a character relationship.

**Auth:** Required  
**Roles:** Author

### GET /novels/{novelId}/timeline-events

List story timeline events.

**Auth:** Required  
**Roles:** Author

### POST /novels/{novelId}/timeline-events

Create a story timeline event.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "title": "Liora enters the archive",
  "eventOrder": 1,
  "chapterId": "chapter_123",
  "summary": "Liora discovers the sealed archive door.",
  "source": "AUTHOR_MANUAL"
}
```

MVP note: timeline-character linking is deferred until a timeline-character join table is added.

### PATCH /timeline-events/{eventId}

Update a story timeline event.

**Auth:** Required  
**Roles:** Author

### DELETE /timeline-events/{eventId}

Delete a story timeline event.

**Auth:** Required  
**Roles:** Author

### GET /novels/{novelId}/plot-summaries

List plot summaries.

**Auth:** Required  
**Roles:** Author

**Query**

| Query | Description |
| :--- | :--- |
| `scope` | `NOVEL`, `ARC`, or `CHAPTER`. |
| `arcName` | Arc name when querying summaries for a specific arc. |
| `orderBy` | Defaults to `startChapterNumber` for arc/chapter summaries. |

### POST /novels/{novelId}/plot-summaries

Create or update a plot summary.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "scope": "CHAPTER",
  "chapterId": "chapter_123",
  "arcName": null,
  "startChapterNumber": 1,
  "endChapterNumber": 1,
  "summary": "Summary text...",
  "source": "AUTHOR_MANUAL"
}
```

### PATCH /plot-summaries/{summaryId}

Update a plot summary.

**Auth:** Required  
**Roles:** Author

### DELETE /plot-summaries/{summaryId}

Delete a plot summary.

**Auth:** Required  
**Roles:** Author

## Context Proposal Endpoints

Context proposal endpoints are deferred until the AI/Copilot phase. They are not required for Phase 9.5 Authoring Context Core.

### GET /novels/{novelId}/context-proposals

List pending/resolved AI-generated context proposals.

**Auth:** Required  
**Roles:** Author

**Query**

| Query | Description |
| :--- | :--- |
| `status` | `PENDING`, `APPROVED`, `REJECTED`. |
| `targetType` | `CHARACTER_PROFILE`, `STORY_TIMELINE`, `PLOT_SUMMARY`. |

### POST /context-proposals/{proposalId}/approve

Approve an AI proposal and commit changes into official context data.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "editedPayload": null
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "proposalId": "proposal_123",
    "status": "APPROVED",
    "committedResourceId": "summary_123"
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `AI_003`, `AI_004`, `CONTENT_005`

### POST /context-proposals/{proposalId}/reject

Reject an AI proposal.

**Auth:** Required  
**Roles:** Author

**Request**

```json
{
  "reason": "Not consistent with my outline."
}
```

**Errors:** `AI_003`, `AI_004`
