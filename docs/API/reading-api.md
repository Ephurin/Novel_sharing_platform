# Reading Experience API

Related SRS: `docs/SRS/reading-experience-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `ReadingPreference` | Font, size, background, and display settings. |
| `ReadingHistory` | Last read chapter/paragraph position. |
| `Bookmark` | Reader's personal library item. |
| `SearchResult` | Public novel discovery/search result. |
| `ReaderNovelDetail` | Published novel metadata and published chapter list. |
| `ReaderChapter` | Published chapter reading content. |

## Endpoints

### GET /reading/preferences/me

Get current reader display preferences.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "fontFamily": "serif",
    "fontSize": 18,
    "background": "DARK",
    "lineHeight": 1.6
  },
  "error": null,
  "meta": {}
}
```

### PUT /reading/preferences/me

Save current reader display preferences.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "fontFamily": "serif",
  "fontSize": 18,
  "background": "DARK",
  "lineHeight": 1.6
}
```

**Errors:** `VALIDATION_001`

### GET /reading/search

Search and filter public novels.

Each result includes `latestChapter` (or `null`), containing the latest published, non-deleted chapter's `chapterId`, `chapterNumber`, `title`, and `publishedAt`. This supports direct chapter links on the public homepage.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `q` | Keyword. |
| `genre` | Genre name or slug, including secondary genres. |
| `tag` | Tag filter. |
| `status` | Story status: `ONGOING`, `COMPLETED` or `HIATUS`. Can be combined with genre/tag filters. |
| `sort` | `relevance`, `views`, `likes`, `updatedAt`, `wordCount`, `title`. `wordCount` sums only published, non-deleted chapters; `title` sorts case-insensitively. |
| `page`, `limit`, `order` | Pagination conventions. |

**Response**

```json
{
  "success": true,
  "data": [
    {
      "novelId": "novel_123",
      "title": "The Moonlit Archive",
      "authorName": "Author One",
      "genre": "FANTASY",
      "tags": ["magic", "academy"],
      "status": "PUBLISHED",
      "likesCount": 120
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

### GET /reading/filters

Get the complete genre and tag lists for searchable catalog dropdowns. Choices are independent of the current search and pagination.

**Auth:** Not required

**Response data:** `{ "genres": ["Fantasy"], "tags": ["magic", "academy"] }`

### GET /reading/novels/{novelId}

Get a published novel detail with its published chapter list.

Detail metadata includes `genres`, `authorNote`, and `lastUpdatedAt`. The last update is the most recent `updated_at` among published, non-deleted chapters, falling back to the novel's publication/creation time when none exist. View-count updates and draft/deleted chapters do not affect this timestamp.

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "novelId": "novel_123",
    "title": "The Moonlit Archive",
    "authorId": "user_123",
    "authorName": "Author One",
    "synopsis": "A public synopsis...",
    "coverImageUrl": null,
    "genre": "Fantasy",
    "tags": ["magic", "academy"],
    "status": "ONGOING",
    "likesCount": 120,
    "viewsCount": 3000,
    "chaptersCount": 12,
    "chapters": [
      {
        "chapterId": "chapter_123",
        "novelId": "novel_123",
        "title": "The Door",
        "chapterNumber": 1,
        "wordCount": 1800,
        "isVip": false,
        "priceCoins": 0,
        "publishedAt": "2026-07-20T00:00:00.000Z"
      }
    ]
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`

### GET /reading/chapters/{chapterId}

Get published chapter reading content.

**Auth:** Optional for free chapters; required if the chapter is VIP and already unlocked by the current user.  
**Roles:** Guest, Reader, Author, Admin

**Response**

```json
{
  "success": true,
  "data": {
    "chapterId": "chapter_123",
    "novelId": "novel_123",
    "title": "The Door",
    "chapterNumber": 1,
    "wordCount": 1800,
    "isVip": false,
    "priceCoins": 0,
    "publishedAt": "2026-07-20T00:00:00.000Z",
    "content": "Published chapter content..."
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `PAYMENT_002`

### PUT /reading/history/me

Sync latest reading position.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "paragraphIndex": 42,
  "pageOffset": 0.72
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "synced": true,
    "cached": true
  },
  "error": null,
  "meta": {}
}
```

**Errors:** `CONTENT_001`, `VALIDATION_001`

### GET /reading/history/me

List current user's reading history.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### GET /reading/history/me/{novelId}

Get current user's latest reading position for one novel.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### GET /reading/library/me

List novels in the reader's unified following/library state. Existing bookmarks, novel follows and legacy likes are merged and deduplicated, with published/non-deleted visibility checks applied before pagination.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### POST /reading/library/me

Add a novel to personal library.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Request**

```json
{
  "novelId": "novel_123"
}
```

**Errors:** `CONTENT_001`, `INTERACTION_001`

### DELETE /reading/library/me/{novelId}

Remove a novel from personal library and following. Existing bookmark, novel-follow and legacy-like records for that reader/novel are removed atomically; legacy like counts are adjusted once.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response:** `204 No Content`

**Errors:** `INTERACTION_002`
