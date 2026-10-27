# P1 Integration Readiness Protocol & Codex Handoff Gate

**Document Version:** 1.0  
**Target Demo Date:** 09/11/2026  
**Baseline SHA:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**QA Working Branch:** `gemini/p1-demo-qa-prep`  

---

## 1. Operating Principle & Strict QA Boundary

Per mission instructions:
> "Chuẩn bị kiểm thử độc lập cho P1 Author Experience. Codex đang phát triển Editable Codex/Direct Author Edit trên branch khác.  
> Bạn sở hữu test infrastructure, fixture, regression, browser E2E và evidence. Không chỉnh runtime API/AI-service/UI production để làm test PASS."

Under no circumstances should QA alter production runtime logic, database schemas, or controller contracts to force green results on unimplemented or buggy features. If an endpoint is missing, returns 404/500, or exhibits race conditions, the result must be reported honestly as `BLOCKED` or `FAIL` with reproduction traces.

---

## 2. Seven-Step Integration Procedure (Upon Candidate Delivery)

When Codex completes development and delivers the integrated source candidate:

### Step 1 — Receive Exact Candidate SHA
- Verify the exact commit SHA and tree SHA provided by Codex.
- Validate that the commit descends from an authorized baseline and contains zero unscrubbed secrets.

### Step 2 — Create Fresh Acceptance Branch
```powershell
git fetch origin <codex-branch>
git checkout -b acceptance/p1-codex-integration-<short-sha> <codex-commit-sha>
git status --porcelain # Must be completely clean
```

### Step 3 — Run Focused New Feature Tests (Category A & B)
- Execute focused Editable Entity Profile test suite (`EEP-01` to `EEP-05`).
- Verify CAS 409 version conflict recovery modal.
- Verify two-tab concurrent editing without buffer destruction.
- Verify homonym resolution with exact UUID isolation.
- Verify Canon / Notes / Plans boundaries (`CNP-01` to `CNP-04`).

### Step 4 — Run Relevant P1 Core Regression Suite (Category E)
- Execute regression test suite:
  ```powershell
  python scripts/p1_final_acceptance.py web-units --output C:/task-evidence/integration-run
  python scripts/p1_final_acceptance.py ai-unit --output C:/task-evidence/integration-run
  python scripts/p1_final_acceptance.py backend-regression --output C:/task-evidence/integration-run
  ```
- Ensure zero regression in debounce saves, Undo/Redo ABA, outbox events, and SPA account switching.

### Step 5 — Run Mounted Browser E2E & Demo Journey
- Execute mounted browser E2E S09–S11 and demo journey:
  ```powershell
  python scripts/p1_final_acceptance.py browser-review --output C:/task-evidence/integration-run
  node --test web/tests/p1-author-demo-qa.browser.test.mjs
  ```
- Capture full Playwright traces, network HAR/JSON logs, and timestamped screenshots.

### Step 6 — Multi-Tier State Reconciliation
Perform cross-database readbacks comparing:
1. **PostgreSQL:**
   - `narrative.entities` (verify UUID, canonical_name, entity_type, profile_version, author_profile, private_author_notes).
   - `narrative.entity_profile_audits` (verify actor, request key, before/after audit records).
   - `narrative.events` (verify event status `ACTIVE` vs `SUPERSEDED`, provenance `AUTHOR_CORRECTION`).
   - `narrative.proposals` (verify proposal group acceptance and atomic status).
   - `chapter_revisions` & `revision_outbox_events` (verify SHA256 content hashes, parent linkages).
2. **MongoDB:**
   - `draft_chapters` (verify real-time dirty edits, version monotonically increasing).
3. **Budget Gateway / LLM Ledger:**
   - Confirm zero live cloud requests (`live_requests = 0`).
   - Verify fake upstream ledger records expected model alias `gemini-3.5-flash-lite`.
   - Verify zero leakage of author private secrets into context prompt.


### Step 7 — Issue Reporting with Exact Reproduction
- For any failure, document:
  - Exact command line and exit code.
  - Sanitized request/response HTTP payload.
  - Screenshot of UI failure state.
  - Database discrepancy readback.
- Never modify Codex source code to bypass test failures.

---

## 3. Definition of Done Checklist for Baseline Preparation

- [x] Clean worktree established at `C:\Users\Laptop\Novel_sharing_platform_qa` from `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`.
- [x] Working tree clean; git status confirmed with zero untracked runtime modifications.
- [x] Workflow contracts reviewed (`Pipeline_test/WORKFLOW_CONTRACT.md` v1.4, `REPRODUCE.md`, `FINAL_HANDOFF.md`, S09–S11 matrix).
- [x] Test runner baseline documented across Python pytest, tsx, Node test, and Docker orchestrator.
- [x] Four-tier test boundary defined (Offline Unit, Mounted Component, HTTP/DB Isolated E2E, Real-Provider Live).
- [x] Environment isolation verified via `scripts/p1_final_acceptance.py` (`provision`, `bridge-config`, `cleanup-owned`).
- [x] 23-case QA Matrix formulated with full test setups, browser actions, expected APIs, DB readbacks, and failure evidence.
- [x] Reusable Demo Fixture specified (Novel "Đại Lục Tinh Thần", 4 chapters, 2 characters, 1 location, 1 item, item state change in Ch 2, secret note in Ch 3, correction proposal, Ch 4 writing loop).
- [x] Executable public-API fixture seed script prepared (`scripts/p1_demo_fixture_seed.py`).
- [x] Playwright browser acceptance test created (`web/tests/p1-author-demo-qa.browser.test.mjs`).
- [x] Direct author edit / AX-01 tests labeled `NOT_RUN` on baseline, awaiting candidate code integration.
