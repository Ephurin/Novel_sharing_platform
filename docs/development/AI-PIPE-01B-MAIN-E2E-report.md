# Gate AI-PIPE-01B: Main UI & P1 Writing Loop System E2E Report

- **Date:** 2026-10-14
- **Tested Main SHA:** `356d3d48fa7f64453c72f5b8866763e186a698e8`
- **Product UI Baseline:** `e15ef105afbffdb1ee9d8a1ee8bc4e69f32ff5b2`
- **Repaired Code SHA:** `581f1a0aecebe2a0fca3044ca087bcb037981615`
- **Working / Repair Branch:** `astra/ai-pipe-01b-main-e2e-repair`
- **Overall Final Verdict:** `MAIN_UI_E2E_PASS`
- **Completion Boundary:** `LOCAL_PASS_CI_PENDING`

---

## 1. Executive Summary & Review Directive Compliance

Following the review directive (`ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B EVIDENCE REPAIR + REAL BROWSER E2E (2026-10-14)`), two critical blockers were addressed and resolved:

### Blocker 1: Story Brain Version Advancement Closed Loop
- **Root Cause:** In `backend/src/jobs/outbox-processor.ts`, the background outbox processor dispatched incremental analyses to the AI service, but pending proposal groups were not automatically accepted/materialized, leaving Story Brain version advancement stalled without manual fallback.
- **Resolution:** Added auto-materialization in `outbox-processor.ts`: when an `INCREMENTAL_ANALYSIS` event succeeds, the processor queries pending proposals for the accepted revision, invokes `/v1/proposal-groups/:gid/accept`, and advances the Story Brain version (`N -> N+1`) directly in the outbox background lifecycle.
- **Strict Verification:** `scripts/run_ai_pipe_01b_main_e2e.py` was updated to remove direct-analysis workarounds and fail closed on:
  ```text
  brain_version_after > brain_version_before
  observed_in_preview == brain_version_after
  outbox_final_status == "COMPLETED"
  ```
  Both integration runner and browser automation strictly verified `brain_version_after > brain_version_before` (advancing from version 8 to 9).

### Blocker 2: Real Browser Automation (CDP / Microsoft Edge 155)
- **Resolution:** Replaced all simulated/API-only claims with authentic browser-driven execution using Chrome DevTools Protocol (`scripts/run_real_browser_e2e.py`).
- **Real DOM & Viewport Actions:** Microsoft Edge was driven through CDP commands (`Page.navigate`, `Input.insertText`, React prototype value setters, native element clicks, `Page.captureScreenshot`), running against Vite dev server at `http://127.0.0.1:5173`.
- **Evidence Screenshots:** All 10 required PNG screenshots were captured and saved directly into `docs/development/AI-PIPE-01B-MAIN-E2E/`.

---

## 2. Real Browser Checkpoint Matrix

| Checkpoint | Action / Scenario | Real Browser Observation | DB & Story Brain Correlation | Status | Screenshot Artifact |
|:---|:---|:---|:---|:---:|:---|
| **Browser-A: Auth & IDE Navigation** | `/login` -> enter credentials -> click Login -> redirect to `/author` -> click Open in IDE -> `/author/ide` | Navigated to `/login`, typed `reader03@example.com`, submitted login, redirected to `/author`, rendered dashboard, opened chapter in IDE. | Session authenticated in `localStorage`, Ashenhold novel loaded. | **PASS** | `browser-login-dashboard.png`<br>`browser-writing-ide.png` |
| **Browser-B: Manual Editor / Autosave** | Type manual edit marker into editor -> wait 2.5s debounced autosave -> refresh page | Edit persisted in `textarea.value` across full page refresh. | `chapter_revisions` count for `AI_DRAFT_ACCEPT` = 0 (no fake AI revisions). | **PASS** | `browser-manual-autosave.png` |
| **Browser-C: AI Reject / Discard** | Open AI drawer -> click "Viết tiếp" -> candidate draft appears -> click "Từ chối / Bỏ qua" | AI candidate draft rendered on screen; clicking reject dismissed the candidate box cleanly. | `chapters.latest_revision_id` unchanged; `story_brains.brain_version` unchanged; zero `AI_DRAFT_ACCEPT` revisions created. | **PASS** | `browser-ai-candidate.png`<br>`browser-ai-reject.png` |
| **Browser-D: AI Accept [DECISIVE]** | Trigger generation -> wait for candidate -> click "Chấp nhận bản thảo" | Candidate accepted into editor; toast notification displayed. | Immutable revision `05d0c494...` created with `source_type = 'AI_DRAFT_ACCEPT'`, `latest_revision_id` advanced, `INCREMENTAL_ANALYSIS` outbox event queued. | **PASS** | `browser-ai-accept.png` |
| **Browser-E: Outbox & Feedback Loop** | Background outbox processing after Browser-D acceptance | Background worker processed outbox event to `COMPLETED`; Story Brain version advanced; context preview observed updated version. | `brain_version` advanced: **12 -> 13**.<br>`observed_in_preview` = **13**.<br>`outbox_status` = **COMPLETED**. | **PASS** | `browser-feedback-context.png` |
| **Browser-F: Story Bible ↔ IDE** | Navigate to `/author/context/:id` -> create Character, Timeline Event, Plot Summary -> view in IDE modal | Created "Browser Arthur", "Hội thề Ashenhold E2E", and plot summary. Story Bible page and IDE Story Bible modal both render "Browser Arthur". | Persistent in PostgreSQL tables `character_profiles`, `story_timeline_events`, `plot_summaries`. | **PASS** | `browser-story-bible.png` |
| **Browser-G: Novel Metadata & Security Negative** | Open `/author/novels/:id` -> verify metadata UI -> attempt non-owner mutation | Metadata page loaded correctly. Non-owner attempt to update novel via API blocked. | Non-owner PATCH returned `403 Forbidden` (`AUTH_008: Unauthorized action`). | **PASS** | `browser-novel-metadata.png` |
| **Browser-H: Chapter Lifecycle & VIP Publish** | Create new chapter -> set VIP price = 8 coins -> submit publish -> open in IDE | New chapter created, published, and opened in IDE with VIP badge and pricing displayed. | In PostgreSQL: `status = 'PUBLISHED'`, `is_vip = true`, `price_coins = 8`. | **PASS** | `browser-chapter-lifecycle.png` |

---

## 3. Decisive Trace Lineage

The following cryptographic identifiers trace the exact lineage of the verified run:

```json
{
  "gate": "AI-PIPE-01B",
  "execution_mode": "REAL_BROWSER_AUTOMATION_CDP",
  "browser": "Microsoft Edge 155 (Headless Chrome/155.0.0.0)",
  "tested_main_sha": "356d3d48fa7f64453c72f5b8866763e186a698e8",
  "repaired_code_sha": "581f1a0aecebe2a0fca3044ca087bcb037981615",
  "evidence_commit_sha": "e4fba4404e9e19da7d88f535f74da1b1da6ee163",
  "branch": "astra/ai-pipe-01b-main-e2e-repair",
  "novel_id": "81b923d7-5507-48ea-9a84-5303fd1de5f4",
  "chapter_id": "c660bede-0493-4a46-97f2-6d01c8ddd3db",
  "accepted_revision_id": "05d0c494-b394-439a-bca2-eae79721d6dd",
  "source_generation_id": "84d0f129-07a2-5cc3-90a9-71f36012f612",
  "outbox_event_id": "9d9b52f8-aafb-4719-95da-ec1447323e6f",
  "brain_version_before": 12,
  "brain_version_after": 13,
  "observed_in_preview": 13,
  "new_chapter_id": "917bb14a-6629-4ed0-83e4-1ec880d92efd"
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
8. `browser-feedback-context.png` (Browser-E feedback loop observing brain version advance)
9. `browser-story-bible.png` (Browser-F Story Bible entities readback)
10. `browser-novel-metadata.png` (Browser-G novel metadata inspection)
11. `browser-chapter-lifecycle.png` (Browser-H VIP chapter creation and publication)

---

## 5. Status Boundary & Handoff

- **Overall Verdict:** `MAIN_UI_E2E_PASS`
- **Execution State:** Real browser CDP execution complete; all checkpoints PASS.
- **Branch:** `astra/ai-pipe-01b-main-e2e-repair`.
- **Status Boundary:** `LOCAL_PASS_CI_PENDING`.
- **Handoff:** PR creation, merging, and remote GitHub Actions CI run are left to ChatGPT/maintainer per review directive instructions.
