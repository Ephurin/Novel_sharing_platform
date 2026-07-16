# Low-Fidelity Wireframes

These wireframes are intentionally rough. They are meant to clarify layout and data needs before visual design.

Legend:

```txt
[Button]      clickable action
{Card}        grouped content
<Input>       form field
| Panel |     layout area
```

---

## 1. Mobile - Home Feed

```txt
┌────────────────────────────────────┐
│ Ephurin                      🔔 👤 │
├────────────────────────────────────┤
│ <Search novels, authors, tags...>  │
├────────────────────────────────────┤
│ Genres: [Fantasy] [Romance] [More] │
├────────────────────────────────────┤
│ Continue Reading                   │
│ ┌────────────────────────────────┐ │
│ │ Cover │ Novel Title            │ │
│ │       │ Ch. 12 · 62% complete  │ │
│ │       │ [Continue]             │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ Trending                           │
│ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │Cover │ │Cover │ │Cover │        │
│ │Title │ │Title │ │Title │        │
│ └──────┘ └──────┘ └──────┘        │
├────────────────────────────────────┤
│ Bottom Nav: Home Search Library Me │
└────────────────────────────────────┘
```

Primary actions:

- Search novels.
- Open novel detail.
- Continue reading.
- Open notifications/profile.

---

## 2. Mobile - Novel Detail

```txt
┌────────────────────────────────────┐
│ ← Novel Detail                ☆    │
├────────────────────────────────────┤
│ ┌──────┐  Novel Title              │
│ │Cover │  Author Name              │
│ │      │  Fantasy · 120 chapters   │
│ └──────┘  ★ 4.8 · 12K reads        │
├────────────────────────────────────┤
│ [Read Now] [Add Library] [Like]    │
├────────────────────────────────────┤
│ Synopsis                           │
│ Lorem ipsum summary text...        │
│ [Show more]                        │
├────────────────────────────────────┤
│ Chapters                           │
│ Ch. 1  The Door              Free  │
│ Ch. 2  Forgotten Name        Free  │
│ Ch. 3  Moon Archive          VIP 🔒 │
├────────────────────────────────────┤
│ Comments Preview                   │
│ "Great opening..."                 │
└────────────────────────────────────┘
```

Primary actions:

- Read first/next chapter.
- Unlock VIP chapter.
- Bookmark/library.
- Like novel.
- Open comments.

---

## 3. Mobile - Reader Screen

```txt
┌────────────────────────────────────┐
│ ← Ch. 12: The Door            ⋮    │
├────────────────────────────────────┤
│                                    │
│  Paragraph text line 1...          │
│  Paragraph text line 2...     💬 3 │
│                                    │
│  Paragraph text line 3...          │
│  Paragraph text line 4...          │
│                                    │
│  [Inline comment marker]           │
│                                    │
├────────────────────────────────────┤
│ Aa  ☾  Progress 62%       Report   │
└────────────────────────────────────┘
```

Reading settings drawer:

```txt
┌────────────────────────────────────┐
│ Reading Settings                   │
├────────────────────────────────────┤
│ Font size      [-] 18 [+]          │
│ Theme          [Light] [Sepia] [Dark] │
│ Line spacing   [Compact] [Normal]  │
│ Brightness     ━━━━━━━             │
│ [Save Settings]                    │
└────────────────────────────────────┘
```

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

## 13. Mobile - Wallet Mock

```txt
┌────────────────────────────────────┐
│ Wallet                             │
├────────────────────────────────────┤
│ Balance                            │
│ 4,200 Coins                        │
├────────────────────────────────────┤
│ [Mock Deposit] [Transaction History]│
├────────────────────────────────────┤
│ Packages                           │
│ ┌────────────────────────────────┐ │
│ │ 1,000 Coins              [Buy] │ │
│ │ 5,000 Coins              [Buy] │ │
│ │ 10,000 Coins             [Buy] │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ Recent Transactions                │
│ +1,000 Deposit Mock SUCCESS        │
│ -50 Unlock Chapter SUCCESS         │
└────────────────────────────────────┘
```

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
