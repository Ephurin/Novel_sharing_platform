# Gate AI-PIPE-01B: Main UI & P1 Writing Loop System E2E Report

- **Date:** 2026-10-14
- **Tested Code SHA:** `e85570f835932bbd26992f94d4707e35dddc510f`
- **Evidence Payload SHA:** `dceb5856b2284c916750281b8c0a59ed5b0b81f4`
- **Tested Main SHA:** `5432a201b1076b00c3b01968832a84d4df0e7740`
- **Working / Repair Branch:** `astra/ai-pipe-01b-main-e2e-repair`
- **Overall Final Verdict:** `MAIN_UI_E2E_PASS`
- **Completion Boundary:** `LOCAL_PASS_CI_PENDING`

---

## 1. Executive Summary & Review Directive Compliance

Following the directive `ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B FINAL EVIDENCE HARDENING (2026-10-14)`, all directives were addressed, verified, and hardened:

### Blocker 1: Branch Sync & Merge with Origin Main
- **Status:** Merged latest `origin/main` commit `5432a201b1076b00c3b01968832a84d4df0e7740` into `astra/ai-pipe-01b-main-e2e-repair`.
- **Baseline Main SHA:** `5432a201b1076b00c3b01968832a84d4df0e7740`.

### Blocker 2: Complete 4-Surface Story Bible UI DOM Mutation (Browser-F)
- **4 Implemented Surfaces Mutated 100% via UI DOM:**
  1. *Character A:* `Browser Arthur fac0` created via character creation form (`[title="Thêm nhân vật mới"]`).
  2. *Character B:* `Browser Guinevere d6ae` created via character creation form.
  3. *Relationship:* `Browser Arthur fac0` -> `Browser Guinevere d6ae` (`Hộ vệ trung thành`) created via relationship form dropdowns and inputs in the "Mối quan hệ" tab.
  4. *Timeline Event:* `Hội thề Ashenhold c184` created via timeline creation form in the "Dòng thời gian (Timeline)" tab.
  5. *Plot Summary:* Novel-scope plot summary created via plot summary form in the "Tóm tắt hồi (Plot Summaries)" tab.
- **Persistence Verification:** Full page reload of `/author/context/:id` confirmed all 4 surfaces persistent in DOM.
- **IDE Story Bible Modal Verification:** Navigated back to `/author/ide`, opened Story Bible modal, and verified all 4 surfaces rendered across their respective tabs (`Nhân vật`, `Mối quan hệ`, `Dòng thời gian`, `Tóm tắt hồi`).

### Blocker 3: `processOutboxOnce` Multi-Attempt State-Transition Tests
- **Outbox Processor Seam:** Added optional `deps?: OutboxDependencies` to `processOutboxOnce` in `backend/src/jobs/outbox-processor.ts` for deterministic state-transition testing without requiring live background timers.
- **Test Suite:** Added comprehensive state-transition test (Test 6) in `backend/src/jobs/outbox-processor.test.ts`:
  - *Attempt 1:* Group A materializes -> Group B transiently fails with HTTP 503 -> `markCompleted` NOT called -> `markFailed` called with backoff -> event transitions to `FAILED` (retryable).
  - *Attempt 2 (Retry):* Reclaimed with active lease -> already-materialized Group A is not duplicated -> Group B succeeds -> `markCompleted` called -> event transitions to `COMPLETED`.
- **Full Backend Suite Results:** 6/6 outbox processor tests + 5/5 IDE contract tests = **11/11 PASS**.

### Blocker 4: Reproducible Evidence Lineage Protocol
- **Strict Backward Lineage:** `TESTED_CODE_SHA` (`e85570f835932bbd26992f94d4707e35dddc510f`) established and pushed to origin before test execution. Runner dynamically records `tested_code_sha: e85570f835932bbd26992f94d4707e35dddc510f` and `tested_main_sha: 5432a201b1076b00c3b01968832a84d4df0e7740`. Zero self-referential guessed commits.

---

## 2. Real Browser Checkpoint Matrix

| Checkpoint | Action / Scenario | Real Browser Observation | DB & Story Brain Correlation | Status | Screenshot Artifact |
|:---|:---|:---|:---|:---:|:---|
| **Browser-A: Auth & IDE Navigation** | `/login` -> enter credentials -> click Login -> redirect to `/author` -> click Open in IDE -> `/author/ide` | Navigated to `/login`, typed `reader03@example.com`, submitted login, redirected to `/author`, rendered dashboard, opened chapter in IDE. | Session authenticated in `localStorage`, Ashenhold novel loaded. | **PASS** | `browser-login-dashboard.png`<br>`browser-writing-ide.png` |
| **Browser-B: Manual Editor / Autosave** | Type manual edit marker into editor -> wait 2.5s debounced autosave -> refresh page | Edit persisted in `textarea.value` across full page refresh. | `chapter_revisions` count for `AI_DRAFT_ACCEPT` = 0 (no fake AI revisions). | **PASS** | `browser-manual-autosave.png` |
| **Browser-C: AI Reject / Discard** | Open AI drawer -> click "Viết tiếp" -> candidate draft appears -> click "Từ chối / Bỏ qua" | AI candidate draft rendered on screen; clicking reject dismissed the candidate box cleanly. | `chapters.latest_revision_id` unchanged; `story_brains.brain_version` unchanged; zero `AI_DRAFT_ACCEPT` revisions created. | **PASS** | `browser-ai-candidate.png`<br>`browser-ai-reject.png` |
| **Browser-D: AI Accept [DECISIVE]** | Trigger generation -> wait for candidate -> click "Chấp nhận bản thảo" | Candidate accepted into editor; toast notification displayed. | Immutable revision `476f78c6...` created with `source_type = 'AI_DRAFT_ACCEPT'`, `latest_revision_id` advanced, `INCREMENTAL_ANALYSIS` outbox event queued. | **PASS** | `browser-ai-accept.png` |
| **Browser-E: Outbox & Feedback Loop** | Background outbox processing after Browser-D acceptance + UI generation #2 | Background worker processed outbox event to `COMPLETED`; Story Brain version advanced: **20 -> 21**. Generation #2 from UI sent `expected_brain_version: 21`. | `brain_version` advanced: **20 -> 21**.<br>`expected_brain_version` = **21**.<br>`second_browser_request_id` = **1588.516**.<br>`outbox_status` = **COMPLETED**. | **PASS** | `browser-feedback-context.png` |
| **Browser-F: Story Bible ↔ IDE [4 SURFACES]** | Navigate to `/author/context/:id` -> create Character A & B, Relationship, Timeline Event, and Plot Summary via UI form controls -> verify reload and IDE modal | Created `Browser Arthur fac0`, `Browser Guinevere d6ae`, Relationship `Hộ vệ trung thành`, Timeline Event `Hội thề Ashenhold c184`, and Plot Summary via rendered form controls. Verified all 4 surfaces on reload and in IDE modal tabs. | Persistent in PostgreSQL tables `character_profiles`, `character_relationships`, `story_timeline_events`, and `plot_summaries`. | **PASS** | `browser-story-bible.png` |
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
  "tested_code_sha": "e85570f835932bbd26992f94d4707e35dddc510f",
  "evidence_payload_sha": "dceb5856b2284c916750281b8c0a59ed5b0b81f4",
  "tested_main_sha": "5432a201b1076b00c3b01968832a84d4df0e7740",
  "branch": "astra/ai-pipe-01b-main-e2e-repair",
  "novel_id": "81b923d7-5507-48ea-9a84-5303fd1de5f4",
  "chapter_id": "c660bede-0493-4a46-97f2-6d01c8ddd3db",
  "accepted_revision_id": "476f78c6-e14c-4e70-8e06-7f21a030a10a",
  "source_generation_id": "b112c6ab-8256-5463-85dd-6e9a62c89cad",
  "outbox_event_id": "eced64f3-93c5-4d45-903d-9241b532b55f",
  "brain_version_before": 20,
  "brain_version_after": 21,
  "second_browser_request_id": "1588.516",
  "new_chapter_id": "5044300e-2a61-4318-88a3-fcea72e52c84"
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

## 5. Status Boundary & Handoff

- **Overall Verdict:** `MAIN_UI_E2E_PASS`
- **Execution State:** Real browser CDP execution complete; all checkpoints PASS with 100% UI DOM mutations.
- **Branch:** `astra/ai-pipe-01b-main-e2e-repair`.
- **Status Boundary:** `LOCAL_PASS_CI_PENDING`.
- **Handoff:** PR creation, merging, and remote GitHub Actions CI run are left to ChatGPT/maintainer per review directive instructions.
