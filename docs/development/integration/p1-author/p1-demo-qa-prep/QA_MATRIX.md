# P1 Author Experience — Comprehensive QA Acceptance Matrix

**Target Demo:** 09/11/2026  
**Baseline Commit:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**QA Branch:** `gemini/p1-demo-qa-prep`  
**Scope:** Independent QA Verification Matrix for P1 Author Experience (Editable Entity Profile, Direct Author Edit, Canon/Notes/Plans, Event State, Story Brain Context, and Core P1 Regression).

---

## Matrix Summary

| Group | Category | Case IDs | Count | Gate Status |
|---|---|---|---|---|
| **A** | Editable Entity Profile | `EEP-01` to `EEP-05` | 5 | PENDING INTEGRATION CANDIDATE |
| **B** | Canon / Notes / Plans | `CNP-01` to `CNP-04` | 4 | PENDING INTEGRATION CANDIDATE |
| **C** | Event / State Integrity | `EVS-01` to `EVS-04` | 4 | PENDING INTEGRATION CANDIDATE |
| **D** | Authoritative Context Assembly | `CTX-01` to `CTX-04` | 4 | PENDING INTEGRATION CANDIDATE |
| **E** | P1 Core Baseline Regression | `REG-01` to `REG-06` | 6 | **BASELINE PROVEN ON MAIN** |
| **TOTAL** | | | **23** | |

---

## Category A — Editable Entity Profile

### Case `EEP-01`: Entity Profile Create / Read / Update / Reload Continuity
- **Category:** Editable Entity Profile
- **Setup:** Authenticated Author A, novel "Đại Lục Tinh Thần" with activated Story Brain version 1. Entity "Lâm Phong" (UUID `e1111111-1111-4111-8111-111111111111`) exists in Canon.
- **Browser Action:**
  1. Navigate to `/author/ide?novelId={novelA}&chapterId={ch1}`.
  2. Open Author Memory Drawer (`#author-memory-panel`).
  3. Click on entity card "Lâm Phong". Click "Edit Profile".
  4. Modify description to: "Thiếu niên kiên nghị, mang trong mình bí mật huyết mạch Lâm gia và nửa mảnh Ngọc Bội Huyết Long."
  5. Add alias: "Tiểu Phong".
  6. Click "Save Profile".
  7. Hard refresh browser page (`Ctrl+F5`).
- **Expected API Behavior:**
  - `PUT /api/v1/ai/story-brains/{novelId}/entities/{entityId}`
  - Headers: `Authorization: Bearer {token}`, `If-Match: "1"` (or `expected_version: 1`).
  - Status Code: `200 OK`.
  - Response payload: `{ "success": true, "data": { "entity_id": "{uuid}", "name": "Lâm Phong", "aliases": ["Tiểu Phong"], "description": "...", "version": 2 } }`.
- **DB Readback:**
  - `SELECT version, canonical_name, aliases, description, updated_at FROM canon_entities WHERE entity_id='{uuid}'`
  - Assert `version=2`, `aliases=['Tiểu Phong']`, description matches updated text.
  - Assert `canon_version` in `story_brains` increments from 1 to 2.
- **Failure Evidence:**
  - Missing field persistence, version unchanged, HTTP 500, or stale values rendered on page reload (`screenshot: eep-01-reload-stale.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-02`: Version Conflict (CAS 409) & Conflict Modal Recovery
- **Category:** Editable Entity Profile
- **Setup:** Author A has entity "Diệp Linh Nhi" open in editor at `version: 1`. In parallel, backend receives an update setting `version: 2`.
- **Browser Action:**
  1. Author attempts to save modifications: description "Đệ tử đan đạo thiên tài."
  2. Click "Save Changes".
  3. UI displays Concurrency Conflict Warning Modal (`#conflict-dialog`).
  4. Modal presents server version (v2) alongside local dirty draft.
  5. Author selects "Review Server Version & Merge".
- **Expected API Behavior:**
  - `PUT /api/v1/ai/story-brains/{novelId}/entities/{entityId}` with `expected_version: 1`.
  - Status Code: `409 Conflict`.
  - Response: `{ "success": false, "error": { "code": "VERSION_CONFLICT", "current_version": 2, "server_state": { ... } } }`.
  - Subsequent readback `GET /api/v1/ai/story-brains/{novelId}/entities/{entityId}` returns v2 without corrupting local form.
- **DB Readback:**
  - Readback confirms entity in PostgreSQL remains v2 untouched by the stale v1 write.
- **Failure Evidence:**
  - Silent overwrite (Lost Update problem), infinite spinner, unhandled 500 (`screenshot: eep-02-silent-overwrite.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-03`: Concurrent Edit in Two Tabs (Same Author)
- **Category:** Editable Entity Profile
- **Setup:** Same Author A opens the same entity "Ngọc Bội Huyết Long" in Tab 1 and Tab 2.
- **Browser Action:**
  1. Tab 1 edits description: "Bảo vật gia truyền màu đỏ thẫm" -> clicks "Save" -> succeeds (v1 -> v2).
  2. Tab 2 without reloading edits description: "Ngọc bội cổ xưa hình rồng cuộn" -> clicks "Save".
  3. Tab 2 detects version divergence -> highlights conflict without destroying Tab 2 text buffer.
  4. Tab 2 allows author to re-apply edit over fresh v2 -> advances to v3.
- **Expected API Behavior:**
  - Tab 1: `PUT ...` expected v1 -> 200 OK (returns v2).
  - Tab 2: `PUT ...` expected v1 -> 409 Conflict (with server v2).
  - Tab 2 re-submit: `PUT ...` expected v2 -> 200 OK (returns v3).
- **DB Readback:**
  - PostgreSQL `canon_entities`: version transitions `1 -> 2 -> 3`. History audit log contains both transitions with monotonic timestamps.
- **Failure Evidence:**
  - Dirty text loss in Tab 2, crash of editing state, or out-of-order revision writes (`screenshot: eep-03-tab-loss.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-04`: Cross-Tenant / Wrong Owner Novel Isolation (403/404)
- **Category:** Editable Entity Profile
- **Setup:** Author A owns novel A with entity $E_A$. Author B owns novel B with entity $E_B$.
- **Browser Action:**
  1. Logged in as Author B.
  2. Attempt direct API mutation or URL navigation to edit Author A's entity $E_A$:
     `PUT /api/v1/ai/story-brains/{novelA}/entities/{entityA}`.
  3. Attempt edit passing Author B's novel ID with Author A's entity ID:
     `PUT /api/v1/ai/story-brains/{novelB}/entities/{entityA}`.
- **Expected API Behavior:**
  - Cross-novel attempt: Status Code `403 Forbidden` or `404 Not Found`.
  - Scoped mismatch attempt: Status Code `404 Not Found` (entity does not belong to novel).
  - Response must not leak entity details, novel titles, or author metadata.
- **DB Readback:**
  - PostgreSQL verify zero rows updated in `canon_entities` where `novel_id='{novelA}'`.
- **Failure Evidence:**
  - 200 OK cross-tenant write, information disclosure in error message, or SQL exception (`log: eep-04-cross-tenant.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-05`: Homonymous Entities Separation by Exact UUID
- **Category:** Editable Entity Profile
- **Setup:** Novel contains two distinct entities with the exact homonymous name "Lâm Phong" (e.g., "Lâm Phong (Thiếu chủ)" with UUID $U_1$ and "Lâm Phong (Thương gia tiền bối)" with UUID $U_2$).
- **Browser Action:**
  1. Open Memory Drawer.
  2. Verify UI displays both distinct homonyms with unique discriminator badges.
  3. Select and edit $U_2$ (change role to "Trưởng thương hội").
  4. Save and reload drawer.
- **Expected API Behavior:**
  - `PUT .../entities/{U2}` targeting exact UUID $U_2$.
  - Status Code `200 OK`.
  - Entity $U_1$ payload remains untouched.
- **DB Readback:**
  - `SELECT entity_id, canonical_name, description, version FROM canon_entities WHERE novel_id='{novelA}' AND canonical_name='Lâm Phong'`
  - Readback returns 2 rows: $U_1$ (version unchanged) and $U_2$ (version incremented, description updated).
- **Failure Evidence:**
  - Accidental name-based merge, mutating $U_1$ instead of $U_2$, or UI collapsing both entities into one card (`screenshot: eep-05-homonym-collision.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category B — Canon / Notes / Plans Boundary

### Case `CNP-01`: Author Notes Do Not Become Historical Canon
- **Category:** Canon / Notes / Plans
- **Setup:** Author enters the "Notes & Lore" tab for entity "Lâm Phong".
- **Browser Action:**
  1. Author adds private note: "Ý tưởng tương lai: Lâm Phong có thể có thêm một tỷ tỷ thất lạc."
  2. Clicks "Save Note".
  3. Navigates to Canon Timeline / Narrative Memory overview.
- **Expected API Behavior:**
  - Notes saved to author private workspace / MongoDB `author_entity_notes` or `story_plans`.
  - Zero mutations to PostgreSQL `canon_entities` (canonical facts) or `canon_events`.
- **DB Readback:**
  - `SELECT COUNT(*) FROM canon_facts WHERE subject_id='{uuid}' AND fact_text LIKE '%tỷ tỷ thất lạc%'` -> returns `0`.
  - `SELECT COUNT(*) FROM canon_events WHERE event_description LIKE '%tỷ tỷ thất lạc%'` -> returns `0`.
- **Failure Evidence:**
  - Note text appears inside `canon_facts` or advances Story Brain `canon_version` (`log: cnp-01-note-leak.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-02`: Story Plans Do Not Become Occurred Events
- **Category:** Canon / Notes / Plans
- **Setup:** Author creates an outline / beat plan in the Planning tab: "Chương 5: Lâm Phong đột phá Trúc Cơ tại Đỉnh Vân Tiêu."
- **Browser Action:**
  1. Save plan item in UI.
  2. Inspect consistency check and memory drawer for Chapter 3.
- **Expected API Behavior:**
  - Plan saved via `POST /api/v1/ai/story-plans` with status `PLANNED`.
  - Event status is NOT `HAPPENED` / `OCCURRED`.
- **DB Readback:**
  - `SELECT status FROM story_plans WHERE novel_id='{novelA}' AND plan_content LIKE '%đột phá Trúc Cơ%'` -> `PLANNED`.
  - `SELECT COUNT(*) FROM canon_events WHERE event_description LIKE '%đột phá Trúc Cơ%'` -> `0`.
- **Failure Evidence:**
  - Consistency checker treats planned event as established past fact and flags contradiction in Chapter 3 (`screenshot: cnp-02-premature-canon.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-03`: Author Private Secret Note Excluded from Context
- **Category:** Canon / Notes / Plans
- **Setup:** Chapter 3 contains an author-only confidential premise: "Lâm Phong là hậu duệ Ma Thần, ấn ký bị phong ấn bởi Ngọc Bội Huyết Long."
- **Browser Action:**
  1. Author marks note as `private_secret: true` in the Lore panel.
  2. Author requests AI Assistant continuation prompt for Chapter 4 in IDE.
- **Expected API Behavior:**
  - Context packing API `POST /api/v1/ai/context/assemble` builds context for Chapter 4.
  - Assembled context prompt sent to LLM contains ONLY approved Canon facts from Chapters 1–3.
  - Secret note is explicitly excluded from the packed prompt text.
- **DB & Payload Readback:**
  - Inspect sanitized request body captured at Budget Gateway / Fake Upstream.
  - Assert substring `"hậu duệ Ma Thần"` is strictly ABSENT from context text blocks.
- **Failure Evidence:**
  - Leakage of author secret note into LLM prompt (`log: cnp-03-secret-leak.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-04`: Author Direct Edit Does Not Bypass AI Proposal Review
- **Category:** Canon / Notes / Plans
- **Setup:** A chapter revision is generated by AI with 3 candidate entities pending review in HITL gate.
- **Browser Action:**
  1. Author navigates to pending review panel.
  2. Author attempts to directly edit entity attributes without submitting decision approvals.
  3. Author attempts to trigger downstream event extraction while review is in `waiting_entity_review` state.
- **Expected API Behavior:**
  - Downstream event/fact extraction endpoint `POST .../advance` returns `428 Precondition Required` or `400 Bad Request`.
  - Status remains `waiting_entity_review` until explicit freeze/continue.
- **DB Readback:**
  - `SELECT status FROM entity_reviews WHERE analysis_run_id='{runId}'` -> returns `waiting_review`.
  - Zero downstream `canon_events` created for this revision.
- **Failure Evidence:**
  - Bypassing human review gate, events created before entity checkpoint frozen (`log: cnp-04-bypass-gate.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category C — Event & State Integrity

### Case `EVS-01`: Existing Event Correction & Provenance Preservation
- **Category:** Event / State Integrity
- **Setup:** Chapter 2 has approved event $E_1$: "Lâm Phong chiến đấu với Hắc Long Xà tại Hang Hắc Long."
- **Browser Action:**
  1. In Timeline/Memory panel, author selects event $E_1$.
  2. Author clicks "Correct Event".
  3. Modifies description to: "Lâm Phong và Diệp Linh Nhi hiệp lực đẩy lui Hắc Long Xà tại Hang Hắc Long."
  4. Selects provenance reason: "Bổ sung sự tham gia của Diệp Linh Nhi theo đúng bản thảo."
  5. Clicks "Submit Correction".
- **Expected API Behavior:**
  - `POST /api/v1/ai/story-brains/{novelId}/events/{eventId}/correct`
  - Status Code `200 OK`.
  - Event $E_1$ superseded; new event $E_2$ created with `supersedes_event_id: {E1}`, `provenance: 'AUTHOR_CORRECTION'`.
- **DB Readback:**
  - `SELECT event_id, status, supersedes_event_id, provenance FROM canon_events WHERE novel_id='{novelA}'`
  - $E_1$ status = `SUPERSEDED`.
  - $E_2$ status = `ACTIVE`, `supersedes_event_id` = $E_1$.
- **Failure Evidence:**
  - Hard delete of $E_1$ (destroying audit provenance), or unversioned in-place text mutation without replacement tracking (`screenshot: evs-01-provenance-lost.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-02`: State Change Event Progression (Item Condition)
- **Category:** Event / State Integrity
- **Setup:**
  - Chapter 1 state: "Ngọc Bội Huyết Long: intact (nguyên vẹn)".
  - Chapter 2 event: "Ngọc Bội Huyết Long bị vỡ làm đôi trong trận chiến".
- **Browser Action:**
  1. Author inspects entity profile for "Ngọc Bội Huyết Long" while viewing Chapter 1. State shows "Nguyên vẹn".
  2. Author switches context selector to Chapter 2. State shows "Vỡ làm đôi".
  3. Author switches to Chapter 3. State persists as "Vỡ làm đôi".
- **Expected API Behavior:**
  - `GET /api/v1/ai/story-brains/{novelId}/state?chapterId={ch1}` -> returns item state `INTACT`.
  - `GET /api/v1/ai/story-brains/{novelId}/state?chapterId={ch2}` -> returns item state `BROKEN_TWO_HALVES`.
  - `GET /api/v1/ai/story-brains/{novelId}/state?chapterId={ch3}` -> returns item state `BROKEN_TWO_HALVES`.
- **DB Readback:**
  - State projection query reads from `canon_events` up to chapter sequence index.
- **Failure Evidence:**
  - Chapter 1 incorrectly shows broken item, or Chapter 3 reverts to intact item (`screenshot: evs-02-temporal-state.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-03`: No Future Information Leakage (Temporal Boundary)
- **Category:** Event / State Integrity
- **Setup:** Novel has Chapter 1, Chapter 2 (item broken), Chapter 3 (secret discovery). Author is editing Chapter 1.
- **Browser Action:**
  1. In Author IDE, author triggers Writing Assistant suggestion in Chapter 1.
- **Expected API Behavior:**
  - Assembled context for Chapter 1 restricts narrative boundary to $Ch \le 1$.
  - Events occurring in Chapter 2 or Chapter 3 must NOT be included in the context bundle.
- **Gateway / LLM Payload Readback:**
  - Verify prompt payload sent to Fake Upstream contains zero mention of "Hang Hắc Long" or "vỡ làm đôi".
- **Failure Evidence:**
  - AI writes continuation referencing future event that hasn't happened yet (`log: evs-03-future-leak.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-04`: Chapter-Level Consistency Diagnostics
- **Category:** Event / State Integrity
- **Setup:** Chapter 2 established that "Ngọc Bội Huyết Long bị vỡ làm đôi".
- **Browser Action:**
  1. In Chapter 3, author types: "Lâm Phong lấy chiếc Ngọc Bội Huyết Long nguyên vẹn không tì vết ra ngắm nghía."
  2. Triggers "Check Consistency".
  3. UI displays Consistency Finding: "Contradiction detected: Ngọc Bội Huyết Long was broken in Chapter 2, but described as intact in Chapter 3."
  4. Finding cites exact source quote and chapter link.
- **Expected API Behavior:**
  - `POST /api/v1/ai/consistency/check`
  - Status `200 OK`.
  - Finding object contains: `{ "type": "CONTRADICTION", "severity": "WARNING", "entity_id": "{uuid}", "evidence_source_chapter": "{ch2Id}", "text_snippet": "..." }`.
- **DB Readback:**
  - Consistency check does NOT mutate Canon or block author from proceeding (non-destructive advisory).
- **Failure Evidence:**
  - Missing finding, crash on comparison, or automated modification of Chapter 2 history to cover up contradiction (`screenshot: evs-04-consistency.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category D — Authoritative Context Assembly

### Case `CTX-01`: Profile Edit Immediately Reflected in Authoritative Context
- **Category:** Context Assembly
- **Setup:** Entity "Diệp Linh Nhi" has description updated from "Đệ tử đan đạo" to "Thiếu các chủ Đan Hà Các".
- **Browser Action:**
  1. Save profile update.
  2. Immediately click "Draft Assist" in Chapter 4 editor.
- **Expected API Behavior:**
  - `POST /api/v1/ai/context/assemble` fetches fresh entity from PostgreSQL with latest `version`.
  - Prompt contains "Thiếu các chủ Đan Hà Các".
- **Gateway Readback:**
  - Captured payload at Gateway confirms presence of new role string and absence of old stale role.
- **Failure Evidence:**
  - Stale in-memory cache used, requiring server restart or re-login (`log: ctx-01-stale-cache.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-02`: Explicit Private Exclusions Honored Under Context Pressure
- **Category:** Context Assembly
- **Setup:** Context budget set to maximum stress (e.g. 8k / 32k window limit). Entity has 20 Canon facts and 5 private author notes.
- **Browser Action:**
  1. Trigger context assembly with token limit near capacity.
- **Expected API Behavior:**
  - Priority truncation algorithm sheds lower-priority facts and distant dialogue quotes first.
  - Private notes remain strictly 100% excluded regardless of token pressure or packing budget.
- **Gateway Readback:**
  - Assert zero private note tokens present across all packed chunks.
- **Failure Evidence:**
  - Private notes leaking when context packing algorithm falls back or truncates (`log: ctx-02-pressure-leak.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-03`: Honest Handling of Missing Evidence
- **Category:** Context Assembly
- **Setup:** Novel contains mention of an entity "Hắc Ma Tông" with status `UNKNOWN` / zero confirmed facts in Canon.
- **Browser Action:**
  1. Author queries Writing Assistant about "Hắc Ma Tông".
- **Expected API Behavior:**
  - Context assembler outputs disclaimer block: `[Unverified Entity: Hắc Ma Tông - No confirmed facts in Canon]`.
  - LLM instructions explicitly prohibit hallucinating ungrounded historical lore.
- **Payload Readback:**
  - Grounding instructions verified in assembled system prompt.
- **Failure Evidence:**
  - Fabricating fake past events or presenting rumors as Canon truth (`screenshot: ctx-03-hallucination.png`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-04`: Rejected Proposals Never Enter Authoritative Context
- **Category:** Context Assembly
- **Setup:** In Chapter 2 review, AI proposed an erroneous event $P_{err}$: "Lâm Phong phản bội gia tộc", which author explicitly clicked "REJECT".
- **Browser Action:**
  1. In Chapter 3 writing session, request assistant continuation.
- **Expected API Behavior:**
  - Assembled context queries `canon_events` with `status='ACTIVE'`.
  - Rejected proposal $P_{err}$ has status `REJECTED` and is excluded from context.
- **DB Readback:**
  - `SELECT status FROM canon_proposals WHERE proposal_id='{errId}'` -> returns `REJECTED`.
  - Gateway payload confirms $P_{err}$ text is completely absent.
- **Failure Evidence:**
  - Rejected proposal bleeding into future chapter context (`log: ctx-04-rejected-leak.log`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category E — P1 Core Baseline Regression

### Case `REG-01`: Manuscript Bootstrap Clean Baseline
- **Category:** P1 Regression
- **Setup:** Fresh author account, novel with Chapter 1 manuscript content.
- **Browser Action:**
  1. Trigger bootstrap from manuscript.
  2. System pauses at `waiting_review`. Author finalizes empty candidate review.
  3. Baseline activated.
- **Expected API Behavior:**
  - `POST /ai/story-brains/bootstrap/from-manuscript` -> job status `waiting_review`.
  - `POST .../baseline/activate` -> status `200 OK`.
  - `GET .../memory` returns `entities: []`, `events: []`, `brain_version: 1`.
- **DB Readback:**
  - PostgreSQL `story_brains`: `brain_version=1`, active baseline established.
- **Status:** **PROVEN PASS on baseline main** (via `p1_final_acceptance.py`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-02`: Entity Review, Homonym Freezing, and Continue Gate
- **Category:** P1 Regression
- **Setup:** Chapter analysis generates candidates with homonyms.
- **Browser Action:**
  1. Review drawer opens.
  2. Author groups homonyms, assigns distinct UUIDs.
  3. Clicks "Freeze Decisions" -> reloads page -> UUIDs stable.
  4. Clicks "Continue" -> advances pipeline downstream.
- **Expected API Behavior:**
  - `POST .../review` persists decisions.
  - `POST .../continue` transitions run to downstream proposal generation.
- **DB Readback:**
  - `entity_reviews` record updated with finalized decisions and frozen timestamp.
- **Status:** **PROVEN PASS on baseline main** (via `web/tests/p1-full-stack-s09-s11.browser.test.mjs`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-03`: Proposal Approval & Rejection Atomic Semantics
- **Category:** P1 Regression
- **Setup:** Group of 2 proposals (1 accepted, 1 rejected).
- **Browser Action:**
  1. Author accepts proposal A, rejects proposal B.
  2. Submits atomic review.
- **Expected API Behavior:**
  - Only proposal A commits to `canon_entities` / `canon_events`.
  - Proposal B marked `REJECTED` without mutating Canon.
  - Version increments once atomically.
- **DB Readback:**
  - Verified in PostgreSQL: Proposal A `ACTIVE` in Canon; Proposal B `REJECTED`.
- **Status:** **PROVEN PASS on baseline main**.
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-04`: Save, Rapid Undo ABA, Chapter Switch & Reload Continuity
- **Category:** P1 Regression
- **Setup:** Author IDE textarea with content string A.
- **Browser Action:**
  1. Type text B -> immediately Undo back to A -> type text B before debounce timer fires.
  2. Switch chapter while dirty -> dialog confirms flush -> old chapter flushed, new chapter loaded cleanly.
  3. Reload browser -> latest state restored from MongoDB draft and PostgreSQL revision.
- **Expected API Behavior:**
  - Debounce timer coalesces intermediate edits cleanly.
  - Flush writes exact revision to PostgreSQL and draft to MongoDB.
- **DB Readback:**
  - Content hash matches SHA256 of final text string; parent revision linkage intact.
- **Status:** **PROVEN PASS on baseline main**.
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-05`: Revision & Outbox Persistence with Provenance
- **Category:** P1 Regression
- **Setup:** Chapter save triggers transactional outbox event.
- **Browser Action:**
  1. Author saves new chapter draft.
- **Expected API Behavior:**
  - Atomically creates `chapter_revisions` row and `revision_outbox_events` row with matching `content_hash` and `created_by`.
- **DB Readback:**
  - Outbox event processed by AI worker (`status='COMPLETED'`).
  - Event payload matches immutable revision provenance.
- **Status:** **PROVEN PASS on baseline main**.
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-06`: Account Isolation & Stale 409 Concurrency Recovery
- **Category:** P1 Regression
- **Setup:** Two browser sessions with different accounts or simultaneous editing.
- **Browser Action:**
  1. Stale client save triggers 409 conflict dialog in UI.
  2. UI displays server revision and provides clean recovery option.
  3. Author B logout / Author A login clears all cached private tokens and memory drawer without document reload.
- **Expected API Behavior:**
  - `409 Conflict` returned with required version headers.
  - Session logout purges all private stores in localStorage / Zustand.
- **DB Readback:**
  - Zero cross-author data leakage between accounts.
- **Status:** **PROVEN PASS on baseline main**.
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`
