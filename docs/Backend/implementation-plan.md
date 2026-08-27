# Backend Implementation Plan

This plan proposes backend implementation phases for a graduation-project MVP.

## Phase 0: Project Bootstrap

Goals:

- initialize Node.js backend project;
- configure TypeScript;
- configure lint/format if desired;
- configure env loading;
- configure API response wrapper;
- configure PostgreSQL and MongoDB connections.

Deliverables:

- app starts locally;
- health check endpoint;
- global error handler;
- config module.

Suggested endpoints:

```txt
GET /api/v1/health
```

## Phase 1: Auth + User Profile

Modules:

- `auth`
- `users`

Deliverables:

- register;
- login;
- refresh token;
- logout;
- current user;
- profile get/update;
- password change;
- role/status checks.

Important tables:

- `users`
- `user_profiles`
- `refresh_tokens`
- `wallets` should be created when user registers.

## Phase 2: Novel + Chapter Basic

Modules:

- `novels`

Deliverables:

- create/update/list/get novel;
- create/update/list/get chapter;
- submit novel/chapter publish;
- basic status transitions;
- draft storage abstraction.

Important data:

- `novels`
- `chapters`
- `draft_chapters`
- `genres`
- `tags`
- `novel_tags`

Approved content strategy:

- latest approved/published content is stored in PostgreSQL `chapters.content`;
- editable draft/autosave content is stored in MongoDB `draft_chapters`;
- full draft version history is deferred for MVP.

## Phase 3: Content Control + Reading + Interaction

Modules:

- `content-control`
- `reading`
- `interactions`

Deliverables:

- keyword/rule content check endpoint;
- user report creation;
- moderation review queue;
- search/list public novels;
- reading preferences;
- reading history sync;
- library/bookmark;
- comments;
- likes;
- follows;
- notifications basic.

Important data:

- `content_filter_rules`
- `moderation_reviews`
- `reports`
- `moderation_evidence`
- `reading_preferences`
- `reading_histories`
- `bookmarks`
- `comments`
- `likes`
- `follows`
- `notifications`
- `device_tokens`

Rule:

- Novel and Interaction modules call Content Control for publish/comment checks.
- Content Control owns moderation reviews and user reports.

## Phase 4: Mock Wallet

Modules:

- `wallet`

Deliverables:

- wallet balance;
- mock deposit session;
- mock deposit webhook;
- unlock VIP chapter;
- donate Coins;
- author withdraw request.

Important transaction rules:

- no negative wallet balance;
- idempotent mock webhook;
- idempotent unlock check;
- all wallet mutations create `transactions`.

Important data:

- `wallets`
- `transactions`
- `deposit_sessions`
- `chapter_unlocks`
- `withdraw_requests`

## Phase 5: AI + Writing Copilot

Modules:

- `ai`
- `novels.context`

Deliverables:

- metadata suggestions;
- novel classification;
- style analysis mock/integration;
- plot consistency checking;
- writing suggestions;
- context proposals;
- approve/reject context proposals.

Important data:

- `character_profiles`
- `story_timeline_events`
- `plot_summaries`
- `context_change_proposals`
- `copilot_generation_logs`

Rule:

- AI can propose context changes.
- Author approval is required before official context mutation.
- AI/LLM does not perform content moderation.
- Consistency warnings are advisory and do not block publishing.

## Phase 6: Admin

Modules:

- `admin`

Deliverables:

- user lock/unlock;
- taxonomy management;
- withdraw review;
- dashboard stats.

Important data:

- `activity_logs`
- existing domain tables.

## Suggested Team Split

| Team Member | Area |
| :--- | :--- |
| Member A | Auth, user profile, RBAC. |
| Member B | Novel/chapter, drafts, context data. |
| Member C | Reading, interaction, notifications. |
| Member D | Content Control, wallet mock, admin, dashboard. |
| Member E | AI/Copilot integration and context proposals. |

## Definition of Done per Phase

- API endpoints match `docs/API`.
- Database access matches `docs/Database`.
- Errors use `docs/API/error-codes.md`.
- Response format matches `docs/API/conventions.md`.
- Role/ownership checks exist.
- Basic happy-path and failure-path tests exist.
- README/run instructions are updated.
