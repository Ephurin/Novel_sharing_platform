---
name: storycraft-design-system
description: Apply the StoryCraft warm editorial design system to new or existing web screens. Use this skill whenever creating, implementing, reviewing, or restyling StoryCraft interfaces, components, pages, or design prompts. Prioritize visual consistency with the approved warm ivory and terracotta references over creative variation.
---

# StoryCraft Design System — Warm Editorial UI

## 1. Purpose and priority

This skill defines the **single visual source of truth** for StoryCraft, a Vietnamese novel writing and publishing platform.

Use it when designing in Stitch/Figma or implementing frontend pages and components. The approved visual direction is the **warm, light editorial/publishing dashboard** shown in the reference **Tác phẩm / Author Dashboard** and **Novel Manager** screens: off-white page background, warm-white cards, restrained terracotta/orange actions, thin warm-gray borders, compact tables and controls, and very readable Vietnamese text.

**Important: This warm editorial theme REPLACES the earlier purple/lavender StoryCraft theme. Do not default back to purple.**

Precedence when instructions conflict:
1. Explicit requirements for the current task (functionality, content, accessibility, brand changes).
2. These StoryCraft global design tokens and shared component rules.
3. Layout conventions in the approved reference screens.
4. Agent/AI design preferences and defaults.

Do not change business logic or remove features merely to follow the visual style. Prefer reusing existing shared components/tokens instead of duplicating styles per screen.

## 2. Visual identity

**Keywords:** warm, editorial, literary, refined, lightweight, structured, approachable, information-efficient.

- Overall surface: warm ivory/off-white, not pure cold gray, not lavender.
- Cards and panels: white or very slightly warm white, 1px subtle border, modest corner radius, minimal shadow.
- Primary accent: soft terracotta / coral-orange. Use it for primary CTAs, selected nav states, highlighted links, and restrained accent details.
- Text: warm charcoal, clear visual hierarchy, muted warm gray for supporting metadata.
- Success: soft mint/green; Warning/VIP: soft amber; Error: muted red; Draft: neutral gray.
- Avoid heavy gradients, dramatic shadows, glassmorphism, saturated/neon accents, large decorative backgrounds, and excessive pills/badges.
- Use **one compact global navbar**. Do not introduce a secondary global/novel navbar unless explicitly requested. Use breadcrumbs and contextual page actions.

### 2.1 Color tokens

Use existing repository tokens if they already implement this warm reference style. Otherwise start with these **recommended implementation tokens**. They are approximations of the visual references, **not claimed to be pixel-sampled exact colors**. Define centrally and never invent slightly different values on individual screens.

| Token | Suggested hex | Usage |
|---|---|---|
| `--sc-bg` | `#F8F7F4` | Page canvas, warm ivory |
| `--sc-surface` | `#FFFFFF` | Cards, modals, tables |
| `--sc-surface-subtle` | `#FCFBF8` | Filters, soft sections |
| `--sc-primary` | `#DD8567` | Primary button, active states |
| `--sc-primary-hover` | `#C96F52` | Primary hover |
| `--sc-primary-soft` | `#FFF1EA` | Selected accents and faint fills |
| `--sc-text` | `#252B2A` | Primary text |
| `--sc-text-muted` | `#77736F` | Secondary metadata |
| `--sc-border` | `#E8E5DF` | Card/input/table borders |
| `--sc-success` | `#247F68` | Published/success text |
| `--sc-success-bg` | `#DDF7EB` | Published/success badge |
| `--sc-warning` | `#9A641B` | VIP/warning text |
| `--sc-warning-bg` | `#FFF1DA` | VIP/warning badge |
| `--sc-danger` | `#B84D49` | Error/destructive text |
| `--sc-danger-bg` | `#FFF0EF` | Error/destructive badge |
| `--sc-neutral-bg` | `#F1F0ED` | Draft/neutral badges |

Aim for sufficient contrast; adjust accessible foreground colors when needed. Primary orange should not be used for long blocks of text on white if contrast is insufficient.

## 3. Typography — strict global rules

**Single UI font family:** `"Be Vietnam Pro", system-ui, sans-serif` with Vietnamese character support. Import once in the app shell. Do **not** mix Inter, Roboto, Times New Roman, Georgia, or ad-hoc fonts across screens. Avoid all-caps labels unless meaningful and used consistently.

Use these **semantic type tokens** on every page:

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Page title (`.text-page-title`) | 24px | 700 | 32px |
| Section title (`.text-section-title`) | 18px | 600 | 26px |
| Card / modal title (`.text-card-title`) | 16px | 600 | 24px |
| Body (`.text-body`) | 14px | 400 | 22px |
| Navigation (`.text-nav`) | 14px | 500 | 20px |
| Button (`.text-button`) | 14px | 600 | 20px |
| Form label (`.text-form-label`) | 13px | 500 | 20px |
| Table body (`.text-table`) | 13px | 400 | 20px |
| Table header (`.text-table-head`) | 12px | 600 | 18px |
| Metadata/helper (`.text-meta`) | 12px | 400 | 18px |
| Badge/status (`.text-badge`) | 12px | 500 | 16px |

**Consistency invariant:** A form label on Wallet must look identical to a form label on Novel Manager; shared button labels, table headers, metadata, and badges must also use identical role tokens. Do not make labels smaller simply to fit more UI. Truncate, wrap intentionally, widen a column, or simplify content instead.

**Writing Studio exception:** Manuscript prose can use a dedicated readable editor scale (e.g. 16–18px, 1.7–1.9 line-height) while keeping the same font family by default. The editor canvas should support user-configurable reading size if the application requires it. UI chrome still follows the standard tokens.

## 4. Spacing, dimensions, and shape

Use a **4px grid**. Prefer spacing tokens `4 / 8 / 12 / 16 / 24 / 32px`; avoid arbitrary per-screen spacing.

| Element | Standard |
|---|---|
| Global navbar | ~56–60px high; same on every page |
| Main content | Consistent centered max width (e.g. 1200–1280px) with ~24px desktop gutters |
| Standard button | 36px high |
| Small button | 30px high |
| Text input / select / search | 40px high |
| Badge | ~22px high, no wrapping |
| Standard card padding | 16–20px |
| Content section gap | 24px |
| Major section gap | 32px |
| Table row | ~48–52px minimum, expand for content/accessibility |
| Standard card radius | 10–12px |
| Button/input radius | 6–8px |
| Modal radius | 12–14px |
| Border | 1px soft warm gray |
| Icons | 16px standard, 20px for featured context, consistent stroke |

Component alignment matters more than fitting a specific number of items above the fold. Keep the page airy without enormous whitespace. Avoid dense nesting of cards within cards.

## 5. Reusable UI components

### 5.1 `GlobalNavbar`
- Same logo, font, logo size, navbar height, active-item treatment, spacing, and actions on all screens.
- White/warm-white bar with subtle bottom border; terracotta active state and primary “Viết tiếp” action as appropriate.
- For the current user-facing product, preserve the nav labels and routing structure from the actual application; avoid mixing earlier mockup labels if the source project differs.
- Do not automatically add a second navigation row or permanent sidebar.

### 5.2 `Button`
- Variants: **primary, secondary, outline, ghost, danger**. Consistent height, radius, icon gap, padding, type scale, focus/hover/disabled states.
- Primary = terracotta fill with accessible contrasting text.
- Secondary/outline = subtle neutral surface, soft border and charcoal text.
- Do not render four equally emphasized CTAs inside one small card. Prioritize one action; move secondary actions to contextual or overflow menus.

### 5.3 `Input`, `Select`, `Textarea`, `SearchField`
- Same label style (`13px/500`), border, focus ring, error feedback, placeholder colors and spacing.
- Single-line controls = 40px. Textareas size based on content.
- Required markers and validation styles are identical across every form.

### 5.4 `Badge`, `StatusBadge`
- Small, readable, ~22px tall; same font/padding/radius per variant.
- **Published**: soft mint/green; **Draft**: subtle gray; **VIP/warning**: amber; **Error**: pale red.
- Use color semantically, not decoratively; do not combine too many status pills in a single row. Badges should not wrap to two lines.

### 5.5 `Card`, `NovelCard`
- White surface, 1px warm border, moderate radius, little or no shadow.
- Align information, titles, cover aspect ratio, and footer actions consistently.
- In **Author Dashboard**, keep cards functional and concise (title, status, chapter/read stats, last activity, primary actions); do not crowd with long synopses or a row of badges.
- On a **public author profile**, prioritize book covers (vertical 2:3), title, genre and brief stats; entire card/cover can link to the novel, with no repeated management actions.

### 5.6 `Table`, `FilterBar`, `Tabs`, `Pagination`
- Table header uses `12px/600`, table body `13px/400`, subtle horizontal rules, aligned numerics and dates.
- Keep filter controls to one compact row if possible; use responsive wrapping instead of shrinking type below token size.
- Restrained active tab indicator in terracotta; consistent tab label size and underline/border behavior.
- Pagination uses the same button/active colors across all data tables.

### 5.7 `Modal`, `Dialog`
- Consistent title, close icon, padding, field spacing and footer alignment.
- One clear primary confirmation and one secondary cancel action; destructive operations use danger styling and explicit confirmation.
- Standardized overlay, focus management, keyboard Escape behavior, and form validation feedback in implementation.

### 5.8 `Breadcrumb`, icons, and imagery
- Consistent breadcrumb type scale, separators, spacing and muted/link colors.
- One icon style (Lucide-like outline icons), matching stroke and size.
- Preserve uploaded book covers and author avatars; never replace existing assets with stock photos or placeholders during a style-only refactor.
- Book covers generally use a vertical **2:3 aspect ratio**; avoid accidental square crops.

## 6. Page-level rules

These rules apply across StoryCraft's author-facing workflows:

- **Author Dashboard:** compact metrics, filter/search toolbar, consistent novel cards; prioritize finding and continuing books.
- **Novel Manager:** concise novel overview and aligned stats; chapter table is main content; contextual actions are grouped, not scattered.
- **Writing Studio:** maximize writing canvas; low-distraction editor, chapter navigation, optional AI panel; allow focus mode. Do not add redundant navigation chrome.
- **Story Bible:** readable character index and detail editor; relationships/timeline separated into meaningful tabs or views; no analytical dashboard widgets.
- **Manuscript Import:** upload → analyze/preview → confirm; clear column labels and inline validation; imported chapters are drafts until explicitly published.
- **Wallet & Revenue:** clear balance and transaction hierarchy, consistent data formatting, bank account masking, and validation; do not invent financial policy constants.
- **Public Author Profile:** author identity, follow/support, published books; minimal metadata, no private dashboards or management actions in reader view.

### Status/data principles
- Do not use invented live stats or unverified financial policies in production UI. Mock data should be clearly synthetic.
- Distinguish book writing state (ongoing/completed) from publication visibility (draft/public/hidden).
- Distinguish public metadata from author-only metrics and actions.

## 7. Responsive behavior and accessibility

- Design desktop-first with the reference look at approximately **1440px** viewport, but make responsive behavior explicit.
- At narrower widths, collapse grids progressively and allow toolbars to wrap, without shrinking fonts or overflowing badges.
- Keep tap targets comfortably usable, labels associated with controls, keyboard focus visible, color contrast readable, and tables horizontally scrollable where appropriate.
- Do not communicate status through color alone; include short visible status text.
- Support Vietnamese diacritics and natural wrapping, especially for long chapter and novel titles.

## 8. Implementation example (CSS tokens)

If the repository uses Tailwind or another design-token system, translate these definitions into its existing theme configuration **once**; do not keep duplicate systems.

```css
:root {
  --sc-font: "Be Vietnam Pro", system-ui, sans-serif;
  --sc-bg: #F8F7F4;
  --sc-surface: #FFFFFF;
  --sc-surface-subtle: #FCFBF8;
  --sc-primary: #DD8567;
  --sc-primary-hover: #C96F52;
  --sc-primary-soft: #FFF1EA;
  --sc-text: #252B2A;
  --sc-text-muted: #77736F;
  --sc-border: #E8E5DF;
  --sc-success: #247F68;
  --sc-success-bg: #DDF7EB;
  --sc-warning: #9A641B;
  --sc-warning-bg: #FFF1DA;
  --sc-danger: #B84D49;
  --sc-danger-bg: #FFF0EF;
  --sc-radius-card: 12px;
  --sc-radius-control: 8px;
  --sc-button-height: 36px;
  --sc-input-height: 40px;
  --sc-badge-height: 22px;
  --sc-content-width: 1240px;
}

html, body { font-family: var(--sc-font); color: var(--sc-text); }
body { background: var(--sc-bg); }
```

> The hexadecimal values are an initial reusable approximation. If the project already has an approved token file closer to the references, use that single token file instead and keep the component rules unchanged.

## 9. Agent workflow — mandatory before and after UI changes

When asked to **create a new screen**:
1. Inspect the repository's existing theme/tokens, font setup, `GlobalNavbar`, shared `Button`, `Input`, `Badge`, `Card`, `Table`, `Modal`, and adjacent screens.
2. Reuse those components; define missing reusable variants centrally if necessary.
3. Follow the warm editorial reference (not earlier purple versions) and semantic type/spacing tokens.
4. Implement the requested page's actual content, route, and interactions without unrelated visual additions.
5. Verify at desktop and responsive widths, and compare the shared elements against at least one existing StoryCraft page.

When asked to **restyle an existing screen**:
1. Preserve route, content, data and behavior unless changes are explicitly requested.
2. Replace local, ad-hoc values with shared design tokens/components.
3. Do not swap real images with generated placeholders.
4. Check that typography, control heights, table rows, badges, and the navbar match other screens.

When the agent **cannot access the visual references or shared design tokens**, state the limitation and use this written skill as the baseline. Do not claim pixel-perfect matching.

### Final visual consistency checklist

- [ ] Warm ivory canvas and warm-white cards, **no purple primary theme**.
- [ ] Terracotta primary buttons, active states, and links used consistently.
- [ ] One font family: Be Vietnam Pro.
- [ ] Same semantic typography roles have same size/weight/line height.
- [ ] Buttons 36px, inputs 40px, badges ~22px unless documented size variant.
- [ ] Same global navbar and breadcrumb styles across pages.
- [ ] Semantic badge colors; no excess colored labels.
- [ ] Thin warm-gray borders, restrained shadows and consistent radii.
- [ ] Tables/cards are concise, aligned, scannable.
- [ ] Only requested features/content; no surprise extra nav or dashboard widgets.
- [ ] Responsive layout, Vietnamese text wrapping, keyboard focus and accessible contrast checked.

## 10. Reusable instruction for external screen generators

Paste this **in addition to** a detailed screen specification when using Stitch or another design generator:

> **STRICT STORYCRAFT DESIGN CONSISTENCY:** Match the approved StoryCraft Author Dashboard and Novel Manager warm editorial reference screens. Use warm ivory page backgrounds, white/warm-white cards, terracotta-orange primary CTAs, mint published statuses, amber VIP states, warm-gray borders, and one global Be Vietnam Pro font. Apply the typography scale, control sizes, spacing and component rules defined in the StoryCraft Design System. All equivalent labels, buttons, inputs, tables, statuses and nav elements must look identical between screens. Preserve the requested functionality and content. Do not generate a new Style Guide screen, switch back to purple, create a secondary navbar, or invent new component styles. Create or edit the requested application screen only.
