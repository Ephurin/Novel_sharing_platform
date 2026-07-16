# Frontend Mockup & UX Notes

This folder contains low-fidelity frontend mockups for the Ephurin Novel Platform.

The goal is not to finalize visual design. The goal is to make screen structure, user flows, and API needs visible before frontend implementation.

## Documents

| Document | Scope |
| :--- | :--- |
| `sitemap.md` | Web, Mobile, and Admin screen hierarchy. |
| `user-flows.md` | Main user journeys for Reader, Author, Admin, Wallet, and Copilot. |
| `wireframes.md` | Low-fidelity ASCII wireframes for key screens. |
| `screen-specs.md` | Screen purpose, primary data, and related APIs. |
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
- Author IDE implementation should start from `wireframes.md` and `screen-specs.md`.
