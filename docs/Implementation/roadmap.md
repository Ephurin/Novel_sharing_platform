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
- AI/Copilot contract stubs or lightweight integration.

## 2. Work Order Summary

| Phase | Focus | Primary Output |
| :--- | :--- | :--- |
| 0 | Repo scaffold | `backend/`, `web/`, shared conventions, env examples |
| 1 | Backend foundation | Express app, config, errors, auth, DB connections |
| 2 | Core content | Users, novels, chapters, drafts, publish state |
| 3 | Web Author IDE shell | Activity bar, story tree, editor layout, API client |
| 4 | Content Control + Interaction | Rule check, reports, comments, moderation queue |
| 5 | Reader experience | Public browse, novel detail, reader screen |
| 6 | Mock wallet | Coin balance, deposit mock, unlock, transactions |
| 7 | AI/Copilot | Metadata, suggestions, consistency check, context proposals |
| 8 | Admin dashboard | Users, taxonomy, moderation review, withdraw review, stats |
| 9 | Mobile app | Reader mobile app after APIs stabilize |

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

### Phase 3: Web Author AI Writing IDE Shell

References:

- `docs/Frontend/wireframes.md`
- `docs/Frontend/screen-specs.md`
- `docs/Frontend/user-flows.md`
- `docs/API/novel-chapter-api.md`
- `docs/API/ai-copilot-api.md`

Deliverables:

- React + Vite app shell.
- Mantine theme and layout baseline.
- Author IDE layout:
  - top toolbar;
  - left activity bar;
  - dynamic sidebar;
  - rich text editor area;
  - right AI assistant panel;
  - bottom status bar.
- API client wrapper.
- TanStack Query provider.
- Zustand UI state for active activity/sidebar.

Implementation note:

- AI/Copilot actions can be stubbed until Phase 7.
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

### Phase 5: Reader Experience

References:

- `docs/API/reading-api.md`
- `docs/API/novel-chapter-api.md`
- `docs/Frontend/wireframes.md`

Deliverables:

- public novel list/search;
- novel detail;
- chapter reader;
- reading history sync;
- library/bookmark;
- likes/follows.

Frontend:

- Web responsive fallback can be basic.
- Mobile app can wait until Phase 9.

### Phase 6: Mock Wallet

References:

- `docs/API/payment-wallet-api.md`
- `docs/SRS/payment-wallet-service.md`
- `docs/Database/postgresql-schema.md`

Deliverables:

- wallet balance;
- mock deposit session;
- mock deposit webhook/success action;
- VIP chapter unlock;
- donate Coins;
- author withdraw request;
- transaction history.

Rules:

- no real payment gateway;
- no real card/bank data;
- all wallet mutations create transaction rows;
- wallet decrement must be transaction-safe.

### Phase 7: AI + Writing Copilot

References:

- `docs/SRS/ai-intelligence-service.md`
- `docs/API/ai-copilot-api.md`
- `docs/Database/mongodb-collections.md`

Deliverables:

- metadata suggestion endpoint;
- classification endpoint;
- style analysis endpoint;
- `POST /ai/copilot/suggestions`;
- `POST /ai/copilot/consistency-check`;
- context proposal generation;
- context proposal approve/reject flow.

MVP option:

- Use deterministic/mock provider first.
- Keep `ai-provider.client` interface ready for real LLM integration.

Rules:

- AI suggestions do not auto-save into drafts.
- context updates require Author approval.
- consistency warnings are non-blocking.
- do not use AI for Content Control.

### Phase 8: Admin Dashboard

References:

- `docs/API/admin-api.md`
- `docs/API/content-control-api.md`
- `docs/Frontend/screen-specs.md`

Deliverables:

- admin dashboard stats;
- moderation review queue UI;
- user lock/unlock;
- taxonomy management;
- mock withdraw review.

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

## 4. Cross-Phase Rules

- API response format must follow `docs/API/conventions.md`.
- Error codes must follow `docs/API/error-codes.md`.
- Database ownership must follow `docs/Database/overview.md`.
- Backend module boundaries must follow `docs/Backend/module-structure.md`.
- Frontend Author IDE must follow `docs/Frontend/wireframes.md`.
- Do not implement features that contradict SRS/API docs; update docs first if requirements change.

## 5. Suggested First Coding Sprint

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
