# Phase 8 Final Web QA Report

Date: 2026-07-21

## Scope

Phase 8.9 closes the official web MVP before Phase 9 Mobile Reader App.

Covered web surfaces:

- public guest browse/detail/free-chapter reading;
- authenticated Reader browse, detail, reader, comments, library, history, preferences;
- Author project manager, metadata editor, IDE shell, chapter draft/publish flow;
- Wallet mock deposit, unlock, donate, withdraw, transactions;
- notifications, profile, author profile;
- Admin dashboard, users, taxonomy, moderation queue/detail, user-report view, withdraw review.

## Route QA Summary

| Area | Routes | Status |
| :--- | :--- | :--- |
| Public | `/public`, `/public/novels/:novelId`, `/public/chapters/:chapterId` | Ready |
| Auth | `/login` | Ready; OAuth remains placeholder |
| Reader | `/reader`, `/reader/novels/:novelId`, `/reader/chapters/:chapterId`, `/reader/library`, `/reader/history` | Ready |
| Author | `/author`, `/author/novels/:novelId`, `/author/novels/:novelId/chapters/:chapterId`, `/author/ide` | Ready for non-AI work |
| User Utility | `/wallet`, `/notifications`, `/profile/me`, `/authors/:authorId` | Ready |
| Admin | `/admin`, `/admin/users`, `/admin/taxonomy`, `/admin/moderation`, `/admin/moderation/:reviewId`, `/admin/reports`, `/admin/withdraws` | Ready |

## API QA Summary

- Public/Reader screens use `GET /reading/search`, `GET /reading/novels/:novelId`, `GET /reading/chapters/:chapterId`, preferences, history, library, comments, social, reports, and VIP unlock endpoints.
- Author screens use novel/chapter create, list, detail, draft save, metadata update, and publish submission endpoints.
- Wallet screens use mock wallet endpoints only.
- Admin screens use dashboard, users, taxonomy, moderation review list/detail/resolve, and withdraw review endpoints.
- AI/Copilot endpoints are intentionally not called in Phase 8.x.

## Database Visibility Summary

Visible through UI:

- auth/user/profile tables through login, profile, user management, author profile;
- novels/chapters/draft chapters through Reader and Author views;
- genres/tags/novel_tags through Reader filters and Admin taxonomy;
- reading preferences/history/bookmarks through Reader pages;
- comments/social interactions/reports/moderation reviews through Reader/Admin pages;
- wallet balances/transactions/unlocks/donations/withdraws through Wallet/Admin pages;
- notifications through Notifications page;
- Mongo `comments` through public/reader comments API;
- Mongo `moderation_evidence` through backend-safe `evidenceSummary` in Admin moderation detail.

Deferred with documented reason:

- `character_profiles`, `character_relationships`, `story_timeline_events`, `plot_summaries`, and context proposal data are visible as Author IDE placeholders but persistence is deferred until backend context/AI phases.
- embeddings/vector retrieval collections are deferred until Phase 10 AI/Copilot architecture.

## Known Limitations

- OAuth callback is not implemented.
- Author context management is placeholder-only; no CRUD for characters, timeline, summaries, or context proposals yet.
- AI suggestion and consistency checking buttons are disabled and must remain non-calling until Phase 10.
- Web Reader is acceptable as MVP fallback; Phase 9 still builds the primary Mobile Reader App.
- Build emits existing Vite warnings for third-party `"use client"` directives and bundle size; there is no blocking compile/build error.

## Validation Commands

- `npm.cmd --prefix backend run typecheck` passed.
- `npm.cmd --prefix web run typecheck` passed.
- `npm.cmd --prefix web run build` passed.

## Manual Demo Script

1. Logout and open `/public`.
2. Search sample novels, open a public novel, then open a free chapter.
3. Login as Reader and review `/reader`, `/reader/library`, `/reader/history`, `/wallet`, `/notifications`, `/profile/me`.
4. Login as Author and review `/author`, metadata editor, chapter deep link, and `/author/ide`.
5. Login as Admin and review `/admin`, `/admin/users`, `/admin/taxonomy`, `/admin/moderation`, `/admin/reports`, and `/admin/withdraws`.
