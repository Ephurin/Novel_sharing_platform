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
- Keep AI/Copilot behind provider/client abstraction.
- Keep Content Control separate from AI/LLM.
