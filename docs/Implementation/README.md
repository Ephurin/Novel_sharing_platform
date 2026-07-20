# Implementation Roadmap

This folder translates the completed design documents into implementation order.

Use it as the working checklist before creating `backend/`, `web/`, and later `mobile/`.

## Documents

| Document | Scope |
| :--- | :--- |
| `roadmap.md` | End-to-end implementation phases across backend, frontend, database, and AI/Copilot. |
| `phase-0-bootstrap-checklist.md` | First coding checklist for repository scaffolding. |
| `phase-1-backend-foundation-checklist.md` | Backend foundation checklist for auth middleware and database clients. |
| `phase-2-auth-user-core-content-checklist.md` | Auth, user, novel, chapter, draft, and publish-state implementation checklist. |
| `phase-3-web-author-ide-checklist.md` | Web Author IDE checklist for auth, project loading, chapter editing, and publish actions. |
| `phase-4-content-control-interaction-checklist.md` | Content Control, reports, admin moderation, and chapter comments checklist. |
| `phase-5-reader-backend-checklist.md` | Reader backend APIs: browse, reading, history, library, reactions. |
| `phase-6-mock-wallet-backend-checklist.md` | Mock wallet backend APIs: balance, deposit mock, unlock, donate, withdraw, transactions. |
| `phase-7-profile-notification-admin-checklist.md` | Profile, notification, and admin backend APIs: author profile, notifications, stats, users, taxonomy, withdraw review. |
| `phase-8-web-frontend-completion-checklist.md` | Web frontend completion for Author, Reader, Wallet, Notification, and Admin flows. |
| Phase 9 planned | Mobile reader app after reader/wallet APIs stabilize. |
| Phase 10 planned | AI/Copilot as a separate FastAPI service after non-AI backend and frontend are stable. |

## Source Documents

Read these before coding:

1. `docs/SRS/README.md`
2. `docs/API/README.md`
3. `docs/Database/README.md`
4. `docs/Backend/README.md`
5. `docs/Frontend/README.md`
6. `docs/techstack.md`
7. `SKILL/AGENTS.md`

## Current Implementation Strategy

- Build as a **modular monolith** first.
- Start with `backend/` and `web/`.
- Delay `mobile/` until core Reader APIs are stable.
- Keep payment as mock/demo only.
- Defer AI/Copilot until the non-AI backend and frontend are stable.
- Implement AI/Copilot as a separate FastAPI service when Phase 10 starts.
- Keep Node.js as the public API gateway for AI routes.
- Keep Content Control separate from AI/LLM.
