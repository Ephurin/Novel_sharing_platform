# AX-01 Integration Handoff & Test Preparation

**Target Demo:** 09/11/2026  
**QA Working Branch:** `gemini/p1-demo-qa-prep`  
**Baseline Commit:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**Codex Development Branch:** `codex/p1-ax01-storybrain-core`  
**Handoff Gate Status:** `QA_PREP_READY_FOR_INTEGRATION`  
**AX-01 Feature Status:** `NOT_RUN / BLOCKED_PENDING_INTEGRATION` (Awaiting reviewed candidate SHA)

---

## 1. Boundary & Policy Declaration

Per strict remediation guidelines:
- QA working branch `gemini/p1-demo-qa-prep` does NOT merge `codex/p1-ax01-storybrain-core` prematurely.
- Production business logic, database migrations, and controller implementations are neither mocked nor modified in QA to force green tests.
- All 17 new test cases across Categories A, B, C, and D remain labeled **NOT_RUN / BLOCKED_PENDING_INTEGRATION** until the integrated candidate SHA is officially delivered and reviewed.

---

## 2. Prepared Test Cases for AX-01 Delivery

The following test harness definitions are verified against the AX-01 API and schema contract (`PATCH /ai/story-brains/:novelId/entities/:entityId/profile`, required `expected_version`, `expected_brain_version`, `Idempotency-Key`, `narrative.entities.private_author_notes`, `narrative.entity_profile_audits`):

### 1. Profile Save & Reload (`EEP-01`)
- **Probe:** `PATCH /api/v1/ai/story-brains/{novelId}/entities/{entityId}/profile` with `expected_version: 0`, `expected_brain_version: 1`, `effective_from_chapter: 1`.
- **Assertion:** HTTP 200 returned. PostgreSQL `narrative.entities` updates `profile_version=1` and `description`. Audit row created in `narrative.entity_profile_audits`. Page hard-reload restores updated text.

### 2. Version Conflict & Two-Tab 409 (`EEP-02`, `EEP-03`)
- **Probe:** Tab 1 updates to v1 (`expected_version: 0`). Tab 2 attempts update to v1 (`expected_version: 0`).
- **Assertion:** Tab 2 receives HTTP 409 Conflict with `CHECKPOINT_CONFLICT` or `VERSION_CONFLICT`. UI displays conflict warning without discarding dirty buffer in Tab 2. Subsequent submit with `expected_version: 1` succeeds and advances to v2.

### 3. Same-Name Entity UUID Isolation (`EEP-05`)
- **Probe:** Two entities with identical `canonical_name: 'Lâm Phong'`, entity_type: `PER`, distinct UUIDs $U_1$ and $U_2$.
- **Assertion:** Mutating $U_2$ by UUID increments only $U_2$ version; $U_1$ remains completely untouched in `narrative.entities`.

### 4. Notes & Plans Exclusion (`CNP-01`, `CNP-02`, `CNP-03`)
- **Probe:** Author saves private lore in `author_notes`.
- **Assertion:** Note persisted strictly in PostgreSQL `narrative.entities.private_author_notes` and audit ledger. Context preview (`GET /ai/story-brains/{id}/context-preview`) strictly excludes private notes. Story plans (`POST /ai/story-plans`) remain status `PLANNED` and never enter `narrative.events`.

### 5. Context Preview & Actual Generation Prompt (`CTX-01`, `CTX-02`)
- **Probe:** Story Brain Context Preview `GET /api/v1/ai/story-brains/{storyBrainId}/context-preview?chapterId={ch4Id}`.
- **Assertion:** Approved profile description appears in context bundle. Private notes excluded even under maximum context budget pressure.

### 6. Event Correction & Provenance (`EVS-01`)
- **Probe:** `POST /api/v1/ai/story-brains/{novelId}/events/{eventId}/corrections`.
- **Assertion:** Returns HTTP 201 with pending proposal group. Author approves via `POST /api/v1/ai/proposal-groups/{groupId}/accept` with `expected_brain_version`. Original event marked `SUPERSEDED`, new event marked `ACTIVE` with `provenance: 'AUTHOR_CORRECTION'`.

### 7. S09–S11 Core Regression Verification (`REG-01` to `REG-06`)
- **Prerequisite:** Baseline regression proven on `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`:
  - `REG-01`: Manuscript bootstrap baseline.
  - `REG-02`: Entity candidate review & continue gate.
  - `REG-03`: Proposal approval adhering to atomic dependency groups.
  - `REG-04`: Debounce auto-save, Undo ABA, and chapter flush.
  - `REG-05`: Transactional outbox event persistence with content hash.
  - `REG-06`: Stale 409 concurrency and multi-session account isolation.

---

## 3. Integration Readiness Checklist

- [x] Test harness false-green vulnerability fixed; unreachable backend fails fast.
- [x] Negative tests verified: unreachable backend rejected; unpromoted reader rejected (403); invalid snapshot purpose rejected (400/422).
- [x] Demo fixture seeder updated to use `/auth/become-author` and valid purposes (`MANUSCRIPT_BOOTSTRAP`, `AUTHOR_SNAPSHOT`).
- [x] Secret hygiene scanner created and tested; zero credentials or raw notes in public artifacts.
- [x] QA Matrix aligned with real routes, `narrative.*` PostgreSQL schema, and AX-01 contract.
- [x] All Codex-dependent cases labeled `BLOCKED_PENDING_INTEGRATION / NOT_RUN`.
- [x] Ready for independent review and subsequent AX-01 candidate promotion.
