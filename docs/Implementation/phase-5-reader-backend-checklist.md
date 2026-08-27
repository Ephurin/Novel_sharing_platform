# Phase 5 Reader Backend APIs Checklist

Use this checklist after Phase 4 is approved.

Phase 5 implements non-AI Reader backend APIs. It does not implement reader web/mobile UI yet.

## 1. Implemented Scope

- [x] Add `reading_preferences` table.
- [x] Add `reading_histories` table.
- [x] Add `bookmarks` table.
- [x] Add `likes` table.
- [x] Add `follows` table.
- [x] Add `GET /api/v1/reading/preferences/me`.
- [x] Add `PUT /api/v1/reading/preferences/me`.
- [x] Add `GET /api/v1/reading/search`.
- [x] Add `GET /api/v1/reading/novels/{novelId}`.
- [x] Add `GET /api/v1/reading/chapters/{chapterId}`.
- [x] Add `PUT /api/v1/reading/history/me`.
- [x] Add `GET /api/v1/reading/history/me`.
- [x] Add `GET /api/v1/reading/history/me/{novelId}`.
- [x] Add `GET /api/v1/reading/library/me`.
- [x] Add `POST /api/v1/reading/library/me`.
- [x] Add `DELETE /api/v1/reading/library/me/{novelId}`.
- [x] Add `POST /api/v1/novels/{novelId}/likes`.
- [x] Add `DELETE /api/v1/novels/{novelId}/likes/me`.
- [x] Add `POST /api/v1/authors/{authorId}/follow`.
- [x] Add `DELETE /api/v1/authors/{authorId}/follow`.
- [x] Add `GET /api/v1/authors/{authorId}/followers/count`.

## 2. Validation

- [x] `npm.cmd --prefix backend run typecheck` passes.
- [x] `npm.cmd --prefix backend run build` passes.
- [x] `npm.cmd --prefix backend run db:migrate` applies `006_reading_interactions.sql`.
- [x] Smoke test creates a published novel/chapter fixture.
- [x] Search returns the published novel.
- [x] Reader novel detail returns published chapters.
- [x] Reader chapter endpoint returns published chapter content.
- [x] Reading preferences get/update works.
- [x] Reading history sync/list/detail works.
- [x] Library add/list/remove works.
- [x] Like/unlike updates state and counters.
- [x] Follow/count/unfollow works.

## 3. Manual Review Guide

Run backend:

```txt
npm.cmd --prefix backend run dev
```

Postman collection:

```txt
docs/API/postman/phase-5-reader-backend.postman_collection.json
```

Prepare:

- one `READER` token;
- one published novel with at least one published non-VIP chapter;
- one author user ID for follow testing.

If needed, publish a test novel/chapter directly in PostgreSQL for MVP review:

```sql
update novels
set status = 'PUBLISHED',
    published_at = now(),
    updated_at = now()
where novel_id = '<novel_id>';

update chapters
set status = 'PUBLISHED',
    content = coalesce(content, 'Published test content.'),
    published_at = now(),
    updated_at = now()
where chapter_id = '<chapter_id>';
```

### 3.1 Search Published Novels

```http
GET http://localhost:4000/api/v1/reading/search?q=test&page=1&limit=20
```

Expected:

- response status is `200`;
- only published novels are returned.

### 3.2 Reader Novel Detail

```http
GET http://localhost:4000/api/v1/reading/novels/{novelId}
```

Expected:

- response includes novel metadata;
- response includes published chapter list.

### 3.3 Reader Chapter Content

```http
GET http://localhost:4000/api/v1/reading/chapters/{chapterId}
```

Expected:

- response includes published chapter content;
- VIP chapter returns `PAYMENT_002` until Phase 6 unlock APIs are implemented.

### 3.4 Reading Preferences

```http
GET http://localhost:4000/api/v1/reading/preferences/me
Authorization: Bearer <READER_TOKEN>
```

```http
PUT http://localhost:4000/api/v1/reading/preferences/me
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "fontFamily": "serif",
  "fontSize": 18,
  "background": "DARK",
  "lineHeight": 1.6
}
```

Expected:

- saved values are returned.

### 3.5 Reading History

```http
PUT http://localhost:4000/api/v1/reading/history/me
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "novelId": "{novelId}",
  "chapterId": "{chapterId}",
  "paragraphIndex": 2,
  "pageOffset": 0.5
}
```

```http
GET http://localhost:4000/api/v1/reading/history/me
Authorization: Bearer <READER_TOKEN>
```

```http
GET http://localhost:4000/api/v1/reading/history/me/{novelId}
Authorization: Bearer <READER_TOKEN>
```

Expected:

- sync response has `synced = true`;
- list/detail return the latest position.

### 3.6 Library

```http
POST http://localhost:4000/api/v1/reading/library/me
Authorization: Bearer <READER_TOKEN>
Content-Type: application/json

{
  "novelId": "{novelId}"
}
```

```http
GET http://localhost:4000/api/v1/reading/library/me
Authorization: Bearer <READER_TOKEN>
```

```http
DELETE http://localhost:4000/api/v1/reading/library/me/{novelId}
Authorization: Bearer <READER_TOKEN>
```

Expected:

- add returns `bookmarked = true`;
- list shows the bookmarked novel;
- delete returns `204`.

### 3.7 Likes

```http
POST http://localhost:4000/api/v1/novels/{novelId}/likes
Authorization: Bearer <READER_TOKEN>
```

```http
DELETE http://localhost:4000/api/v1/novels/{novelId}/likes/me
Authorization: Bearer <READER_TOKEN>
```

Expected:

- like returns `liked = true`;
- unlike returns `liked = false`;
- `likesCount` is updated safely.

### 3.8 Follows

```http
POST http://localhost:4000/api/v1/authors/{authorId}/follow
Authorization: Bearer <READER_TOKEN>
```

```http
GET http://localhost:4000/api/v1/authors/{authorId}/followers/count
```

```http
DELETE http://localhost:4000/api/v1/authors/{authorId}/follow
Authorization: Bearer <READER_TOKEN>
```

Expected:

- follow returns `following = true`;
- count increases;
- unfollow returns `following = false`.

## 4. Phase 5 Done Criteria

- [x] Reader search only returns published novels.
- [x] Reader detail only exposes published chapters.
- [x] Reader chapter exposes content for published non-VIP chapters.
- [x] VIP chapter access is blocked until Phase 6 unlock APIs.
- [x] Preferences, history, and library work for authenticated users.
- [x] Likes and follows are idempotency-safe through conflict handling.
- [x] Phase 5 reviewed and approved.

If approved, continue to Phase 6: Mock Wallet Backend APIs.
