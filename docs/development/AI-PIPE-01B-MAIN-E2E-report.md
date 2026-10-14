# Gate AI-PIPE-01B: Main UI & P1 Writing Loop System E2E Report

- **Date:** 2026-10-14
- **Tested Main SHA:** `356d3d48fa7f64453c72f5b8866763e186a698e8`
- **Product UI Baseline:** `e15ef105afbffdb1ee9d8a1ee8bc4e69f32ff5b2`
- **Working / Repair Branch:** `astra/ai-pipe-01b-main-e2e-repair`
- **Overall Final Verdict:** `MAIN_UI_E2E_PASS`
- **Completion Boundary:** `LOCAL_PASS_CI_PENDING`

---

## 1. Executive Summary

Following the merge of PR #43 (`1d1525b` — feat(ui): add author writting ide) and PR #44 (`0e7012c` — feat(ui): add novel data and story bible screen), an end-to-end audit was conducted across the real stack (Node backend, Python AI service, PostgreSQL + pgvector, MongoDB, and React Web app).

### Defect Classification & Resolution
- **Defect Found:** `UI_CONTRACT_REGRESSION` in `AuthorWritingIde.tsx`.
- **Root Cause:** The new Author Writing IDE invoked `POST /api/v1/ai/copilot/suggestions` and upon user acceptance inserted suggestion text into the editor followed by autosave `PATCH /api/v1/chapters/:chapterId`. This bypassed the canonical P1 writing generation and acceptance flow (`startWritingGeneration`, job polling, `acceptDraftRevision`), failing to produce immutable `AI_DRAFT_ACCEPT` revisions, omitting `INCREMENTAL_ANALYSIS` outbox events, and breaking Story Brain closed-loop version advancement.
- **Scoped Repair:** Reconnected `AuthorWritingIde.tsx` to the canonical P1 flow:
  1. Base revision snapshot verification (`listChapterRevisions` / `createChapterSnapshot`).
  2. Context preview lookup for expected Story Brain version (`fetchContextPreview`).
  3. Canonical job generation (`startWritingGeneration`).
  4. Polling until terminal state (`getJobStatus`).
  5. Canonical draft acceptance (`acceptDraftRevision`), creating immutable revisions and outbox events.
  6. Discard/reject cleanly dismissing candidates without altering canon.
- **Regression Coverage:** Added unit/contract regression test suite in `backend/src/modules/ai/ai-pipe-01b-ide-e2e.test.ts` (5/5 PASS) and end-to-end integration runner in `scripts/run_ai_pipe_01b_main_e2e.py` (all checkpoints PASS).

---

## 2. Checkpoint Execution Matrix

| Checkpoint | UI Component / Action | API Reached | DB & Story Brain State | Status | Notes |
|:---|:---|:---|:---|:---:|:---|
| **E2E-A: Main UI Smoke & Navigation** | Login (`/login`) -> `/author` -> Novel Data (`/author/novels/:id`) -> Story Bible (`/author/context/:id`) -> Writing IDE (`/author/ide`) | `POST /auth/login`<br>`GET /novels/me`<br>`GET /novels/:id`<br>`GET /novels/:id/chapters`<br>`GET /chapters/:id` | Readback active author session, 2 novels loaded, 10 chapters in Ashenhold fixture. | **PASS** | No route crashes, session survives navigation, query params synchronized, non-mock data from PostgreSQL. |
| **E2E-B1: Manual Edit / Autosave** | Editor text input -> debounced autosave | `PATCH /chapters/:chapterId` (`autosave: true`) | MongoDB draft updated.<br>`chapter_revisions` count for `AI_DRAFT_ACCEPT` = 0.<br>`revision_outbox_events` = 0. | **PASS** | Manual autosave updates draft without fabricating AI revision or triggering incremental analysis. |
| **E2E-B2: AI Generation / Reject** | Open AI Drawer -> "Viết tiếp" -> candidate received -> Dismiss/Reject | `POST /ai/writing/generations`<br>`GET /ai/jobs/:jobId` | `chapters.latest_revision_id` unchanged.<br>`chapter_revisions` created = 0.<br>Story Brain version unchanged. | **PASS** | Rejection leaves canon, latest revision pointer, and Story Brain untouched. |
| **E2E-B3: AI Generation / Accept** | Open AI Drawer -> generation completed -> "Chấp nhận bản thảo" | `POST /ai/writing/generations`<br>`GET /ai/jobs/:jobId`<br>`POST /chapters/:id/revisions/accept-draft` | Immutable revision `540bfd67...` persisted with `source_type = 'AI_DRAFT_ACCEPT'`.<br>`chapters.latest_revision_id` advanced.<br>Outbox event `INCREMENTAL_ANALYSIS` created. | **PASS** | **Decisive Checkpoint:** Canonical P1 lineage fully verified in backend and PostgreSQL. |
| **E2E-B4: Story Brain Feedback Loop** | Accept draft -> background transactional outbox processing | Outbox worker -> `POST /v1/revisions/:id/analyses`<br>`GET /ai/story-brains/:id/context-preview` | Outbox event reached `COMPLETED`.<br>Story Brain version verified.<br>Second context preview observes active state. | **PASS** | Closed-loop validated: incremental analysis processed and observed by subsequent context calls. |
| **E2E-C: Story Bible ↔ IDE Consistency** | Story Bible tabs -> create Character, Timeline Event, Plot Summary | `POST /novels/:id/characters`<br>`POST /novels/:id/timeline-events`<br>`POST /novels/:id/plot-summaries` | Direct PostgreSQL query in `character_profiles`, `story_timeline_events`, `plot_summaries` verified persistence. | **PASS** | Story Bible mutations persist durably and reflect in Writing IDE lookups. |
| **E2E-D: Novel Metadata & Ownership Guard** | Novel Data -> edit synopsis -> save.<br>Non-owner attempt | `PATCH /novels/:id` (owner)<br>`PATCH /novels/:id` (non-owner) | Owner update succeeds (200).<br>Non-owner mutation rejected with HTTP 403 Forbidden. | **PASS** | Strict ownership invariants maintained. |
| **E2E-E: Chapter Lifecycle in Writing IDE** | New chapter -> edit -> toggle VIP pricing -> submit publish | `POST /novels/:id/chapters`<br>`PATCH /chapters/:id`<br>`POST /chapters/:id/submit-publish` | Chapter created, VIP price = 25 coins persisted, status updated to `PUBLISHED`. | **PASS** | Full chapter publication and monetization cycle verified. |

---

## 3. Correlated Identifiers (Trace Lineage)

```text
tenant_id:                     00000000-0000-0000-0000-000000000001
author_id:                     51ca9a66-d798-4f6c-8518-11c085678e4f (reader03@example.com)
novel_id:                      81b923d7-5507-48ea-9a84-5303fd1de5f4 (Ashenhold - Sample Story)
chapter_id:                    c660bede-0493-4a46-97f2-6d01c8ddd3db
base_revision_id:              c64e3ec5-e4fc-40f1-8315-dc01c3bae9f7
generation_job_id (accepted):  6b8e2e2f-a04a-5759-b3d7-d0a9c826c414
accepted_revision_id:          540bfd67-298a-4a9f-80ba-b2bc611cb92e
outbox_event_id:               b1a8e2ea-7f2e-4156-80ec-e0c29422466e
outbox_event_type:             INCREMENTAL_ANALYSIS
outbox_final_status:           COMPLETED
story_brain_id:                29908259-3ab2-4c6b-901a-99488df74217
```

---

## 4. Evidence Lineage

Structured JSON artifact saved to:
`docs/development/AI-PIPE-01B-MAIN-E2E/ai-pipe-01b-main-e2e-evidence.json`

Commands executed:
```bash
# Regression suite
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ephurin"; $env:MONGODB_URI="mongodb://localhost:27017/ephurin"; $env:JWT_ACCESS_SECRET="test-secret-123456"; $env:JWT_REFRESH_SECRET="test-secret-123456"; npx tsx --test src/modules/ai/ai-pipe-01b-ide-e2e.test.ts

# E2E system runner
python scripts/run_ai_pipe_01b_main_e2e.py
```

---

## 5. Status Boundary

Gemini local execution completed. Local verification: `PASS`.
Branch: `astra/ai-pipe-01b-main-e2e-repair`.
Status: `LOCAL_PASS_CI_PENDING`.
Merging and remote GitHub CI acceptance owned by ChatGPT.
