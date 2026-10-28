# P1 AX-01 + AX-02 Integrated Acceptance Report — Hardened Evidence & Verification

**Date:** 2026-10-28  
**Task:** `AX-ACCEPTANCE-02: Final Evidence Hardening & Independent Verification`  
**Target Milestone:** Demo 09/11/2026  
**Repository:** `Ephurin/Novel_sharing_platform`  
**Working Branch:** `gemini/p1-ax01-ax02-integrated-acceptance`  
**Final Integrated Verdict:** **`AX01_AX02_INTEGRATION_PASS`** (Scope Note: 7 Scenarios PASS, 1 Scenario PARTIAL_PASS with contract limitation disclosed)

---

## 1. Executive Summary

This integrated acceptance report delivers hardened, independently reproducible evidence verifying the end-to-end integration between **AX-01 (`StoryBrain Core`)** and **AX-02 (`Editable Codex UI`)** in an isolated, real-service containerized environment without mocks or live cloud LLM dependencies.

### Core Hypothesis Under Test
> **Tác giả chỉnh sửa hồ sơ nhân vật trong Author IDE → backend lưu vào PostgreSQL → tải lại vẫn giữ dữ liệu → AI generation sử dụng đúng hồ sơ đã cập nhật.**

### Independent Review Remediation Summary
Following the independent QA review (`AX01_AX02_INTEGRATION_NEEDS_CHANGES`), this iteration resolved all identified evidence hygiene and assertion gaps:
1. **Task A (Evidence Hygiene & Leakage Prevention):** Implemented strict allowlist sanitization for all HTTP traces and database readbacks. Excluded raw `author_notes`, `private_author_notes`, audit `before`/`after` snapshots, and MongoDB chapter draft contents from evidence. Pre-registered all credentials and test sentinels (`SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET`). Masked DOM fields before screenshot capture. Added deep inspection of zip archives in secret scanner and proved negative tests across 7 distinct credential/leak classes.
2. **Task B (Context Integrity Verification in AX-E2E-07):** Queried PostgreSQL `narrative.writing_generations` by exact `job_id` (eliminated `ORDER BY created_at DESC LIMIT 1`). Bound fake-upstream prompt captures to the generation request using a unique correlation token (`CORR_JOB_10ea7726d5`) embedded in `instruction`. Recalculated SHA256 context hash from prompt Story Brain JSON using the exact implementation canonical contract (`json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)`), proving `recomputed_hash == persisted_hash`. Verified `ContextBudgetPacker` execution (`context-budget-v1`) and strict exclusion of private notes and unrelated entity profiles.
3. **Task C (Overclaimed Coverage Corrections):**
   - **AX-E2E-04:** Formally marked as **`PARTIAL_PASS`**. Explicitly disclosed domain uniqueness constraint (`HOMONYM_CREATION_UNSUPPORTED` returning HTTP 422 via author creation API) and labeled the secondary entity fixture as **`SYNTHETIC_DB_FIXTURE`** (`UUID_ISOLATION_PASS` in test DB).
   - **AX-E2E-05:** Fully executed on **two real browser contexts** (`pageA` and `pageB`) authenticated as the author. Verified HTTP 409 conflict, input retention in Browser B, server comparison panel activation, and subsequent successful save using CAS versioning and a fresh idempotency key.
   - **AX-E2E-08:** Registered Author B and novel B via the production auth flow (`POST /auth/become-author`), verifying bidirectional 403/404 isolation for private entity profiles.
4. **Task D (Evidence Provenance & Reproducibility):** Packaged minimal, compact, sanitized evidence artifacts inside the repository (`docs/development/integration/p1-author/evidence/2026-10-28-ax01-ax02-hardening/`).

---

## 2. Source Provenance & Branch Hierarchy

| Component | Repository / Branch | Exact Commit SHA | Verified Status |
| :--- | :--- | :--- | :--- |
| **Reviewed QA Base** | `gemini/p1-ax01-ax02-integrated-acceptance` | `810e38674c41e587dff189c4299566ef0ebf7ad6` | Reviewed Base HEAD |
| **AX-01 Core** | `codex/p1-ax01-storybrain-core` (PR #75) | `b98dab9712e587cc75449795d73252f662b57d6d` | Remote Verified & Built |
| **AX-02 UI** | `codex/p1-ax02-editable-codex-ui` (PR #76) | `3be021d2c0f777ba6cd5c0043554499acffcbc09` | Remote Verified & Built |
| **Tested Source Tree** | Working Tree (`web/dist` built from source) | `6832257aff89c96e328810d55ee8cf0121b8c413` | Verified & Built |

*Constraint Enforcement:* Neither PR #75 nor PR #76 was merged into `main` or `integration`. Production codebase in `backend/`, `ai-service/`, and `web/src/` was untouched; all corrections are strictly contained within `web/tests/`, `scripts/`, and documentation.

---

## 3. Environment & Isolation Verification

### 3.1 Task-Owned Container Stack Specification
The tests executed against an isolated, disposable Docker Compose project:
- **Project Name:** `codex-p1-final-a99e773598`
- **PostgreSQL Port:** `61287` (`ephurin_test_p1_final_a99e773598`)
- **MongoDB Port:** `61288`
- **Backend API Gateway Port:** `61289`
- **Frontend Web Proxy Port:** `61247` (serving `web/dist` with `VITE_API_BASE_URL=/api/v1`)
- **Budget Gateway Port:** `18090` (mode: `OFFLINE_ONLY`)
- **Fake Upstream Port:** `18091` (deterministic offline LLM provider)

### 3.2 Cloud & Financial Boundary
- **Total Live Cloud LLM Calls:** `0` (Zero live requests to OpenAI, Anthropic, Google Gemini, or AWS).
- **Actual Invoice USD:** `$0.00` (mode: `OFFLINE_ONLY`, `status: OFFLINE_ONLY`).
- **Fake Upstream Captured Requests:** `41` offline calls recorded in ledger (`provider-after.log`).
- **Network Boundary Sandbox:** Playwright browser network requests routed strictly to `127.0.0.1:61247` and `127.0.0.1:61289`. External outbound requests intercepted and rejected (`blocked-external.json: []`).

---

## 4. Acceptance Scenario Matrix

| Scenario ID | Test Scenario | Status | Key Verifications & Readbacks |
| :--- | :--- | :---: | :--- |
| **AX-E2E-01** | Author and Story Brain Setup | **PASS** | User `52b14c91-...` promoted to `AUTHOR`; Novel `e78e28c9-...`; Chapter 1 bootstrap job; 4 entities approved; Baseline activated; `brain_version = 2`. |
| **AX-E2E-02** | Browser Edit, Reload & Independent DB Readback | **PASS** | Edge UI login -> Author IDE -> Story Brain drawer -> Codex tab -> Select Lâm Phong -> Save form -> HTTP 200 PATCH -> Page reload -> Form retains values -> PostgreSQL readback: `profile_version = 1`, `brain_version = 3`, 1 audit record (`a8b4c0b2-...`). |
| **AX-E2E-03** | Private Author Notes Isolation and Secrecy | **PASS** | Form edit of `author_notes` masked before capture -> HTTP 200 PATCH -> `profile_version = 2`, `brain_version = 3` (strictly unchanged: `3 === 3`); zero events/facts fabricated; confidential sentinel note strictly excluded from `GET /ai/story-brains/{novel_id}/memory`. |
| **AX-E2E-04** | Homonymous Characters UUID Isolation | **PARTIAL_PASS** | **Domain Limitation:** Production API returns HTTP 422 (`HOMONYM_CREATION_UNSUPPORTED`).<br>**UUID Isolation:** Tested via `SYNTHETIC_DB_FIXTURE` in isolated test DB. Entities A (`c076b893-...`) and B (`e228925f-...`) differentiated in UI dropdown and DB; edits to Entity A do not touch Entity B (`UUID_ISOLATION_PASS`). |
| **AX-E2E-05** | Concurrent Editing, CAS Conflict & Same-Key Retry | **PASS** | **Two Real Browser Contexts:** Session A saves version 2 -> succeeds (v3); Session B submits stale form -> HTTP 409 Conflict; Session B retains input; Session A committed profile not overwritten; Session B clicks "Tải phiên bản server để đối chiếu" -> comparison panel displayed -> saves reconciled profile -> HTTP 200 (v4); DB audits verify exactly 2 audit records. Same-key retry verified. |
| **AX-E2E-06** | Temporal Cutoff (`effective_from_chapter = 10`) | **PASS** | Cutoff set to 10 -> Chapter 9 context excludes profile (`approved_profile: {}`) -> Chapter 10 context includes profile (`ch10_Appearance` present) -> Zero fabricated events/facts. |
| **AX-E2E-07** | Actual Writing Generation & LLM Prompt Verification | **PASS** | Normal route `POST /ai/writing/generations` (no preview bypass); queried by exact `job_id = 245f820f-...`; fake upstream correlated via `CORR_JOB_10ea7726d5`; recomputed SHA256 context hash (`1da8f7ef...`) equals persisted `context_hash`; `ContextBudgetPacker` verified (`context-budget-v1`); Lâm Phong profile included; unrelated profiles and private notes excluded. |
| **AX-E2E-08** | Real Cross-Author Ownership & Security Boundaries | **PASS** | Author B registered via production auth and promoted via `POST /auth/become-author`; Novel B created; Author B denied access to Author A's private profile (403/404); Author A denied access to Author B's profile (403/404); 401 unauthenticated; 403 reader forbidden; 422 missing key; 422 oversized payload. |

---

## 5. Scenario Deep Dive & Hardened Evidence

### 5.1 AX-E2E-01: Real Production API Setup
- **Novel ID:** `e78e28c9-ad76-484b-a8ef-f492c7c30deb`
- **Author ID:** `52b14c91-e5e7-4d77-975e-9127d426517d`
- **Chapters Created:**
  - Chapter 1: `186b3d66-205c-471b-9ebc-4a1fb3a142a8` (Revision: `bb8f0f22-18f0-4bb1-ad93-323d14eb6fb7`)
  - Chapter 2: `34491ec2-de3a-48fd-a969-9120e17e130e` (Revision: `d67287d1-dfd5-4cd3-8983-c5b14dfdad5f`)
  - Chapter 3: `1de337fc-5149-403b-873b-47c51a9fac0f` (Revision: `c201da47-6e40-41a2-a308-631013c65560`)
  - Chapter 4: `45fac9fb-961a-4d1e-8807-0afe6db3e8e4` (Draft)
- **Entities Approved:** 4 canonical entities confirmed (`Lâm Phong`, `Diệp Linh Nhi`, `Trấn Thanh Phong`, `Ngọc Bội Huyết Long`).
- **PostgreSQL Baseline Brain Version:** `2`

### 5.2 AX-E2E-02: Real Browser Edit, Reload & Independent DB Readback
- **Browser Interaction:**
  1. Author logged into `http://127.0.0.1:61247/login` using credentials.
  2. Navigated to `http://127.0.0.1:61247/author/ide?novelId=e78e28c9-...&chapterId=186b3d66-...`.
  3. Clicked Story Brain drawer trigger button (`[data-testid="btn-story-brain"]`).
  4. Switched to `Hồ sơ Codex` tab (`role="tab"`).
  5. Selected Lâm Phong (`8194063a-6700-46d4-ac53-2e3a50fdc47d`) from searchable UUID select dropdown.
  6. Updated fields:
     - `Mô tả`: `"Thiếu niên kiên định mang trong mình huyết mạch bí ẩn."`
     - `Ngoại hình`: `"Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng."`
     - `Tính cách`: `"Trầm tĩnh, cẩn trọng và không dễ tin người."`
     - `Chương bắt đầu có hiệu lực`: `"1"`
  7. Clicked `Lưu thay đổi`. Browser emitted `PATCH /api/v1/ai/story-brains/{novel_id}/entities/{entity_id}/profile` with `Idempotency-Key` and CAS version headers -> Received `200 OK`.
  8. Browser reloaded -> Navigated back to drawer -> Form inputs displayed persisted values.
- **Independent PostgreSQL Readback:**
  ```sql
  SELECT author_profile, description, profile_version FROM narrative.entities WHERE id='8194063a-6700-46d4-ac53-2e3a50fdc47d';
  ```
  - `profile_version`: `1`
  - `author_profile.appearance`: `"Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng."`
  - `story_brains.brain_version`: `3` (incremented from 2)
  - `narrative.entity_profile_audits`: 1 record created (Audit ID: `a8b4c0b2-99b5-4e49-a64f-a0403e5b479b`).
- **Visual Artifact:** Screenshot `ax-e2e-02-profile-saved.png` captured (SHA256: `c44155e1817c4f8c4d5a9038b418ae5c824dcd0bde8e6264324a7fc7714ae911`).

### 5.3 AX-E2E-03: Private Author Notes Isolation & Secrecy
- **Sentinel Secret Registered:** `"SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET"`
- **Browser Mitigation:** Textarea masked to `[REDACTED_AUTHOR_NOTE_MASKED]` prior to screenshot capture to ensure zero visual exposure.
- **Invariance Checks:**
  - `narrative.entities.profile_version`: `2` (incremented from 1).
  - `narrative.story_brains.brain_version`: `3` (strictly unchanged: `3 === 3`).
  - `narrative.events` count: `1` (unchanged).
  - `narrative.facts` count: `0` (unchanged).
  - `GET /ai/story-brains/{novel_id}/memory`: Raw JSON response inspected — sentinel note string does **NOT** exist anywhere in approved memory payload.
- **Visual Artifact:** Screenshot `ax-e2e-03-private-notes-saved.png` captured (SHA256: `9ae507ecba33db423a711ff19db896a166d3b39de9af896624e34a57163128f5`).

### 5.4 AX-E2E-04: Homonymous Characters UUID Isolation
- **Domain Constraint Verification:** Attempting to create a second entity with canonical name `"Minh"` via `POST /author-entities` is rejected by domain uniqueness validation (`HTTP 422`, `HOMONYM_CREATION_UNSUPPORTED`).
- **Synthetic DB Fixture Setup (`SYNTHETIC_DB_FIXTURE`):**
  - Entity A (`Minh`, Merchant): `c076b893-7ae1-4307-aed5-a180f238e559` (Appearance: `"Béo tốt, áo gấm hoa lệ"`)
  - Entity B (`Minh`, Hunter): `e228925f-3834-4da1-b50c-5033233a8ffb` (Appearance: `"Gầy gò áo da thú"`)
- **UI Disambiguation Verification:** Browser dropdown renders option labels with format:  
  `${name} · ${entity_type} · ${entity_id}`  
  Both options rendered simultaneously with unique UUID discriminators.
- **Isolation Readback:** Edits to Entity A updated Entity A only; Entity B remained untouched (`UUID_ISOLATION_PASS`).
- **Visual Artifact:** Screenshot `ax-e2e-04-homonymous-dropdown.png` captured (SHA256: `387d560e7a2dc42f956c38b62b1c47de0eee48d005f73c44008fc81e0fea4b7e`).

### 5.5 AX-E2E-05: Concurrent Editing & CAS Conflict with Two Real Browsers
- **Two Real Browser Contexts:**
  - `contextA` (Page A) and `contextB` (Page B) both logged into the author account and navigated to the same entity editor.
- **Session A Save:** Submits patch with `expected_version = 2` -> **200 OK** (version becomes `3`).
- **Session B Stale Save:** Submits concurrent patch with stale `expected_version = 2` -> **409 Conflict** (`OptimisticLockError: Profile or Canon changed; reload before saving`).
- **Input Preservation:** Browser B form verified to retain author's typed input without wipeout.
- **No Overwrite:** Database verified; Session A's update was not overwritten.
- **Reconciliation Workflow:** Browser B clicks `"Tải phiên bản server để đối chiếu"` -> server comparison panel displays Session A's committed changes -> Browser B clicks `"Lưu bản đã đối chiếu"` -> **200 OK** (version becomes `4`).
- **Database Audit Check:** `narrative.entity_profile_audits` verified to record exactly 2 audit records corresponding to Session A and Session B's reconciled commit.
- **Same-Key Retry:** Repeat request with identical key returns cached 200 response without incrementing version.

### 5.6 AX-E2E-06: Temporal Cutoff Verification
- **Cutoff Applied:** `effective_from_chapter = 10`
- **Chapter 9 Evaluation (`chapter_number = 9`):**  
  Context package assembled by `PostgresNarrativeRepository.get_structured_context(chapter_number=9)`:  
  `approved_profile` for Lâm Phong is `{}` (empty dict). Profile is **EXCLUDED** because `9 < 10`.
- **Chapter 10 Evaluation (`chapter_number = 10`):**  
  Context package assembled by `PostgresNarrativeRepository.get_structured_context(chapter_number=10)`:  
  `approved_profile` is present with appearance `"Lâm Phong sau 10 chương tu luyện: phong trần dày dạn"`. Profile is **INCLUDED** because `10 >= 10`.
- **Database Integrity:** Zero fabricated events or facts created by cutoff update.

### 5.7 AX-E2E-07: Actual Writing Generation & Prompt Integrity Verification
- **Job Submission:**
  - Route: `POST /ai/writing/generations` (normal writing generation, no preview bypass).
  - Novel ID: `e78e28c9-...`
  - Chapter ID: `45fac9fb-...` (Chapter 4)
  - Correlation Token: `CORR_JOB_10ea7726d5` embedded inside `instruction`.
- **Terminal State Polling:** Job ID `245f820f-751e-5105-9228-16bfee14ea33` transitioned to `completed`.
- **PostgreSQL Exact Job Readback:**
  ```sql
  SELECT * FROM narrative.writing_generations WHERE job_id='245f820f-751e-5105-9228-16bfee14ea33';
  ```
  - Query executed by exact `job_id` (zero reliance on `ORDER BY created_at DESC LIMIT 1`).
  - `status`: `completed`.
  - `context_summary.context_packing_version`: `["context-budget-v1"]` (ContextBudgetPacker verified active).
  - `persisted_context_hash`: `1da8f7ef8378ed5a5eb010eb7abfaafe7df34b2c08bb7923fa75ed549357a60b`.
- **Independent Upstream Correlation & Recomputation:**
  - Upstream request located by exact correlation token `CORR_JOB_10ea7726d5`.
  - Story Brain JSON payload extracted from `Bối cảnh tiểu thuyết (Story Brain):`.
  - SHA256 recomputed according to the canonical contract:
    ```python
    recomputed_hash = hashlib.sha256(
        json.dumps(ctx_obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()
    ```
  - **Contract Integrity Assertion:** `recomputed_hash == persisted_context_hash` -> **`TRUE`** (`1da8f7ef8378ed5a5eb010eb7abfaafe7df34b2c08bb7923fa75ed549357a60b`).
  - **Inclusion / Exclusion Verification:**
    - Canonical entity `"Lâm Phong"` UUID `8194063a-...`: **PRESENT**.
    - Updated appearance: `"Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng"`: **PRESENT**.
    - Updated personality: `"Trầm tĩnh cẩn trọng và không dễ tin người"`: **PRESENT**.
    - Unrelated entity profiles (`unrelated_profiles_count`): **0** (strictly excluded).
    - Confidential sentinel note: **STRICTLY EXCLUDED**.

### 5.8 AX-E2E-08: Real Cross-Author Ownership & Security Boundaries
- **Production Auth Flow for Second Author:**
  - Registered `author_b_e2e` via `POST /auth/register`.
  - Promoted to `AUTHOR` via `POST /auth/become-author` (no direct SQL role updates).
  - Database confirmed `users.role = 'AUTHOR'`.
- **Novel & Entity Creation:** Author B created novel `d0e2f531-...` and entity `"Vân Tiêu"`.
- **Bidirectional Access Control:**
  - Author B token accessing Author A's private entity profile -> **HTTP 403 Forbidden** (zero private notes returned).
  - Author A token accessing Author B's private entity profile -> **HTTP 403 Forbidden**.
- **Edge Boundaries:**
  - Unauthenticated GET -> **HTTP 401 Unauthorized**.
  - Reader role GET -> **HTTP 403 Forbidden**.
  - Missing `Idempotency-Key` on PATCH -> **HTTP 422 Unprocessable Entity**.
  - Oversized payload (>4000 code points) -> **HTTP 422 Unprocessable Entity**.

---

## 6. Audit Evidence & Secret Hygiene Verification

### 6.1 Compact Sanitized Evidence Manifest
All evidence files are stored in `docs/development/integration/p1-author/evidence/2026-10-28-ax01-ax02-hardening/`:
- `acceptance-results.json`: Complete scenario metadata and assertion readbacks.
- `http-counts.json`: 204 HTTP requests (151x200, 15x201, 2x202, 5x304, 1x401, 3x403, 23x404, 1x409, 3x422).
- `blocked-external.json`: `[]` (Zero external outbound requests).
- `screenshot-manifest.json`: Cryptographic SHA256 checksums of masked screenshots.
- `trace-sanitization.json`: Playwright trace zip sanitization report (44 text entries sanitized, zero credential leaks).
- `environment.json`: Scrubbed compose project configuration.
- `runtime-topology.json`: Service network topology and environment flags.
- `commands-and-exits.jsonl`: Append-only command execution log with git SHAs, exit codes, and timestamps.
- `screenshots/`:
  - `ax-e2e-02-profile-saved.png` (`c44155e1817c4f8c4d5a9038b418ae5c824dcd0bde8e6264324a7fc7714ae911`)
  - `ax-e2e-03-private-notes-saved.png` (`9ae507ecba33db423a711ff19db896a166d3b39de9af896624e34a57163128f5`)
  - `ax-e2e-04-homonymous-dropdown.png` (`387d560e7a2dc42f956c38b62b1c47de0eee48d005f73c44008fc81e0fea4b7e`)

### 6.2 Secret Hygiene Scanner Results
Automated validator `scripts/verify_secret_hygiene.py` output:
```
[*] Running Secret Hygiene Negative Self-Tests (7 required classes)...
    [OK] Negative Test 1: JWT detected successfully
    [OK] Negative Test 2: Plaintext password detected successfully
    [OK] Negative Test 3: Authorization header / Bearer token detected successfully
    [OK] Negative Test 4: Private note sentinel detected successfully
    [OK] Negative Test 5: Audit snapshot leak detected successfully
    [OK] Negative Test 6: Raw profile note in HTTP payload detected successfully
    [OK] Negative Test 7: Private input inside trace ZIP detected successfully
    [OK] Positive Test 8: Sanitized manifest passed with zero violations

[OK] All 7 Negative Tests + Positive Clean Test PASSED!

[*] Scanning target path for credential hygiene: docs/development/integration/p1-author/evidence/2026-10-28-ax01-ax02-hardening
[OK] PASS: Zero credential hygiene violations found in docs/development/integration/p1-author/evidence/2026-10-28-ax01-ax02-hardening
```

---

## 7. Residual Scope Limitations

1. **AX-E2E-04 Homonym Authoring Contract Limitation:**
   - The current production domain model enforces uniqueness on `canonical_name` within a story brain (`POST /ai/story-brains/{novel_id}/author-entities` rejects duplicates with HTTP 422).
   - Homonym disambiguation is verified exclusively for the reading and editing layers via `SYNTHETIC_DB_FIXTURE`. Direct end-user creation of homonyms is **unsupported in Milestone Demo 09/11/2026** and will require a domain schema update in a subsequent milestone.
2. **Context Integrity Serialization Contract:**
   - Recomputing the context hash requires strict compliance with Python's canonical JSON serialization (`sort_keys=True, separators=(',', ':'), ensure_ascii=False`). Any external client attempting to independently compute context hashes must implement this canonical standard.

---

## 8. Final Integrated Recommendation

- **Verdict:** **`AX01_AX02_INTEGRATION_PASS`**
- **Readiness:** Hardened evidence confirms closed-loop integration between AX-01 and AX-02 across 7 fully passing scenarios and 1 partial passing scenario (homonym authoring limitation explicitly documented).
- **Handoff:** Ready for independent review by GPT-6.
