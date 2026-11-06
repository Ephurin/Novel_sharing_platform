---
name: storycraft-dark-mode
description: Add, implement, or review a coherent accessible dark mode in StoryCraft without redesigning layouts, changing the warm editorial terracotta identity, or increasing content density. Use alongside storycraft-design-system and storycraft-content-density for new screens and existing UI.
---

# StoryCraft Dark Mode — Warm Editorial Night Theme

## 1. Scope and source of truth

This skill adds a **dark color mode** to the existing StoryCraft warm-editorial design system. It does **not** replace the approved **light ivory + terracotta** theme.

Use with:
- `storycraft-design-system` for color naming, typography, component sizes and the single global navbar.
- `storycraft-content-density` for low-text-density layouts and progressive disclosure.

**Priority:** functional correctness, accessibility, existing StoryCraft component rules, then aesthetic preferences. Preserve screen content, UI hierarchy, routes, controls, flows, book covers and avatars. Dark mode means changing semantic colors and states, **not** redesigning the page or reducing visible functionality.

## 2. Visual direction

**Keywords:** warm charcoal, ink, espresso, terracotta, literary, readable, restrained, calm.

- Use dark **warm gray/charcoal** backgrounds, not solid `#000000` everywhere.
- Surfaces form a subtle hierarchy: page canvas < card < elevated modal/popover (in lightness).
- Retain **soft terracotta-orange** as the brand accent; tune the dark-mode variant for sufficient contrast. No purple/blue rebrand, neon orange or excessive gradients.
- Neutral text should be warm off-white; helper text muted but legible.
- Success = readable mint, warning/VIP = soft amber, danger = gentle coral/red, drafts = gray.
- Borders should define regions softly; don't outline every nested container or increase visual noise.
- Keep book cover images, avatars, logos and photos at their original colors. **Never invert images or hue-rotate the whole app.**

## 3. Semantic color tokens

Reuse the same token **names** from `storycraft-design-system`; add dark values under `[data-theme="dark"]`. These hex values are **recommended starting points**, not measurements of existing screenshots. If a repo has a mature theme token layer, add dark values there instead of defining parallel palettes.

| Token | Light mode (existing reference) | Dark mode proposal | Usage |
|---|---|---|---|
| `--sc-bg` | `#F8F7F4` | `#171715` | Page canvas |
| `--sc-surface` | `#FFFFFF` | `#24221F` | Cards, panels |
| `--sc-surface-subtle` | `#FCFBF8` | `#2C2926` | Filter areas, table header, low-elevation controls |
| `--sc-surface-elevated` | `#FFFFFF` | `#322E2A` | Modals, popovers, dropdowns |
| `--sc-primary` | `#DD8567` | `#E69B7F` | Primary CTAs, selected affordances |
| `--sc-primary-hover` | `#C96F52` | `#F0AE95` | Hover or emphasized action |
| `--sc-primary-soft` | `#FFF1EA` | `#423026` | Subtle active background |
| `--sc-on-primary` | `#241915` | `#241915` | Accessible text/icons on terracotta buttons; test contrast |
| `--sc-text` | `#252B2A` | `#F2EFEA` | Primary text |
| `--sc-text-muted` | `#77736F` | `#BDB6AD` | Secondary metadata |
| `--sc-border` | `#E8E5DF` | `#45403A` | Borders/dividers |
| `--sc-success` | `#247F68` | `#89D9B6` | Published/success text |
| `--sc-success-bg` | `#DDF7EB` | `#1D3A30` | Success badge background |
| `--sc-warning` | `#9A641B` | `#F2C37E` | VIP/warning text |
| `--sc-warning-bg` | `#FFF1DA` | `#423422` | Warning badge background |
| `--sc-danger` | `#B84D49` | `#F2A09A` | Error/destructive text |
| `--sc-danger-bg` | `#FFF0EF` | `#4A2B2A` | Error badge background |
| `--sc-neutral-bg` | `#F1F0ED` | `#393631` | Draft/neutral badge background |
| `--sc-overlay` | `rgba(30,25,22,.42)` | `rgba(0,0,0,.68)` | Modal backdrop |
| `--sc-focus-ring` | `#C96F52` | `#F1AD8D` | Visible keyboard focus |

**Implementation rule:** Components use semantic tokens, not hardcoded light colors or global filters. Extend the table when genuine functional roles exist (e.g., chart series, selection, disabled, skeleton, editor canvas) rather than inventing random hex values in each component.

## 4. Typography and dimensions must remain identical

Dark mode **must not change**:
- Global font: `"Be Vietnam Pro", system-ui, sans-serif`.
- Shared type scale: page title 24/700, section 18/600, card/modal 16/600, body 14/400, label 13/500, metadata/status/table head 12px as defined in the design-system skill.
- Standard button 36px; small button 30px; input/select/search 40px; badge ~22px; existing card radius, table density and spacing grid.
- Global navbar structure, breadcrumbs, button priority, modal layout, chapter/wallet information architecture.
- Writing Studio text size preference; editor reading settings remain user-controlled.

If dark text seems too dense, adjust contrast/surface hierarchy and remove duplicate copy per `storycraft-content-density`; **do not shrink fonts**.

## 5. Theme control and preference behavior

Provide a small **Appearance / Giao diện** control in the user menu or an unobtrusive theme icon in the existing `GlobalNavbar`. Avoid a second navbar or a large standalone theme card.

Options: **Sáng / Tối / Theo hệ thống**.

- Default to system preference for a new visitor (unless an existing product preference takes precedence).
- A manually chosen Light/Dark preference overrides system changes.
- Persist the choice locally (e.g., `localStorage` with a stable key like `storycraft-theme`); if the product already stores a profile preference, integrate with it consistently.
- Apply the resolved theme to the root document (`<html data-theme="light|dark">`) **before the first content paint** to reduce flash of incorrect theme. For SSR, use an equivalent server/cookie/pre-hydration technique.
- When set to System, react to changes in `prefers-color-scheme`.
- On error or blocked storage, fall back to System gracefully.
- Use `color-scheme: light` / `color-scheme: dark` on root for native form controls and scrollbars.
- Switching theme must NOT reset form data, chapter drafts, editor state, scroll position, or navigation.

## 6. Component-specific dark-mode checklist

- **Navbar / breadcrumb:** dark warm surface, subtle divider, visible active state; orange CTA readable; text/icons legible.
- **Cards / grids:** separate canvas/cards by luminance and soft borders; preserve original book cover colors and 2:3 proportions.
- **Buttons:** accessible foreground on terracotta; hover, pressed, focus, disabled and loading all distinct. Avoid low-contrast white on pale orange.
- **Forms:** input surface differs from outer panel; readable placeholder, caret, focus ring, validation text and disabled states; prevent white native select popups where controllable.
- **Tables:** legible header, alternating or hover row surfaces only when useful; subtle row separators; selected row clearly distinguishable.
- **Badges:** dark tinted backgrounds with readable semantic foreground; no color-only communication—include short text/icon.
- **Modals / popovers / tooltips:** elevated surfaces, dimmed overlay, proper close/focus affordances, consistent layering and focus trap in code.
- **Charts:** adapt axes, gridlines, tooltips, legend, bars and labels to theme; keep revenue chart series distinct without neon colors.
- **Writing Studio:** use a comfortable deep-warm-neutral editor canvas and high-contrast prose; cursor, selection, spellcheck highlights, revision indicators, autosave warnings, and AI panels stay visible. Do not turn manuscript text terracotta.
- **Novel Manager / import:** maintain discoverable table actions, regex editor readability, parsing validation and missing-chapter warnings.
- **Wallet:** balances, conversion, fees, bank account details, disabled withdrawal actions, payout confirmation and financial notices must be easy to read. Keep bank display card distinctive but not glaring.
- **Public profile:** retain author portrait, banners, novel artwork; text over photography needs a readable overlay or solid content surface.

## 7. Accessibility and verification

- Meet **WCAG AA contrast targets** as the baseline: normal text >= 4.5:1, large text >= 3:1, important controls/non-text boundaries >= 3:1 where applicable. Check actual on-background pairs rather than guessing from token names.
- Focus outlines must be visible for keyboard users in both modes.
- Don't encode warnings, publishing states, VIP access or financial outcomes solely by color.
- Do not use opacity to the point that metadata, placeholders or disabled controls become ambiguous.
- Respect `prefers-reduced-motion` for transitions; theme change should be quick and not flash.
- Check desktop and mobile, especially menus, date-picker overlays, dropdowns, native controls and dark editor view.
- Verify both modes for default, hover, focus, disabled, loading, empty, error, success and modal-open states.
- Test persistence through refresh and route navigation; verify system mode responds to OS preference changes.

## 8. Agent workflow (required)

1. Inspect existing `storycraft-design-system` tokens/components and theme implementation; avoid duplicate systems.
2. Create/add a shared **semantic light/dark token mapping**; maintain existing light appearance.
3. Add theme preference state and root theme application as appropriate for the project's framework; handle system/persistence and initial flash.
4. Update shared components first: `GlobalNavbar`, Button, Input, Badge, Card, Table, Modal, Tooltip, Tabs, icons.
5. Audit each screen: Author Dashboard, Novel Manager, Writing Studio, Story Bible, Manuscript Import, Wallet, Public Author Profile.
6. Adjust code-level chart/portal/third-party component surfaces and image overlays separately when CSS variables are insufficient.
7. Test all states, contrast, switching, persistence, and navigation. Don't claim complete coverage unless verified.
8. When working in Stitch (design only), make a **dark variant of the selected existing screen**, referencing its light version; Stitch mockups do not implement preference persistence or functional switching.

## 9. Non-goals / mistakes to avoid

- No global `filter: invert(1)` or `hue-rotate()` on the app.
- No separate new design system or random palette per page.
- No changing warm terracotta to purple/blue for dark mode.
- No project-wide layout redesign or additional navigation.
- No more on-screen paragraphs, explanatory cards, badges or dashboards to "justify" dark mode.
- No replacing user-uploaded cover images/avatars.
- No fake dark mode that is only one screenshot without an implementation plan when the user requested working UI.

## 10. Reusable handoff instruction

> Implement StoryCraft dark mode using `storycraft-dark-mode` with `storycraft-design-system` and `storycraft-content-density`. Keep the current light theme intact. Use central semantic light/dark tokens, expose Light/Dark/System in the existing navbar user menu, save preference, respect system preference, avoid initial flash, preserve all layouts and functions, and verify accessibility across all screens.
