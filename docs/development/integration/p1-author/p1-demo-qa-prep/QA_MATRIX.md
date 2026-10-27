# P1 Author Experience — Comprehensive QA Acceptance Matrix

**Target Demo:** 09/11/2026  
**Baseline Commit:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**QA Working Branch:** `gemini/p1-demo-qa-prep`  
**Scope:** Independent QA Verification Matrix for P1 Author Experience (Editable Entity Profile, Direct Author Edit, Canon/Notes/Plans, Event State, Story Brain Context, and Core P1 Regression).

---

## Matrix Summary & Gate Status

| Group | Category | Case IDs | Count | Gate Status on Current Branch | Evidence Type / Blocker |
|---|---|---|---|---|---|
| **A** | Editable Entity Profile | `EEP-01` to `EEP-05` | 5 | **BLOCKED** | Blocked pending integration of `codex/p1-ax01-storybrain-core` |
| **B** | Canon / Notes / Plans Boundary | `CNP-01` to `CNP-04` | 4 | **BLOCKED** | Blocked pending AX-01 integration and Story Brain baseline |
| **C** | Event / State Integrity | `EVS-01` to `EVS-04` | 4 | **BLOCKED** | Blocked pending AX-01 integration and Story Brain baseline |
| **D** | Authoritative Context Assembly | `CTX-01` to `CTX-04` | 4 | **BLOCKED** | Blocked pending AX-01 integration and Story Brain baseline |
| **E** | P1 Core Baseline Regression | `REG-01` to `REG-06` | 6 | **HISTORICAL_PASS** | Referenced from baseline commit `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` |
| **TOTAL** | | | **23** | | |

*Discipline Rules:*
- **PASS**: Executed on current HEAD with live verified multi-tier evidence.
- **FAIL**: Executed on current HEAD and failed assertions.
- **BLOCKED**: Blocker identified; execution cannot proceed until upstream dependency delivers.
- **NOT_RUN**: Test case not yet executed.
- **HISTORICAL_PASS**: Proven on previous baseline SHA (`749b4bf3`); cannot be claimed as PASS on new source without live re-execution.

---

## Category A — Editable Entity Profile

### Case `EEP-01`: Entity Profile Create / Read / Update / Reload Continuity
- **Category:** Editable Entity Profile
- **Entity Type:** `PER`
- **Setup:** Authenticated Author A, novel "Đại Lục Tinh Thần" with activated Story Brain version 1. Entity "Lâm Phong" (UUID `e1111111-1111-4111-8111-111111111111`, `entity_type='PER'`) exists in `narrative.entities` at `profile_version=0`.
- **Browser Action:**
  1. Navigate to `/author/ide?novelId={novelA}&chapterId={ch1}`.
  2. Open Author Memory Drawer (`#author-memory-panel`).
  3. Click on entity card "Lâm Phong". Click "Edit Profile".
  4. Modify description to: "Thiếu niên kiên nghị, mang trong mình bí mật huyết mạch Lâm gia và nửa mảnh Ngọc Bội Huyết Long."
  5. Set effective chapter cutoff: `effective_from_chapter: 1`.
  6. Click "Save Profile".
  7. Hard refresh browser page (`Ctrl+F5`).
- **Target API Contract (AX-01):**
  - `PATCH /api/v1/ai/story-brains/{novelId}/entities/{entityId}/profile`
  - Headers:
    - `Authorization: Bearer {authorToken}`
    - `Idempotency-Key: {uniqueKey}` (pattern: `[A-Za-z0-9_-]{1,128}`)
  - Request Body:
    ```json
    {
      "expected_version": 0,
      "expected_brain_version": 1,
      "description": "Thiếu niên kiên nghị, mang trong mình bí mật huyết mạch Lâm gia và nửa mảnh Ngọc Bội Huyết Long.",
      "effective_from_chapter": 1
    }
    ```
  - Status Code: `200 OK`.
  - Response payload envelope:
    ```json
    {
      "success": true,
      "data": {
        "entity_id": "{uuid}",
        "novel_id": "{novelId}",
        "version": 1,
        "brain_version": 2,
        "profile": {
          "description": "Thiếu niên kiên nghị, mang trong mình bí mật huyết mạch Lâm gia và nửa mảnh Ngọc Bội Huyết Long.",
          "appearance": "",
          "personality": "",
          "background": ""
        },
        "effective_from_chapter": 1,
        "author_notes": ""
      }
    }
    ```
- **PostgreSQL Readback:**
  - `SELECT profile_version, canonical_name, entity_type, description, author_profile, author_profile->>'effective_from_chapter' AS effective_from_chapter, updated_at FROM narrative.entities WHERE id='{uuid}' AND novel_id='{novelA}'`
  - Assert `profile_version=1`, `entity_type='PER'`, `description` matches updated text, `author_profile->>'effective_from_chapter' = '1'` (stored inside JSONB `author_profile`, not a separate top-level column).
  - `SELECT brain_version FROM narrative.story_brains WHERE novel_id='{novelA}'` -> increments from 1 to 2.
  - `SELECT COUNT(*) FROM narrative.entity_profile_audits WHERE entity_id='{uuid}' AND novel_id='{novelA}'` -> returns `1` (audit ledger populated).
- **Scope Boundary:** Alias editing is NOT part of the entity profile PATCH endpoint; entity aliases remain governed by narrative identity lock rules.
- **Status:** **BLOCKED** (Requires branch `codex/p1-ax01-storybrain-core`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-02`: Version Conflict (CAS 409) & Conflict Recovery
- **Category:** Editable Entity Profile
- **Entity Type:** `PER`
- **Setup:** Author A has entity "Diệp Linh Nhi" (`entity_type='PER'`) open in editor with base `version: 0`. In parallel, backend receives an update committing `version: 1` (`brain_version: 2`).
- **Browser Action:**
  1. Author attempts to save local dirty draft with description: "Đệ tử đan đạo thiên tài."
  2. Click "Save Changes".
  3. UI receives 409 conflict and presents notification of server version divergence.
  4. Local text buffer is preserved. UI re-fetches latest server version via `GET .../profile`.
  5. Author reviews server state and submits revised draft with `expected_version: 1, expected_brain_version: 2`.
- **Target API Contract (AX-01):**
  - Stale write: `PATCH /api/v1/ai/story-brains/{novelId}/entities/{entityId}/profile` with `expected_version: 0, expected_brain_version: 1`.
  - Status Code: `409 Conflict`.
  - Response: `{ "success": false, "error": { "code": "CHECKPOINT_CONFLICT", "message": "Version conflict on entity profile" } }`.
  - Fresh fetch: `GET /api/v1/ai/story-brains/{novelId}/entities/{entityId}/profile` -> returns current server state (v1).
  - Re-save: `PATCH ...` with `expected_version: 1, expected_brain_version: 2` -> `200 OK` (advances to v2).
- **PostgreSQL Readback:**
  - `SELECT profile_version FROM narrative.entities WHERE id='{uuid}'` confirms row was not overwritten by stale v0 write; cleanly transitions `0 -> 1 -> 2`.
- **Scope Boundary:** Advanced 3-way line-level diff merge is out of scope; standard recovery contract is informing author, fetching current server state, and re-submitting with aligned version.
- **Status:** **BLOCKED** (Requires branch `codex/p1-ax01-storybrain-core`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-03`: Concurrent Edit in Two Tabs (Same Author)
- **Category:** Editable Entity Profile
- **Entity Type:** `ITEM`
- **Setup:** Same Author A opens the entity "Ngọc Bội Huyết Long" (`entity_type='ITEM'`, initial `profile_version=0`) in Tab 1 and Tab 2.
- **Browser Action:**
  1. Tab 1 edits description: "Bảo vật gia truyền màu đỏ thẫm" -> clicks "Save" -> succeeds (v0 -> v1, brain_version 1 -> 2).
  2. Tab 2 (still holding stale v0 base) edits description: "Ngọc bội cổ xưa hình rồng cuộn" -> clicks "Save".
  3. Tab 2 detects 409 conflict without losing dirty text in the editing buffer.
  4. Tab 2 updates base version to v1 and re-submits -> advances to v2 (brain_version 2 -> 3).
- **Target API Contract (AX-01):**
  - Tab 1: `PATCH .../profile` with `expected_version: 0, expected_brain_version: 1` -> 200 OK (returns v1, brain_version 2).
  - Tab 2 initial: `PATCH .../profile` with `expected_version: 0, expected_brain_version: 1` -> 409 Conflict.
  - Tab 2 re-submit: `PATCH .../profile` with `expected_version: 1, expected_brain_version: 2` -> 200 OK (returns v2, brain_version 3).
- **PostgreSQL Readback:**
  - `narrative.entities`: `profile_version` transitions `0 -> 1 -> 2`.
  - `narrative.entity_profile_audits`: contains both audit records with monotonic timestamps and respective request keys.
- **Status:** **BLOCKED** (Requires branch `codex/p1-ax01-storybrain-core`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-04`: Cross-Tenant / Wrong Owner Novel Isolation (403/404)
- **Category:** Editable Entity Profile
- **Entity Type:** `PER`
- **Setup:** Author A owns novel A with entity $E_A$. Author B owns novel B with entity $E_B$.
- **Browser Action:**
  1. Logged in as Author B.
  2. Attempt direct API mutation targeting Author A's entity $E_A$ under novel A:
     `PATCH /api/v1/ai/story-brains/{novelA}/entities/{entityA}/profile`.
  3. Attempt edit passing Author B's novel ID with Author A's entity ID:
     `PATCH /api/v1/ai/story-brains/{novelB}/entities/{entityA}/profile`.
- **Target API Contract (AX-01):**
  - Cross-novel unauthorized attempt: Status Code `403 Forbidden` (`FORBIDDEN: You do not have permission to access this novel`).
  - Scoped entity mismatch attempt: Status Code `404 Not Found` (Entity does not belong to novel B).
  - Error envelope must not disclose private note content, novel titles, or author identity.
- **PostgreSQL Readback:**
  - `SELECT COUNT(*) FROM narrative.entity_profile_audits WHERE novel_id='{novelA}' AND actor_id='{authorB_userId}'` -> returns `0`.
  - Zero rows updated in `narrative.entities` where `novel_id='{novelA}'`.
- **Status:** **BLOCKED** (Requires branch `codex/p1-ax01-storybrain-core`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EEP-05`: Homonymous Entities Separation by Exact UUID
- **Category:** Editable Entity Profile
- **Entity Type:** `PER`
- **Setup:** Novel contains two distinct entities with the exact homonymous name "Lâm Phong" (`entity_type='PER'`), identified by UUID $U_1$ ("Lâm Phong - Thiếu chủ") and UUID $U_2$ ("Lâm Phong - Thương gia tiền bối").
- **Browser Action:**
  1. Open Memory Drawer. Verify both homonyms render with distinct badges and UUID attributes.
  2. Select and edit profile for $U_2$: set description to "Tiền bối thương hội, không dính líu ân oán thế gia."
  3. Save profile and hard reload drawer.
- **Target API Contract (AX-01):**
  - `PATCH /api/v1/ai/story-brains/{novelId}/entities/{U2}/profile` with `expected_version` targeting $U_2$.
  - Status Code `200 OK`.
  - $U_1$ record remains completely untouched.
- **PostgreSQL Readback:**
  - `SELECT id, canonical_name, description, profile_version FROM narrative.entities WHERE novel_id='{novelA}' AND canonical_name='Lâm Phong'`
  - Returns 2 rows:
    - $U_1$: `profile_version=0`, description untouched.
    - $U_2$: `profile_version=1`, description updated.
- **Status:** **BLOCKED** (Requires branch `codex/p1-ax01-storybrain-core`).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category B — Canon / Notes / Plans Boundary

### Case `CNP-01`: Author Notes Do Not Become Historical Canon
- **Category:** Canon / Notes / Plans Boundary
- **Entity Type:** `PER`
- **Setup:** Author enters the profile editor for entity "Lâm Phong" (`entity_type='PER'`).
- **Browser Action:**
  1. Author adds private note in `author_notes` field: "Ý tưởng tương lai: Lâm Phong có thể có thêm một tỷ tỷ thất lạc."
  2. Clicks "Save Profile".
  3. Navigates to Canon Timeline / Memory overview.
- **Target API Contract (AX-01):**
  - `PATCH /api/v1/ai/story-brains/{novelId}/entities/{entityId}/profile`
  - Body contains `"author_notes": "Ý tưởng tương lai: Lâm Phong có thể có thêm một tỷ tỷ thất lạc."`
  - Note-only edits increment `profile_version`, but do NOT increment Story Brain `brain_version` (Canon unaffected).
- **PostgreSQL Readback:**
  - Verified in PostgreSQL `narrative.entities`: `private_author_notes` column contains note text.
  - `SELECT COUNT(*) FROM narrative.facts WHERE subject_entity_id='{uuid}' AND fact_value::text LIKE '%tỷ tỷ thất lạc%'` -> returns `0` (schema uses `subject_entity_id` and JSONB `fact_value`).
  - `SELECT COUNT(*) FROM narrative.events WHERE summary LIKE '%tỷ tỷ thất lạc%'` -> returns `0` (schema uses `summary`, not `event_description`).
  - Note is strictly stored in PostgreSQL `narrative.entities.private_author_notes`, NOT in an ungrounded MongoDB collection.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-02`: Story Plans Do Not Become Occurred Events
- **Category:** Canon / Notes / Plans Boundary
- **Setup:** Author creates an outline beat plan via `POST /api/v1/ai/story-plans`: "Chương 5: Lâm Phong đột phá Trúc Cơ tại Đỉnh Vân Tiêu."
- **Browser Action:**
  1. Save plan item in Planning panel.
  2. Inspect consistency check and memory drawer for Chapter 3.
- **Expected API Behavior:**
  - Plan saved via `POST /api/v1/ai/story-plans` with status `PLANNED`.
  - Plan status is NOT `HAPPENED` / `OCCURRED`.
- **DB Readback:**
  - `SELECT COUNT(*) FROM narrative.events WHERE summary LIKE '%đột phá Trúc Cơ%'` -> returns `0` (schema uses `summary`, not `event_description`).
  - Consistency checker treats plan as non-Canon future intent and does not flag contradiction in Chapter 3.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-03`: Author Private Secret Note Excluded from Context
- **Category:** Canon / Notes / Plans Boundary
- **Setup:** Entity profile for "Lâm Phong" contains private confidential lore in `private_author_notes`:
  `"BÍ MẬT TÁC GIẢ (CHỈ DÀNH CHO OUTLINE): Ngọc Bội Huyết Long không phải bảo vật bình thường mà là phong ấn nhốt một sợi tàn hồn của Cổ Đại Thần Ma. Lâm Phong chính là huyết mạch Ma Thần duy nhất còn sót lại."`
- **Browser Action:**
  1. Author opens Chapter 4 in IDE.
  2. Author clicks "Ask Copilot" or "Context Preview".
- **Target API Contract (AX-01 & Story Brain Context):**
  - Context Preview endpoint: `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch4Id}`.
  - Context assembler pulls canonical profile fields (`description`, `appearance`, `personality`, `background`) that satisfy `effective_from_chapter <= 4`.
  - `private_author_notes` is strictly omitted from the serialization allowlist by `get_structured_context`.
- **Payload Readback:**
  - Sanitized request body inspected at gateway/LLM provider.
  - Substring `"hậu duệ Ma Thần"` or `"tàn hồn của Cổ Đại Thần Ma"` is strictly ABSENT.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CNP-04`: Direct Edit Does Not Bypass AI Proposal Review
- **Category:** Canon / Notes / Plans Boundary
- **Setup:** Chapter analysis revision generates 3 candidate entities pending review in HITL gate.
- **Browser Action:**
  1. Author navigates to review queue (`GET /api/v1/ai/story-brains/{novelId}/review-queue`).
  2. Author attempts to trigger downstream event extraction while review state is `waiting_review`.
- **Expected API Behavior:**
  - Downstream extraction endpoint returns `428 Precondition Required` or `400 Bad Request`.
  - State remains `waiting_review` until explicit freeze/continue.
- **PostgreSQL Readback:**
  - `SELECT status, entity_candidate_audit->>'status' AS audit_status FROM narrative.analysis_runs WHERE id='{runId}'` -> returns `status='waiting_review'` / `audit_status='waiting_entity_review'` (candidate audits persisted in `narrative.analysis_runs`).
  - Zero downstream rows created in `narrative.events`.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category C — Event & State Integrity

### Case `EVS-01`: Existing Event Correction & Pending Review Semantics
- **Category:** Event / State Integrity
- **Setup:** Chapter 2 has approved Canon event $E_1$: "Lâm Phong chiến đấu với Hắc Long Xà tại Hang Hắc Long."
- **Browser Action:**
  1. In Timeline/Memory panel, author selects event $E_1$.
  2. Author clicks "Correct Event". Modifies description to: "Lâm Phong và Diệp Linh Nhi hiệp lực đẩy lui Hắc Long Xà tại Hang Hắc Long."
  3. Submits correction request.
- **Production API Contract (Pydantic EventCorrectionRequest):**
  - `POST /api/v1/ai/story-brains/{novelId}/events/{eventId}/corrections`
  - Body:
    ```json
    {
      "expected_brain_version": 2,
      "replacement": {
        "event_type": "plot_event",
        "summary": "Lâm Phong và Diệp Linh Nhi hiệp lực đẩy lui Hắc Long Xà tại Hang Hắc Long.",
        "participants": ["{entityId_LamPhong}", "{entityId_DiepLinhNhi}"],
        "chapter": 2
      },
      "transitions": []
    }
    ```
  - Status Code: `201 Created`.
  - Pending Review Semantics: Endpoint returns a proposal list/group; correction does NOT immediately overwrite Canon in-place.
  - Review Acceptance: Author approves correction proposal group via `POST /api/v1/ai/proposal-groups/{groupId}/accept` with `expected_brain_version: 2`.
- **PostgreSQL Readback:**
  - `SELECT id, confirmation_status, summary, event_metadata->>'supersedes_event_id' AS supersedes_event_id, source_type FROM narrative.events WHERE novel_id='{novelA}'`
  - $E_1$ (original event): `confirmation_status = 'superseded'` (ORM column is `confirmation_status`, not `status`).
  - $E_2$ (correction event): `confirmation_status = 'confirmed'`, `event_metadata->>'supersedes_event_id' = '{E1_uuid}'` (linkage held in JSONB `event_metadata`, not a top-level column), `source_type = 'author'` (ORM column is `source_type`, not `provenance`), `summary` matches replacement.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-02`: State Change Event Progression (Item Condition)
- **Category:** Event / State Integrity
- **Entity Type:** `ITEM`
- **Setup:**
  - Chapter 1 state: "Ngọc Bội Huyết Long: intact (nguyên vẹn)".
  - Chapter 2 event: "Ngọc Bội Huyết Long bị vỡ làm đôi trong trận chiến".
- **Browser Action:**
  1. Inspect entity profile for "Ngọc Bội Huyết Long" while viewing Chapter 1. State shows "Nguyên vẹn".
  2. Switch context selector to Chapter 2. State shows "Vỡ làm đôi".
  3. Switch to Chapter 3. State persists as "Vỡ làm đôi".
- **Target API Contract:**
  - `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch1}` -> item condition is intact.
  - `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch2}` -> item condition is broken.
  - `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch3}` -> item condition is broken.
- **PostgreSQL Readback:**
  - State projection queries read from `narrative.events` where `confirmation_status = 'confirmed'` up to chapter sequence index.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-03`: No Future Information Leakage (Temporal Boundary)
- **Category:** Event / State Integrity
- **Setup:** Novel has Chapter 1 (initial meeting), Chapter 2 (battle in Hang Hắc Long; jade broken), Chapter 3 (secret discovery). Author is editing Chapter 1.
- **Browser Action:**
  1. In Chapter 1 editor, author triggers AI Writing Suggestion.
- **Expected API & Context Boundary:**
  - Context Preview for Chapter 1 restricts narrative boundary to $Ch \le 1$.
  - **Business Invariant:** Established location names (e.g. "Trấn Thanh Phong", "Hang Hắc Long") that already exist in the world setting are NOT forbidden.
  - What is STRICTLY FORBIDDEN is future events, future actions, and future state transitions (e.g. the jade breaking event in Chapter 2, or Chapter 3 discoveries).
- **Gateway Payload Readback:**
  - Verify prompt payload sent to upstream LLM contains zero mention of the jade breaking ("vỡ làm đôi", "long đầu", "long vĩ") or Chapter 2 combat outcomes.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `EVS-04`: Chapter-Level Consistency Diagnostics
- **Category:** Event / State Integrity
- **Setup:** Chapter 2 established that "Ngọc Bội Huyết Long" was broken into two halves.
- **Browser Action:**
  1. In Chapter 3, author types: "Lâm Phong lấy chiếc Ngọc Bội Huyết Long nguyên vẹn không tì vết ra ngắm nghía."
  2. Clicks "Check Consistency".
  3. UI displays Consistency Warning citing Chapter 2 state change.
- **Expected API Behavior:**
  - Advisory finding returned without mutating Canon or blocking author workflow.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category D — Authoritative Context Assembly

### Case `CTX-01`: Profile Edit Immediately Reflected in Story Brain Context
- **Category:** Context Assembly
- **Entity Type:** `PER`
- **Setup:** Entity "Diệp Linh Nhi" has description updated from "Đệ tử đan đạo" to "Thiếu các chủ Đan Hà Các" with `effective_from_chapter: 1`.
- **Browser Action:**
  1. Save profile update via `PATCH .../profile`.
  2. Immediately inspect Context Preview in Chapter 4 editor.
- **Production API Contract:**
  - `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch4Id}`
  - Fetches fresh entity from `narrative.entities` with updated `author_profile` and `description`.
  - Assembled prompt contains "Thiếu các chủ Đan Hà Các" and omits stale text.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-02`: Explicit Private Exclusions Honored Under Context Pressure
- **Category:** Context Assembly
- **Setup:** Context budget set near token limit. Entity has 20 Canon facts and private author notes.
- **Expected Behavior:**
  - ContextBudgetPacker priority truncation algorithm sheds distant dialogue quotes and secondary facts first.
  - `private_author_notes` is NEVER packed regardless of token pressure or truncation fallback (whitelisted fields only).
- **Payload Readback:**
  - Assert zero private note tokens present across all packed context chunks.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-03`: Honest Handling of Missing Evidence
- **Category:** Context Assembly
- **Setup:** Mention of an entity with zero confirmed facts in Canon.
- **Expected Behavior:**
  - Context assembler outputs unverified status; system prompt strictly forbids hallucinating ungrounded historical lore.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `CTX-04`: Rejected Proposals Never Enter Authoritative Context
- **Category:** Context Assembly
- **Setup:** An erroneous proposal was marked `REJECTED` in review queue.
- **Expected Behavior:**
  - Context assembler queries `narrative.events` where `confirmation_status='confirmed'`.
  - Rejected proposal rows in `narrative.proposals` (`status='rejected'`) are completely excluded from context bundle.
- **Status:** **BLOCKED** (Requires AX-01 integration and Story Brain baseline).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

## Category E — P1 Core Baseline Regression

### Case `REG-01`: Manuscript Bootstrap Clean Baseline
- **Category:** P1 Regression
- **Setup:** Fresh author account, novel with Chapter 1 manuscript content.
- **Production API Behavior:**
  - `POST /api/v1/ai/story-brains/bootstrap/from-manuscript` -> job status `waiting_review`.
  - `POST /api/v1/ai/story-brains/{novelId}/baseline/activate` -> status `200 OK`.
  - `GET /api/v1/ai/story-brains/{novelId}/memory` returns `entities: []`, `events: []`, `brain_version: 1`.
- **PostgreSQL Readback:**
  - `narrative.story_brains`: `brain_version=1`, active baseline established.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `scripts/p1_final_acceptance.py`; not executed on current HEAD).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-02`: Entity Review, Homonym Freezing, and Continue Gate
- **Category:** P1 Regression
- **Setup:** Chapter analysis generates candidates with homonyms.
- **Production API Behavior:**
  - `POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/review` persists decisions.
  - `POST /api/v1/ai/story-brains/{novelId}/entity-reviews/{runId}/continue` transitions run to downstream proposal generation.
- **PostgreSQL Readback:**
  - `narrative.analysis_runs.entity_candidate_audit` JSONB record updated with finalized decisions and frozen timestamp.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `web/tests/p1-full-stack-s09-s11.browser.test.mjs`; not executed on current HEAD).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-03`: Proposal Approval & Rejection Atomic Dependency Groups
- **Category:** P1 Regression
- **Setup:** Group of proposals linked by `dependency_group_id`.
- **Production API Behavior:**
  - Author reviews proposals grouped by dependency group:
    `POST /api/v1/ai/proposal-groups/{groupId}/accept`
    Headers: `Authorization: Bearer {authorToken}`
    Body:
    ```json
    {
      "proposal_ids": ["{propId1}", "{propId2}"],
      "expected_brain_version": 1,
      "reason": "EXPLICIT_AUTHOR_REVIEW"
    }
    ```
  - Rejection:
    `POST /api/v1/ai/proposal-groups/{groupId}/reject`
    with `expected_brain_version: 1`.
  - Atomic Semantics: All proposals in the group commit or reject together. `brain_version` in `narrative.story_brains` increments exactly once atomically. Stale `expected_brain_version` returns `409 Conflict`.
- **PostgreSQL Readback:**
  - `SELECT id, status, decision_reason FROM narrative.proposals WHERE dependency_group_id='{groupId}'` -> status `accepted` or `rejected`.
  - `narrative.story_brains.brain_version` incremented exactly by 1.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `scripts/canon_review_smoke.py`; not executed on current HEAD).
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
  - Flush writes exact revision to PostgreSQL `chapter_revisions` and draft to MongoDB.
- **DB Readback:**
  - Content hash matches SHA256 of final text string; parent revision linkage intact.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `web/tests/draft-persistence.browser.test.mjs`; not executed on current HEAD).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-05`: Revision & Outbox Persistence with Provenance
- **Category:** P1 Regression
- **Setup:** Chapter save triggers transactional outbox event.
- **Production API Behavior:**
  - Atomically creates `chapter_revisions` row and `revision_outbox_events` row with matching `content_hash` and `created_by`.
- **PostgreSQL Readback:**
  - Outbox event processed by AI worker (`status='COMPLETED'`).
  - Event payload matches immutable revision provenance.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `backend/src/modules/interactions/author-workflow.integration.test.ts`; not executed on current HEAD).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`

---

### Case `REG-06`: Account Isolation & Stale 409 Concurrency Recovery
- **Category:** P1 Regression
- **Setup:** Two browser sessions with different accounts or simultaneous editing.
- **Production API Behavior:**
  - Stale client save with outdated `expectedVersion` returns `409 Conflict`.
  - UI displays server revision and provides clean recovery reload.
  - Session logout clears auth tokens and memory drawer state without document reload.
- **PostgreSQL & MongoDB Readback:**
  - Zero cross-author data leakage between accounts.
- **Status:** **HISTORICAL_PASS** (Evidence referenced from baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` via `web/tests/author-ide.browser.test.mjs`; not executed on current HEAD).
- **Source Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`
