# Phase 8.3 - Reader Web Checklist

Goal: complete the web reader fallback flow using the Phase 5 reader APIs and related social/wallet endpoints.

## 1. Routes

- [x] Add `/reader` for published novel search.
- [x] Add `/reader/novels/:novelId` for reader-facing novel detail.
- [x] Add `/reader/chapters/:chapterId` for chapter reading.
- [x] Add `/reader/library` for saved novels.
- [x] Add `/reader/history` for reading progress.

## 2. Reader Home

- [x] Search published novels through `GET /reading/search`.
- [x] Show novel cards with title, author/genre, synopsis, likes, views, and chapter count.
- [x] Link each novel card to the reader novel detail route.
- [x] Show loading, empty, and error states.

## 3. Novel Detail

- [x] Load detail through `GET /reading/novels/{novelId}`.
- [x] Show synopsis, tags, stats, and published chapter list.
- [x] Support add-to-library through `POST /reading/library/me`.
- [x] Support like/unlike through interaction APIs.
- [x] Support follow/unfollow author through interaction APIs.
- [x] Support report novel through `POST /reports`.

## 4. Chapter Reader

- [x] Load content through `GET /reading/chapters/{chapterId}`.
- [x] Show locked VIP state when backend returns `PAYMENT_002`.
- [x] Allow unlock through `POST /chapters/{chapterId}/unlock`.
- [x] Provide wallet shortcut when balance is insufficient.
- [x] Sync reading history through `PUT /reading/history/me`.
- [x] Support report chapter through `POST /reports`.

## 5. Comments

- [x] List approved comments through `GET /chapters/{chapterId}/comments`.
- [x] Create comment through `POST /chapters/{chapterId}/comments`.
- [x] Delete own/admin comment through `DELETE /comments/{commentId}`.
- [x] Show empty/error states for comments.

## 6. Library and History

- [x] List library through `GET /reading/library/me`.
- [x] Remove saved novel through `DELETE /reading/library/me/{novelId}`.
- [x] List history through `GET /reading/history/me`.
- [x] Continue reading from history item.

## 7. Review Guide

1. Start backend and web.
2. Login as `reader04` or any `READER` account.
3. Open `/reader` and confirm published novels appear.
4. Search by part of a published novel title.
5. Open a novel detail page and confirm chapter list appears.
6. Use `Add library`, then open `/reader/library` and confirm the novel appears.
7. Open a free chapter, confirm content is visible, then click `Sync history`.
8. Open `/reader/history` and confirm the chapter can be continued.
9. Add a safe comment and confirm either approved comments appear or pending moderation is understandable.
10. Open a VIP chapter if available; confirm locked state, unlock CTA, and wallet shortcut.
11. Use `Like`, `Unlike`, `Follow`, `Unfollow`, and `Report` to confirm actions return success or clear API errors.

## 8. Known Limitations

- Like/follow state is action-based; the UI does not yet hydrate whether the current user already liked/followed.
- Comment update UI is not implemented yet; delete and create are available.
- Reader settings/preferences drawer is still deferred to Phase 8.5 polish unless needed sooner.
- Mobile remains the primary reader client in Phase 9, so this web reader is a demo-ready fallback.
