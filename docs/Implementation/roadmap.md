# Ephurin Implementation Roadmap

## 1. Goal

Turn the current design docs into a working graduation-project MVP.

The MVP should demonstrate:

- account/auth flow;
- Author AI Writing IDE shell;
- novel/chapter creation and draft editing;
- story context management;
- Content Control moderation flow;
- Reader browsing/reading basics;
- mock wallet/unlock flow;
- AI/Copilot is deferred until the non-AI backend and frontend are stable.

## 2. Work Order Summary

| Phase | Focus | Primary Output |
| :--- | :--- | :--- |
| 0 | Repo scaffold | `backend/`, `web/`, shared conventions, env examples |
| 1 | Backend foundation | Express app, config, errors, auth, DB connections |
| 2 | Core content | Users, novels, chapters, drafts, publish state |
| 3 | Web Author IDE shell | Activity bar, story tree, editor layout, API client |
| 4 | Content Control + Interaction | Rule check, reports, comments, moderation queue |
| 5 | Reader backend APIs | Public browse, novel detail, reading state, library, reactions |
| 6 | Mock wallet backend APIs | Coin balance, deposit mock, unlock, transactions |
| 7 | Profile, notification, and admin backend APIs | Author profile, notifications, users, taxonomy, withdraw review, stats |
| 8 | Web frontend completion | Author IDE, reader web, wallet mock UI, notifications, admin UI |
| 9 | Mobile reader app | Reader mobile app after APIs stabilize |
| 10 | AI/Copilot | Metadata, suggestions, consistency check, context proposals |

## 3. Phase Details

### Phase 0: Repository Bootstrap

References:

- `docs/Implementation/phase-0-bootstrap-checklist.md`
- `docs/techstack.md`
- `SKILL/AGENTS.md`

Deliverables:

- `backend/` project initialized.
- `web/` project initialized.
- root-level scripts documented if needed.
- `.env.example` files created.
- TypeScript, lint, format, and basic run commands documented.

Do not start business logic before Phase 0 is complete.

### Phase 1: Backend Foundation

References:

- `docs/Backend/overview.md`
- `docs/Backend/module-structure.md`
- `docs/API/conventions.md`
- `docs/API/error-codes.md`

Deliverables:

- Express + TypeScript app.
- `/api/v1/health`.
- config/env module.
- global error handler.
- response envelope helper.
- auth middleware skeleton.
- PostgreSQL connection.
- MongoDB connection.
- module folder structure.

Definition of Done:

- backend starts locally;
- health endpoint returns standard response envelope;
- unknown errors map to `SYS_001`;
- validation errors map to `VALIDATION_001`.

### Phase 2: Auth + User + Core Content

References:

- `docs/API/auth-api.md`
- `docs/API/user-profile-api.md`
- `docs/API/novel-chapter-api.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

Deliverables:

- register/login/refresh/logout/current user;
- user profile get/update;
- author creates/updates novel;
- author creates/updates chapter;
- chapter draft save abstraction;
- publish submit sets correct status;
- ownership checks for author content.

Important constraints:

- create wallet on user registration;
- latest approved/published chapter content lives in PostgreSQL;
- editable draft/autosave content lives in MongoDB;
- do not implement full draft version history in MVP.

### Phase 3: Web Author IDE Shell

References:

- `docs/Frontend/wireframes.md`
- `docs/Frontend/screen-specs.md`
- `docs/Frontend/user-flows.md`
- `docs/API/novel-chapter-api.md`

Deliverables:

- React + Vite app shell.
- Mantine theme and layout baseline.
- Author IDE layout:
  - top toolbar;
  - left activity bar;
  - dynamic sidebar;
  - rich text editor area;
  - right assistant/context panel placeholder;
  - bottom status bar.
- API client wrapper.
- TanStack Query provider.
- Zustand UI state for active activity/sidebar.

Implementation note:

- AI/Copilot actions are deferred until Phase 10.
- The layout should support Story, Entities, Timeline, Knowledge Graph, Search, Tasks, Projects, Settings.

### Phase 4: Content Control + Interaction

References:

- `docs/SRS/content-control-moderation-service.md`
- `docs/API/content-control-api.md`
- `docs/API/interaction-social-api.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

Deliverables:

- `POST /content-control/check`.
- `POST /reports`.
- moderation review list/detail/resolve endpoints.
- comment create/list/update/delete.
- comment status integration with Content Control.
- Mongo comment `commentId` UUID.

Boundary:

- Content Control uses keyword/rule filtering and user reports.
- AI/LLM is not used for content judgement.

### Phase 5: Reader Backend APIs

References:

- `docs/API/reading-api.md`
- `docs/API/novel-chapter-api.md`
- `docs/API/interaction-social-api.md`

Deliverables:

- public novel list/search API;
- novel detail API;
- chapter reading API;
- reading history sync API;
- library/bookmark API;
- likes/follows API.

Boundary:

- implement backend endpoints and persistence first;
- web/mobile UI waits until Phase 8/9;
- no AI personalization in this phase.

### Phase 6: Mock Wallet Backend APIs

References:

- `docs/API/payment-wallet-api.md`
- `docs/SRS/payment-wallet-service.md`
- `docs/Database/postgresql-schema.md`

Deliverables:

- wallet balance API;
- mock deposit session API;
- mock deposit webhook/success action;
- VIP chapter unlock API;
- donate Coins API;
- author withdraw request API;
- transaction history API.

Rules:

- no real payment gateway;
- no real card/bank data;
- all wallet mutations create transaction rows;
- wallet decrement must be transaction-safe.

### Phase 7: Profile, Notification, and Admin Backend APIs

References:

- `docs/API/user-profile-api.md`
- `docs/API/interaction-social-api.md`
- `docs/API/admin-api.md`
- `docs/API/content-control-api.md`
- `docs/API/payment-wallet-api.md`
- `docs/Database/postgresql-schema.md`
- `docs/Database/mongodb-collections.md`

Deliverables:

- public author profile API with follower count and published novel summary;
- notification list API;
- notification mark-read API;
- device-token registration API;
- admin dashboard stats API;
- moderation review management API hardening;
- user lock/unlock API;
- taxonomy management API;
- mock withdraw review API.

Boundary:

- backend APIs only;
- author/reader/admin UI waits until Phase 8/9;
- notifications can be persisted without real push delivery in MVP;
- reuse Phase 4 moderation data instead of duplicating moderation logic.

### Phase 8: Web Frontend Completion

References:

- `docs/Frontend/wireframes.md`
- `docs/Frontend/screen-specs.md`
- `docs/Frontend/user-flows.md`
- `docs/API/reading-api.md`
- `docs/API/payment-wallet-api.md`
- `docs/API/admin-api.md`
- `docs/API/content-control-api.md`

Deliverables:

- finish Author IDE non-AI flows;
- reader web browse/detail/reader screens;
- library/bookmark/history screens;
- public author profile screens;
- notification list/read state UI;
- mock wallet/deposit/unlock screens;
- admin dashboard, moderation queue, user/taxonomy/withdraw screens;
- shared frontend auth/session guards.

Boundary:

- consume stable backend APIs from Phases 2, 4, 5, 6, and 7;
- keep AI UI as disabled/placeholder entry points;
- do not implement AI calls yet.

### Phase 9: Mobile Reader App

References:

- `docs/Frontend/sitemap.md`
- `docs/Frontend/wireframes.md`
- `docs/API/reading-api.md`
- `docs/API/interaction-social-api.md`
- `docs/API/payment-wallet-api.md`

Deliverables:

- mobile home feed;
- search/filter;
- novel detail;
- reader screen;
- comments;
- wallet mock;
- profile/settings.

Start this only after reader APIs and wallet APIs are stable.

### Phase 10: AI + Writing Copilot

References:

- `docs/SRS/ai-intelligence-service.md`
- `docs/API/ai-copilot-api.md`
- `docs/Database/mongodb-collections.md`
- `docs/Backend/overview.md`
- `docs/Backend/module-structure.md`

Deliverables:

- separate FastAPI/Python `ai-service`;
- Node.js `ai-gateway` client/routes that proxy authorized AI requests;
- metadata suggestion endpoint;
- classification endpoint;
- style analysis endpoint;
- `POST /ai/copilot/suggestions`;
- `POST /ai/copilot/consistency-check`;
- context proposal generation;
- context proposal approve/reject flow.

MVP option:

- Use deterministic/mock provider first.
- Keep FastAPI provider interfaces ready for real LLM integration.

Rules:

- frontend calls Node.js `/api/v1/ai/*`, not FastAPI directly;
- Node.js backend owns auth, ownership checks, rate limits, and persistence decisions;
- FastAPI owns model calls, prompt/context assembly helpers, embeddings, and consistency execution;
- update detailed AI SRS/API/DB/deployment docs after Phase 9 and before Phase 10 coding;
- AI suggestions do not auto-save into drafts.
- context updates require Author approval.
- consistency warnings are non-blocking.
- do not use AI for Content Control.

## 4. Cross-Phase Rules

- API response format must follow `docs/API/conventions.md`.
- Error codes must follow `docs/API/error-codes.md`.
- Database ownership must follow `docs/Database/overview.md`.
- Backend module boundaries must follow `docs/Backend/module-structure.md`.
- Frontend Author IDE must follow `docs/Frontend/wireframes.md`.
- Do not implement features that contradict SRS/API docs; update docs first if requirements change.
- From Phase 5 onward, finish non-AI backend APIs first, then frontend integration, then AI/Copilot last.

## 5. Current Priority After Phase 4

Use this order after Phase 4 is approved:

1. Phase 5: Reader backend APIs.
2. Phase 6: Mock wallet backend APIs.
3. Phase 7: Profile, notification, and admin backend APIs.
4. Phase 8: Web frontend completion.
5. Phase 9: Mobile reader app.
6. Phase 10: AI/Copilot.

## 6. Suggested First Coding Sprint

Sprint 1 should include:

1. Scaffold `backend/`.
2. Add Express + TypeScript + health endpoint.
3. Add response envelope + error handler.
4. Add env validation.
5. Add PostgreSQL/MongoDB connection placeholders.
6. Scaffold module folders.
7. Scaffold `web/`.
8. Add Mantine + React Router + TanStack Query providers.
9. Create empty Author IDE shell layout.

Stop after Sprint 1 and review before implementing auth/business logic.
