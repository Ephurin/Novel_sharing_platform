# Mobile Wireframes

These low-fidelity wireframes cover the mobile reader app surfaces from docs/Frontend/sitemap.md: splash/auth check, home, search, novel detail, reader, library/history, wallet mock, notifications, profile/settings, comments, inline comments, and report content.

Use this document for Expo/React Native implementation review. PC web and desktop author/admin screens are separated into `docs/Frontend/wireframes-web.md`.

Legend:

``txt
[Button]      clickable action
{Card}        grouped content
<Input>       form field
| Panel |     layout area
``

## Coverage Notes

- Existing mobile home/detail/reader/wallet wireframes are preserved from the combined document.
- Missing mobile screens from the sitemap are added as compact mobile-first ASCII wireframes.
- Mobile is reader-first; authoring stays on desktop web for MVP unless explicitly expanded later.
- Report/comment flows should identify novel/chapter/paragraph context without exposing raw database IDs.

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

---

## 32. Mobile - Splash / Auth Check

```txt
+--------------------------------------+
|                                      |
|              Ephurin                 |
|        Reading novels anywhere       |
|                                      |
|          Loading session...          |
|                                      |
+--------------------------------------+
```

---

---

## 33. Mobile - Search / Filter

```txt
+--------------------------------------+
| <- Search                            |
+--------------------------------------+
| <Search novels, authors, tags...>    |
| Filters: [Genre] [Status] [Sort]     |
+--------------------------------------+
| Results                              |
| {Cover} Title                        |
|         Author | Genre | Stats       |
|         [Open]                       |
| {Cover} Title                        |
+--------------------------------------+
| Bottom Nav: Home Search Library Me   |
+--------------------------------------+
```

---

---

## 34. Mobile - Library / Bookmarks / History

```txt
+--------------------------------------+
| Library                              |
+--------------------------------------+
| Tabs: [Saved] [History]              |
| <Search library/history>             |
+--------------------------------------+
| {Cover} Novel Title                  |
|         Last read: Ch. 12 | 62%      |
|         [Continue] [Remove]          |
| {Cover} Novel Title                  |
+--------------------------------------+
| Bottom Nav: Home Search Library Me   |
+--------------------------------------+
```

---

---

## 35. Mobile - Notifications

```txt
+--------------------------------------+
| Notifications              [Mark all]|
+--------------------------------------+
| Filters: [All] [Unread] [System]     |
+--------------------------------------+
| dot Novel approved                   |
|     Your chapter passed moderation   |
|     2m ago                           |
| dot New follower                     |
|     reader04 followed you            |
|     1h ago                           |
+--------------------------------------+
| Bottom Nav: Home Search Library Me   |
+--------------------------------------+
```

---

---

## 36. Mobile - Profile / Settings

```txt
+--------------------------------------+
| Profile                              |
+--------------------------------------+
| Avatar  Display Name                 |
| @username | role badges              |
| [Edit Profile]                       |
+--------------------------------------+
| Account                              |
| Wallet balance                       |
| Notifications                        |
| Reading settings                     |
| Author workspace link                |
| Logout                               |
+--------------------------------------+
| Bottom Nav: Home Search Library Me   |
+--------------------------------------+
```

---

---

## 37. Mobile - Comments / Inline Comments / Report

```txt
+--------------------------------------+
| Comments                             |
+--------------------------------------+
| Tabs: [Chapter] [Inline]             |
| <Write a comment...> [Post]          |
+--------------------------------------+
| Comment row                          |
| username | time                      |
| text...                         ...  |
| [Reply] [Report]                     |
+--------------------------------------+
| Report Dialog                        |
| Reason [Harassment v]                |
| <Details optional>                   |
| [Cancel] [Submit Report]             |
+--------------------------------------+
```

### UX Notes

- Keep report flow lightweight but explicit.
- Inline comments should identify paragraph/chapter context without exposing raw database IDs.
