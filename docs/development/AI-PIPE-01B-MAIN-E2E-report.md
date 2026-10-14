# Gate AI-PIPE-01B: Main UI & P1 Writing Loop System E2E Report

- **Date:** 2026-10-14
- **Tested Main SHA:** `94c12df380f132580b2d2ea22667aad5154e9aa6`
- **Product UI Baseline:** `e15ef105afbffdb1ee9d8a1ee8bc4e69f32ff5b2`
- **Repaired Code SHA:** `8662b78a3f4181425f9b0999b8aa34eb3ff3d195`
- **Working / Repair Branch:** `astra/ai-pipe-01b-main-e2e-repair`
- **Overall Final Verdict:** `MAIN_UI_E2E_PASS`
- **Completion Boundary:** `LOCAL_PASS_CI_PENDING`

---

## 1. Executive Summary & Review Directive Compliance

Following the directive `ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B FINAL REPAIR BEFORE PR (2026-10-14)`, two critical blockers were addressed, verified, and closed:

### Blocker 1: Fail-Closed Outbox Proposal Materialization with 5 Unit Tests
- **Fail-Closed Contract:** In `backend/src/jobs/outbox-processor.ts`, proposal group fetching and acceptance is strictly scoped to `ev.revision_id === event.revisionId`. Any failure during proposal fetch or proposal group acceptance throws an error, causing `processOutboxOnce` to fail closed and mark the event `FAILED` with retry backoff instead of prematurely marking it `COMPLETED`.
- **Unit Test Suite:** Added 5 focused unit tests in `backend/src/jobs/outbox-processor.test.ts`:
  1. *Analysis success + scoped materialization success* -> event `COMPLETED`, Story Brain advances.
  2. *Proposal-group accept transient failure* -> throws error, event not `COMPLETED`, marked retryable.
  3. *Retry after partial attempt* -> proposals already accepted are not duplicated, finishes cleanly.
  4. *Unrelated pending proposal groups* -> untouched and not auto-accepted.
  5. *Legitimate no-op / no relevant proposals* -> cleanly classified, does not falsely claim Brain advance.
- **Test Results:** 5/5 outbox tests passed, and combined with 5/5 IDE contract tests = **10/10 PASS**.

### Blocker 2: 100% UI DOM Mutations for All Browser Checkpoints
- **Browser-E Feedback Loop:** Triggered generation #2 via UI button "Viết tiếp" in the browser. CDP network interception captured `POST /ai/writing/generations` (`requestId: 18444.515`) asserting `expected_brain_version: 17 == brain_version_after: 17`.
- **Browser-F Story Bible:** Character `Browser Arthur 7388` and timeline event `Hội thề Ashenhold f3ff` were created entirely through rendered UI form controls (`input`, `textarea`, mantine/button click). Verified upon full page reload and readback confirmed in the IDE Story Bible modal.
- **Browser-G Novel Metadata:** Modified novel synopsis via rendered modal form controls and verified on page reload. Non-owner 403 check preserved as supporting security evidence labeled `API_SECURITY`.
- **Browser-H Chapter Lifecycle:** Clicked "Thêm chương mới" via left rail UI in IDE, typed title and prose, toggled VIP at 8 coins, verified debounced autosave, verified switch-away and return preservation, and submitted publish modal in UI (`status = 'PUBLISHED'` in DB).

---

## 2. Real Browser Checkpoint Matrix

| Checkpoint | Action / Scenario | Real Browser Observation | DB & Story Brain Correlation | Status | Screenshot Artifact |
|:---|:---|:---|:---|:---:|:---|
| **Browser-A: Auth & IDE Navigation** | `/login` -> enter credentials -> click Login -> redirect to `/author` -> click Open in IDE -> `/author/ide` | Navigated to `/login`, typed `reader03@example.com`, submitted login, redirected to `/author`, rendered dashboard, opened chapter in IDE. | Session authenticated in `localStorage`, Ashenhold novel loaded. | **PASS** | `browser-login-dashboard.png`<br>`browser-writing-ide.png` |
| **Browser-B: Manual Editor / Autosave** | Type manual edit marker into editor -> wait 2.5s debounced autosave -> refresh page | Edit persisted in `textarea.value` across full page refresh. | `chapter_revisions` count for `AI_DRAFT_ACCEPT` = 0 (no fake AI revisions). | **PASS** | `browser-manual-autosave.png` |
| **Browser-C: AI Reject / Discard** | Open AI drawer -> click "Viết tiếp" -> candidate draft appears -> click "Từ chối / Bỏ qua" | AI candidate draft rendered on screen; clicking reject dismissed the candidate box cleanly. | `chapters.latest_revision_id` unchanged; `story_brains.brain_version` unchanged; zero `AI_DRAFT_ACCEPT` revisions created. | **PASS** | `browser-ai-candidate.png`<br>`browser-ai-reject.png` |
| **Browser-D: AI Accept [DECISIVE]** | Trigger generation -> wait for candidate -> click "Chấp nhận bản thảo" | Candidate accepted into editor; toast notification displayed. | Immutable revision `78218b67...` created with `source_type = 'AI_DRAFT_ACCEPT'`, `latest_revision_id` advanced, `INCREMENTAL_ANALYSIS` outbox event queued. | **PASS** | `browser-ai-accept.png` |
| **Browser-E: Outbox & Feedback Loop** | Background outbox processing after Browser-D acceptance + UI generation #2 | Background worker processed outbox event to `COMPLETED`; Story Brain version advanced: **16 -> 17**. Generation #2 from UI sent `expected_brain_version: 17`. | `brain_version` advanced: **16 -> 17**.<br>`expected_brain_version` = **17**.<br>`second_browser_request_id` = **18444.515**.<br>`outbox_status` = **COMPLETED**. | **PASS** | `browser-feedback-context.png` |
| **Browser-F: Story Bible ↔ IDE** | Navigate to `/author/context/:id` -> create Character and Timeline Event via UI form controls -> verify reload and IDE modal | Created `Browser Arthur 7388` and `Hội thề Ashenhold f3ff` via rendered form controls. Story Bible page reload and IDE Story Bible modal both render `Browser Arthur 7388`. | Persistent in PostgreSQL tables `character_profiles` and `story_timeline_events`. | **PASS** | `browser-story-bible.png` |
| **Browser-G: Novel Metadata & Security Negative** | Open `/author/novels/:id` -> edit synopsis via UI modal -> save -> reload -> non-owner security check | Synopsis modified via UI modal, verified upon reload. Non-owner attempt to update novel via API blocked. | Non-owner PATCH returned `403 Forbidden` (`AUTH_008: Unauthorized action`), labeled `API_SECURITY`. | **PASS** | `browser-novel-metadata.png` |
| **Browser-H: Chapter Lifecycle & VIP Publish** | Click "Thêm chương mới" in IDE rail -> edit title/content -> toggle VIP (8 xu) -> wait autosave -> switch away & return -> publish modal | New chapter created via UI, edited, autosaved, verified preserved upon switching away/returning, and submitted publish modal in UI. | In PostgreSQL: `status = 'PUBLISHED'`, `is_vip = true`, `price_coins = 8`. | **PASS** | `browser-chapter-lifecycle.png` |

---

## 3. Decisive Trace Lineage

The following cryptographic identifiers trace the exact lineage of the verified run:

```json
{
  "gate": "AI-PIPE-01B",
  "execution_mode": "REAL_BROWSER_AUTOMATION_CDP",
  "browser": "Microsoft Edge 155 (Headless Chrome/155.0.0.0)",
  "tested_main_sha": "94c12df380f132580b2d2ea22667aad5154e9aa6",
  "repaired_code_sha": "8662b78a3f4181425f9b0999b8aa34eb3ff3d195",
  "evidence_commit_sha": "9a12125c580f95009a61a77a289114440ae30683",
  "branch": "astra/ai-pipe-01b-main-e2e-repair",
  "novel_id": "81b923d7-5507-48ea-9a84-5303fd1de5f4",
  "chapter_id": "c660bede-0493-4a46-97f2-6d01c8ddd3db",
  "accepted_revision_id": "78218b67-748c-43ba-bbdf-525833d41807",
  "source_generation_id": "ac7d1d79-af3a-5131-8a6d-61a77012ba62",
  "outbox_event_id": "e7c93aaf-1d29-4812-af50-3c2b83e10c33",
  "brain_version_before": 16,
  "brain_version_after": 17,
  "second_browser_request_id": "18444.515",
  "new_chapter_id": "e5aa4e81-0873-46b2-b550-7a1e6a5681c0"
}
```

---

## 4. Evidence Artifacts Listing

All artifacts are preserved under `docs/development/AI-PIPE-01B-MAIN-E2E/`:

1. `ai-pipe-01b-main-e2e-evidence.json` (machine-readable evidence summary)
2. `browser-login-dashboard.png` (Browser-A login and author dashboard)
3. `browser-writing-ide.png` (Browser-A author writing IDE workspace)
4. `browser-manual-autosave.png` (Browser-B editor typing and debounced autosave)
5. `browser-ai-candidate.png` (Browser-C AI candidate draft rendering)
6. `browser-ai-reject.png` (Browser-C candidate dismissal without canon mutation)
7. `browser-ai-accept.png` (Browser-D candidate acceptance and toast confirmation)
8. `browser-feedback-context.png` (Browser-E feedback loop observing brain version advance via browser UI generation #2)
9. `browser-story-bible.png` (Browser-F Story Bible entities created via UI and reloaded)
10. `browser-novel-metadata.png` (Browser-G novel metadata inspection and UI save)
11. `browser-chapter-lifecycle.png` (Browser-H VIP chapter created, autosaved, and published via UI)

---

## 5. Status Boundary & Handoff

- **Overall Verdict:** `MAIN_UI_E2E_PASS`
- **Execution State:** Real browser CDP execution complete; all checkpoints PASS with 100% UI DOM mutations.
- **Branch:** `astra/ai-pipe-01b-main-e2e-repair`.
- **Status Boundary:** `LOCAL_PASS_CI_PENDING`.
- **Handoff:** PR creation, merging, and remote GitHub Actions CI run are left to ChatGPT/maintainer per review directive instructions.
