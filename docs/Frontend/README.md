# Frontend Mockup & UX Notes

This folder contains low-fidelity frontend mockups for the Ephurin Novel Platform.

The goal is not to finalize visual design. The goal is to make screen structure, user flows, and API needs visible before frontend implementation.

## Documents

| Document | Scope |
| :--- | :--- |
| `sitemap.md` | Web, Mobile, and Admin screen hierarchy. |
| `user-flows.md` | Main user journeys for Reader, Author, Admin, Wallet, and Copilot. |
| `wireframes.md` | Index for split low-fidelity wireframe documents. |
| `wireframes-web.md` | PC web/desktop ASCII wireframes for public, reader web, author, wallet, and admin screens. |
| `wireframes-mobile.md` | Mobile app ASCII wireframes for reader-first mobile flows. |
| `screen-specs.md` | Screen purpose, primary data, and related APIs. |
| `routes-and-guards.md` | Web/mobile route map and role-based access rules. |
| `design-system.md` | MVP visual tokens, layout rules, components, and interaction standards. |
| `screen-details-web.md` | Implementation-ready web screen details for Author, Reader, Wallet, Notifications, Profile, and Admin. |
| `screen-details-mobile.md` | Implementation-ready mobile reader screen details for Phase 9. |
| `frontend-state-model.md` | Frontend session, server state, UI state, and query key conventions. |
| `api-screen-matrix.md` | Screen-to-API mapping and API alignment notes. |
| `review-guide.md` | Checklist for reviewing mockups before UI implementation. |

## Design Boundary

- These mockups belong to UI/UX design, not SRS use-case definition.
- SRS defines what the system must do.
- API docs define how screens get/save data.
- Backend/Database docs define implementation structure.
- Frontend docs define how users see and operate the system.

## Target Clients

- **Web App:** Author workspace and Admin dashboard.
- **Mobile App:** Reader browsing, reading, interaction, wallet mock usage.
- **Responsive Web fallback:** Basic reader browsing can work on web if needed, but Mobile is the primary Reader client.

## Implementation Handoff

- Use `docs/Implementation/roadmap.md` for implementation order.
- Use `docs/Implementation/phase-0-bootstrap-checklist.md` before scaffolding `web/`.
- Author IDE implementation should start from `wireframes-web.md` and `screen-specs.md`.
- Mobile reader implementation should start from `wireframes-mobile.md` and `screen-details-mobile.md`.
- Phase 8.x implementation should use `routes-and-guards.md`, `design-system.md`, `screen-details-web.md`, `frontend-state-model.md`, and `api-screen-matrix.md`.
- Phase 9 mobile implementation should use `screen-details-mobile.md`.
