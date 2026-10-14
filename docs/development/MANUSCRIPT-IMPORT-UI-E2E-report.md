# MANUSCRIPT-IMPORT-UI-E2E — Canonical Manuscript Import UI Integration & Closed-Loop Browser E2E Report

## 1. Executive Summary & Verdict

| Metric / Dimension | Specification / Observed Value | Verdict |
| :--- | :--- | :--- |
| **Gate Identifier** | `MANUSCRIPT-IMPORT-UI-E2E` | **ACCEPTED** |
| **Final System Verdict** | `MANUSCRIPT_IMPORT_UI_PASS` | **PASS (100%)** |
| **Integration Branch** | `astra/manuscript-import-ui-e2e` | **ACTIVE** |
| **Base Main Commit** | `dce5172e916d0546fe8293807bce7354e695fd50` | **MATCHED** |
| **Tested Product Code SHA** | `40dc3fd03a991d90a787eed7ebb61d06886831c0` | **SEALED** |
| **Evidence Payload Path** | `docs/development/MANUSCRIPT-IMPORT-UI-E2E/manuscript-import-ui-e2e-evidence.json` | **PERSISTED** |
| **Execution Mode** | Real Microsoft Edge Headless CDP (Automated Native DOM) | **VERIFIED** |
| **Deterministic Contract Tests** | 16 / 16 Node:test specifications (D1–D16) | **PASS (100%)** |
| **AI Gateway Regression Tests** | 74 / 74 total suite tests | **PASS (100%)** |
| **Real Browser Checkpoints** | 16 / 16 (Import-A through Import-P) | **PASS (100%)** |

---

## 2. Invariant & Architecture Resolution

### The Source UI Provenance & Double-Analysis Blockers
1. **Provenance Mismatch**: The original UI sent `chapterId` as `revision_id` and placeholder strings like `'auto-sha256'`, violating backend contract checks.
2. **Double Analysis Hazard (Blocker P0)**: Generic snapshots previously created `source_type = 'AUTHOR_MANUAL'` and enqueued `INCREMENTAL_ANALYSIS` outbox events. In bootstrap flows, this risked competing analysis loops materializing facts into the knowledge base before author baseline review.
3. **State Loss on Readback (Blocker P1)**: Navigating to verify chapters on `/author/novels/:novelId` lost transient React state upon returning to the import screen.

### The Canonical Hardened Resolution
1. **Backend Snapshot Hardening**:
   - `snapshotSchema.body` accepts optional `purpose: z.enum(['AUTHOR_SNAPSHOT', 'MANUSCRIPT_BOOTSTRAP']).default('AUTHOR_SNAPSHOT')`.
   - When `purpose === 'MANUSCRIPT_BOOTSTRAP'`:
     - Checks active baseline in `narrative.story_brains`; fails closed with HTTP 409 `CANNOT_BOOTSTRAP_ACTIVE_STORY_BRAIN` if already active with a baseline revision.
     - Persists revision with `source_type = 'BOOTSTRAP'` (supported natively by PostgreSQL `revision_source_type` enum).
     - **Bypasses outbox event creation**: does NOT insert `INCREMENTAL_ANALYSIS` into `revision_outbox_events` and does NOT trigger the outbox processor.
   - Ordinary author snapshots and `acceptDraft` remain completely untouched, retaining full transactional fail-closed outbox semantics.
2. **Frontend Import Pipeline**:
   - `web/src/features/manuscript-import/manuscript-import-api.ts`: `importChaptersBatch()` creates chapters, invokes `POST /chapters/:chapterId/revisions/snapshot` with `purpose: 'MANUSCRIPT_BOOTSTRAP'`, and collects authentic `{ chapter, revision }` pairs.
   - `ManuscriptImportPage.tsx`: synchronized `jobId` and `step` to URL search params (`?jobId=...&step=3`) ensuring seamless state restoration after navigation/readback.
3. **Deterministic Contract Suite (`manuscript-import-contract.test.ts`)**:
   - Checkpoints D10–D16 assert Requirements A through F:
     - Requirement A: Ordinary snapshot enqueues `INCREMENTAL_ANALYSIS`.
     - Requirement B: Bootstrap snapshot creates `BOOTSTRAP` revision with 0 outbox events.
     - Requirement C: Single bootstrap lineage prevents duplicate proposal groups.
     - Requirement D: Pre-baseline proposals remain un-materialized.
     - Requirement E: Rejected bootstrap proposals never enter canonical facts.
     - Requirement F: Post-baseline AI draft accept normalizes back to standard outbox incremental analysis.
     - Safety Check: Subsequent bootstrap attempts against active baseline are rejected with 409.

---

## 3. Real Browser Checkpoints Execution Matrix (Import-A to Import-P)

All 16 checkpoints were executed autonomously using Microsoft Edge CDP automation via `scripts/run_manuscript_import_browser_e2e.py`:

| Checkpoint | Scope & Description | Evidence Artifact | Status |
| :--- | :--- | :--- | :--- |
| **Import-A** | Author authentication (`reader03@example.com`) and navigation to `/author/import/:novelId` | `import-a-navigated.png` | **PASS** |
| **Import-B** | Open paste modal, paste deterministic 2-chapter Vietnamese fixture, and click Apply | `import-b-pasted-fixture.png` | **PASS** |
| **Import-C** | Browser parses chapters into 2 items and renders editable table with titles and word counts | `import-c-parsed-preview.png` | **PASS** |
| **Import-D** | Author confirms import through UI ("Xác nhận nhập 2 chương"), executing batch creation + snapshot revisions | `import-d-confirming-import.png` | **PASS** |
| **Import-E** | Browser navigates to `/author/novels/:novelId`; validates both chapter titles visibly rendered in DOM; correlates DB | `import-e-reloaded-chapter-list.png` | **PASS** |
| **Import-F** | DB cryptographic verification: `revision_id != chapter_id`, `source_type = 'BOOTSTRAP'`, content hashes match SHA-256, and `pre_baseline_outbox_count == 0` | PostgreSQL `chapter_revisions` | **PASS** |
| **Import-G** | Story Brain bootstrap manifest verification: `revisions` consumed real immutable IDs and hashes | `narrative.bootstrap_jobs` | **PASS** |
| **Import-H** | Bootstrap reaches `waiting_review`; priority review queue rendered in browser UI (2 proposals) | `import-h-review-queue.png` | **PASS** |
| **Import-I** | Author clicks "Từ chối" on target proposal; captures identity; DB proves `status='rejected'` | `import-i-rejected-proposal.png` | **PASS** |
| **Import-J** | Author clicks "Chấp nhận" on remaining proposal group; DB proves intended proposals reached `status='accepted'` | `import-j-accepted-proposals.png` | **PASS** |
| **Import-K** | Author clicks "Kích hoạt Story Brain Baseline"; DB proves `status='active'`; validates 0 rows in `narrative.facts` for rejected proposal | `import-k-baseline-activated.png` | **PASS** |
| **Import-L** | Navigate to Author Writing IDE (`/author/ide`); editor renders imported Chapter 1 content | `import-l-author-ide.png` | **PASS** |
| **Import-M** | Browser AI generation #1 triggers P1 writing service; CDP captures exact `chapter_id`, `revision_id`, `content_hash`, `expected_brain_version` | `import-m-generation1-draft.png` | **PASS** |
| **Import-N** | Author clicks "Hủy" / "Từ chối" on generation #1; DB proves canon and Story Brain version untouched | `import-n-generation1-rejected.png` | **PASS** |
| **Import-O** | Generation #2 -> click "Chấp nhận bản thảo" -> `AI_DRAFT_ACCEPT` revision -> outbox `COMPLETED` -> Brain $2 \rightarrow 3$ | `import-o-generation2-accepted.png` | **PASS** |
| **Import-P** | Browser generation #3 triggers; CDP network interception captures `expected_brain_version=3` ($N+1$) | `import-p-generation3-observes-n-plus-1.png` | **PASS** |

---

## 4. Cryptographic & Correlation Proofs

### Target Novel
- **Novel ID**: `1cb5a593-1dd2-4ff8-bd17-97484c293c07`
- **Novel Title**: `Hà Nội Ký Sự - Bản Thảo Thử Nghiệm 3474b7`
- **Author ID**: `51ca9a66-d798-4f6c-8518-11c085678e4f`

### Canonical Chapters & Revisions
1. **Chapter 1**:
   - `chapter_id`: `bcdaeaa8-907f-452b-b4b1-789b8cada53a`
   - `revision_id`: `0debb4da-7fec-4618-9785-b405d120e6b6`
   - `content_hash`: `1d5769cfc19eb6524807c4f2ffa4fa2b02f6b5e561df23feefb9bf16ebd1bdc4`
   - `source_type`: `BOOTSTRAP`
   - `title`: `Chương 1: Mùa hoa sữa trên phố cổ`
2. **Chapter 2**:
   - `chapter_id`: `568cef94-1958-4fd3-8201-8e045875f885`
   - `revision_id`: `1dbec61d-c2a2-4f31-9d66-3936ab2c898c`
   - `content_hash`: `424e6fea8b401b2826e3a829c9f78c5d49cf377b3bf31777471a024fe724a6db`
   - `source_type`: `BOOTSTRAP`
   - `title`: `Chương 2: Đêm sương lạnh qua cầu Long Biên`

### Outbox Fencing
- `pre_baseline_outbox_count`: `0` (Confirmed zero generic outbox rows created prior to baseline activation).

### Story Brain Lifecycle & Non-Canonical Proof
- **Bootstrap Job ID**: `64e678af-35a4-5133-8f8f-a8f3f4ce12f6`
- **Story Brain ID**: `8ca1cff4-8678-4293-b149-ad302005a7a4`
- **Initial Brain Version**: `1`
- **Baseline Revision ID**: `1dbec61d-c2a2-4f31-9d66-3936ab2c898c`
- **Post-Baseline Brain Version**: `2`
- **Target Rejected Proposal ID**: `537d4e4b-2aa9-51c1-931b-5bca92d4e847` (type: `fact`, key: `world_rule_39429a23f0b4881b`)
- **PostgreSQL Status**: `status = 'rejected'`
- **Canonical Absence Proof**:
  - Query: `SELECT COUNT(*) FROM narrative.facts WHERE novel_id = '1cb5a593-1dd2-4ff8-bd17-97484c293c07' AND fact_key = 'world_rule_39429a23f0b4881b'`
  - Result: `0` (Confirmed non-canonical proposal was never materialized into knowledge base).
- **Accepted Proposal ID**: `111a55f5-7969-5a5b-9d1c-771e4981e9a2` across group `69e33656-b8e0-5896-8f27-19242a0664ee` (`status = 'accepted'`)

### Closed-Loop Writing IDE Verification
- **Generation #1 Provenance Verification**:
  - Request ID: `7F7459A6D85D791B73CBDDF44A8FE444`
  - Job ID: `2376f0fb-58fb-5b07-bac7-a853659914e2`
  - Observed Payload: `chapter_id = bcdaeaa8-907f-452b-b4b1-789b8cada53a`, `revision_id = 0debb4da-7fec-4618-9785-b405d120e6b6`, `expected_brain_version = 2`
- **Generation #1 Discard**: Canon revision and Story Brain version remain `2`.
- **Generation #2 Acceptance**:
  - Accepted Revision: `20df83c1-ebe2-46fb-a9a7-6a7c60af6a5e` (`source_type = 'AI_DRAFT_ACCEPT'`)
  - Outbox Event: `61e38cf7-b6a4-4b34-ae57-40298e4f8109` (`status = 'COMPLETED'`)
  - Advanced Story Brain Version: `3`
- **Generation #3 N+1 Observation**:
  - Intercepted Request ID: `23980.908`
  - Observed Brain Version: `expected_brain_version = 3`

---

## 5. Scope Boundary & Handoff Directive

In accordance with Section 4 and Section 5 of `promt.md`:
1. Gemini local scope is **100% complete**.
2. Stop boundary is strictly observed at:
   ```text
   LOCAL_PASS_CI_PENDING
   ```
3. Gemini does not create PRs, does not merge into `main`, and does not merge the old `UI` branch into `main`.
4. Remote review, GitHub Actions CI verification, and merge decisions belong exclusively to ChatGPT.

---

## 6. Backward-Only SHA Lineage

```text
TESTED_MAIN_SHA:      dce5172e916d0546fe8293807bce7354e695fd50
TESTED_CODE_SHA:      40dc3fd03a991d90a787eed7ebb61d06886831c0
```
