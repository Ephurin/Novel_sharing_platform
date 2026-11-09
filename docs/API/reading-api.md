# Reading Experience API

Related SRS: `docs/SRS/reading-experience-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `ReadingPreference` | Font, size, background, and display settings. |
| `ReadingHistory` | Last read chapter/paragraph position. |
| `ReadingPositionBookmark` | One explicit saved reading position per user and novel. |
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
    "lineHeight": 1.6,
    "margin": 24,
    "textAlign": "LEFT"
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
  "lineHeight": 1.6,
  "margin": 24,
  "textAlign": "LEFT"
}
```

**Errors:** `VALIDATION_001`

`background` accepts `LIGHT`, `SEPIA`, `MINT`, `BLUE`, `ROSE`, `DARK`, and `BLACK`. `margin` is an integer from 0 to 80 pixels. `textAlign` accepts `LEFT`, `CENTER`, `RIGHT`, and `JUSTIFY`. Omitting the two new fields preserves existing values, with defaults of 24 and `LEFT` for new accounts.

### GET /reading/bookmarks/me/:novelId

Requires an active authenticated account. Returns the saved position or `null` when absent or when the chapter/novel is no longer published. The position contains `novelId`, `chapterId`, `paragraphIndex`, `pageOffset`, and `updatedAt`.

### PUT /reading/bookmarks/me/:novelId

Requires an active authenticated account and access to the published chapter, including VIP unlock checks. Replaces that account's explicit position for this novel and returns the saved position.

```json
{
  "chapterId": "a-valid-chapter-uuid",
  "paragraphIndex": 8,
  "pageOffset": 0.35
}
```

`paragraphIndex` is zero-based and ranges from 0 to 1000000. `pageOffset` ranges from 0 to 1 and represents the fractional position within the paragraph. Both default to 0. Saving a position leaves automatic reading history and verified chapter-read markers independent.

### DELETE /reading/bookmarks/me/:novelId

Requires an active authenticated account. Idempotently removes the account's saved position and returns `{ "removed": true }` or `{ "removed": false }`.

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
| `genres`, `tags` | Repeat each parameter to select multiple names/slugs; the novel must match every selected genre and tag. Legacy `genre`/`tag` may be combined with them. |
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

The chapter must belong to the published novel and the authenticated account must be active. VIP writes require the same entitlement as reading the content (unlock, owning author, or entitled content admin). A rejected write leaves history unchanged. Saving a position never marks a chapter as read.

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

**Errors:** `CONTENT_001`, `VALIDATION_001`, `PAYMENT_002` (402: locked VIP), `AUTH_008` (403: inactive/stale account role)

### GET /reading/history/me

List current user's reading history.

Each item includes `readChapterIds`, containing only that user's chapters verified by successful authorized content GETs. Resume pointers and browser storage are not proof of a read.

**Auth:** Required  
**Roles:** Reader, Author, Admin

### GET /reading/history/me/{novelId}

Get current user's latest reading position for one novel.

The response also includes verified `readChapterIds` for the novel. Migration `023_verified_chapter_reads.sql` leaves rows created by earlier unverified-history backfills unverified; opening their content successfully verifies them. Existing positions remain available, but the UI must not infer read markers or a direct resume target from them alone.

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
