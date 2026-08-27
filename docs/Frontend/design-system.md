# Frontend Design System

This document defines the MVP visual and component rules for the Ephurin web UI.

The system should feel like a dark, focused writing IDE for authors, while keeping Reader and Admin screens readable and demo-safe.

## 1. Design Direction

| Area | Direction |
| :--- | :--- |
| Author IDE | Cursor/VSCode/Obsidian-inspired desktop workspace. |
| Reader Web | Clean reading fallback, less dense than Author IDE. |
| Admin | Operational dashboard with clear tables and decisions. |
| Wallet | Demo/mock financial UI; avoid real payment visual claims. |
| Notifications/Profile | Lightweight utility screens. |

## 2. Color Tokens

| Token | Value | Usage |
| :--- | :--- | :--- |
| `bg.app` | `#0f1117` | Main app background. |
| `bg.panel` | `#151a27` | Sidebar, assistant, nav panels. |
| `bg.surface` | `#171923` | Cards and form surfaces. |
| `bg.editor` | `#121620` | Author editor surface. |
| `border.default` | `#252a36` | Panel/card borders. |
| `text.primary` | `#edf0f7` | Main readable text. |
| `text.secondary` | `#d7dce8` | Secondary text. |
| `text.muted` | `#9aa4b8` | Metadata and hints. |
| `accent.primary` | `#8b5cf6` | Primary action and active nav. |
| `accent.success` | `#22c55e` | Success state. |
| `accent.warning` | `#f59e0b` | Pending/review state. |
| `accent.danger` | `#ef4444` | Destructive/rejected state. |

## 3. Typography

| Use | Font | Size |
| :--- | :--- | :--- |
| App/UI | System sans-serif | 12-16px |
| Editor prose | Georgia or serif fallback | 18-20px |
| Admin tables | System sans-serif | 13-14px |
| Status bar | System sans-serif | 11-12px |

Rules:

- Author editor content should use a prose-friendly serif font.
- UI labels and actions should use compact sans-serif.
- Avoid long all-caps labels except small section headers.

## 4. Layout Rules

### Author IDE

| Region | Rule |
| :--- | :--- |
| Top toolbar | 44px height, primary project/status/actions. |
| Activity bar | 52px width, icon-only navigation. |
| Dynamic sidebar | 280-340px width, changes by activity. |
| Editor | Flexible center area, minimum readable width. |
| Assistant/context panel | 320-380px width, AI disabled before Phase 10. |
| Status bar | 26px height, save/API/word status. |

### General Web Shell

| Region | Rule |
| :--- | :--- |
| Topbar | Product, role/session, logout. |
| Sidebar nav | 200-240px width. |
| Content | Scrollable page body with max comfortable density. |

## 5. Component Standards

| Component | Standard |
| :--- | :--- |
| Page Header | Title, short description, optional status badge/actions. |
| Card | `Paper` with border, `md` padding, one clear purpose. |
| Button | Primary for main action, subtle/light for secondary. |
| Badge | Status, role, VIP, moderation decision. |
| Table | Admin/transaction lists only; avoid huge dense tables for reader. |
| Modal | Confirm destructive/admin actions. |
| Text Input | Always labelled; placeholder is not a label. |
| Empty State | Explain why empty and what to do next. |
| Error State | Show actionable message; avoid raw stack traces. |
| Loading State | Button loading for mutations; skeleton/spinner for large lists. |

## 6. Status Badge Rules

| Domain Status | Badge Color |
| :--- | :--- |
| `DRAFT` | Gray |
| `PENDING_MODERATION` | Yellow |
| `PUBLISHED` | Green |
| `REJECTED` | Red |
| `ACTIVE` | Green |
| `LOCKED` | Red |
| `UNREAD` | Violet |
| `READ` | Gray |
| `PENDING` | Yellow |
| `SUCCESS` | Green |
| `FAILED` | Red |

## 7. Interaction Rules

- Never silently fail an API action.
- Disable actions only when the reason is obvious or shown nearby.
- Use confirmations for admin lock, reject, approve withdraw, and delete comment.
- Keep AI buttons disabled until Phase 10 and label them clearly.
- For mock wallet actions, display "Mock/Demo only" language.

## 8. Accessibility Rules

- All form inputs need visible labels.
- Interactive icons need `aria-label`.
- Color must not be the only status indicator; include text.
- Keyboard focus must remain visible.
- Long editor/reader text must preserve comfortable line height.

## 9. Review Checklist

- [ ] Main screens use the same page header/card/action patterns.
- [ ] Status badges are consistent.
- [ ] Empty/loading/error states exist.
- [ ] Author IDE keeps the IDE-inspired layout.
- [ ] Reader screens prioritize readability over density.
- [ ] Admin screens prioritize safe decisions over visual flair.
