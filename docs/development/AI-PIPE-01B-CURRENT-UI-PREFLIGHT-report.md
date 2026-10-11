# AI-PIPE-01B Current UI Preflight Audit Report

**Execution Timestamp:** 2026-10-11T16:50:00Z  
**Branch:** `astra/ai-pipe-01b-current-ui-preflight`  
**Base Commit SHA (CODE_SHA):** `d5c1865c363914b433ce2a1012f277ca9f074a3f`  
**Browser Tooling:** Chrome Headless / Antigravity Browser Subagent (1600x1000 Desktop Viewport)  
**Compose Stack:** `postgres` (pgvector:pg16, port 5433), `backend` (Node/Express, port 4000), `ai-service` (FastAPI, port 8000), `web` (Nginx, port 8080), `mongodb` (Mongo 7, port 27017)  
**Database Backend:** PostgreSQL 16 + pgvector (`ephurin`)  
**Context Routing Policy:** `legacy-v1`  
**Generation Provider:** `gemini-3.5-flash-lite` (via AI Gateway / fake deterministic seam where applicable)  
**Preflight Verdict:** `CURRENT_UI_PREFLIGHT_PASS`  
**Late Gate Milestone:** `AI-PIPE-01B FINAL BROWSER ACCEPTANCE = PENDING_UI_REFACTOR`  

---

## 1. Executive Summary

This preflight browser and system audit evaluated the existing frontend web application (`web/`) against the now CI-closed backend pipelines (P1 Import & Assisted Writing, P2 Idea Bootstrap & Story Plan, P3 Bounded Autonomous Controller).

### Key Conclusions:
1. **P1 Writing & Context Loop Is Fully Functional in Browser:**
   - Author login, novel project navigation, 3-panel Author IDE workspace, Story Brain Context Preview modal, AI writing generation, draft discard (reject), draft acceptance, and immutable revision persistence are **100% real-backend-bound and functional**.
   - Generated draft was accepted in the browser, persisting revision `41cb873e-9814-4d86-929f-93fa0c37a38a` with `source_type='AI_DRAFT_ACCEPT'` and `source_generation_id='da9b30e4-bce1-5fdc-a408-cff90f70f529'` in PostgreSQL `chapter_revisions`.
   - Outbox event `INCREMENTAL_ANALYSIS` was recorded and processed, and re-opening the chapter proved persistent state readback.
2. **Negative Cases Verified:**
   - **Reject / Discard Draft:** Discarding a generated draft closed the preview card, performed zero mutations to the chapter editor, and created zero new revisions in PostgreSQL.
   - **Authorization:** Non-owner attempt to mutate the novel returned HTTP 403 Forbidden (`AUTH_008`).
3. **UI Contract & Responsiveness Finding:**
   - The 4-column IDE layout (`activity-bar`, `dynamic-sidebar`, `editor-workspace`, `assistant-panel`) requires viewport width > 1180px. At `<= 1180px`, `@media (max-width: 1180px)` hides `.assistant-panel`. In desktop viewports (1440px / 1600px), all panels operate cleanly.
4. **Contract Scope Assessment:**
   - **P1 Surfaces:** Fully implemented and bound to real backend APIs.
   - **P2 & P3 Surfaces:** Story Plan management and Autonomous Run loop are currently **NOT_IMPLEMENTED** in the UI (backend-only via closed Node gateways). The UI refactor team can safely design these new surfaces against the established backend schemas without legacy frontend drift.

---

## 2. Browser Checkpoint Audit Matrix

| # | Checkpoint | UI Route / Component | Backend API Reached | DB / State Evidence | Status | Audit Notes |
|---|---|---|---|---|---|---|
| **CP 01** | Author Authentication & Session | `/login` (`AuthLanding`) | `POST /api/v1/auth/login`<br>`GET /api/v1/auth/me` | User `reader03` authenticated, JWT token saved to `localStorage` | **PASS** | Role `AUTHOR` redirects cleanly to `/author`. |
| **CP 02** | Author Projects Dashboard | `/author` (`AuthorProjectsPage`) | `GET /api/v1/novels/me`<br>`GET /api/v1/novels/:id/chapters` | 20 existing novels returned from PostgreSQL `novels` | **PASS** | Real project cards with status badges, chapter counts, and deep links. |
| **CP 03** | Author IDE Shell & Workspace | `/author/ide` (`AuthorIdeShell`) | `GET /api/v1/novels/:id`<br>`GET /api/v1/chapters/:id` | Chapter draft loaded into editor textarea | **PASS** | Activity bar, dynamic sidebar, prose editor, and status bar initialized. |
| **CP 04** | Sidebar Sub-views Audit | `/author/ide` (`DynamicSidebar`) | `GET /api/v1/novels/:id/characters`<br>`GET /api/v1/novels/:id/timeline-events` | Real entities & events loaded in overview | **PARTIAL** | `story`, `entities`, `timeline`, `projects` bound to backend. `graph`, `search`, `tasks`, `settings` are **MOCK_ONLY / PLACEHOLDER**. |
| **CP 05** | Story Brain Context Preview | `/author/ide` (`WritingAssistantPanel`) | `GET /api/v1/ai/story-brains/:id/context-preview` | Token budget (`207 / 12000`), entity states, world rules returned | **PASS** | Modal opens with real story brain context and token gauge. |
| **CP 06** | AI Generation Request | `/author/ide` (`WritingAssistantPanel`) | `POST /api/v1/ai/writing/generations`<br>`GET /api/v1/ai/jobs/:jobId` | Job `da9b30e4-bce1-5fdc-a408-cff90f70f529` status `completed` | **PASS** | Returned validated draft: *"Tiêu Viêm thở dài một hơi..."*. |
| **CP 07** | Negative Case A: Draft Discard | `/author/ide` (`WritingAssistantPanel`) | None (local state discard) | Chapter content untouched, 0 new revisions in `chapter_revisions` | **PASS** | Draft card dismissed, editor content intact, canon preserved. |
| **CP 08** | Positive Case: Draft Acceptance | `/author/ide` (`WritingAssistantPanel`) | `POST /api/v1/chapters/:id/revisions/accept-draft` | Revision `41cb873e` persisted with `AI_DRAFT_ACCEPT` | **PASS** | Draft text merged into editor; immutable revision stored in DB. |
| **CP 09** | Chapter Content Persistence | `/author/ide` (`AuthorIdeShell`) | `GET /api/v1/chapters/:id`<br>`GET /api/v1/chapters/:id/revisions` | Revision readback matches accepted draft | **PASS** | Re-opening chapter proves durable persistence across reloads. |
| **CP 10** | Transactional Outbox Sync | Background Job | `outbox-processor` | Outbox event `086aa719` status `COMPLETED` | **PASS** | `INCREMENTAL_ANALYSIS` executed; Story Brain status `active`. |
| **CP 11** | Negative Case D: Authorization Guard | Direct / API Boundary | `POST /api/v1/novels/:id/chapters` | 403 Forbidden (`AUTH_008`) for non-owner `reader04` | **PASS** | Strict multi-tenant author boundary enforced. |
| **CP 12** | Manuscript Import Interface | `/author/import/:novelId` (`ManuscriptImportPage`) | `POST /api/v1/ai/story-brains/bootstrap/from-manuscript`<br>`GET /api/v1/ai/story-brains/:id/review-queue` | Ready for revision manifest JSON input | **PASS** | Functional developer preflight UI for P1 manuscript import. |
| **CP 13** | Story Context Manager | `/author/context/:novelId` (`AuthorStoryContextPage`) | `GET /api/v1/novels/:id/characters`<br>`POST /api/v1/novels/:id/characters` | Full CRUD for characters, relationships, timeline, plot | **PASS** | Multi-tab context management bound to PostgreSQL. |
| **CP 14** | Story Plan & Autonomous Loop UI | N/A | None in frontend | Backend routes exist (`/ai/story-plans`, `/ai/autonomous`) | **NOT_IMPLEMENTED** | P2 outline and P3 autonomous controller not yet exposed in web UI. |

---

## 3. UI Surface Classification

Every relevant UI surface was audited and classified:

### 3.1 REAL_BACKEND_BOUND
- **Auth Landing (`/login`):** Connects to `POST /auth/login` and `GET /auth/me`.
- **Author Projects (`/author`):** Connects to `GET /novels/me` and `POST /novels`.
- **Author IDE Prose Editor (`/author/ide`):** Connects to `GET/PATCH /chapters/:id`, `POST /chapters/:id/revisions/snapshot`, and `GET /chapters/:id/revisions`.
- **Writing Copilot (`WritingAssistantPanel`):** Connects to `POST /ai/writing/generations`, `GET /ai/jobs/:jobId`, and `POST /chapters/:id/revisions/accept-draft`.
- **Context Preview Modal:** Connects to `GET /ai/story-brains/:id/context-preview`.
- **Manuscript Import (`/author/import/:novelId`):** Connects to `POST /ai/story-brains/bootstrap/from-manuscript`, `GET /ai/jobs/:id`, `GET /ai/story-brains/:id/review-queue`, `POST /ai/proposal-groups/:id/accept`, and `POST /ai/story-brains/:id/baseline/activate`.
- **Story Context Manager (`/author/context/:novelId`):** Connects to full character, timeline, relationship, and plot summary CRUD routes.

### 3.2 MOCK_ONLY / PLACEHOLDER
- **Sidebar Knowledge Graph Tab:** Static count overview with placeholder text noting visualization is planned for Phase 10.
- **Sidebar Search Tab:** Placeholder text for local search.
- **Sidebar Tasks Tab:** Placeholder text for author checklists.
- **Sidebar Settings Tab:** Placeholder text for author workspace settings.

### 3.3 NOT_IMPLEMENTED (Backend-Ready for UI Refactor)
- **Story Plan / Outline Builder (AI-PIPE-02B):** Backend API is complete (`POST /api/v1/ai/story-plans`, `GET /api/v1/ai/story-plans/by-novel/:id/active`), but no frontend view exists yet.
- **Bounded Autonomous Controller (AI-PIPE-03A):** Backend API is complete (`POST /api/v1/ai/autonomous/runs`, `GET /api/v1/ai/autonomous/runs/:id`), but no frontend dashboard exists yet.

---

## 4. Correlated Data Lineage (Browser ↔ Database)

All browser interactions were traced directly into PostgreSQL:

```text
Actor (Author):           86c6646a-5c29-478e-89bb-74c7a9326ce0 (reader03)
Novel ID:                 01c4c899-d0c3-472f-9acb-e4f85f90f2fa ("Disposable Retry Novel 1791730919")
Chapter ID:               e97def21-36e2-4572-87aa-ba1f8496905a ("Untitled Chapter", Ch. 3)

Initial Revision (Pre):   081cf454-e203-455c-b719-2e20d5b72c66 (source_type: AUTHOR_MANUAL)
Generation Job ID:        da9b30e4-bce1-5fdc-a408-cff90f70f529 (operation: continue, status: completed)
Accepted Revision (Post): 41cb873e-9814-4d86-929f-93fa0c37a38a (source_type: AI_DRAFT_ACCEPT, words: 26)
Outbox Event ID:          086aa719-21a2-4c09-b8a2-abab5654b8e2 (INCREMENTAL_ANALYSIS, status: COMPLETED)
Story Brain ID:           c0cb2649-18bd-41ae-a55b-28b7040447dc (version: 1, status: active)
```

---

## 5. Visual Artifacts (Screenshots)

Screenshots captured during the live browser subagent sessions are archived in `docs/development/AI-PIPE-01B-CURRENT-UI-PREFLIGHT/`:

1. **`cp01_author_dashboard.png`:** Author dashboard with writing project cards, status filters, and navigation links.
2. **`cp02_author_ide_wide.png`:** 4-panel wide desktop view showing Activity Bar, Chapter Tree, Editor Workspace, and Writing Copilot.
3. **`cp03_context_preview_modal.png`:** Context Preview modal displaying Story Brain token budget gauge (`207 / 12000`) and entities.
4. **`cp04_draft_rejected_negative.png`:** Discard negative case proving draft preview cleared without mutating chapter text.
5. **`cp05_manuscript_import.png`:** Manuscript Import page with revision manifest input and bootstrap trigger.
6. **`cp06_story_context_manager.png`:** Story Context Manager with Characters, Relationships, Timeline, and Plot Summaries tabs.

---

## 6. Recommendations for UI Refactor Team

1. **Responsive Viewport Layout:**
   - In `styles.css`, `.assistant-panel` is hidden below 1180px via `@media (max-width: 1180px) { display: none; }`.
   - The refactor should introduce a responsive collapsible drawer or floating toggle button for the Writing Assistant on smaller laptop screens (1024px–1280px) rather than abruptly hiding it.
2. **Preserve Established P1 Contract:**
   - The contract implemented in `WritingAssistantPanel` (`startWritingGeneration` $\to$ `getJobStatus` $\to$ `acceptDraftRevision`) is robust and proven. The UI refactor should retain this exact state machine.
3. **Add P2 & P3 Views:**
   - The refactored UI should add views for the Story Plan outline (Phase 2B) and Autonomous Controller dashboard (Phase 3A), binding directly to the existing Express gateway endpoints.
