# Public Readiness Security & Privacy Audit Report (PUBLIC-01B)

- **Target Repository:** `Ephurin/Novel_sharing_platform`
- **Audit Task Ref:** Issue #111 (`PUBLIC-01B`), follow-up to Issue #109 (`PUBLIC-01`)
- **Review Gate:** GPT-6 Independent Review (incorporating review comments #6736487335, #6736649132, and #6736740206)
- **Base Checkpoint (`origin/main`):** `dc38590124e0b00901930669544e739d2ecebe6b` (PR #113 merged)
- **Audit Branch:** `gemini/public-01b-evidence-closure` (PR #112)
- **Audit Version:** v2.0 (Post PR #113 merge and GPT-6 review remediation)
- **Execution Date:** 2026-11-09

---

## 1. Executive Summary & Verdict

### Final Readiness Verdict: `NOT_PUBLIC_READY`

The repository **MUST REMAIN PRIVATE** at this time. Changing visibility to public is blocked by specific P0 and P1 decision gates that require explicit owner decisions and external verification:

1. **P0 (Historical Credential Revocation):** Two historical commits in the permanent Git DAG contain raw API keys:
   - Commit `1a695097...`: Google Gemini API key (`AIzaSyB9EC****8TCc`). Status: `REVOCATION_OWNER_ATTESTED`.
   - Commit `35ab7405...`: `key.txt` containing 6 Zalo/AQ keys (`AQ.Ab8RN6Jd****tdWg` .. `AQ.Ab8RN6Jo****FkPw`). Status: `OWNER_ATTESTED_DELETED`.
   - Both findings remain permanently accessible in Git history even though untracked in current HEAD. Verified proof from provider management dashboards (or an explicit owner risk-acceptance decision) is required prior to public release.
2. **P1 (Repository Licensing Policy):** The root directory lacks an official `LICENSE` file (`OWNER_DECISION_REQUIRED`). While public visibility on GitHub is technically permitted without a license (under standard GitHub Terms of Service view/fork terms), an explicit open-source or proprietary licensing choice is an essential project policy requirement before public exposure.
3. **P1 (Trace Token Hygiene):** Two historical Playwright trace archives contain raw synthetic JWTs generated during offline integration testing. While verified to be local mock tokens, sanitizing them via `scripts/p1_sanitize_trace.py` is strongly recommended for pristine release hygiene.

---

## 2. Standardized Verification Status Matrix

In compliance with Issue #111 and GPT-6 review criteria, each check is strictly classified into:
- `INDEPENDENTLY_VERIFIED_PASS`: Directly validated via reproducible automated tooling or file inspection.
- `OWNER_ATTESTED`: Stated by owner/operator (e.g. key deletion, AI-generated origins); accepted as an origin assertion, not mathematical proof against third-party claims.
- `OWNER_DECISION_REQUIRED` / `BLOCKED`: Item awaiting explicit owner determination.
- `NOT_RUN`: Checks intentionally omitted or outside automated inspection scope (e.g. optical character recognition on image frames).
- `FAIL`: Confirmed active leak or unremediated security defect.

| Item ID | Audit Area | Sub-Check | Verification Status | Exact Evidence & Details |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Git Census | Total refs, commits & DAG state | `INDEPENDENTLY_VERIFIED_PASS` | 1,565 commits across all refs (`git rev-list --all`); 73 branches; 0 tags. Head `origin/main` at `dc38590124e0b00901930669544e739d2ecebe6b`. |
| **SEC-02** | Git History | Historical presence of `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | **0 occurrences** across all 24,232 Git objects in entire DAG. Verified via `git rev-list --objects --all` and `git log --all --full-history -- .eval-private/`. |
| **SEC-03** | Git History | Historical Google Gemini API Key | `REVOCATION_OWNER_ATTESTED` | Commit `1a6950975efc4c11d47f7a39a0f10d9270efe022` (`tests/test.py`) contains raw Gemini key `AIzaSyB9EC****8TCc`. Owner attests revoked on GCP; awaiting private provider console proof. |
| **SEC-04** | Git History | Historical Zalo / AQ API Keys | `OWNER_ATTESTED_DELETED` | Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (`key.txt`) contains 6 raw Zalo keys `AQ.Ab8RN6Jd****tdWg` .. `AQ.Ab8RN6Jo****FkPw`. Owner confirms deleted long ago on provider account and replaced by 4 local keys. |
| **SEC-05** | Git History | Local Replacement AQ Keys | `INDEPENDENTLY_VERIFIED_PASS` (Exclusion) | Confirmed that `key.txt` and `.env*` are strictly ignored by `.gitignore` (lines 20-24). The 4 replacement keys are kept locally outside the repository and are not committed. |
| **SEC-06** | Git History | OpenAI / Anthropic Keys | `INDEPENDENTLY_VERIFIED_PASS` | 0 live keys. Only synthetic test string `sk-srs-SYNTHETIC-SECRET-0123456789` in unit test file `srs-backend-rules.postgres.test.ts`. |
| **SEC-07** | Git History | Private Keys / SSH / Certs | `INDEPENDENTLY_VERIFIED_PASS` | 0 private keys (RSA, EC, OPENSSH) across all commits. |
| **TRC-01** | Traces (ZIP) | Real User PII in 4 ZIP Archives (Text/JSON) | `INDEPENDENTLY_VERIFIED_PASS` | All 299 text/JSON/HAR entries across 4 ZIPs (96.5 MB) audited. **0 real personal emails, 0 phone numbers, 0 real names**. 29 unique test emails, 100% in `@example.invalid`. |
| **TRC-02** | Traces (ZIP) | Binary Screenshot Content (OCR) | `NOT_RUN` / `OUT_OF_SCOPE` | 3,079 binary JPEG screencast frames accounted for in trace archives. Optical character recognition (pixel-level text extraction) was NOT performed on binary images. |
| **TRC-03** | Traces (ZIP) | Passwords in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` | 0 real user passwords. 4 password fields in `playwright-trace.zip` are all `[REDACTED]` or local test fixtures (`password123`). |
| **TRC-04** | Traces (ZIP) | Token Hygiene in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` | Raw JWTs found in `PR-54-55-REVIEW/draft-trace.zip` (23) and `playwright-trace-s09-s11.zip` (62). 100% verified test-harness signing context (`iss: ephurin-api`, `aud: ephurin-client`, `sub`: UUID, no personal claims). 0 JWT in `playwright-trace.zip` (84.6 MB) and component draft trace. |
| **TRC-05** | CI Evidence | Email identity in `ci-source.json` | `INDEPENDENTLY_VERIFIED_PASS` | `th****@gmail.com` appears 4 times in `workflows[].run.head_commit.author/committer`. Verified as public Git commit author metadata recorded by GitHub Actions API, not application user PII. |
| **IP-01** | Nested License | Removal of miscopied `SKILL/LICENSE` | `OWNER_ATTESTED_MISTAKEN_COPY` / `REMOVED_FROM_CURRENT_TREE` | File from `uLearnBox` removed from current tree via PR #113 (merge `dc385901`). Historical blobs in commit `6320ebc7` remain in Git DAG. `SKILL/CONTRIBUTING.md` preserves copy-prevention warning. |
| **IP-02** | Root License | Root Repository `LICENSE` | `BLOCKED` / `OWNER_DECISION_REQUIRED` | No root `LICENSE` file on `main`. Public visibility does not strictly require an OSS license, but project redistribution policy requires owner choice (Option A: Restrictive vs Option B: Open-Source). |
| **IP-03** | Test Stories | Origin of test novels in `docs/Assets/` | `OWNER_ATTESTED_AI_GENERATED` | Owner attests `test_story`, `test_story_2` and Aethelgard are 100% AI-generated synthetic material. Recorded as an origin assertion. |
| **IP-04** | Datasets | Benchmark dataset in `.data/` | `INDEPENDENTLY_VERIFIED_PASS` | Benchmark metadata (`aethelgard-retrieval-eval-v1.0.0`) verified present; raw full manuscript `Aethelgard_Toan_Bo_61_Chuong.md` verified absent from Git history. |
| **IP-05** | Datasets | Blind evaluation corpus `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | Protected by `.gitignore`; verified 0 commits and 0 objects in Git DAG. |
| **CI-01** | CI Workflows | Offline / Mock Execution Boundaries | `INDEPENDENTLY_VERIFIED_PASS` | All 5 workflows in `.github/workflows/` use `ci-dummy-key-not-a-secret` and offline test runners. Zero billing or live LLM invocation. Public runner execution independently verified via probe #110. |

---

## 3. Deep-Dive Audit Findings & Remediation

### A. Full Git History & Secret Census (P0)

1. **Repository Topology & Object Census:**
   - Commit count across all refs: **1,565 commits** (`git rev-list --all --count`).
   - Active branch references: **73 branches** (`git branch -a`).
   - Tag references: **0 tags** (`git tag -l`).
   - Object database census: **24,232 Git objects** inspected.
   - Current `main` HEAD: `dc38590124e0b00901930669544e739d2ecebe6b` (following merge of PR #113).

2. **Forensic Verification of `.eval-private/`:**
   - Command: `git rev-list --objects --all | Select-String "eval-private"` -> **0 matches**.
   - Command: `git log --all --full-history -- ".eval-private"` -> **0 commits**.
   - Finding: The `.eval-private/` directory and its contents have **never been staged or committed** to any branch or ref in the repository's history. It remains strictly local and protected by `.gitignore` (line 81).

3. **Historical Secret Findings in Git History:**
   - **Commit `1a6950975efc4c11d47f7a39a0f10d9270efe022` (2026-04-17):**
     - File: `tests/test.py`
     - Content: `client = genai.Client(api_key="AIzaSyB9EC****8TCc")`
     - Finding Status: `tests/test.py` was removed in commit `981b652b`, but the historical commit object is reachable in the repository's permanent Git DAG.
   - **Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (2026-09-22):**
     - File: `key.txt`
     - Content: 6 raw API keys formatted as `AQ.Ab8RN6...`:
       - Key 1: `AQ.Ab8RN6Jd****tdWg`
       - Key 2: `AQ.Ab8RN6KV****ngHQ`
       - Key 3: `AQ.Ab8RN6L7****8vFQ`
       - Key 4: `AQ.Ab8RN6Iu****qF3A`
       - Key 5: `AQ.Ab8RN6Jg****GEqA`
       - Key 6: `AQ.Ab8RN6Jo****FkPw`
     - Finding Status: Untracked in commit `695aa0ea28ce2bcd55604933bff5914e4141799f` and added to `.gitignore`. Retained in historical commit blob `35ab7405`.

---

### B. Nested License Provenance & Resolution (PR #113)

1. **Background & Discovery (GPT-6 Finding F-01):**
   - The file `SKILL/LICENSE` existed in the repository from the initial scaffold commit `6320ebc769c722710f79f155cb7f4bf59a9f9ff6` (2026-04-17).
   - The file bore the header *"PROPRIETARY AND CONFIDENTIAL LICENSE"*, identified **uLearnBox** as copyright owner, purported to cover *"This repository and all files"*, and prohibited redistribution and external AI access.
2. **Owner Attestation & Team Rights:**
   - On 2026-11-09, the repository owner confirmed that `SKILL/LICENSE` was mistakenly copied from an earlier project (uLearnBox) during initial scaffolding, and that the Ephurin team owns the rights to all Ephurin platform materials.
3. **Remediation Action:**
   - Single-file deletion executed via PR #113 and merged into `main` at `dc38590124e0b00901930669544e739d2ecebe6b`.
   - Current working tree on `main` no longer contains `SKILL/LICENSE`.
4. **Historical Provenance Note:**
   - While removed from the active tree, the historical text remains in commit `6320ebc7` in Git history.
   - `SKILL/CONTRIBUTING.md` deliberately preserves the instruction prohibiting copying code from the earlier project.

---

### C. Credential Revocation & Owner Attestation

1. **Google Gemini API Key (`AIzaSyB9EC****8TCc`):**
   - Status: `REVOCATION_OWNER_ATTESTED`.
   - The owner attests that this key has been disabled/revoked on Google Cloud Console.
   - Requirement: For complete audit closure, the owner should retain a private, non-public verification record (e.g. GCP Cloud Audit Log showing `DeleteApiKey` or GCP Console screenshot showing key `...8TCc` disabled/deleted). Do not commit private console screenshots into the repository.
2. **Historical 6 Zalo / AQ API Keys (`AQ.Ab8RN6...`):**
   - Status: `OWNER_ATTESTED_DELETED`.
   - Owner Attestation (Comment #6736740206): The owner confirms that all 6 historical keys from `key.txt` (commit `35ab7405`) were **deleted long ago** from the provider account and are no longer active.
   - 4 Replacement Keys: Kept locally on the owner's workstation outside the repository.
   - Exclusion Verification: Verified that `key.txt` and `.env*` are strictly ignored by `.gitignore` (lines 20-24). The 4 replacement keys are not tracked in Git.
   - Release Decision: If provider logs for the 6 old keys are no longer retrievable, the owner may proceed on the basis of an explicit **risk-acceptance decision** tied to owner attestation, rather than claiming an unverified automated pass.

---

### D. Playwright Trace Archives & Privacy Audit (P0/P1)

An exhaustive member-by-member stream inspection was performed across all 4 Playwright trace archives currently tracked on `main`.

| Archive Path | Total Size | Total Entries | Scanned Text Entries | Binary JPEG Frames | Real PII (Names/Emails/Phones) | Synthetic Test Emails | Real Passwords | Synthetic JWT Tokens |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `docs/development/PR-54-55-REVIEW/draft-trace.zip` | 738 KB | 96 | 29 | 67 | **0** | 0 | **0** | 23 (`iss: none`, `sub`: UUID) |
| `docs/development/integration/p1-author/evidence/playwright-trace-s09-s11.zip` | 10.3 MB | 311 | 48 | 263 | **0** | 1 (`author_e2e_0652d0@example.invalid`) | **0** | 62 (`iss: ephurin-api`, `sub`: UUID) |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/browser/playwright-trace.zip` | 84.6 MB | 2,867 | 193 | 2,674 | **0** | 28 (`@example.invalid`) | **0** (4 redacted/fixtures) | **0** |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/components/draft-persistence-browser/draft-trace.zip` | 838 KB | 104 | 29 | 75 | **0** | 0 | **0** | **0** |
| **Total** | **96.5 MB** | **3,378** | **299** | **3,079** | **0** | **29 unique** | **0** | **85 total** |

#### Scope & Limitations of PII Inspection:
- **Text & Structured Traces:** 100% of the 299 JSON, text, log, and HAR entries were parsed. Zero real personal identities, phone numbers, or private personal emails were found. All 29 unique email addresses detected belong to the test-only domain `@example.invalid`.
- **Binary Image Inspection (`NOT_RUN / OUT_OF_SCOPE`):** The 3,079 binary screencast JPEG frames captured during Playwright browser automation were verified present. However, optical character recognition (OCR) was NOT performed on individual image pixels. Visual inspection indicates standard automated browser UI views (e.g. Zen mode, Story Bible mockups).

#### Synthetic JWT Signing Context:
- The 85 JWT occurrences across `draft-trace.zip` (23) and `playwright-trace-s09-s11.zip` (62) exhibit consistent test-harness claims:
  - `sub`: Random UUID (`[0-9a-f\-]{36}`)
  - `role`: `AUTHOR`
  - `iss`: `ephurin-api` or none
  - `aud`: `ephurin-client` or none
  - No personal email, name, or external provider claims.
- **Hygiene Recommendation:** While these tokens are local test artifacts rather than live session credentials, running `scripts/p1_sanitize_trace.py` to strip raw tokens before public release is recommended to maintain immaculate repository hygiene.

#### CI Source Email Investigation:
- File 1: `docs/development/integration/p1-author/fe-ai-contract-alignment/evidence/ci-source.json`
- File 2: `docs/development/integration/p1-author/fe-ai-contract-alignment/c01-atomic-approval/evidence/ci-source.json`
- Finding: The email `th****@gmail.com` appears in `workflows[].run.head_commit.author.email` and `committer.email`.
- Forensic Determination: This value is **Git commit author metadata** captured directly from the GitHub Actions workflow event payload. It is identical to the author metadata recorded in the public Git commit log. It does not represent application user PII. The owner may optionally sanitize this static JSON if author email privacy is desired.

---

### E. Licensing Policy vs Repository Visibility (P1)

A crucial legal and technical distinction must be maintained:

1. **GitHub Platform Visibility:**
   - GitHub does NOT require a repository to contain an open-source `LICENSE` to be made public.
   - Under the [GitHub Terms of Service (Section D.4)](https://docs.github.com/en/site-policy/github-terms/of-service#4-license-grant-to-other-users), setting a repository to public grants other GitHub users the right to view and fork the repository on GitHub. All other copyright rights remain reserved by the repository owner by default.
2. **Project Policy & Owner Licensing Choice (`OWNER_DECISION_REQUIRED`):**
   - The absence of a root `LICENSE` file is an internal project governance blocker, not an Actions or platform barrier.
   - The owner must decide between two pathways:
     - **Option A (Restrictive Public Visibility):** Toggle visibility to public without an open-source license. The codebase remains "All Rights Reserved" except for standard GitHub view/fork terms. Suitable if commercial protection is required.
     - **Option B (Open-Source Release):** The owner selects and commits an approved OSI license (e.g. MIT, Apache-2.0, BSD-3-Clause) after confirming contributor consent across all team contributions.
   - **Gemini Restriction:** Autonomous agents will NOT add or fabricate a `LICENSE` file without express owner instruction.

3. **Dataset & Story Content Rights (`OWNER_ATTESTED_AI_GENERATED`):**
   - The owner attests that all story samples under `docs/Assets/test_story/` ("Tàn Tro Của Ashenhold"), `docs/Assets/test_story_2/` ("Thiếu Niên Vùng Biên Thùy"), and the Aethelgard benchmark corpus (`.data/Frozen_v1/`) are **100% AI-generated synthetic material**.
   - This statement is recorded as an owner origin attestation. The full 61-chapter manuscript `Aethelgard_Toan_Bo_61_Chuong.md` is confirmed absent from Git history.

---

### F. CI Boundaries & Workflows Inventory (P1)

All 5 GitHub Actions workflow files under `.github/workflows/` were audited for external dependencies, network access, and model billing:

1. **`defense-demo-contract.yml`:**
   - Trigger: Push/PR on demo contract paths.
   - Execution: Runs local schema validations and unit checks. No live LLM calls.
2. **`eval-pilot.yml`:**
   - Trigger: Manual dispatch (`workflow_dispatch`).
   - Execution: Executes `run_eval_01.py` with mock / offline mode flags. No external API key required.
3. **`p2-setup-provenance.yml`:**
   - Trigger: Pull request.
   - Execution: Local Postgres/Node test runners for setup provenance. Offline.
4. **`p7-semantic-memory.yml`:**
   - Trigger: Pull request.
   - Execution: Explicitly sets `GEMINI_API_KEY: ci-dummy-key-not-a-secret` and validates fallback/offline vector mock behavior. Zero billing.
5. **`p8-cutover.yml`:**
   - Trigger: Pull request.
   - Execution: Automated Docker container migration test against local PostgreSQL 16. Offline.

**Independent Public Runner Verification:**
Issue #110 probe verified that public `ubuntu-latest` GitHub Actions runners execute successfully under the repository owner account without billing blocks.

---

## 4. Final Owner Checklist Prior to Public Visibility Toggle

The following actions remain exclusively with the repository owner:

- [ ] **Owner Gate 1 (P0 - Secret Revocation):** Verify that historical Google Gemini key `...8TCc` is deleted/disabled in GCP Console. Retain non-public verification record in private owner archive.
- [ ] **Owner Gate 2 (P0 - Historical AQ Keys):** Acknowledge owner attestation that the 6 historical Zalo keys in commit `35ab7405` were deleted from the provider account, and execute risk acceptance for their presence in Git history.
- [ ] **Owner Gate 3 (P1 - Licensing Choice):** Decide between Option A (Public with All Rights Reserved) or Option B (Commit an explicit `LICENSE` file such as MIT or Apache-2.0).
- [ ] **Owner Gate 4 (P1 - Contributor Consent):** Confirm that all team contributors consent to public repository visibility under the selected licensing option.
- [ ] **Optional Hygiene (P1 - Trace Sanitization):** Run `scripts/p1_sanitize_trace.py` to sanitize `PR-54-55-REVIEW/draft-trace.zip` and `playwright-trace-s09-s11.zip`.
- [ ] **Optional Privacy (P2 - Author Email):** Scrub or replace `th****@gmail.com` in `ci-source.json` with a GitHub noreply address if personal email anonymity is desired.

---

## 5. Reproducibility Appendix

### A. Tooling & Environment
- **Operating System:** Windows 11 (build 10.0.26200)
- **Python Runtime:** Python 3.11.9
- **Git Version:** git version 2.55.0.windows.3
- **detect-secrets:** version 1.5.0
- **Audit Script Digests:**
  - `scan_git_secrets.py`: SHA-256 `f1bbe6f09825a7bb3fb26cfb84387b7fc9cffd593f970c8f17abe238615f8eb5`
  - `exhaustive_trace_zip_audit.py`: SHA-256 `abc8bd837f1d933aed875d9f3beb95b8b1d66edccbcc9da6ee7b2f525f748d3e`

### B. Exact Reproducible Commands & Exit Codes
1. **Total Commit Census:**
   ```bash
   git rev-list --all --count
   # Exit Code: 0 | Output: 1565
   ```
2. **Historical `.eval-private/` DAG Search:**
   ```bash
   git rev-list --objects --all | Select-String "eval-private"
   # Exit Code: 0 | Output: 0 lines (clean)
   git log --all --full-history -- ".eval-private"
   # Exit Code: 0 | Output: 0 commits (clean)
   ```
3. **Full History Secret Stream Scan:**
   ```bash
   python scripts/audit/scan_git_secrets.py
   # Exit Code: 0 | Commits Scanned: 1565 | Findings: 2 historical leaks (Commit 1a695097, Commit 35ab7405)
   ```
4. **Exhaustive ZIP Trace Member Inspection:**
   ```bash
   python scripts/audit/exhaustive_trace_zip_audit.py
   # Exit Code: 0 | Archives: 4 | Entries: 3378 (299 text, 3079 binary) | PII Found: 0
   ```
5. **Gitignore Path Exclusion Check:**
   ```bash
   git check-ignore -v key.txt .env .env.local
   # Exit Code: 0 | Matching Rules: .gitignore:20, .gitignore:23
   ```

---
*End of Public Readiness Security Audit Report (PUBLIC-01B).*
