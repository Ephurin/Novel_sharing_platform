# Gate AI-PIPE-01B: Main UI & P1 Writing Loop System E2E Report

- **Date:** 2026-10-14
- **Tested Code SHA:** `474b04fbc6173cfc847e06bf4e522211adf6f4d5`
- **Evidence Payload SHA:** `9d75b91be6fc8f76899416a3d1d6faa629c9075b`
- **Tested Main SHA:** `5432a20a93852cc6c4a403fa03e0ed46117f5f36`
- **Working / Repair Branch:** `astra/ai-pipe-01b-main-e2e-repair`
- **Overall Final Verdict:** `MAIN_UI_E2E_PASS`
- **Completion Boundary:** `CI_PASS / MERGED`

---

## 1. Executive Summary & Review Directive Compliance

Following the directive `ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B FINAL SHA CORRECTION + PR HANDOFF (2026-10-14)`, all functional and lineage requirements are verified and closed:

### Blocker 1: Branch Sync & Merge with Origin Main
- **Status:** Merged latest `origin/main` commit into `astra/ai-pipe-01b-main-e2e-repair`.
- **Baseline Main SHA:** `5432a20a93852cc6c4a403fa03e0ed46117f5f36`.

### Blocker 2: Complete 4-Surface Story Bible UI DOM Mutation (Browser-F)
- **4 Implemented Surfaces Mutated 100% via UI DOM:**
  1. *Character A:* `Browser Arthur 9f76` created via character creation form (`[title="Thêm nhân vật mới"]`).
  2. *Character B:* `Browser Guinevere 6a17` created via character creation form.
  3. *Relationship:* `Browser Arthur 9f76` -> `Browser Guinevere 6a17` (`Hộ vệ trung thành`) created via relationship form dropdowns and inputs in the "Mối quan hệ" tab.
  4. *Timeline Event:* `Hội thề Ashenhold 6c24` created via timeline creation form in the "Dòng thời gian (Timeline)" tab.
  5. *Plot Summary:* Novel-scope plot summary created via plot summary form in the "Tóm tắt hồi (Plot Summaries)" tab.
- **Persistence Verification:** Full page reload of `/author/context/:id` confirmed all 4 surfaces persistent in DOM.
- **IDE Story Bible Modal Verification:** Navigated back to `/author/ide`, opened Story Bible modal, and verified all 4 surfaces rendered across their respective tabs (`Nhân vật`, `Mối quan hệ`, `Dòng thời gian`, `Tóm tắt hồi`).

### Blocker 3: `processOutboxOnce` Multi-Attempt State-Transition Tests
- **Outbox Processor Seam:** Added optional `deps?: OutboxDependencies` to `processOutboxOnce` in `backend/src/jobs/outbox-processor.ts` for deterministic state-transition testing without requiring live background timers.
- **Test Suite:** Added comprehensive state-transition test (Test 6) in `backend/src/jobs/outbox-processor.test.ts`:
  - *Attempt 1:* Group A materializes -> Group B transiently fails with HTTP 503 -> `markCompleted` NOT called -> `markFailed` called with backoff -> event transitions to `FAILED` (retryable).
  - *Attempt 2 (Retry):* Reclaimed with active lease -> already-materialized Group A is not duplicated -> Group B succeeds -> `markCompleted` called -> event transitions to `COMPLETED`.
- **Full Backend Suite Results:** 6/6 outbox processor tests + 5/5 IDE contract tests = **11/11 PASS**.

### Blocker 4: Reproducible Evidence Lineage Protocol & Verified Main SHA
- **Strict Backward Lineage:** `FINAL_TESTED_CODE_SHA` (`474b04fbc6173cfc847e06bf4e522211adf6f4d5`) established and pushed to origin before test execution. Runner dynamically records `tested_code_sha: 474b04fbc6173cfc847e06bf4e522211adf6f4d5` and `tested_main_sha: 5432a20a93852cc6c4a403fa03e0ed46117f5f36`.
- **Invalid SHA Purge:** The invalid SHA (`5432a201...`) is completely purged from runner, evidence JSON, and report.

---

## 2. Real Browser Checkpoint Matrix

| Checkpoint | Action / Scenario | Real Browser Observation | DB & Story Brain Correlation | Status | Screenshot Artifact |
|:---|:---|:---|:---|:---:|:---|
| **Browser-A: Auth & IDE Navigation** | `/login` -> enter credentials -> click Login -> redirect to `/author` -> click Open in IDE -> `/author/ide` | Navigated to `/login`, typed `reader03@example.com`, submitted login, redirected to `/author`, rendered dashboard, opened chapter in IDE. | Session authenticated in `localStorage`, Ashenhold novel loaded. | **PASS** | `browser-login-dashboard.png`<br>`browser-writing-ide.png` |
| **Browser-B: Manual Editor / Autosave** | Type manual edit marker into editor -> wait 2.5s debounced autosave -> refresh page | Edit persisted in `textarea.value` across full page refresh. | `chapter_revisions` count for `AI_DRAFT_ACCEPT` = 0 (no fake AI revisions). | **PASS** | `browser-manual-autosave.png` |
| **Browser-C: AI Reject / Discard** | Open AI drawer -> click "Viết tiếp" -> candidate draft appears -> click "Từ chối / Bỏ qua" | AI candidate draft rendered on screen; clicking reject dismissed the candidate box cleanly. | `chapters.latest_revision_id` unchanged; `story_brains.brain_version` unchanged; zero `AI_DRAFT_ACCEPT` revisions created. | **PASS** | `browser-ai-candidate.png`<br>`browser-ai-reject.png` |
| **Browser-D: AI Accept [DECISIVE]** | Trigger generation -> wait for candidate -> click "Chấp nhận bản thảo" | Candidate accepted into editor; toast notification displayed. | Immutable revision `47b02732...` created with `source_type = 'AI_DRAFT_ACCEPT'`, `latest_revision_id` advanced, `INCREMENTAL_ANALYSIS` outbox event queued. | **PASS** | `browser-ai-accept.png` |
| **Browser-E: Outbox & Feedback Loop** | Background outbox processing after Browser-D acceptance + UI generation #2 | Background worker processed outbox event to `COMPLETED`; Story Brain version advanced: **22 -> 23**. Generation #2 from UI sent `expected_brain_version: 23`. | `brain_version` advanced: **22 -> 23**.<br>`expected_brain_version` = **23**.<br>`second_browser_request_id` = **25136.516**.<br>`outbox_status` = **COMPLETED**. | **PASS** | `browser-feedback-context.png` |
| **Browser-F: Story Bible ↔ IDE [4 SURFACES]** | Navigate to `/author/context/:id` -> create Character A & B, Relationship, Timeline Event, and Plot Summary via UI form controls -> verify reload and IDE modal | Created `Browser Arthur 9f76`, `Browser Guinevere 6a17`, Relationship `Hộ vệ trung thành`, Timeline Event `Hội thề Ashenhold 6c24`, and Plot Summary via rendered form controls. Verified all 4 surfaces on reload and in IDE modal tabs. | Persistent in PostgreSQL tables `character_profiles`, `character_relationships`, `story_timeline_events`, and `plot_summaries`. | **PASS** | `browser-story-bible.png` |
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
  "tested_code_sha": "474b04fbc6173cfc847e06bf4e522211adf6f4d5",
  "evidence_payload_sha": "9d75b91be6fc8f76899416a3d1d6faa629c9075b",
  "tested_main_sha": "5432a20a93852cc6c4a403fa03e0ed46117f5f36",
  "branch": "astra/ai-pipe-01b-main-e2e-repair",
  "novel_id": "81b923d7-5507-48ea-9a84-5303fd1de5f4",
  "chapter_id": "c660bede-0493-4a46-97f2-6d01c8ddd3db",
  "accepted_revision_id": "47b02732-73e5-435f-9eb5-ffb4ecd1fc06",
  "source_generation_id": "f56ab4d8-8aba-5915-8116-6e0d42c3461d",
  "outbox_event_id": "9bd3aa85-321f-492a-b0ce-afb60b77670f",
  "brain_version_before": 22,
  "brain_version_after": 23,
  "second_browser_request_id": "25136.516",
  "new_chapter_id": "e5099536-1249-4705-892e-a1316108d8e7"
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
9. `browser-story-bible.png` (Browser-F all 4 Story Bible entities created via UI and reloaded)
10. `browser-novel-metadata.png` (Browser-G novel metadata inspection and UI save)
11. `browser-chapter-lifecycle.png` (Browser-H VIP chapter created, autosaved, and published via UI)

---

## 5. Remote Acceptance & Merge Closure

- **Overall Verdict:** `MAIN_UI_E2E_PASS`.
- **Local Browser Evidence:** PASS on tested code `474b04fbc6173cfc847e06bf4e522211adf6f4d5`, with evidence payload `9d75b91be6fc8f76899416a3d1d6faa629c9075b` and lineage seal `2e1fb9b5747e4dfc0c4a3bef2cab54d55d47f269`.
- **Accepted PR:** #45 — `feat(ai-pipe-01b): close browser UI writing loop E2E`.
- **Accepted PR Head:** `3356de5ded6061dd6447e191b70e59ec48498488`.
- **P7 Semantic Memory Foundation:** run #125 / `38527368867` — **PASS**.
- **P8 Cutover and Migration:** run #122 / `38527368972` — **PASS**.
- **P8 Root Compose Regression Coverage:** AI-PIPE-01A, AI-PIPE-02A, AI-PIPE-02B, and AI-PIPE-03A runners, evidence validators, and route/controller suites all passed on the accepted PR head.
- **Merge Commit:** `ff1ddb2430f342ba4221e442c2976ec481ad99a0`.
- **Remote Status:** `CI_PASS / MERGED`.
- **P1 Overall System Status:** `P1_OVERALL_SYSTEM_PASS`.

The PR-CI repair work after the browser evidence did not change the accepted browser product behavior. It aligned legacy P1/P2 validation runners with the fail-closed outbox contract: revision-scoped proposals may already be materialized when an outbox event reaches `COMPLETED`, and canonical snapshot analysis may advance Story Brain asynchronously before the next generation request.
