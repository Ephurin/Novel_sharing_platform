# Public Readiness Security & Privacy Audit Report (PUBLIC-01B)

- **Target Repository:** `Ephurin/Novel_sharing_platform`
- **Audit Issue Ref:** #111 (`PUBLIC-01B`), follow-up to #109 (`PUBLIC-01`)
- **Reviewer / Verification Gate:** GPT-6 Independent Review
- **Auditor:** Gemini (Automated Security Audit Agent)
- **Base Commit Checkpoint (`origin/main`):** `7b2ad2e0751132da474fa9ffadc55f743a07bce5`
- **Audit Branch:** `gemini/public-01b-evidence-closure`
- **Execution Date:** 2026-11-09

---

## 1. Executive Summary & Verdict

### Final Readiness Verdict: `NOT_PUBLIC_READY`
The repository **MUST NOT** be toggled to public visibility at this time. While zero real user PII was found and current working code on `main` is clean of live credentials, public release is blocked by:
1. **P0 (Credential Verification):** Two historical commits in the Git commit DAG contain unencrypted API keys. The revocation status is currently classified as `REVOCATION_OWNER_ATTESTED` and requires owner-provided provider dashboard records.
2. **P1 (Repository Licensing):** The repository lacks an official `LICENSE` file (`OWNER_DECISION_REQUIRED`). Under copyright law, all rights remain reserved, preventing legal public redistribution.
3. **P1 (Hygiene / Trace Sanitization):** Two historical test trace ZIP files contain raw synthetic JWTs signed by local test harnesses. Although verified non-production, they should be cleaned using `scripts/p1_sanitize_trace.py` for pristine release.

---

## 2. Standardized Verification Status Matrix

Following Issue #111 requirements, all checks are categorized strictly into:
- `INDEPENDENTLY_VERIFIED_PASS`
- `OWNER_ATTESTED`
- `FAIL`
- `NOT_RUN`
- `BLOCKED`

| Item ID | Audit Area | Sub-Check | Verification Status | Exact Evidence & Details |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Git Census | Total refs, commits & DAG state | `INDEPENDENTLY_VERIFIED_PASS` | 1,561 commits across all refs (`git rev-list --all`); 73 branches; 0 tags. Head `origin/main` at `7b2ad2e0751132da474fa9ffadc55f743a07bce5`. |
| **SEC-02** | Git History | Historical presence of `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | 0 occurrences in entire Git DAG. Verified via `git rev-list --objects --all` and `git log --all --full-history -- .eval-private/`. |
| **SEC-03** | Git History | Historical Google Gemini API Key | `REVOCATION_OWNER_ATTESTED` | Commit `1a6950975efc4c11d47f7a39a0f10d9270efe022` (`tests/test.py`) contains raw Gemini key `AIzaSyB9EC****8TCc`. Owner attests revoked on GCP; awaiting provider console proof. |
| **SEC-04** | Git History | Historical Zalo / AQ API Keys | `REVOCATION_OWNER_ATTESTED` | Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (`key.txt`) contains 6 raw Zalo keys `AQ.Ab8RN6Jd****tdWg` .. `AQ.Ab8RN6Jo****FkPw`. Untracked in `695aa0ea`; owner attests revoked on provider portal. |
| **SEC-05** | Git History | OpenAI / Anthropic Keys in History | `INDEPENDENTLY_VERIFIED_PASS` | Only synthetic unit-test fixture string `sk-srs-SYNTHETIC-SECRET-0123456789` found in `srs-backend-rules.postgres.test.ts`. Zero live keys. |
| **SEC-06** | Git History | Private Keys / SSH / Certificates | `INDEPENDENTLY_VERIFIED_PASS` | 0 private keys (RSA, EC, OPENSSH) across entire history. |
| **TRC-01** | Traces (ZIP) | Real User PII in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` | 3,378 entries scanned across 4 ZIPs (96.5 MB). 0 real personal emails, 0 phone numbers, 0 real user identities. 29 unique test emails, 100% in `@example.invalid`. |
| **TRC-02** | Traces (ZIP) | Passwords in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` | 0 real user passwords. 4 occurrences in `playwright-trace.zip` are all `[REDACTED]` or local test fixtures (`password123`). |
| **TRC-03** | Traces (ZIP) | Token Hygiene in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` | Raw JWTs found in `PR-54-55-REVIEW/draft-trace.zip` (23) and `playwright-trace-s09-s11.zip` (62). 100% verified synthetic signing context (`iss: ephurin-api`, `aud: ephurin-client`, `sub`: UUID, no claims). Zero JWTs in `playwright-trace.zip` (84.6 MB) and component draft trace. |
| **TRC-04** | CI Evidence | Email identity in `ci-source.json` | `INDEPENDENTLY_VERIFIED_PASS` | `th****@gmail.com` appears 4 times in `head_commit.author/committer`. Verified as public Git commit author metadata recorded by GitHub Actions, not application user PII. |
| **IP-01** | Licensing | Root Repository `LICENSE` | `BLOCKED` / `OWNER_DECISION_REQUIRED` | No `LICENSE` file present on `main`. Requires owner explicit choice (e.g. MIT, Apache-2.0). |
| **IP-02** | Test Stories | Origin of test novels in `docs/Assets/` | `OWNER_ATTESTED` | Owner attests `test_story`, `test_story_2`, and Aethelgard are 100% AI-generated synthetic material. Accepted per Issue #111 instructions. |
| **IP-03** | Datasets | Benchmark dataset in `.data/` | `INDEPENDENTLY_VERIFIED_PASS` | Benchmark metadata (`aethelgard-retrieval-eval-v1.0.0`) verified present; raw full manuscript `Aethelgard_Toan_Bo_61_Chuong.md` verified absent from Git history. |
| **IP-04** | Datasets | Blind evaluation corpus `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | Protected by `.gitignore`; verified 0 commits and 0 objects in Git DAG. |
| **CI-01** | CI Workflows | Offline / Mock Execution Boundaries | `INDEPENDENTLY_VERIFIED_PASS` | Workflows use `ci-dummy-key-not-a-secret` and offline test runners. Zero billing or paid LLM invocation. |

---

## 3. Deep-Dive Audit Findings

### A. Full Git History & Secret Census (P0)

1. **Repository Topology & Census:**
   - Command: `git rev-list --all --count` -> **1,561 commits**.
   - Command: `git branch -a` -> **73 branch references**.
   - Command: `git tag -l` -> **0 tags**.
   - Tree & Blob Census: **24,228 Git objects** inspected.

2. **Absence of `.eval-private/` Across All Refs:**
   - Command: `git rev-list --objects --all | Select-String "eval-private"` -> **0 results**.
   - Command: `git log --all --full-history -- ".eval-private"` -> **0 results**.
   - Finding: The `.eval-private/` directory has **never been staged or committed** to any branch or ref in the repository's history. It remains strictly local and protected by `.gitignore`.

3. **Historical Secret Leaks in Git History:**
   - **Commit `1a6950975efc4c11d47f7a39a0f10d9270efe022` (2026-04-17):**
     - File: `tests/test.py`
     - Content: `client = genai.Client(api_key="AIzaSyB9EC****8TCc")`
     - Status: The file was removed/relocated in commit `981b652b`, but the historical commit object is reachable in the repository's permanent history.
   - **Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (2026-09-22):**
     - File: `key.txt`
     - Content: 6 raw API keys formatted as `AQ.Ab8RN6...`:
       - Key 1: `AQ.Ab8RN6Jd****tdWg`
       - Key 2: `AQ.Ab8RN6KV****ngHQ`
       - Key 3: `AQ.Ab8RN6L7****8vFQ`
       - Key 4: `AQ.Ab8RN6Iu****qF3A`
       - Key 5: `AQ.Ab8RN6Jg****GEqA`
       - Key 6: `AQ.Ab8RN6Jo****FkPw`
     - Status: Untracked in commit `695aa0ea28ce2bcd55604933bff5914e4141799f` and added to `.gitignore`. Retained in commit blob `35ab7405`.

---

### B. Revocation Evidence Specification (P0)

Because autonomous agents cannot and must not access private provider dashboards without authorization, revocation status is classified as **`REVOCATION_OWNER_ATTESTED`**.

To upgrade this check to verified status prior to public release, the repository owner must provide the following non-sensitive verification evidence:

1. **Google Cloud Console (Gemini API Key):**
   - Project Name / Project ID: *(Redacted / Non-sensitive prefix)*
   - Key Suffix: `...8TCc`
   - Key Status: `Deleted` or `Disabled`
   - Deletion / Revocation Timestamp: `YYYY-MM-DD HH:MM:SS UTC`
   - Verification Method: GCP Console screenshot or GCP Cloud Audit Log entry showing `DeleteApiKey` or `DisableApiKey`.

2. **Zalo / Third-Party Provider Portal:**
   - Application ID / Portal Name: *(Non-sensitive reference)*
   - Key Suffixes: `...tdWg`, `...ngHQ`, `...8vFQ`, `...qF3A`, `...GEqA`, `...FkPw`
   - Status: `Revoked` / `Regenerated` / `Deleted`
   - Revocation Timestamp: `YYYY-MM-DD HH:MM:SS UTC`

---

### C. Playwright Trace Archives & Privacy Audit (P0/P1)

An exhaustive, non-sampling stream audit was conducted across all 4 Playwright trace archives currently tracked on `main`.

| Archive Path | Size | Entries | Real PII | Synthetic Emails | Real Passwords | Synthetic JWTs |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `docs/development/PR-54-55-REVIEW/draft-trace.zip` | 738 KB | 96 | **0** | 0 | **0** | 23 (`iss: none`, `sub`: UUID) |
| `docs/development/integration/p1-author/evidence/playwright-trace-s09-s11.zip` | 10.3 MB | 311 | **0** | 1 (`author_e2e_0652d0@example.invalid`) | **0** | 62 (`iss: ephurin-api`, `sub`: UUID) |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/browser/playwright-trace.zip` | 84.6 MB | 2,867 | **0** | 28 (`@example.invalid`) | **0** (4 redacted/fixtures) | **0** |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/components/draft-persistence-browser/draft-trace.zip` | 838 KB | 104 | **0** | 0 | **0** | **0** |
| **Total** | **96.5 MB** | **3,378** | **0** | **29 unique** | **0** | **85 total** |

#### Safe Claims regarding Synthetic JWTs:
- Decoded Header / Payload: No user emails or personal claims exist in JWT tokens.
- Subject (`sub`): Randomly generated UUIDs (`[0-9a-f\-]{36}`).
- Issuer (`iss`): `ephurin-api` or none.
- Audience (`aud`): `ephurin-client` or none.
- Signing key: Generated by local test runner during offline integration rehearsal.

#### CI Source Email Investigation:
- Inspected:
  - `docs/development/integration/p1-author/fe-ai-contract-alignment/evidence/ci-source.json`
  - `docs/development/integration/p1-author/fe-ai-contract-alignment/c01-atomic-approval/evidence/ci-source.json`
- Found: `th****@gmail.com` under `workflows[].run.head_commit.author.email` and `committer.email`.
- Forensic Classification: This email is **Git author commit metadata** captured verbatim by the GitHub Actions API response. It matches the public author email found in standard `git log` commits by the owner. It is **not application user PII**. Redaction is recommended as optional hygiene before public release if author anonymity is desired.

---

### D. Ownership, Licensing & Public-CI Boundaries (P1)

1. **Repository License (`OWNER_DECISION_REQUIRED`):**
   - Current state: No `LICENSE` file in the root or any subfolder.
   - Requirement: The owner must explicitly choose and commit a license (e.g. MIT, Apache-2.0, or proprietary). The audit cannot default to MIT without explicit owner consent.

2. **Dataset & Content Ownership (`OWNER_ATTESTED`):**
   - The owner attests that all story samples (`docs/Assets/test_story/`, `docs/Assets/test_story_2/`) and the Aethelgard benchmark corpus (`.data/Frozen_v1/`) are **100% AI-generated synthetic material**.
   - Per Issue #111 guidelines, this attestation is formally accepted as owner attestation, removing third-party copyright claims.
   - The full manuscript `Aethelgard_Toan_Bo_61_Chuong.md` is confirmed absent from Git history.

3. **Public CI Boundary Check:**
   - `.github/workflows/` inspection confirms all workflow runs use offline / mock test execution:
     - `GEMINI_API_KEY: ci-dummy-key-not-a-secret`
     - No external API billing calls.
     - Offline test matrices prevent accidental quota consumption or token leakage on PR forks.

---

## 4. Remediation Checklist Prior to Public Toggle

- [ ] **Owner Action 1 (P0):** Record provider dashboard revocation proof for Google key (`...8TCc`) and Zalo keys (`...tdWg` etc.) in security closure notes.
- [ ] **Owner Action 2 (P1):** Add an explicit `LICENSE` file to the root of the repository.
- [ ] **Optional Hygiene (P1):** Run `scripts/p1_sanitize_trace.py` to sanitize `PR-54-55-REVIEW/draft-trace.zip` and `playwright-trace-s09-s11.zip`.
- [ ] **Optional Privacy (P2):** Mask personal Git author email in static `ci-source.json` files if author anonymity is preferred.

---
*End of Public Readiness Security Audit Report.*
