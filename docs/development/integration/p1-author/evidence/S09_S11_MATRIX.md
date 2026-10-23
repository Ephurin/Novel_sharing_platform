# S09–S11 Integration Execution Matrix

**Branch:** `integration/p1-author`
**Tested Base Commit:** `157b71f5608558fdb2763c65b1254e3dffc77fb8`
**Date:** 2026-10-23
**Harness / Environment:** Playwright Chromium/Edge + Isolated Docker Stack (`p1_author_int_b5249`)
**Provider Mode:** `LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=none` (Zero live external provider calls)

---

## 1. S09: Author Writing IDE Rapid Autosave & Revert Verification

| Step ID | Scenario / Invariant | Preconditions | Action | Expected Server & UI State | Observed Actual Result | Status |
|---|---|---|---|---|---|---|
| **S09.1** | Rapid Undo B→A→B (<1200ms) | Editor initialized at content `B` (version 1) | Author types `A`, then presses `Ctrl+Z` (<1200ms) reverting to `B` | 0 HTTP PATCH requests emitted; debounce timer cancelled; editor value = server draft = `B`; no revision or outbox event generated | 0 PATCH requests emitted; editor value = 'B'; server readback draft = 'B'; revision count and outbox events identical to initial baseline. | **PASS** |
| **S09.2** | Dispatched In-Flight A→B | Request for content `in-flight A` held in flight | Author types `B` while `A` is pending; in-flight `A` finishes | Request `A` completes with version 1; queued request `B` immediately dispatches with `expectedVersion: 2`; server settles at `B` | In-flight `A` settled; status indicator showed `saving`; request `B` executed; server draft content readback = `B`. | **PASS** |
| **S09.3** | Buffer Debounce A→C | Editor at content `B` | Author edits `A`, then quickly updates to `{ title: 'Latest', content: 'C', isVip: true, priceCoins: 7 }` | Only buffer `C` dispatched to server; exactly 1 PATCH request emitted; title, VIP, and pricing persisted | Exactly 1 PATCH emitted; readback draft content = 'C', title = 'Latest'; chapter metadata isVip = true, priceCoins = 7. | **PASS** |
| **S09.4** | Chapter Switch Isolation | Chapter X has pending unsaved content `X pending` | Author switches active chapter to Y; edits `Y pending`; flushes | Pending draft `X` is not lost; flushed to X; active chapter Y receives `Y pending`; no buffer cross-contamination | Readback chapter X draft = 'X pending'; readback chapter Y draft = 'Y pending'. Chapter buffers completely isolated. | **PASS** |
| **S09.5** | Route Navigation Blocker | Editor has dirty unsaved content `blocked draft` | Author triggers navigation to `/next` | React Router navigation is blocked (`blocker.state === 'blocked'`) until author explicitly confirms or saves | Router blocker entered `blocked` state; reset restored author control without silent content loss. | **PASS** |
| **S09.6** | Multi-Account Isolation | Author 0 has unsaved dirty buffer on chapter Y | Author 1 logs in and accesses same chapter hook | Author 1 receives baseline for Author 1; Author 0 buffer is never exposed or flushed under Author 1 token | Switched to account 1: buffer initialized with 'Other baseline'; readback verified Author 0 content untouched; no security leak. | **PASS** |
| **S09.7** | 409 Conflict Recovery | Chapter Y loaded at version 1 | Concurrent external save updates chapter Y to version 2 (`Remote winner`); local editor types `Local conflict` and saves | Backend rejects local save with HTTP 409 `DRAFT_CONFLICT`; UI status reflects `error`; local content preserved in localStorage backup; author reloads and recovers | HTTP 409 returned; UI status = 'error'; localStorage backup key `storycraft-draft:userId:chapterId` verified intact; reload + final save settled cleanly. | **PASS** |
| **S09.8** | Durable Readback & Immutable Provenance | Final content saved as `Final B` | Author triggers snapshot creation on chapter Y | Server draft, immutable `chapter_revisions` row, and `revision_outbox_events` row all share identical SHA-256 hash | Final snapshot returned contentHash `1c31f508...`; readback `revisions[-1].content_hash` = `1c31f508...`; `outbox[0].content_hash` = `1c31f508...`. | **PASS** |
| **S09.9** | In-Flight Account Switch | Author 0 has request `account-flight` held in flight | Author switches to Author 1 while request is pending | Author 0 in-flight response does not drain Author 1 queue or overwrite Author 1 state | Response completed; Author 0 draft = 'account-flight'; Author 1 draft = 'B'; Author 1 UI status = 'saved'. | **PASS** |
| **S09.10**| React Strict Mode & Remount | Component unmounts and remounts with dirty state | Strict Mode double-invocation / route remount | Dirty recovery buffer persists across remount; no premature flush or wipe | Readback verified content preserved across remount; recovery restored. | **PASS** |

---

## 2. S10: Consistency Checker with Contradictory Detail

| Step ID | Scenario / Invariant | Preconditions | Action | Expected Server & UI State | Observed Actual Result | Status |
|---|---|---|---|---|---|---|
| **S10.1** | Contradictory Detail Injection & Detection | Active Story Brain baseline active with canon entities/events | Author injects contradictory fact into chapter draft and clicks "Kiểm tra nhất quán chương đang mở" in Story Brain drawer | AI Gateway executes `check_consistency` operation; returns findings list citing specific contradictory description and evidence snippet | Drawer tab "Sự kiện" triggered `runAuthorOperation('check_consistency')`; findings rendered in UI with evidence excerpt and revision reference. | **PASS** (Offline Fake) |
| **S10.2** | Author UI Remediation & Verification | Contradiction findings displayed in UI | Author corrects the contradictory detail in the editor, saves draft, and re-runs consistency check | Findings list clears; UI displays "Không tìm thấy mâu thuẫn trong lần kiểm tra này."; chapter remains in draft status | Author edited text; save updated draft; re-run returned empty findings; UI confirmed clean consistency. Chapter status remains `DRAFT`. | **PASS** (Offline Fake) |
| **S10.3** | Live Provider Consistency Check | Real external LLM API | Live Gemini/OpenAI consistency inspection | Zero live calls permitted under test boundary | Live provider calls strictly forbidden and skipped per project instructions. | **NOT_RUN** (Live Provider) |

---

## 3. S11: Reload, Continue Writing & Memory/Context Continuity

| Step ID | Scenario / Invariant | Preconditions | Action | Expected Server & UI State | Observed Actual Result | Status |
|---|---|---|---|---|---|---|
| **S11.1** | Page Reload & Editor Continuity | Story Brain active, chapter in `DRAFT` status | Browser page reloaded; author continues writing paragraph | Chapter loads existing draft without data loss; new edits queue via `useDraftPersistence`; chapter status remains `DRAFT` | Page reloaded cleanly; draft content loaded from server CAS; subsequent edits persisted without error; chapter status verified `DRAFT`. | **PASS** |
| **S11.2** | Context & Memory Tab Coherence | Multiple Story Bible tabs (Characters, Locations, Items, History, Facts) | Author navigates across memory tabs after reload | Entities, relationships, and timeline events match active Story Brain version; no stale or ghost data | All queries (`listCharacters`, `listPlotSummaries`, `listTimelineEvents`) loaded and rendered coherently with active Story Brain version. | **PASS** |
| **S11.3** | M-FIRST Automatic Analysis Outbox Continuity | Baseline activated; new chapter content saved | Author saves new modified chapter text | System automatically creates immutable revision and enqueues `INCREMENTAL_ANALYSIS` outbox event for M-FIRST memory pipeline | Verified in PostgreSQL: `chapter_revisions` row created with `source_type=AUTHOR_MANUAL`; `revision_outbox_events` row queued with `event_type=INCREMENTAL_ANALYSIS`. | **PASS** |
