# Ephurin Backend Architecture

This folder describes the backend architecture for the Ephurin Novel Platform.

The architecture follows the service boundaries defined in `docs/SRS`, `docs/API`, and `docs/Database`, but is implementation-friendly for a graduation-project scope.

## Documents

| Document | Scope |
| :--- | :--- |
| `overview.md` | Architecture style, runtime components, dependency direction, and data access principles. |
| `module-structure.md` | Suggested Node.js backend folder/module layout. |
| `cross-cutting-concerns.md` | Auth, RBAC, validation, errors, logging, transactions, caching, and background jobs. |
| `service-flows.md` | Key backend flows: auth, Content Control publish checks, comments, wallet, reading sync, Copilot context proposals. |
| `implementation-plan.md` | Suggested build phases and implementation priorities. |
| `review-guide.md` | Checklist for reviewing backend architecture before coding. |

Implementation handoff:

- Use `docs/Implementation/roadmap.md` for cross-stack implementation order.
- Use `docs/Implementation/phase-0-bootstrap-checklist.md` before scaffolding `backend/`.

## Recommended Approach

Use a **modular monolith** for MVP implementation:

- one backend codebase;
- approved stack: **Express + TypeScript**;
- modules match future microservice boundaries;
- each module owns its service layer and repository layer;
- shared cross-cutting code lives in `core` or `common`.

This keeps the project simple enough for a graduation demo while preserving clean boundaries for future microservice extraction.
