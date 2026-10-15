# MANUSCRIPT-IMPORT-UI-E2E — Canonical Manuscript Import UI Integration & Closed-Loop Browser E2E Report

## 1. Executive Summary & Verdict

| Metric / Dimension | Specification / Observed Value | Verdict |
| :--- | :--- | :--- |
| **Gate Identifier** | `MANUSCRIPT-IMPORT-UI-E2E` | **ACCEPTED** |
| **Final System Verdict** | `MANUSCRIPT_IMPORT_UI_PASS` | **PASS (100%)** |
| **Integration Branch** | `astra/manuscript-import-ui-e2e` | **MERGED via PR #46** |
| **Base Main Commit** | `f500f0013253add139b3e08cf7d0ff85236f3dce` | **MATCHED** |
| **Tested Product Code SHA** | `66f94e22980b2c10cf3e2e93523e31f6582def60` | **SEALED** |
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
- **Novel ID**: `3babb4a1-8c44-4ef5-8448-3699d7b7c694`
- **Novel Title**: `Hà Nội Ký Sự - Bản Thảo Thử Nghiệm bde3d8`
- **Author ID**: `51ca9a66-d798-4f6c-8518-11c085678e4f`

### Canonical Chapters & Revisions
1. **Chapter 1**:
   - `chapter_id`: `29e748d1-b1cb-440d-b9d9-ed265f10dd70`
   - `revision_id`: `26195fb8-5bef-402c-a0f4-0faf79491010`
   - `content_hash`: `1d5769cfc19eb6524807c4f2ffa4fa2b02f6b5e561df23feefb9bf16ebd1bdc4`
   - `source_type`: `BOOTSTRAP`
   - `title`: `Chương 1: Mùa hoa sữa trên phố cổ`
2. **Chapter 2**:
   - `chapter_id`: `bf125340-7021-4094-bf4d-4df64bfebbad`
   - `revision_id`: `9aeaac3c-756e-4bc3-9dfc-42ad9ea023a9`
   - `content_hash`: `424e6fea8b401b2826e3a829c9f78c5d49cf377b3bf31777471a024fe724a6db`
   - `source_type`: `BOOTSTRAP`
   - `title`: `Chương 2: Đêm sương lạnh qua cầu Long Biên`

### Outbox Fencing
- `pre_baseline_outbox_count`: `0` (Confirmed zero generic outbox rows created prior to baseline activation).

### Story Brain Lifecycle & Non-Canonical Proof
- **Bootstrap Job ID**: `1596c880-40cb-5aa9-b110-e59202f79a5d`
- **Story Brain ID**: `93ff7257-93cb-4378-b623-57d29f53e62b`
- **Initial Brain Version**: `1`
- **Baseline Revision ID**: `9aeaac3c-756e-4bc3-9dfc-42ad9ea023a9`
- **Post-Baseline Brain Version**: `2`
- **Target Rejected Proposal ID**: `ca21cfc0-005f-5079-8b6f-4d3eee7dddb0` (type: `fact`, key: `world_rule_39429a23f0b4881b`)
- **PostgreSQL Status**: `status = 'rejected'`
- **Canonical Absence Proof**:
  - Query: `SELECT COUNT(*) FROM narrative.facts WHERE novel_id = '3babb4a1-8c44-4ef5-8448-3699d7b7c694' AND fact_key = 'world_rule_39429a23f0b4881b'`
  - Result: `0` (Confirmed non-canonical proposal was never materialized into knowledge base).
- **Accepted Proposal ID**: `d0303362-b333-5f9f-b132-aa5d38deb486` across group `9529cb12-c44a-57c6-85ee-81ad985d832c` (`status = 'accepted'`)

### Closed-Loop Writing IDE Verification
- **Generation #1 Provenance Verification**:
  - Request ID: `222DB8D3E7B3378DB851DE3B62C43332`
  - Job ID: `e1d6a775-fc04-59a2-a8ef-ae18dffafc07`
  - Observed Payload: `chapter_id = 29e748d1-b1cb-440d-b9d9-ed265f10dd70`, `revision_id = 26195fb8-5bef-402c-a0f4-0faf79491010`, `expected_brain_version = 2`
- **Generation #1 Discard**: Canon revision and Story Brain version remain `2`.
- **Generation #2 Acceptance**:
  - Accepted Revision: `60ba7e8d-8de1-448e-93d6-44b4a3c5470c` (`source_type = 'AI_DRAFT_ACCEPT'`)
  - Outbox Event: `8f4e8b20-3011-48b0-a36f-110c8764f1fd` (`status = 'COMPLETED'`)
  - Advanced Story Brain Version: `3`
- **Generation #3 N+1 Observation**:
  - Intercepted Request ID: `18600.819`
  - Observed Brain Version: `expected_brain_version = 3`

---

## 5. Remote Acceptance & Merge Closure

The local browser/system gate was accepted and then independently exercised by required GitHub Actions on PR #46.

```text
PR:
#46 — feat(manuscript-import): canonical bootstrap ownership and browser E2E

accepted PR head:
d73e6d138e27892f3eec71d627dae2aeaa3f2c55

P7 Semantic Memory Foundation:
run #126 / 38670492688 / PASS

P8 Cutover and Migration:
run #123 / 38670492674 / PASS

merge commit:
ff1d47b59ca995af32b068163599cefdcc158db8
```

P8 root-compose regression passed the complete accepted chain:

```text
AI-PIPE-01A production persistence   PASS
AI-PIPE-02A idea bootstrap           PASS
AI-PIPE-02B outline planning         PASS
AI-PIPE-03A autonomous controller    PASS
frontend/API cutover                 PASS
PostgreSQL integration               PASS
rollback rehearsal                   PASS
final cleanup gate                   PASS
```

Remote status:

```text
MANUSCRIPT_IMPORT_UI_PASS
CI_PASS / MERGED
```

No CI-only product behavior repair was required for PR #46.

---

## 6. Backward-Only SHA Lineage

```text
TESTED_MAIN_SHA:      f500f0013253add139b3e08cf7d0ff85236f3dce
TESTED_CODE_SHA:      66f94e22980b2c10cf3e2e93523e31f6582def60
EVIDENCE_PAYLOAD_SHA: 9771996f92b19076ebd081421c25e6aad033b9d7
```
