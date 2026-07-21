# Screen Specs and API Mapping

## 1. Mobile Reader Screens

### Home Feed

| Item | Details |
| :--- | :--- |
| Purpose | Show featured/trending novels and continue reading. |
| Primary API | `GET /reading/search`, `GET /reading/history/me` |
| Key Data | Novel cover, title, author, genre, latest chapter, reading progress. |
| Empty State | No reading history: hide Continue Reading section. |

### Search / Filter

| Item | Details |
| :--- | :--- |
| Purpose | Search public novels by title, genre, tag, status. |
| Primary API | `GET /reading/search` |
| Key Data | Query, genre, tag, sort, pagination. |
| Empty State | Show "No novels found" and clear-filter action. |

### Novel Detail

| Item | Details |
| :--- | :--- |
| Purpose | Show novel metadata, synopsis, chapters, social actions. |
| Primary API | `GET /reading/novels/{novelId}` |
| Actions | `POST /novels/{novelId}/likes`, `POST /reading/library/me` |
| Key Data | Cover, title, synopsis, author, tags, chapters, VIP status, stats. |

### Reader Screen

| Item | Details |
| :--- | :--- |
| Purpose | Read chapter content with settings and inline comments. |
| Primary API | `GET /reading/chapters/{chapterId}`, `PUT /reading/history/me` |
| Actions | `GET /chapters/{chapterId}/comments`, `POST /reports` |
| Key Data | Chapter content, chapter number, VIP/unlock state, comments count. |

### Comments

| Item | Details |
| :--- | :--- |
| Purpose | Display and create chapter/paragraph comments. |
| Primary API | `GET /chapters/{chapterId}/comments`, `POST /chapters/{chapterId}/comments` |
| Key Data | Comment content, author display name, status, paragraph offset. |
| State Note | `PENDING_MODERATION` comments should show "Waiting for review" only to the commenter. |

### Wallet Mock

| Item | Details |
| :--- | :--- |
| Purpose | Show Coin balance, mock deposit packages, transaction history. |
| Primary API | `GET /wallet/me`, `GET /wallet/transactions` |
| Actions | `POST /wallet/deposit-sessions`, `POST /chapters/{chapterId}/unlock` |
| Scope Note | Demo-only; no real payment card/bank input. |

## 2. Desktop Author AI Writing IDE

### Main Workspace Shell

| Item | Details |
| :--- | :--- |
| Purpose | Provide IDE-like writing workspace with top toolbar, activity bar, dynamic sidebar, editor, AI assistant, and status bar. |
| Primary API | `GET /novels/{novelId}`, `GET /chapters/{chapterId}`, context endpoints in `novel-chapter-api.md` |
| Actions | `PATCH /chapters/{chapterId}`, `POST /chapters/{chapterId}/submit-publish`; AI actions are disabled until Phase 10. |
| Key Data | Current project, selected arc/chapter, editor content, autosave state, moderation status. Context health/consistency warnings are Phase 10. |
| UX Note | Author should not leave the workspace to inspect characters, timeline, summaries, or AI suggestions. |

### Activity: Story

| Item | Details |
| :--- | :--- |
| Purpose | Manage novel structure by project, arc, and chapter. |
| Primary API | `GET /novels`, `GET /novels/{novelId}`, `GET /novels/{novelId}/chapters`; a current-author-only listing endpoint is recommended for polished UI. |
| Actions | `POST /novels`, `PATCH /novels/{novelId}`, `POST /novels/{novelId}/chapters` |
| Key Data | Novel title, arcs, chapters, status, word count, publish state. |
| UI Pattern | VSCode-like explorer tree grouped by arcs. |

### Activity: Entities

| Item | Details |
| :--- | :--- |
| Purpose | Manage characters, relationships, locations, factions, and important objects. |
| Primary API | Character profile and relationship endpoints in `novel-chapter-api.md` |
| Actions | Create/update character profile, update relationship notes, approve Copilot context proposals. |
| Key Data | Character role, description, traits, relationship graph, first/last seen chapter. |
| UI Pattern | Obsidian-like entity notes plus relationship inspector. |

### Activity: Timeline

| Item | Details |
| :--- | :--- |
| Purpose | Manage chronological events and arc/chapter event sequence. |
| Primary API | Story timeline endpoints in `novel-chapter-api.md` |
| Actions | Create/update timeline event, link event to chapter, filter by character/arc. |
| Key Data | Event order, chapter number, participating characters, event summary. |
| UI Pattern | Timeline canvas with selected event detail panel. |

### Activity: Knowledge Graph

| Item | Details |
| :--- | :--- |
| Purpose | Visualize connections among characters, locations, objects, plot points, and summaries. |
| Primary API | Character/timeline/summary endpoints in `novel-chapter-api.md` |
| Actions | Open node detail, jump to related chapter, inspect relationship. |
| Key Data | Nodes, relationship types, event links, summary links. |
| MVP Note | Can be a static relationship list/canvas placeholder before full graph rendering. |

### Activity: Search

| Item | Details |
| :--- | :--- |
| Purpose | Search across draft chapters, characters, timeline events, and summaries. |
| Primary API | Existing list/detail endpoints; dedicated search can be added later. |
| Actions | Open match in editor, open entity/context, filter by scope. |
| Key Data | Query, result type, title, excerpt, target ID. |

### Activity: Tasks / Consistency

| Item | Details |
| :--- | :--- |
| Purpose | Track revision TODOs, unresolved consistency warnings, and Copilot-generated review items. |
| Primary API | Phase 10: `POST /ai/copilot/consistency-check`. Phase 8.x: static disabled placeholder only. |
| Actions | Phase 8.x: open placeholder/detail notes only. Phase 10: open related chapter/context, dismiss warning, convert warning to task. |
| Key Data | Task title, type, linked chapter/entity, severity, status. |
| Persistence Note | MVP can read warnings from the latest consistency-check response/log; dedicated task persistence can be added later. |

### Right AI Assistant Panel

| Item | Details |
| :--- | :--- |
| Purpose | Generate context-aware writing suggestions, analyze consistency, and propose context updates. |
| Primary API | Phase 10: `POST /ai/copilot/suggestions`, `POST /ai/copilot/consistency-check`. Phase 8.x: no AI API call. |
| Related API | Character/timeline/plot context endpoints in `novel-chapter-api.md`. |
| Key Data | Current draft, additional context text, instruction, loaded context chips, suggestion text, proposal IDs. |
| Safety Note | Copilot suggestions do not mutate official context until Author approves proposals. |

### Activity: Projects / Settings

| Item | Details |
| :--- | :--- |
| Purpose | Switch novels/projects and configure editor/AI preferences. |
| Primary API | `GET /auth/me`, `GET /users/me/settings`; a current-author novel listing endpoint is recommended. |
| Actions | Create novel, switch project, update local editor settings. |
| Key Data | Novel list, recent activity, editor theme, autosave interval, AI context settings. |

## 3. Web Admin Screens

### Admin Dashboard

| Item | Details |
| :--- | :--- |
| Purpose | Show operational stats and shortcuts. |
| Primary API | `GET /admin/dashboard/stats` |
| Key Data | Users, novels, pending moderation count, mock revenue Coins. |

### Moderation Queue

| Item | Details |
| :--- | :--- |
| Purpose | Review content/user items created by Content Control. |
| Primary API | `GET /admin/moderation/reviews` |
| Actions | `GET /admin/moderation/reviews/{reviewId}`, `POST /admin/moderation/reviews/{reviewId}/resolve` |
| Key Data | Target type, target ID, source, evidence summary, report count, status. |

### User Management

| Item | Details |
| :--- | :--- |
| Purpose | Search, lock, unlock users. |
| Primary API | `GET /admin/users` |
| Actions | `PATCH /admin/users/{userId}/lock`, `PATCH /admin/users/{userId}/unlock` |
| Key Data | User role, status, username/email, created date. |

### Taxonomy Management

| Item | Details |
| :--- | :--- |
| Purpose | Manage genres and tags. |
| Primary API | `GET /admin/taxonomy` |
| Actions | `POST /admin/taxonomy/genres`, `POST /admin/taxonomy/tags` |
| Key Data | Genre/tag name, status, usage count if available. |

### Withdraw Review

| Item | Details |
| :--- | :--- |
| Purpose | Review author mock withdraw requests. |
| Primary API | `GET /admin/withdraw-requests` |
| Actions | `POST /admin/withdraw-requests/{withdrawRequestId}/approve`, `POST /admin/withdraw-requests/{withdrawRequestId}/reject` |
| Scope Note | Demo/mock payout only, not real finance integration. |

## 4. Cross-Screen States

| State | UI Behavior |
| :--- | :--- |
| Loading | Skeleton card/list placeholders. |
| Empty | Friendly message + primary action. |
| Error | Inline error for forms, toast for retryable API errors. |
| Unauthorized | Redirect to login or show permission notice. |
| Pending Moderation | Show badge and disable public visibility actions. |
| Draft Saved | Show timestamp and non-blocking success indicator. |
