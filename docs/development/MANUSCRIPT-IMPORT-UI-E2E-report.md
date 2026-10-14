# MANUSCRIPT-IMPORT-UI-E2E — Canonical Manuscript Import UI Integration & Closed-Loop Browser E2E Report

## 1. Executive Summary & Verdict

| Metric / Dimension | Specification / Observed Value | Verdict |
| :--- | :--- | :--- |
| **Gate Identifier** | `MANUSCRIPT-IMPORT-UI-E2E` | **ACCEPTED** |
| **Final System Verdict** | `MANUSCRIPT_IMPORT_UI_PASS` | **PASS (100%)** |
| **Integration Branch** | `astra/manuscript-import-ui-e2e` | **ACTIVE** |
| **Base Main Commit** | `dce5172e916d0546fe8293807bce7354e695fd50` | **MATCHED** |
| **Tested Product Code SHA** | `95a8afda869642b88aa74f1e6421c8366487939f` | **SEALED** |
| **Evidence Payload Path** | `docs/development/MANUSCRIPT-IMPORT-UI-E2E/manuscript-import-ui-e2e-evidence.json` | **PERSISTED** |
| **Execution Mode** | Real Microsoft Edge Headless CDP (Automated Native DOM) | **VERIFIED** |
| **Deterministic Contract Tests** | 9 / 9 Node:test specifications | **PASS (100%)** |
| **Real Browser Checkpoints** | 16 / 16 (Import-A through Import-P) | **PASS (100%)** |

---

## 2. Invariant & Architecture Resolution

### The Source UI Provenance Bug
The previous `UI@fe8429c` branch mapped:
```typescript
const revisions = createdChapters.map((ch) => ({
  chapter_id: ch.chapterId,
  revision_id: ch.chapterId,      // INVALID: Sent chapter ID as revision ID
  content_hash: 'auto-sha256'      // INVALID: Sent placeholder hash
}));
```
This failed against the backend contract: the AI Service verifies every revision against PostgreSQL `chapter_revisions` and rejects non-existent revisions (HTTP 404 `REVISION_NOT_FOUND`) or hash mismatches (HTTP 422 `CONTENT_HASH_MISMATCH`).

### The Canonical Resolution
In `web/src/features/manuscript-import/manuscript-import-api.ts` and `ManuscriptImportPage.tsx`:
1. `importChaptersBatch()` was updated to sequentially:
   - Persist chapter to PostgreSQL + MongoDB draft via `POST /api/v1/novels/:novelId/chapters`.
   - Immediately create an authentic canonical snapshot revision via `POST /api/v1/chapters/:chapterId/revisions/snapshot`.
   - Return `{ chapter, revision }` pairs containing the server-generated `revisionId` and 64-character lowercase hexadecimal SHA-256 `contentHash`.
2. `handleConfirmImport` maps exact authentic provenance to the Story Brain bootstrap endpoint:
   ```typescript
   const revisions: BootstrapRevisionInput[] = importedResults.map((item) => ({
     chapter_id: item.chapter.chapterId,
     revision_id: item.revision.revisionId,
     content_hash: item.revision.contentHash
   }));
   await startManuscriptBootstrap(novelId, revisions);
   ```
3. Excluded all non-production mock artifacts (`ManuscriptImportPage.html`, `ManuscriptImportPage_old.tsx`).

---

## 3. Real Browser Checkpoints Execution Matrix (Import-A to Import-P)

All 16 checkpoints were executed autonomously using Microsoft Edge CDP automation via `scripts/run_manuscript_import_browser_e2e.py`:

| Checkpoint | Scope & Description | Evidence Artifact | Status |
| :--- | :--- | :--- | :--- |
| **Import-A** | Author authentication (`reader03@example.com`) and navigation to `/author/import/:novelId` | `import-a-navigated.png` | **PASS** |
| **Import-B** | Open paste modal, paste deterministic 2-chapter Vietnamese fixture, and click Apply | `import-b-pasted-fixture.png` | **PASS** |
| **Import-C** | Browser parses chapters into 2 items and renders editable table with titles and word counts | `import-c-parsed-preview.png` | **PASS** |
| **Import-D** | Author confirms import through UI ("Xác nhận nhập 2 chương"), executing batch creation + snapshot revisions | `import-d-confirming-import.png` | **PASS** |
| **Import-E** | Correlate DB: Chapters 1 & 2 persisted in PostgreSQL with exact titles and numbering | DB Query Correlation | **PASS** |
| **Import-F** | DB cryptographic verification: `revision_id != chapter_id` and `content_hash` matches exact SHA-256 | PostgreSQL `chapter_revisions` | **PASS** |
| **Import-G** | Story Brain bootstrap manifest verification: `revisions` consumed real immutable IDs and hashes | `narrative.bootstrap_jobs` | **PASS** |
| **Import-H** | Bootstrap reaches `waiting_review`; priority review queue rendered in browser UI (2 proposals) | `import-h-review-queue.png` | **PASS** |
| **Import-I** | Author clicks "Từ chối" on Proposal 2 in UI; DB proves status='rejected' and excluded from canon | `import-i-rejected-proposal.png` | **PASS** |
| **Import-J** | Author clicks "Chấp nhận" on remaining proposal groups in UI with optimistic locking | `import-j-accepted-proposals.png` | **PASS** |
| **Import-K** | Author clicks "Kích hoạt Story Brain Baseline" in UI; DB proves Story Brain `status='active'` | `import-k-baseline-activated.png` | **PASS** |
| **Import-L** | Navigate to Author Writing IDE (`/author/ide`); editor renders imported Chapter 1 content | `import-l-author-ide.png` | **PASS** |
| **Import-M** | Browser AI generation #1 triggers P1 writing service using imported Story Brain context | `import-m-generation1-draft.png` | **PASS** |
| **Import-N** | Author clicks "Hủy" / "Từ chối" on generation #1; DB proves canon and Story Brain version untouched | `import-n-generation1-rejected.png` | **PASS** |
| **Import-O** | Generation #2 -> click "Chấp nhận bản thảo" -> `AI_DRAFT_ACCEPT` revision -> outbox `COMPLETED` -> Brain $2 \rightarrow 3$ | `import-o-generation2-accepted.png` | **PASS** |
| **Import-P** | Browser generation #3 triggers; CDP network interception captures `expected_brain_version=3` ($N+1$) | `import-p-generation3-observes-n-plus-1.png` | **PASS** |

---

## 4. Cryptographic & Correlation Proofs

### Target Novel
- **Novel ID**: `7c071a7b-671e-4f59-a0eb-22171c00c6cb`
- **Novel Title**: `Hà Nội Ký Sự - Bản Thảo Thử Nghiệm c80915`
- **Author ID**: `51ca9a66-d798-4f6c-8518-11c085678e4f`

### Canonical Chapters & Revisions
1. **Chapter 1**:
   - `chapter_id`: `affb01f4-b1b7-4458-af7a-be5c05926898`
   - `revision_id`: `f91be560-c6e0-4c90-bd03-439db34d53c7`
   - `content_hash`: `1d5769cfc19eb6524807c4f2ffa4fa2b02f6b5e561df23feefb9bf16ebd1bdc4`
   - `title`: `Chương 1: Mùa hoa sữa trên phố cổ`
2. **Chapter 2**:
   - `chapter_id`: `ec904893-8de4-4538-a446-e89e3d6f2b55`
   - `revision_id`: `f1cdbd82-f5cc-47af-927d-ea86cecbe6b4`
   - `content_hash`: `424e6fea8b401b2826e3a829c9f78c5d49cf377b3bf31777471a024fe724a6db`
   - `title`: `Chương 2: Đêm sương lạnh qua cầu Long Biên`

### Story Brain Lifecycle
- **Bootstrap Job ID**: `dd4553bd-a135-5d3d-82cf-ba757e9968b0`
- **Initial Brain Version**: `1`
- **Baseline Revision ID**: `f1cdbd82-f5cc-47af-927d-ea86cecbe6b4`
- **Post-Baseline Brain Version**: `2`
- **Rejected Proposal ID**: `1819b1ba-8ae4-5ba4-ab58-fc1f90e21650` (`status='rejected'`)
- **Accepted Proposal ID**: `32a0b922-527e-472c-8fe9-76f27b4de79d` (`status='accepted'`)
- **Accepted Draft Revision**: `884fa0a0-7ab0-481f-86a9-3ac72fd3d228` (`source_type='AI_DRAFT_ACCEPT'`)
- **Accepted Generation ID**: `c07fbccb-1506-51ba-bcf4-17cf5d37ceb9`
- **Transactional Outbox Event**: `253a746f-8ab9-4011-827c-51ab839fc072` (`status='COMPLETED'`)
- **Advanced Brain Version**: `3`
- **Subsequent Generation #3 Request**: `expected_brain_version=3`

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
