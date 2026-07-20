# Backend Module Structure

This document proposes a Node.js backend folder structure for **Express + TypeScript**. The structure keeps module boundaries explicit so the project can evolve later if another framework is adopted.

## Suggested Folder Layout

```txt
backend/
  src/
    main.ts
    app.ts

    core/
      config/
      database/
      errors/
      logger/
      middleware/
      security/
      validation/
      response/

    modules/
      auth/
        auth.controller.ts
        auth.service.ts
        auth.repository.ts
        auth.routes.ts
        auth.schemas.ts
        auth.types.ts

      users/
        users.controller.ts
        users.service.ts
        users.repository.ts
        users.routes.ts
        users.schemas.ts
        users.types.ts

      novels/
        novels.controller.ts
        novels.service.ts
        novels.repository.ts
        chapters.service.ts
        chapters.repository.ts
        context.service.ts
        context.repository.ts
        proposals.service.ts
        proposals.repository.ts
        novels.routes.ts
        novels.schemas.ts
        novels.types.ts

      reading/
        reading.controller.ts
        reading.service.ts
        reading.repository.ts
        reading-cache.repository.ts
        reading.routes.ts
        reading.schemas.ts
        reading.types.ts

      interactions/
        comments.controller.ts
        comments.service.ts
        comments.repository.ts
        likes.service.ts
        follows.service.ts
        notifications.service.ts
        notifications.repository.ts
        interactions.routes.ts
        interactions.schemas.ts
        interactions.types.ts

      wallet/
        wallet.controller.ts
        wallet.service.ts
        wallet.repository.ts
        transaction.service.ts
        transaction.repository.ts
        wallet.routes.ts
        wallet.schemas.ts
        wallet.types.ts

      ai-gateway/              # Phase 10 placeholder; do not implement before Phase 10
        ai-gateway.controller.ts
        ai-gateway.service.ts
        ai-service.client.ts
        ai-gateway.routes.ts
        ai-gateway.schemas.ts
        ai-gateway.types.ts

      content-control/
        content-control.controller.ts
        content-control.service.ts
        content-filter.service.ts
        moderation.service.ts
        reports.service.ts
        moderation.repository.ts
        moderation-evidence.repository.ts
        content-control.routes.ts
        content-control.schemas.ts
        content-control.types.ts

      admin/
        admin.controller.ts
        dashboard.service.ts
        taxonomy.service.ts
        admin.routes.ts
        admin.schemas.ts
        admin.types.ts

    jobs/
      reading-history-sync.job.ts
      notification-dispatch.job.ts
      cleanup-expired-tokens.job.ts
      moderation-evidence-retention.job.ts
      ai-log-retention.job.ts

    shared/
      constants/
      events/
      utils/

ai-service/                    # Phase 10 FastAPI service; created after Phase 9
  app/
    main.py
    api/
    core/
    providers/
    copilot/
    embeddings/
    consistency/
    schemas/
  tests/
```

## Layer Responsibilities

### Controller

Responsibilities:

- parse route params/query/body;
- call validation;
- call service methods;
- return response envelope.

Controllers should not:

- query database directly;
- contain business transactions;
- call external AI/payment services directly.

### Service

Responsibilities:

- business rules;
- permission/ownership checks;
- state transitions;
- transaction orchestration;
- cross-module coordination.

Examples:

- `wallet.service.ts` performs unlock/donate/withdraw transactions.
- `context.service.ts` commits approved context proposals.
- `content-control/moderation.service.ts` resolves novel, chapter, and comment moderation reviews.
- `admin` services manage user accounts, taxonomy, dashboard data, and mock withdraw review.

### Repository

Responsibilities:

- ORM queries;
- MongoDB queries;
- raw SQL where needed;
- mapping database records to domain models.

Repositories should not:

- decide business permissions;
- return raw sensitive fields such as `password_hash`;
- call other modules' services.

## Module Ownership

| Module | Owns |
| :--- | :--- |
| `auth` | `users.password_hash`, `refresh_tokens`, login/logout/token logic. |
| `users` | `user_profiles`, user settings. |
| `novels` | `novels`, `chapters`, `draft_chapters`, official story context, context proposals. |
| `reading` | `reading_preferences`, `reading_histories`, `bookmarks`, reading cache. |
| `interactions` | `comments`, `likes`, `follows`, `notifications`, `device_tokens`. |
| `wallet` | `wallets`, `transactions`, `chapter_unlocks`, `deposit_sessions`, `withdraw_requests`. |
| `ai-gateway` | Node.js auth/ownership/rate-limit boundary and internal client for future AI service calls. |
| `ai-service` | Future FastAPI service for AI provider calls, Copilot suggestions, consistency checks, embeddings, and generation logs. |
| `content-control` | `content_filter_rules`, `moderation_reviews`, `reports`, `moderation_evidence`. |
| `admin` | user management, dashboard aggregation, taxonomy management, mock withdraw review. |

## Shared Types and DTOs

Each module should define:

- request DTOs;
- response DTOs;
- internal domain types;
- validation schemas.

Shared enums should come from a central constants module and match `docs/Database/enums-and-indexes.md`.

## Route Registration

The app should register route groups by module:

```txt
/api/v1/auth
/api/v1/users
/api/v1/novels
/api/v1/chapters
/api/v1/reading
/api/v1/wallet
/api/v1/ai
/api/v1/content-control
/api/v1/admin
```

`/api/v1/ai` should be exposed by the Node.js `ai-gateway` in Phase 10. The public API must not expose the FastAPI service directly.

Some resource routes are mounted across modules but should still call the owner module:

| Route | Owner Module |
| :--- | :--- |
| `/novels/{novelId}/likes` | `interactions` |
| `/reading/library/me` | `reading` |
| `/chapters/{chapterId}/unlock` | `wallet` |
| `/context-proposals/{proposalId}/approve` | `novels` |
| `/admin/moderation/*` | `content-control` |
| `/reports` | `content-control` |

## Framework Decision

Approved framework for MVP: **Express + TypeScript**.

Rationale:

- simple enough for a graduation-project team;
- easy to map API docs to route/controller/service/repository files;
- less framework-specific learning overhead than NestJS;
- flexible enough to keep module boundaries clean.

Alternatives considered:

| Option | Pros | Cons |
| :--- | :--- | :--- |
| Express/Fastify + manual modules | Simple, lightweight, easy to understand. | Requires strict folder and naming conventions. |
| NestJS | Strong module structure, DI, guards, decorators. | More framework concepts to learn. |

Fastify or NestJS can be reconsidered after MVP, but API/DB docs should proceed with Express conventions now.

## AI Service Decision

Approved future direction for Phase 10: **FastAPI + Python** for AI/Copilot execution.

Rationale:

- Python has stronger LLM, embedding, and vector retrieval ecosystem support.
- AI dependencies remain isolated from the core Node.js backend.
- The core backend can stay stable while AI provider/model choices evolve.
- AI failures or latency can be contained behind a gateway/client boundary.

Until Phase 10, keep AI routes and UI entry points as placeholders only.
