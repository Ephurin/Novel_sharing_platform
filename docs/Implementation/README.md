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
| `phase-8x-web-frontend-completion-plan.md` | Intermediate web frontend phases before mobile: foundation hardening, official Author IDE, Reader web, utility/admin UI, final polish. |
| `phase-8-1-frontend-foundation-hardening-checklist.md` | Frontend foundation hardening: session restore, role guards, shared UI states, API errors, admin confirmations. |
| `phase-8-2-author-project-manager-checklist.md` | Author project manager UI, author-reader switching, and current-author novel endpoint. |
| `phase-8-3-reader-web-checklist.md` | Reader web UI for search, novel detail, chapter reading, comments, library, history, and VIP unlock. |
| `phase-8-4-utility-admin-profile-checklist.md` | Wallet, notifications, profile/settings, public author profile, and admin utility UI review. |
| `phase-8-ui-coverage-audit.md` | Gap audit across sitemap, API usage, and database/Mongo visibility before final web QA. |
| `phase-8-5-author-workspace-deepening-checklist.md` | Author metadata editor, deep links, project health, and non-AI context placeholders. |
| `phase-8-6-reader-experience-deepening-checklist.md` | Reading preferences, auto-history, reader filters, comment edit, and social UX. |
| `phase-8-7-admin-moderation-deepening-checklist.md` | Admin reports, moderation detail, and moderation evidence visibility. |
| `phase-8-8-public-guest-web-checklist.md` | Public landing/browse/detail and guest action gates. |
| `phase-8-9-final-web-qa-checklist.md` | Final web UI QA before Phase 9 mobile. |
| `phase-8-10-author-premium-chapter-checklist.md` | Author IDE controls and backend validation for Premium/VIP chapter pricing before publication. |
| `../SystemTest/README.md` | System test handoff guide for another tester/agent after Phase 8 Web MVP. |
| `phase-9-mobile-reader-app-checklist.md` | Mobile Reader App implementation and Android Expo Go review checklist. |
| `phase-9-5-authoring-context-core-checklist.md` | Non-AI Authoring Context Core: character profiles, relationships, timeline events, and plot summaries. |
| `phase-9-6-admin-novel-management-checklist.md` | Admin novel catalog management and reversible soft removal with Author notification. |
| Phase 10 planned | AI/Copilot as a separate FastAPI service after Authoring Context Core is stable. |

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
- Implement Authoring Context Core before AI/Copilot because characters, timeline, and summaries are core Author story-management data.
- Defer AI/Copilot until the non-AI backend, frontend, and Authoring Context Core are stable.
- Implement AI/Copilot as a separate FastAPI service when Phase 10 starts.
- Keep Node.js as the public API gateway for AI routes.
- Keep Content Control separate from AI/LLM.
