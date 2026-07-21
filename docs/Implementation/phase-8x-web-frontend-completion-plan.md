# Phase 8.x Web Frontend Completion Plan

This plan splits the broad Phase 8 into smaller reviewable frontend phases before starting Phase 9 Mobile Reader App.

The goal is to turn the current functional MVP UI into a stable, demo-ready web frontend.

## 1. Rationale

Current Phase 8 proves that the web app can call backend APIs, but it is not yet the final UI.

Frontend docs show several different needs:

- Author needs an IDE-like desktop workspace with low context switching.
- Reader needs smooth browse/detail/reader/comment/wallet flows.
- Admin needs reliable operational screens for moderation, reports, users, taxonomy, wallet withdraw review, and stats.
- Public/guest users need a platform entry point before login.

Trying to finish all of that as one phase is too large. Split it into smaller frontend phases so each part can be reviewed without waiting for the entire UI.

## 2. Proposed Phase Split

| Phase | Name | Goal | Review Output |
| :--- | :--- | :--- | :--- |
| 8.1 | Frontend Foundation Hardening | Make routing, auth/session, API errors, loading states, and shared UI patterns stable. | Stable app shell and predictable API behavior. |
| 8.2 | Author Project Manager and Official Author IDE UI | Add project-style novel management, then polish the Author IDE workspace. | Demo-ready author project hub and editor shell. |
| 8.3 | Reader Web Completion | Finish web reader fallback for browse, novel detail, reading, comments, library/history, and VIP unlock. | Reader flow works end-to-end on web. |
| 8.4 | Wallet, Notifications, Profile, Admin UI | Finish operational/user utility screens. | Admin and utility screens are usable for demo. |
| 8.5 | Author Workspace Deepening | Finish Author-side UI still missing from sitemap/API. | Author workspace no longer depends on manual IDs or hidden state for normal non-AI work. |
| 8.6 | Reader Experience Deepening | Finish preferences, social current-state UX, comment update, filters, and smoother history behavior. | Reader web uses remaining Phase 5 APIs and feels less like a test harness. |
| 8.7 | Admin and Moderation Deepening | Add admin detail pages for reports/moderation evidence and expose operational DB/Mongo data currently hidden. | Admin can inspect moderation/report cases without Postman/DB tools. |
| 8.8 | Public and Guest Web Surface | Add public landing/browse/detail routes and clarify guest-vs-authenticated reader behavior. | Demo can start from a public-facing platform entry point. |
| 8.9 | Final Web QA and UI Polish | Make the web frontend consistent, demo-safe, and ready before mobile. | Approved official web UI before mobile. |

Phase 9 should start only after Phase 8.9 is accepted.

## 3. Phase 8.1 Frontend Foundation Hardening

References:

- `docs/Frontend/sitemap.md`
- `docs/Frontend/screen-specs.md`
- `docs/API/conventions.md`

Scope:

- stabilize app shell navigation;
- add role-aware route guards;
- restore current user from `GET /auth/me` after refresh;
- centralize API error extraction from standard response envelope;
- add shared loading, empty, and error components;
- separate Author IDE full-screen layout from general web shell layout;
- prevent accidental destructive admin actions with confirmation UI;
- ensure unauthorized users see clear messages instead of broken pages.

Definition of Done:

- refreshing any protected route keeps session if token is valid;
- `READER`, `AUTHOR`, and `ADMIN` see only appropriate navigation/actions;
- failed backend calls show meaningful error messages;
- `npm.cmd --prefix web run typecheck` passes;
- `npm.cmd --prefix web run build` passes.

## 4. Phase 8.2 Author Project Manager and Official Author IDE UI

References:

- `docs/Frontend/wireframes.md`
- `docs/Frontend/screen-specs.md`
- `docs/Frontend/Specific_promt_for_Author_UI.md`

Scope:

- make `/author` the default landing page for `AUTHOR` users;
- add an Author Project Manager, similar to an IDE project launcher;
- keep a visible switch from author workspace to reader web;
- make Author IDE the primary desktop experience;
- keep VSCode/Cursor-like layout;
- improve Story activity, chapter tree, save draft, submit chapter/novel, and status feedback;
- add disabled AI/context entry points until Phase 10.

Definition of Done:

- author lands on Project Manager, not directly inside Author IDE;
- author can switch between Reader web and Author workspace with the same account;
- author can create/select/edit/save/submit novel and chapter without manually pasting IDs in the happy path;
- all disabled AI/context actions are visibly marked as future Phase 10 work.

## 5. Phase 8.3 Reader Web Completion

References:

- `docs/Frontend/sitemap.md`
- `docs/Frontend/wireframes.md`
- `docs/Frontend/user-flows.md`
- `docs/API/reading-api.md`
- `docs/API/interaction-social-api.md`
- `docs/API/payment-wallet-api.md`

Scope:

- build Reader home/search page;
- build novel detail page with synopsis, author, stats, chapters, VIP labels;
- build reader screen with chapter content, history sync, report action, and chapter navigation;
- add comments list/create/delete UI;
- add library and history pages;
- add like/follow/unfollow actions;
- handle VIP chapter locked state and Wallet unlock.

Definition of Done:

- reader can search, open novel, read free chapter, save history, comment, report, like, follow, add to library;
- reader can unlock VIP chapter after mock deposit;
- web reader is acceptable as fallback even though mobile remains primary in Phase 9.

## 6. Phase 8.4 Wallet, Notifications, Profile, Admin UI

References:

- `docs/API/payment-wallet-api.md`
- `docs/API/interaction-social-api.md`
- `docs/API/admin-api.md`
- `docs/API/content-control-api.md`
- `docs/API/user-profile-api.md`

Scope:

- polish wallet mock UI;
- polish notifications UI;
- add public author profile page;
- add current user profile/settings page;
- polish admin UI for dashboard, users, taxonomy, moderation list, and withdraw review.

Definition of Done:

- admin can complete basic operational tasks without Postman;
- wallet mock flow is understandable as demo-only payment;
- notifications and profile flows are visible in the web app.

## 7. Phase 8.5 Author Workspace Deepening

References:

- `docs/Frontend/sitemap.md`
- `docs/Frontend/screen-details-web.md`
- `docs/API/novel-chapter-api.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

Scope:

- add dedicated novel metadata editor route from `/author/novels/:novelId`;
- make project card `Metadata` action active instead of disabled;
- support chapter deep link route `/author/novels/:novelId/chapters/:chapterId`;
- show project health from existing data:
  - novel status;
  - chapter count;
  - draft/published/pending/rejected chapter states;
  - VIP/free chapter indicators;
- improve Author IDE Story activity:
  - remove manual ID dependency in normal flow;
  - select chapter by list/deep link;
  - edit chapter title;
  - show saved draft version and published status clearly;
- add non-AI context workspace placeholders for:
  - `character_profiles`;
  - `character_relationships`;
  - `story_timeline_events`;
  - `plot_summaries`;
  - `context_change_proposals`;
- keep context persistence disabled or explicitly marked pending until backend context APIs are implemented.

Definition of Done:

- author can create, open, edit metadata, edit chapters, submit, and navigate by URLs without copying IDs;
- sitemap Author routes no longer point to missing pages;
- context sections show what database objects they will represent without pretending AI is active;
- `npm.cmd --prefix web run typecheck` and build pass.

## 8. Phase 8.6 Reader Experience Deepening

References:

- `docs/Frontend/sitemap.md`
- `docs/API/reading-api.md`
- `docs/API/interaction-social-api.md`
- `docs/Database/postgresql-schema.md`

Scope:

- add reading preferences UI using `GET /reading/preferences/me` and `PUT /reading/preferences/me`;
- apply preferences to chapter reader:
  - font family;
  - font size;
  - background;
  - line height;
- auto-sync reading history when a chapter opens or changes;
- keep manual sync as a debug/fallback action only if useful;
- add genre/tag/status/sort filters to Reader Home so `genres`, `tags`, and `novel_tags` are visible outside Admin;
- add comment update UI through `PATCH /comments/{commentId}`;
- improve like/follow UX for already-liked/already-followed responses;
- use `GET /reading/history/me/{novelId}` for continue-reading state on novel detail.

Definition of Done:

- reader preferences affect the reader screen visibly;
- history is saved without requiring the user to remember a button;
- comments can be created, edited, and deleted from UI;
- taxonomy data is visible in reader discovery, not only Admin;
- reader flow has no obvious Postman-only gaps.

## 9. Phase 8.7 Admin and Moderation Deepening

References:

- `docs/Frontend/sitemap.md`
- `docs/API/admin-api.md`
- `docs/API/content-control-api.md`
- `docs/API/interaction-social-api.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

Scope:

- add admin routes/tabs for moderation review detail, user reports, report target navigation, and moderation evidence;
- use `GET /admin/moderation/reviews/{reviewId}` instead of list-only cards;
- expose data currently hidden from UI:
  - `reports`;
  - `content_rule_violations`;
  - `moderation_reviews`;
  - Mongo `moderation_evidence`;
  - rejected/pending comment evidence where available;
- improve Admin Console routes:
  - `/admin/moderation`;
  - `/admin/moderation/:reviewId`;
  - `/admin/reports`;
  - `/admin/users`;
  - `/admin/taxonomy`;
  - `/admin/withdraws`;
- keep destructive actions behind confirmation and clear target IDs.

Definition of Done:

- admin can inspect a moderation/report case without opening DB tools;
- moderation evidence explains why a target was flagged;
- admin tabs/routes match sitemap;
- non-admin users cannot render or query admin data.

## 10. Phase 8.8 Public and Guest Web Surface

References:

- `docs/Frontend/sitemap.md`
- `docs/Frontend/routes-and-guards.md`
- `docs/API/reading-api.md`

Scope:

- add public landing/home route for guest users;
- allow public browse/detail/free-chapter reading where backend supports optional auth;
- keep protected actions gated:
  - library;
  - history;
  - comments;
  - likes;
  - follows;
  - reports;
  - wallet unlock;
- improve guest-to-login redirect messaging;
- add basic featured/latest novels section using `GET /reading/search`;
- clarify OAuth callback remains placeholder unless OAuth is implemented.

Definition of Done:

- demo can begin from a public platform page;
- guests can browse and read free published content;
- protected actions redirect to login cleanly;
- authenticated users still land on role home.

## 11. Phase 8.9 Final Web QA and UI Polish

References:

- `docs/Frontend/review-guide.md`
- `docs/Frontend/wireframes.md`
- `docs/Implementation/phase-8-ui-coverage-audit.md`

Scope:

- establish consistent visual language:
  - colors;
  - spacing;
  - typography;
  - cards;
  - buttons;
  - badges;
  - tables;
  - forms;
- improve responsive behavior for tablet/small desktop;
- add accessibility pass;
- add final manual demo script;
- clean inaccurate placeholder copy;
- document known limitations before Phase 9;
- decide whether to add frontend test tooling after UI stabilizes.

Definition of Done:

- web app is demo-ready for graduation review;
- all Phase 8.1-8.8 review checklists are accepted;
- no major route is visually broken;
- no core web flow requires Postman;
- Phase 9 Mobile Reader App can start with stable web/API learnings.

## 12. Deferred Until Phase 10

The following items should not block Phase 8.x:

- real LLM suggestions;
- AI consistency checking;
- context proposal generation;
- embeddings/vector retrieval;
- AI-created character/timeline/summary updates.

Frontend may show disabled entry points, but should not fake completed AI behavior.

## 13. Current Immediate Next Step

Continue with Phase 8.5.

Reason:

- Phase 8.1-8.4 now cover the broad web shell, author project manager, reader flow, wallet, notifications, profile, and admin basics;
- sitemap still has missing Author metadata/context routes;
- API and database coverage still have visible gaps that should be closed before final QA.
