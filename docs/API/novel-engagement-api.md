# Novel ratings, reviews and follows

Base URL: `/api/v1`. These endpoints serve the reader module as well as author
statistics. They are independent of chapter comments and author follows.

## Permissions

Writes require a valid Bearer access token with role `READER`, plus an existing
database account whose role is currently `READER`, status is `ACTIVE` and
`deleted_at` is null. A stale token cannot grant access after a role/status change.
Guests get 401; non-reader, locked and deleted accounts get 403. Only published,
nondeleted novels accept mutations. Identity always comes from the access token,
never a body `userId`, so callers can only modify their own follow and review.

GET endpoints for published novels allow guests. For private novels, only their
author or an admin may read statistics/reviews; other callers receive 404.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/novels/:novelId/statistics` | Aggregate words, followers and score, plus the viewer's saved state |
| PUT | `/novels/:novelId/follow` | Follow a novel; repeated calls do not increment twice |
| DELETE | `/novels/:novelId/follow` | Unfollow; safe to repeat |
| PUT | `/novels/:novelId/notifications` | Set independent chapter-notification preference with `{ "enabled": true/false }` |
| PUT | `/novels/:novelId/rating` | Create/update the caller's score and optional review |
| DELETE | `/novels/:novelId/rating` | Remove the caller's score and text together |
| GET | `/novels/:novelId/reviews?page=1&limit=10` | List reader reviews, newest update first |

PUT rating accepts an integer `score` from 1 to 10. Optional `review` is trimmed
and must contain 1–2,000 characters or be null. An omitted field preserves the
existing text; null clears text while retaining the score. Blank/whitespace-only
text, oversized text and invalid scores return 400. Existing score-only API
clients continue to work.

```json
{ "score": 8, "review": "Good pacing and memorable characters." }
```

Each mutation returns the same `data` shape as statistics, in the standard API
envelope:

```json
{
  "novelId": "UUID",
  "totalWords": 5412,
  "followersCount": 12,
  "ratingAverage": 8.5,
  "ratingsCount": 2,
  "isFollowing": true,
  "notificationsEnabled": false,
  "myRating": 8,
  "myReview": "Good pacing and memorable characters."
}
```

Guests receive `isFollowing: false`, `myRating: null`, `myReview: null`. No votes
means `ratingAverage: null`, not a zero score. Followers, averages and public
review lists exclude non-READER, locked and deleted accounts. Public word counts
sum published, nondeleted chapters; an author/admin receives all nondeleted
chapters for the management screen.

The reviews endpoint returns an array in `data` and `page`, `limit`, `totalItems`,
`totalPages` in `meta` (default limit 10, maximum 50). Each item contains `userId`,
`displayName`, `avatarUrl`, `score`, `review`, `createdAt`, `updatedAt`. Only entries
with text appear here; a score without text still contributes to the statistics
endpoint's average, but not the review-list average.
Dates are ISO timestamps. Ordering uses update time and user ID for a stable tie
breaker. Reviews contain plain text, which clients should render as text.

Schema: migrations `012_novel_engagement.sql` and `013_novel_review_text.sql`.
Each reader has at most one follow and one score/review per novel.

The reader UI exposes one Follow heart in place of separate like, bookmark and follow actions. `isFollowing` and `followersCount` include deduplicated legacy saved/liked entries. PUT follow atomically ensures both follow and library membership; DELETE clears the viewer's follow/bookmark/legacy-like records together. Repeated/concurrent toggles do not create duplicates or leave follow and library writes partially committed.

Chapter notifications are off by default and independent of following/library membership. Migration `021_novel_notification_subscriptions.sql` stores preferences and queues idempotent `NOVEL_CHAPTER_PUBLISHED` events in the publication transaction, covering immediate publication, moderation approval and schedules. Only active readers who opted in receive events for published, visible novels/chapters. Delivery rechecks eligibility; opting out removes pending events. Existing delivered notifications remain in history.

### Reader reviews page

Readers write and manage their review at `/reader/novels/:novelId/reviews`. Guests can view `/public/novels/:novelId/reviews` and are prompted to sign in to write. The score can be typed or selected with a slider, using the existing integer 1–10 API contract.

The author route is `/author/novels/:novelId/reviews`. Only the novel owner or
an admin can access its management view; it has no reader-review edit actions.

The existing GET reviews endpoint accepts `sort=newest|oldest|highest|lowest`
(default `newest`). Ordering is applied in PostgreSQL before pagination,
with user ID as a deterministic tie breaker. Newest/oldest use the last review
update date, consistent with the date displayed on each review.

Response metadata additionally includes `ratingAverage: number | null`,
computed across all visible reviews with text, not just the current page.
Score-only ratings remain included in the statistics endpoint, but are excluded
from this review-list average and total. Empty review sets return null average.
The review-list UI labels these as “Điểm trung bình của nhận xét có nội dung”
and “nhận xét có điểm”; neither value represents all reader ratings.

The page reuses AuthorTheme, AuthorNavbar, NovelReviews and PageStates. It now
shares the application-wide Light/Dark/System preference and semantic StoryCraft
tokens; see `docs/Implementation/dark-mode.md` for theme behavior.
