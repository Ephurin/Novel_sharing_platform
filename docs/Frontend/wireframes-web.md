# Web / Desktop Wireframes

These low-fidelity wireframes cover the PC web surfaces from docs/Frontend/sitemap.md: public web, authenticated reader web, author workspace, author IDE, wallet/withdraw mock, and admin dashboard.

Use this document for desktop-first implementation review. Mobile-specific screens are separated into `docs/Frontend/wireframes-mobile.md`.

Legend:

``txt
[Button]      clickable action
{Card}        grouped content
<Input>       form field
| Panel |     layout area
``

## Coverage Notes

- Existing desktop IDE and admin wireframes are preserved from the combined document.
- Missing web screens from the sitemap are added as implementation-oriented ASCII wireframes.
- Raw database IDs should not appear in user-facing web UI; select projects/chapters by title, number, or status.
- Author and reader surfaces should remain switchable for authenticated users with author capability.

---

## 4. Desktop Author - AI Writing IDE Main Workspace

Inspired by Cursor, VSCode, Antigravity, and Obsidian. This is the primary Author workspace.

```txt
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Ephurin IDE  Project: Moon Archive  Branch: Draft v3    [Save] [Preview] [Submit Publish]  Sync ✓  Author 👤 │
├──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┤
│ Act  │ Dynamic Sidebar              │ Center Rich Text Editor                     │ Right AI Assistant      │
│      │ STORY                        │                                              │                         │
│ 📚   │ Novel: The Moon Archive      │ Ch. 12 — The Door That Forgot               │ Copilot Context         │
│ 👥   │ ┌──────────────────────────┐ │ ┌──────────────────────────────────────────┐ │ [Characters ✓] [Timeline ✓]│
│ 🕒   │ │ Arc I: The Missing Name  │ │ │ The archive door opened without sound.  │ │ [Plot Summary ✓] [Draft ✓] │
│ 🕸   │ │  ✓ Ch.01 The Door        │ │ │                                          │ │                         │
│ 🔎   │ │  ✓ Ch.02 Broken Lantern  │ │ │ Liora held her breath. The silver       │ │ Instruction             │
│ ☑    │ │  ! Ch.03 Pending Review  │ │ │ glyphs along the frame rearranged       │ │ <Continue with quiet tension>│
│ 🗂   │ │ Arc II: The Moon Archive │ │ │ themselves into a name she almost knew. │ │                         │
│ ⚙    │ │  ● Ch.12 The Door        │ │ │                                          │ │ [Generate] [Analyze]    │
│      │ │  ○ Ch.13 Untitled        │ │ │ "It remembers me," she whispered,      │ │                         │
│      │ └──────────────────────────┘ │ │ "but I don't."                           │ │ Suggestion              │
│      │                              │ │                                          │ │ ┌─────────────────────┐ │
│      │ Scene Context                │ │                                          │ │ │ Add a sensory beat  │ │
│      │ Characters: Liora, Cael      │ │                                          │ │ │ before Cael speaks. │ │
│      │ Timeline: Event #42          │ │                                          │ │ └─────────────────────┘ │
│      │ Summary: Arc II / Ch. 11     │ │                                          │ │ [Insert] [Replace]     │
│      │                              │ └──────────────────────────────────────────┘ │ [Create Proposal]      │
│      │ Consistency                  │                                              │                         │
│      │ ⚠ Cael should not know the   │ Inline Inspector                             │ Proposed Context Updates│
│      │   door's true name yet.      │ Characters in scene · Related events · Notes│ Plot Summary +1 Pending │
├──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┤
│ Words 1,248 · Chapter 12/40 · Arc II · Autosaved 12s ago · Context Health: 86% · 1 warning · AI idle         │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

---

## 5. Desktop Author - Activity: Story

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 📚   │ STORY                        │ Chapter Outline                              │ AI / Context            │
│      │                              │                                              │                         │
│      │ [New Arc] [New Chapter]      │ Arc II: The Moon Archive                     │ Chapter Health          │
│      │                              │ ┌──────────────────────────────────────────┐ │ ┌─────────────────────┐ │
│      │ ▾ The Moon Archive           │ │ Goal: Liora reaches the archive door     │ │ │ Pacing: Good        │ │
│      │   ▾ Arc I: The Missing Name  │ │ Conflict: Cael hides what he knows       │ │ │ Continuity: 1 warn  │ │
│      │     ✓ Ch.01 The Door         │ │ Reveal: The door reacts to forgotten     │ │ │ Context: 86%        │ │
│      │     ✓ Ch.02 Broken Lantern   │ │         memories                         │ │ └─────────────────────┘ │
│      │     ! Ch.03 Pending Review   │ └──────────────────────────────────────────┘ │                         │
│      │   ▾ Arc II: Moon Archive     │                                              │ Related Context         │
│      │     ● Ch.12 The Door         │ Chapter Cards                                │ - Liora                 │
│      │     ○ Ch.13 Untitled         │ Ch.10 Published · Ch.11 Published · Ch.12 ● │ - Archive Door          │
│      │                              │                                              │ - Event #42             │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 6. Desktop Author - Activity: Entities

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 👥   │ ENTITIES                     │ Character Profile                            │ Relationship Inspector  │
│      │ <Search characters...>       │                                              │                         │
│      │                              │ Name: Liora Vey                              │ Liora ─ trusts ─ Cael   │
│      │ Characters                   │ Role: PROTAGONIST                            │ Liora ─ fears ─ Archive │
│      │ ● Liora Vey                  │ Status: Active in Arc II                     │                         │
│      │ ○ Cael Orin                  │                                              │ Scene Usage             │
│      │ ○ The Archive Door           │ Description                                  │ - Ch.10                 │
│      │ ○ Moon Archivist             │ <A memory thief who cannot remember...>      │ - Ch.11                 │
│      │                              │                                              │ - Ch.12 current         │
│      │ Locations                    │ Traits                                       │                         │
│      │ ○ East Gate                  │ [careful] [stubborn] [afraid of silence]    │ Copilot Suggestions     │
│      │ ○ Moon Archive               │                                              │ + Add relationship note │
│      │                              │ Development Notes                            │ + Update fear trigger   │
│      │                              │ <Notes across arcs...>                       │ [Review Proposal]       │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 7. Desktop Author - Activity: Timeline

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 🕒   │ TIMELINE                     │ Arc II Timeline                              │ Event Detail            │
│      │ Filters                      │                                              │                         │
│      │ [Arc II ▼] [Liora ▼]         │ Ch.10 ── Event #40 ── Lantern breaks         │ Event #42               │
│      │                              │              │                               │ Chapter: Ch.12          │
│      │ Event List                   │ Ch.11 ── Event #41 ── Cael lies              │ Characters: Liora, Cael │
│      │ #40 Lantern breaks           │              │                               │                         │
│      │ #41 Cael lies                │ Ch.12 ── Event #42 ── Door reacts            │ Summary                 │
│      │ #42 Door reacts              │              │                               │ <Door reacts to memory> │
│      │ #43 Name appears             │ Ch.13 ── Event #43 ── Name appears planned   │                         │
│      │                              │                                              │ Consistency Links       │
│      │ [New Event]                  │                                              │ - Plot Summary Ch.11    │
│      │                              │                                              │ - Character: Liora      │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 8. Desktop Author - Activity: Knowledge Graph

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 🕸   │ KNOWLEDGE GRAPH              │ Graph Canvas                                  │ Node Inspector          │
│      │                              │                                              │                         │
│      │ View Mode                    │      [Liora]────trusts────[Cael]             │ Selected: Archive Door  │
│      │ [Characters] [Locations]     │         │                       │            │ Type: Object/Location   │
│      │ [Plot] [All]                 │       fears                   knows          │ First seen: Ch.01       │
│      │                              │         │                       │            │ Related events: 4       │
│      │ Graph Filters                │  [Archive Door]────contains────[Forgotten Name]│                         │
│      │ Arc: II                      │         │                                    │ Notes                   │
│      │ Depth: 2                     │      reacts to                              │ <Door responds to lost  │
│      │                              │         │                                    │ memories, not blood.>   │
│      │                              │   [Memory Fragment]                         │                         │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 9. Desktop Author - Activity: Search

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 🔎   │ SEARCH                       │ Results                                      │ Preview                 │
│      │ <archive door>               │                                              │                         │
│      │                              │ 12 matches in Drafts                         │ Ch.12 The Door          │
│      │ Scope                        │ ┌──────────────────────────────────────────┐ │ "...archive door opened│
│      │ [✓] Drafts                   │ │ Ch.01 The Door                            │ │ without sound..."      │
│      │ [✓] Characters               │ │ Ch.12 The Door                            │ │                         │
│      │ [✓] Timeline                 │ │ Plot Summary: Arc II                      │ │ [Open in Editor]       │
│      │ [✓] Summaries                │ │ Entity: Archive Door                      │ │ [Open Context]         │
│      │                              │ └──────────────────────────────────────────┘ │                         │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 10. Desktop Author - Activity: Tasks / Consistency

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ ☑    │ TASKS                        │ Task Board                                   │ Resolution Panel        │
│      │                              │                                              │                         │
│      │ Filters                      │ TODO                                         │ Selected Warning        │
│      │ [Warnings] [Revision] [Ideas]│ ┌──────────────────────────────────────────┐ │ Cael knows too much     │
│      │                              │ │ ⚠ Cael should not know true name yet     │ │                         │
│      │                              │ │ □ Add sensory detail to Ch.12            │ │ Evidence                │
│      │                              │ │ □ Review Arc II summary                  │ │ - Ch.08: Cael absent   │
│      │                              │ └──────────────────────────────────────────┘ │ - Ch.11: secret hidden  │
│      │                              │ DONE                                         │                         │
│      │                              │ ✓ Rename "Moon Gate" to "Archive Door"      │ [Open Ch.12] [Dismiss]  │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 11. Desktop Author - Activity: Projects / Settings

```txt
┌──────┬──────────────────────────────┬──────────────────────────────────────────────┬─────────────────────────┐
│ 🗂   │ PROJECTS                     │ Project Overview                             │ Settings Quick Panel    │
│      │                              │                                              │                         │
│      │ Novels                       │ The Moon Archive                             │ Editor                  │
│      │ ● The Moon Archive           │ Status: Draft                                │ Theme: Dark IDE         │
│      │ ○ Ashes of Winter            │ Chapters: 12/40                              │ Font: Literata          │
│      │ ○ Glass Kingdom              │ Context Health: 86%                          │ Autosave: 10s           │
│      │                              │                                              │                         │
│      │ [New Novel]                  │ Recent Activity                              │ AI                      │
│      │                              │ - Ch.12 edited 12s ago                       │ Model: LLM Provider     │
│      │                              │ - Plot summary proposal pending              │ Context window: Medium  │
└──────┴──────────────────────────────┴──────────────────────────────────────────────┴─────────────────────────┘
```

---

---

## 12. Web Admin - Moderation Queue

```txt
┌────────────────────────────────────────────────────────────┐
│ Admin / Moderation Queue                                  │
├────────────────────────────────────────────────────────────┤
│ Filters: Target [All ▼] Source [All ▼] Status [Pending ▼] │
├────────────────────────────────────────────────────────────┤
│ Review Queue                                               │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ID      Target   Source          Severity   Created    │ │
│ │ rev_01  Chapter  KEYWORD_FILTER  HIGH       Today      │ │
│ │ rev_02  Comment  USER_REPORT     MEDIUM     Today      │ │
│ └────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│ Selected Review                                            │
│ Target: Chapter ch_123                                     │
│ Evidence: matched rule toxic_phrase_rule_001               │
│ Content Preview: "...highlighted excerpt..."               │
│ Reports: 0                                                 │
│                                                            │
│ Decision reason                                            │
│ <Reason textarea>                                          │
│ [Approve] [Reject] [Require Revision] [Hide Content]       │
└────────────────────────────────────────────────────────────┘
```

---

---

## 14. Web Admin - Dashboard

```txt
┌────────────────────────────────────────────────────────────┐
│ Admin Dashboard                                           │
├────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│ │ Users   │ │ Novels  │ │ Pending │ │ Coins   │          │
│ │ 1,200   │ │ 300     │ │ 12      │ │ 150K    │          │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├────────────────────────────────────────────────────────────┤
│ Growth Chart Placeholder                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
├────────────────────────────────────────────────────────────┤
│ Quick Actions                                              │
│ [Moderation Queue] [Reports] [Withdraw Review] [Taxonomy] │
└────────────────────────────────────────────────────────────┘
```

---

---

## 16. Public Web - Landing / Featured Novels

### Purpose

Introduce Ephurin, let visitors discover published novels, and route them to public novel detail or authentication.

### User Goal

Find something interesting to read without logging in, or create/login to continue with personal features.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Ephurin | Browse | Genres | About                         [Login] [Register]    |
+--------------------------------------------------------------------------------+
| Hero: "Discover long-form fiction"                                              |
| <Search novels, authors, tags...> [Search]                                      |
| Genre chips: [Fantasy] [Romance] [Mystery] [More]                               |
+-------------------------------+------------------------------------------------+
| Featured Novel                | Trending / Recently Updated                     |
| {Large cover + synopsis}      | {Novel Card} {Novel Card} {Novel Card}          |
| [Read Public Preview]         | [Open]       [Open]       [Open]                |
+-------------------------------+------------------------------------------------+
| Footer: terms, contact, content policy, graduation-project note                 |
+--------------------------------------------------------------------------------+
```

### Components / States

- Header navigation, search input, genre/tag chips, novel cards, featured card, login/register CTA.
- Empty: no published novels match this search.
- Loading: skeleton novel cards.
- Error: retry banner for catalog API failure.

### UX Notes

- Do not require login to see published catalog metadata.
- Personal actions such as library, like, comment should show auth prompt when unauthenticated.

---

---

## 17. Web Auth - Login / Register / OAuth Callback

### Purpose

Authenticate users and route them to reader, author workspace, or admin dashboard.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Ephurin                                                       Need help?        |
+--------------------------------------+-----------------------------------------+
| Product Illustration / Value Copy     | Login / Register Card                   |
| - Read published novels               | Tabs: [Login] [Register]                |
| - Write and manage stories            | <Email or username>                     |
| - Mock wallet for graduation demo     | <Password>                              |
|                                      | [Login]                                 |
|                                      | [Continue with OAuth]                   |
|                                      | Forgot password / validation messages   |
+--------------------------------------+-----------------------------------------+
| OAuth Callback State: Verifying session... -> Redirect by role                  |
+--------------------------------------------------------------------------------+
```

### Components / States

- Auth card, field validation, password visibility toggle, OAuth button, route guard redirect notice.
- Loading: disabled form and spinner after submit.
- Error: invalid credential alert or expired OAuth callback alert.
- Success: toast and role-based redirect.

### Accessibility Notes

- Labels must be explicit and errors must be associated with fields.
- Focus first invalid field after validation failure.

---

---

## 18. Web Reader - Home / Search

### Purpose

Desktop reader workspace for searching, filtering, continuing reading, and discovering published novels.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Ephurin | Reader | Writing Projects | Wallet | Notifications | Profile         |
+--------------------------------------------------------------------------------+
| Reader Home                                      <Search...> [Search] [Filters] |
+----------------------+---------------------------------------------------------+
| Left Sidebar         | Continue Reading                                        |
| - Home               | {Novel progress card} {Novel progress card}             |
| - Search             |---------------------------------------------------------|
| - Library            | Search Results / Trending                               |
| - History            | {Novel Card} {Novel Card} {Novel Card} {Novel Card}     |
| - Wallet             | Pagination: [Prev] 1 2 3 [Next]                        |
+----------------------+---------------------------------------------------------+
```

### Components / States

- Reader sidebar, search bar, filters, continue-reading cards, novel grid, pagination.
- Empty: no result, no history, no library.
- Loading: card skeletons.
- Error: retry panel.

### UX Notes

- Keep library/history in the left sidebar, not floating in the middle of the screen.
- Preserve search/filter in URL query params.

---

---

## 19. Web Reader - Novel Detail

### Purpose

Show published novel metadata, chapters, social actions, and unlock/read actions.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Reader / Novel Detail                                      [Back to Search]     |
+----------------------+--------------------------------------+------------------+
| Cover + Actions      | Novel Metadata                       | Author Panel     |
| [Read Next]          | Title, author, genre/tags, status    | Avatar/name      |
| [Add Library]        | Synopsis                             | [Follow]         |
| [Like] [Report]      | Stats: views, likes, chapters        | Other novels     |
+----------------------+--------------------------------------+------------------+
| Chapters                                                                      |
| Ch | Title                  | Status     | Price | Action                     |
| 01 | The Door               | Free       | 0     | [Read]                     |
| 02 | Moon Archive           | VIP locked | 10    | [Unlock]                   |
+--------------------------------------------------------------------------------+
| Comments Preview / Reviews                                                     |
+--------------------------------------------------------------------------------+
```

### Components / States

- Metadata header, action buttons, chapter table, author profile card, comments preview.
- Empty: published novel has no visible chapters.
- Error: not found, unpublished/unauthorized, insufficient coins.
- Success: liked/saved/followed/unlocked toast.

---

---

## 20. Web Reader - Chapter Reading Screen

### Purpose

Provide distraction-light desktop reading with progress sync, settings, comments, and report actions.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| <- Novel | Ch. 12: The Door                       [Aa] [Comments] [Report]     |
+----------------------+--------------------------------------+------------------+
| Chapter List         | Reading Content                      | Context Panel    |
| Ch.10                | Paragraph text...                    | Novel progress   |
| Ch.11                | Paragraph text...                    | 62% complete     |
| > Ch.12              | Paragraph text...                    | [Prev] [Next]    |
| Ch.13 locked         | Paragraph text...                    | Recent comments  |
+----------------------+--------------------------------------+------------------+
| Bottom: Progress slider | Sync status | Reading settings summary                  |
+--------------------------------------------------------------------------------+
```

### Components / States

- Chapter navigation sidebar, reading content, settings drawer, comments drawer, report dialog.
- Empty: content unavailable for locked/VIP chapter.
- Error: `PAYMENT_002`, `AUTH_001`, not found.
- Success: reading history synced toast.

---

---

## 21. Web Reader - Library / History

### Purpose

Let readers manage saved novels and resume previous reading sessions.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Reader / Library & History                                  <Search library>   |
+----------------------+---------------------------------------------------------+
| Reader Sidebar       | Tabs: [Library] [History]                               |
| - Home               | Filters: Status [All] Sort [Recent]                     |
| - Library            |                                                         |
| - History            | {Novel row: cover, title, last chapter, progress}        |
| - Wallet             | [Continue] [Remove from Library]                        |
|                      | Pagination                                              |
+----------------------+---------------------------------------------------------+
```

### UX Notes

- Saved and history share the same row component but use different empty copy.
- Remove from library should require confirmation.

---

---

## 22. Web Author - Project Manager / My Writing Projects

### Purpose

Home base for authors to create, find, and open writing projects.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Writing Projects                                      <Search> [New Novel]      |
+----------------------+---------------------------------------------------------+
| Author Sidebar       | Project Grid / List                                     |
| - Projects           | {Project Card} {Project Card} {Project Card}            |
| - Author IDE         | Title, status, chapters, updated time                   |
| - Wallet             | [Open IDE in New Tab] [Metadata] [Chapters]             |
| - Stats              |---------------------------------------------------------|
| - Reader Home        | Recent activity / pending moderation notice             |
+----------------------+---------------------------------------------------------+
```

### UX Notes

- Treat author projects like IDE projects: select by title, hide raw IDs, open IDE in a new tab.
- Author should still have a route back to reader UI.

---

---

## 23. Web Author - Novel Metadata Editor

### Purpose

Edit business-visible novel metadata and publish workflow state.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Author / Project / Metadata                       [Open IDE] [Submit Publish]   |
+----------------------+--------------------------------------+------------------+
| Project Sidebar      | Metadata Form                        | Preview Panel    |
| - Overview           | <Title>                              | Cover preview    |
| - Metadata           | <Synopsis textarea>                  | Public card      |
| - Chapters           | <Genre> <Tags>                       | Status badges    |
| - Context            | <Cover URL/upload placeholder>       | Moderation notes |
|                      | <Age rating> <Serial status>         |                  |
|                      | [Save Metadata]                      |                  |
+----------------------+--------------------------------------+------------------+
```

### Components / States

- Metadata form, validation messages, preview card, status/moderation panel.
- Empty: no cover, no tags.
- Error: save/submit failure.
- Success: saved/submit toast.

---

---

## 24. Web Author - Chapter Editor

### Purpose

Standalone chapter management screen outside the IDE for metadata, content, VIP price, and publish submission.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Author / Project / Chapters                       [New Chapter] [Open IDE]      |
+----------------------+--------------------------------------+------------------+
| Chapter List         | Chapter Form                         | Publish Panel    |
| Ch.01 Draft          | <Chapter title>                      | Status: Draft    |
| Ch.02 Published      | <Chapter number readonly>            | is_vip toggle    |
| Ch.03 VIP            | <Content textarea/rich editor>       | price_coins      |
|                      | [Save Draft]                         | [Submit Chapter] |
|                      |                                      | Moderation notes |
+----------------------+--------------------------------------+------------------+
```

### UX Notes

- Hide raw IDs; select chapters by title and chapter number.
- Keep direct IDE open action in a new tab with URL parameters internal-only.

---

---

## 25. Web Author - Context Management

### Purpose

Manage authoring context used later by Writing Copilot: character profiles, timeline events, and plot summaries.

### ASCII Wireframe

```txt
+--------------------------------------------------------------------------------+
| Author / Project / Context                                      [Add Item]      |
+----------------------+-------------------------------+-------------------------+
| Context Tabs         | List                          | Detail Editor           |
| [Characters]         | Liora - protagonist           | Name / aliases          |
| [Timeline]           | Event #42 - Door opens        | Description             |
| [Plot Summary]       | Arc I summary                 | Scope: Novel/Arc/Chapter|
| [AI Proposals]       | Proposal: rename object       | Source: Author/AI       |
|                      |                               | [Approve] [Reject]      |
+----------------------+-------------------------------+-------------------------+
```

### UX Notes

- Separate current facts from proposed AI changes.
- AI can propose changes, but author approval should be explicit before current context changes.

---

---

## 26. Web Author - Author Stats

### Purpose

Show author-facing performance indicators for novels, chapters, readers, and wallet earnings.

```txt
+--------------------------------------------------------------------------------+
| Author / Stats                                      Date Range [Last 30 days]   |
+----------------------+---------------------------------------------------------+
| Author Sidebar       | KPI Cards: Views | Likes | Library Adds | Coins Earned   |
|                      |---------------------------------------------------------|
|                      | Chart: Views over time                                  |
|                      |---------------------------------------------------------|
|                      | Top Novels / Top Chapters Table                         |
|                      | Novel | Views | Likes | Unlocks | Coins                 |
+----------------------+---------------------------------------------------------+
```

---

---

## 27. Web Wallet - Author Wallet / Withdraw Mock

### Purpose

Let authors review mock earnings and submit mock withdrawal requests.

```txt
+--------------------------------------------------------------------------------+
| Author Wallet / Withdraw Mock                             [Request Withdraw]    |
+----------------------+---------------------------------------------------------+
| Wallet Sidebar       | Balance: 12,500 coins                                   |
| - Balance            | Pending Withdraw: 2,000 coins                           |
| - Transactions       |---------------------------------------------------------|
| - Withdraws          | Withdraw Form: <Amount> <Note> [Submit Request]         |
|                      |---------------------------------------------------------|
|                      | Transaction / Withdraw History Table                    |
|                      | Date | Type | Amount | Status | Reference               |
+----------------------+---------------------------------------------------------+
```

### UX Notes

- Label every payment action as `Mock` for graduation-project clarity.
- Do not imply real external payment provider settlement.

---

---

## 28. Web Admin - Reports

```txt
+--------------------------------------------------------------------------------+
| Admin / Reports                          Target [All] Status [Open] <Search>   |
+----------------------+-------------------------------+-------------------------+
| Admin Sidebar        | Report Queue                  | Selected Report Detail  |
| - Overview           | #102 Comment harassment       | Reporter / target       |
| - Moderation         | #103 Chapter harmful content  | Reason + free text      |
| - Reports            | #104 Novel metadata issue     | Evidence preview        |
| - Users              |                               | [Resolve] [Escalate]    |
| - Taxonomy           | Pagination                    | [Open Target]           |
+----------------------+-------------------------------+-------------------------+
```

---

---

## 29. Web Admin - User Management

```txt
+--------------------------------------------------------------------------------+
| Admin / Users                                      <Search user> Role [All]     |
+----------------------+---------------------------------------------------------+
| Admin Sidebar        | Users Table                                             |
|                      | User | Email | Role | Status | Created | Actions         |
|                      | reader04 | ... | READER | ACTIVE | ... | [View] [Lock]   |
|                      |---------------------------------------------------------|
|                      | User Detail Drawer: profile, wallet summary, reports    |
+----------------------+---------------------------------------------------------+
```

---

---

## 30. Web Admin - Taxonomy

```txt
+--------------------------------------------------------------------------------+
| Admin / Taxonomy                                                       [Save]   |
+----------------------+-------------------------------+-------------------------+
| Admin Sidebar        | Genres                        | Tags                    |
|                      | <New genre name> [Add Genre]  | <New tag name> [Add Tag]|
|                      | Fantasy        [Edit]         | slow-burn      [Edit]   |
|                      | Romance        [Edit]         | reincarnation  [Edit]   |
+----------------------+-------------------------------+-------------------------+
```

---

---

## 31. Web Admin - Withdraw Review

```txt
+--------------------------------------------------------------------------------+
| Admin / Withdraw Review                         Status [Pending] Date [Range]  |
+----------------------+-------------------------------+-------------------------+
| Admin Sidebar        | Withdraw Queue                | Request Detail          |
|                      | Author | Amount | Status      | Author wallet summary   |
|                      | reader03 | 2000 | Pending     | Note / created date     |
|                      |                               | Decision reason         |
|                      | Pagination                    | [Approve] [Reject]      |
+----------------------+-------------------------------+-------------------------+
```

---
