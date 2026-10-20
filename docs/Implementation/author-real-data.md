# Author data corrections

The author UI uses existing PostgreSQL records. No verification, achievement,
publication schedule, chapter view counter, KYC or royalty policy is introduced.

- `GET /authors/:authorId/profile` returns `totalViews` for published, nondeleted
  novels and `totalWords` for published, nondeleted chapters of those novels.
  These totals are public; private drafts are excluded. Existing `joinedAt`,
  covers, genres and viewer-specific `isFollowing` remain available.
- Novel responses include `genreId`. `GET /novels/me` additionally includes
  nullable `latestChapter` (`chapterId`, `chapterNumber`, `title`, `status`,
  `updatedAt`), ordered by chapter update time. Public novel responses do not
  expose that author-only summary. Saving a published chapter's MongoDB draft
  also updates its PostgreSQL activity timestamp without publishing draft prose.
- Novel updates preserve genre in the response, apply an explicitly supplied
  genre, and accept `null` to clear genre or cover.
- Wallet history includes both parties, with `direction` relative to the viewer
  and `balanceChangeCoins` for the available balance. Failed transactions and
  historical self transfers have zero effect; pending withdrawals reserve coins
  immediately. History uses transaction ID as a tie breaker for pagination.
- Earnings count successful incoming unlock/donation transfers only, excluding
  self transfers and deposits. Lifetime earnings and daily buckets are read from
  one PostgreSQL snapshot. `asOfDay` and `timeZone` anchor 730 calendar days in
  `Asia/Bangkok`, allowing 7/30/365-day comparisons with the preceding period.
  Missing days count as zero. A zero previous period has no percentage growth.
- Authors open their own VIP chapters without a transfer. Wallet controls state
  that deposits/withdrawals are simulations, with no cash exchange rate or bank
  settlement promise. The current transfer flow credits the full coin amount;
  no 70/30 division is claimed or implemented.

## Novel statistics and chapter layout

- Author chapter tables show five chapters per page and reserve five rows even
  when a novel, filtered result or last page has fewer chapters.
- Migration `012_novel_engagement.sql` adds `novel_follows` and `novel_ratings`.
  Novel follows are separate from author follows, library bookmarks and likes.
  Each user has at most one follow and one integer rating (1–10) per novel.
- `GET /novels/:novelId/statistics` returns `totalWords`, `followersCount`,
  nullable `ratingAverage`, `ratingsCount`, `isFollowing` and `myRating`.
  No ratings means a null average, displayed as “Chưa có”. Counts and averages
  exclude locked/deleted accounts. Viewer fields are private to that viewer.
- Authors/admins see the word count of all nondeleted chapters, including draft
  chapters. Public/readers see published chapters only; private novel statistics
  require ownership/admin access. Counts use PostgreSQL chapter word counts;
  unpublished edits to an already published chapter are not substituted into
  its canonical word count.
- Active accounts with the `READER` role can follow/unfollow using `PUT`/`DELETE`
  `/novels/:novelId/follow`, and rate/change/clear a score using `PUT`/`DELETE`
  `/novels/:novelId/rating`. The PUT rating body accepts a score and optional
  review: `{ "score": 8, "review": "A thoughtful story." }`. Migration 013 adds
  `review_text` (up to 2,000 characters). Omitting `review` preserves an existing
  text; `review: null` clears the text. DELETE removes the score and review.
  Only published novels accept these interactions. Both JWT role and the current
  database role/status are checked, including deletion state; AUTHOR and ADMIN
  accounts have no write permission. The reader detail screen exposes a score
  and review form with explicit save/delete actions.
- `GET /novels/:novelId/reviews?page=1&limit=10` is a shared paginated read API.
  It exposes public reader identity, score, review text and timestamps without
  email or account settings. Only nonempty reviews from active READER accounts
  appear. Ratings without text still contribute to the score average.
  Statistics additionally return `myReview` for the authenticated viewer only.
- Docker deployments must apply migrations 012 and 013 before serving the new backend.
  Rebuild and recreate the web/backend containers to update localhost:8080;
  a local frontend build alone does not update the running Nginx image.

Chapter comments already exist in the repository. No chapter-comment or separate
novel-comment feature was added or changed in this work. Reviews remain one
score/text entry per reader and novel, with no comment threads or replies.

## Editorial overview and author metadata

Migration `014_novel_editorial_metadata.sql` adds nullable `novels.author_note`
and the `novel_genres` join table, backfilled from the existing primary genre.
Novel DTOs expose `authorNote` and `genres` alongside the compatible primary
`genre`/`genreId`. Create/PATCH accept up to five genre names and a nullable
author note of up to 5,000 characters. An omitted field preserves the saved
value; an empty genres array or null note clears it. Ownership checks apply.
Legacy `genre` writes update the same associations, with `genres` taking
precedence when both are supplied. Other metadata edits preserve every genre.

The author overview shows cover, status/age, title, genres, author, full synopsis
and actions first; six metrics follow in a single desktop row, then the author
note. Narrow screens wrap the metrics. The synopsis is always visible with no
two-line clamp or disclosure toggle, so expanding it cannot move the page.
The edit dialog provides genre tags (including new names) and the author note.

`npm run db:seed:novel-metadata` adds Vietnamese multi-paragraph synopses,
sample author notes and a secondary genre to the two known demo novels owned
by `reader03` (Ashenhold and Thanh Van Sword Path). The script skips records
that already have an author note, keeps edited introductions, and does not reset
users, balances, chapters or unrelated novels. It is an explicit local demo step,
not part of the schema migration or automatic startup.

The metadata edit dialog is up to 1,040px wide, with two columns on desktop,
larger author-note/synopsis fields, a scrolling body and fixed header/actions.
The overview cover is 192×288px on desktop and 144×216px on narrow screens.

Writing Studio reserves a bounded viewport for the scrolling workspace and
prevents the manuscript page from shrinking below its content. Textarea height
is recalculated on content/format changes, font loading and width changes
(including AI/sidebar toggles); height transitions are disabled. AI occupies a
separate right column on desktop and a lower panel on narrow screens, instead
of covering the toolbar or prose. The scene-break toolbar button was removed.

## Verification

From `backend`, with a configured local `.env`:

```powershell
$env:RUN_AUTHOR_DATA_TESTS='1'
node --import tsx --test src/modules/wallet/author-data.postgres.test.ts
npm run typecheck
```

For the repository's example local connection, add `--env-file=.env.example`
to the Node command. The opt-in test creates a uniquely named schema, applies
the required migrations there, exercises real repository queries, and removes
that schema afterward. It does not seed or inventory application tables.

From `web` (Node 22.6+):

```powershell
npm run test:wallet
npm run typecheck
npm run build
```

Tests cover incoming/outgoing transfers, duplicate unlocks, own-author access,
pending/rejected/approved withdrawals, balance reconciliation, recipient
isolation, date boundaries, historical earnings, public draft exclusion,
follow state, novel summaries and nullable metadata updates.
