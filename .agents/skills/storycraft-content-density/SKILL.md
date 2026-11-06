---
name: storycraft-content-density
description: Reduce visual text clutter in StoryCraft UI designs and frontend without removing essential capabilities. Use alongside storycraft-design-system whenever designing, reviewing, implementing, or simplifying StoryCraft screens, cards, forms, tables, dashboards, or public pages.
---

# StoryCraft — Content Density & Progressive Disclosure

> **Purpose:** Make StoryCraft interfaces quiet, scannable and task-focused. **Reduce the amount of visible text**, not the font size. This skill complements `storycraft-design-system` (warm ivory + terracotta palette, Be Vietnam Pro, shared typography/component tokens). If they conflict, preserve design tokens from `storycraft-design-system` and follow this skill for content hierarchy and density.

## 1. Golden rule: less content, not smaller text

- Show only information needed for the **user's next decision or action**.
- Prefer **removing repetitions, combining related facts and moving secondary details to progressive disclosure** over font-size/padding reductions.
- Never make text tiny, reduce contrast, or cram more information into the same space in the name of minimalism.
- Preserve required fields, accessibility labels, critical warnings, financial disclosures, validation feedback, and essential workflows. Hide secondary details *accessibly*, not delete information or backend data.
- Keep Vietnamese labels short, concrete and natural. Avoid decorative copy, marketing slogans, fake endorsements and excessive instructional paragraphs.
- Do not add sections or widgets merely to fill whitespace. Whitespace can be intentional.

## 2. Information hierarchy: 3 visibility levels

1. **Always visible (primary):** page title, current object/context, core metric/status, primary action, and data essential for immediate decisions.
2. **Visible when useful (secondary):** short metadata, one concise helper line or one supporting metric. Prefer one line and group related values (e.g. `48 chương · 142,8K lượt đọc`).
3. **On demand (tertiary):** long descriptions, logs, IDs, advanced settings, detailed analytics, extra actions, explanations and rarely-used metadata. Place in details drawer, tooltip (nonessential only), expansion, secondary tab, modal or overflow menu as appropriate.

**Do not move safety-critical warnings, blocking validation messages, permissions or monetary terms to tooltip-only presentation.** Critical information must remain discoverable and readable before decisions.

## 3. Concrete text budgets (defaults, not hard truncation rules)

These are **target presentation budgets**. If exact meaning would be lost, retain the information or provide a visible way to expand it.

| UI region | Suggested visible content |
|---|---|
| Page header | One title + optional one-line subtitle; no repeated breadcrumb/context chips |
| General-purpose card | Title + up to 2 short metadata lines + one primary action; avoid more than one status badge |
| Author Dashboard novel card | Cover + title (up to 2 lines) + 1 status + `chapters · reads` + 1 recent-activity line only if genuinely useful; 1 primary CTA and optional secondary/overflow |
| Public novel gallery card | Cover + title + genre + one compact stats line; entire card is link, no repeated CTA |
| KPI card | Single label + primary number + at most one clarification; no multi-sentence prose |
| Table row | Distinct necessary fields only; avoid repeated IDs, duplicate titles, overlapping statuses and verbose row actions |
| Status badge | One short status; avoid stacking role, genre, VIP, status, rank and multiple achievements |
| Modal | Short title + necessary controls + essential help/validation + clear primary/secondary actions |
| Helper text | Maximum one short, plain-language sentence; remove when the field label is self-explanatory |
| Empty state | What happened + one action; no long motivational messages |

Avoid arbitrary ellipsis on crucial titles and numbers. Allow at most 2 lines for titles, use sensible column widths and overflow details if needed.

## 4. Deduplication pass — mandatory

For every screen, check and eliminate:

- Information repeated in global navbar, breadcrumbs, context chip, page title and card heading.
- Same action exposed repeatedly in top toolbar, each card and footer without contextual reason.
- Multiple badges representing the same status.
- Decorative microcopy such as `Theo dõi hành trình sáng tác của bạn` when the page purpose is already obvious.
- Multiple metrics that differ only by wording or are not actionable.
- Copying long novel descriptions onto an author management card or multiple data tables.
- Duplicate warnings, instructional tips or explanatory text that users can infer from labels.

**Never strip contextual distinctions that affect a task** (e.g. draft vs published, source chapter vs target chapter, available funds vs pending settlement).

## 5. Layout and component rules

- Preserve the approved warm StoryCraft editorial styling and the shared component measurements from `storycraft-design-system`.
- Keep **one global navbar** and a concise breadcrumb only where helpful; no secondary navbar unless explicitly requested.
- One dominant primary action per *local context*. Place rare actions in a labeled overflow menu; keep discoverable alternatives for keyboard/touch.
- Prefer one compact toolbar over multiple filter/action rows.
- Avoid nested cards, unnecessary colorful chips, large icon decorations and long status explanations.
- Do not reduce font sizes below the shared semantic typography scale in order to fit more text.
- Use progressive disclosure for optional details: tabs, collapsible sections, drawers or modals where context warrants.
- Preserve alignment, readable wrapping, predictable controls and responsive behavior at 1440px and narrower viewports.

## 6. StoryCraft page-specific simplification

### Author Dashboard (`/author`)
- Focus: identify novel, current state, manage or continue writing.
- Cards: **cover, name, status, chapter/read count, relevant recent activity, actions**. No long synopsis, rankings, overlapping badges or promotional copy.
- Global metrics: up to three useful headline values; no charts unless specifically requested.

### Novel Manager (`/author/novels/:novelId`)
- Compact cover/title/short summary and three relevant metrics.
- Chapter table dominates. Merge chapter number and title where that does not obscure required numbering.
- Bulk controls only when selection is active; long warnings appear when a destructive action is actually initiated.

### Writing Studio (`/author/ide`)
- Writing canvas dominates. Keep editor chrome concise and allow focus mode.
- Story Bible/AI/advanced controls can appear in optional panels. **Do not hide autosave failures, unsaved work warnings or publication state.**

### Story Bible (`/author/context/:novelId`)
- Index rows: portrait + name + role, with one meaningful status only if needed.
- Show rich profile details on selection, not repeated inside each list row.
- Distinct relationship and timeline tools may reside behind tabs.

### Manuscript Import (`/author/import/:novelId`)
- Show upload → analyze → preview → confirm.
- One compact parsing summary. Keep source/target chapter distinctions and validation visible.
- Advanced regex/normalization settings may be collapsed; do not bury blocking errors or draft/import implications.

### Wallet (`/wallet`)
- Keep **available**, **pending** and **lifetime** amounts clearly differentiated; financial clarity outweighs aggressive minimalism.
- Tables show meaningful transaction info with compact labels; full references/details on demand.
- Withdrawal amounts, fees, net payout, destination, limits and required tax/policy disclosures must remain visible at confirmation.

### Public Author Profile (`/authors/:authorId`)
- Priority: **who the author is → which books they wrote → follow/support**.
- Header: avatar + name + short bio + relevant actions; statistics inline.
- Book gallery: cover + title + genre + chapter/read summary. Entire card is clickable.
- Move long biography and optional schedule to a small section, only if needed. No admin data or redundant actions.

## 7. Agent procedure

1. Identify the **screen's single primary user goal** and the one decision/action most important to users.
2. Inventory existing UI text and classify each piece **primary / secondary / tertiary / duplicate**.
3. Remove duplicated, promotional and non-actionable copy. Combine related metadata naturally.
4. Move nonessential tertiary details behind a discoverable interaction. Keep mandatory and critical content visible.
5. Simplify controls: fewer concurrent badges and repeated actions, without losing functionality.
6. Reuse `storycraft-design-system` typography/spacing tokens; **never solve density by shrinking text**.
7. Verify core flows, meaningful statuses, warnings, keyboard and screen reader labels still work.
8. Review desktop and mobile screenshots; check readability, visual hierarchy and access to hidden information.
9. For any content you remove from the *default view*, be able to state where it went or why it was duplicate.

## 8. Review checklist

- [ ] One clear purpose and primary action per screen/context.
- [ ] Header concise; context not repeated three times.
- [ ] Novel cards prioritize title/cover; no extra paragraphs.
- [ ] No badge overload or repeated actions.
- [ ] One useful metadata line where possible.
- [ ] Toolbars/tables clean; columns carry unique information.
- [ ] Optional detail stays accessible on demand.
- [ ] No loss of critical publishing, import, error, or financial information.
- [ ] Typography stays on Be Vietnam Pro and existing semantic tokens.
- [ ] Same warm editorial style, spacing, component sizes and one global navbar.
- [ ] Do not add new sections just to fill whitespace.

## 9. Prompt snippet for Google Stitch

Attach/select the intended **existing application screen** and relevant StoryCraft warm editorial reference. Paste this with the actual screen request:

> **STORYCRAFT CONTENT DENSITY RULE:** Make this screen quieter and easier to scan. Reduce visible TEXT and redundant information, not font sizes. Prioritize the user's main task. Keep the title, essential context, required status, key values, one primary action and essential errors. Remove repeated descriptions, duplicate metrics, excess badges, marketing microcopy and unnecessary instructions. Combine related metadata into short lines. Move secondary details and rarely used actions to accessible expansion, detail view or overflow menus. Keep Vietnamese labels short and precise. Preserve core functionality, meaningful statuses, validation, financial/publishing disclosures and uploaded images. Follow `storycraft-design-system` (warm ivory, terracotta, Be Vietnam Pro, fixed semantic typography and shared components). Do not add new sections or a second navbar. **Edit the selected application screen, NOT a style guide or documentation screen.**

## 10. Execution examples

**Too dense:** `Chương: 48` + `Lượt đọc: 142.800` + `Cập nhật gần nhất: hôm nay 14:45` + `Trạng thái: Đang sáng tác` + `Thể loại: Hiện đại/Lãng mạn` + 2-line synopsis + 3 badges + 3 buttons.

**Cleaner on a dashboard card:** title, `Đang sáng tác`, `48 chương · 142,8K lượt đọc`, `Sửa hôm nay`, primary `Viết tiếp`, secondary `Quản lý` or overflow. The long synopsis moves to Novel Manager.

**Too dense on a public profile:** multiple author stat cards, published chapter count, last-activity metadata, long biography, schedule, extra author achievements, repeated follow/support calls to action.

**Cleaner public profile:** avatar + name + one-line bio + Follow/Support; one inline summary `14.250 người theo dõi · 4 tác phẩm`; book gallery with covers and titles; optional short biography below.
