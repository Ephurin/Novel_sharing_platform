# Reading Experience API

Related SRS: `docs/SRS/reading-experience-service.md`

## Resource Summary

| Resource | Description |
| :--- | :--- |
| `ReadingPreference` | Font, size, background, and display settings. |
| `ReadingHistory` | Last read chapter/paragraph position. |
| `Bookmark` | Reader's personal library item. |
| `SearchResult` | Public novel discovery/search result. |

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

**Auth:** Optional  
**Roles:** Guest, Reader, Author, Admin

**Query**

| Query | Description |
| :--- | :--- |
| `q` | Keyword. |
| `genre` | Genre filter. |
| `tag` | Tag filter. |
| `status` | Story status filter. |
| `sort` | `relevance`, `views`, `likes`, `updatedAt`. |
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

List bookmarked novels.

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

Remove a novel from personal library.

**Auth:** Required  
**Roles:** Reader, Author, Admin

**Response:** `204 No Content`

**Errors:** `INTERACTION_002`
