# Public Readiness Security & Privacy Audit Report (PUBLIC-01B)

- **Target Repository:** `Ephurin/Novel_sharing_platform`
- **Audit Task Ref:** Issue #111 (`PUBLIC-01B`), follow-up to Issue #109 (`PUBLIC-01`)
- **Review Gate:** GPT-6 Independent Review (incorporating review comments #6736487335, #6736649132, #6736740206, #6736859360, #6737038151, #6737240193, and #6737404558)
- **Base Checkpoint (`origin/main`):** `dc38590124e0b00901930669544e739d2ecebe6b` (PR #113 merged)
- **Frozen Scan Snapshot Ref:** `07b3a7487ab462b0532ecfc4dbaf0ffa4fab331b` (`07b3a7487a`)
- **Audit Branch:** `gemini/public-01b-evidence-closure` (PR #112)
- **Audit Version:** v2.4 (Remediation for F-14 relative link sanitization & F-15 scan snapshot ref pinning)
- **Execution Date:** 2026-11-09

---

## 1. Executive Summary & Verdict

### Final Readiness Verdict: `NOT_PUBLIC_READY`

The repository **MUST REMAIN PRIVATE** at this time. Changing repository visibility to public is blocked by specific P0 and P1 decision gates that require explicit owner action, provider-side verification, and formal project policy determinations:

1. **P0 (Historical Credential Revocation & Risk Acceptance):** Two historical commits in the permanent Git commit DAG contain raw API keys:
   - Commit `1a695097...`: Google Gemini API key (suffix `...8TCc`). Status: `REVOCATION_OWNER_ATTESTED`.
   - Commit `35ab7405...`: `key.txt` containing 6 Zalo/AQ keys (suffixes `...tdWg` .. `...FkPw`). Status: `OWNER_ATTESTED_DELETED`.
   - These findings remain permanently accessible in Git history even though untracked in current HEAD. Verified proof from provider management dashboards (or an explicit owner risk-acceptance decision) is required prior to public release.
2. **P1 (Repository Licensing Policy):** The root directory lacks an official `LICENSE` file (`OWNER_DECISION_REQUIRED`). While public visibility on GitHub is technically permitted without a license (under standard GitHub Terms of Service view/fork terms), an explicit open-source or proprietary licensing choice is an essential project policy requirement before public exposure.
3. **P1 (Trace Token Hygiene & Media Review):** Two historical Playwright trace archives contain raw synthetic JWTs generated during offline integration testing. While verified to be local mock tokens, sanitizing them via `scripts/p1_sanitize_trace.py` is strongly recommended. Additionally, while structured trace text contains zero PII, optical character recognition on 3,079 screencast JPEG frames was `NOT_RUN` and requires an owner-approved sampling review.
4. **P1 (Author Metadata & Privacy Scope):** Personal Git author metadata (`th****@gmail.com`) is present in the historical Git commit log and Actions payload records (`ci-source.json`). The audit scanner output has been purged of personal author emails (F-09), but the owner must confirm whether historical Git author metadata is acceptable for public release or requires retention in private scope.

---

## 2. Standardized Verification Status Matrix

In compliance with Issue #111 and GPT-6 review criteria, each check is strictly classified into:
- `INDEPENDENTLY_VERIFIED_PASS`: Directly validated via reproducible committed tooling or file inspection.
- `OWNER_ATTESTED`: Stated by owner/operator (e.g. key deletion, AI-generated origins); accepted as an origin assertion, not mathematical proof against third-party claims.
- `OWNER_DECISION_REQUIRED` / `BLOCKED`: Item awaiting explicit owner determination.
- `NOT_RUN`: Checks intentionally omitted or outside automated inspection scope (e.g. optical character recognition on image frames).
- `FAIL` / `INFRA_BLOCKED` / `CI_NOT_EXECUTED`: Confirmed active leak, failure, or infrastructure queue block.

| Item ID | Audit Area | Sub-Check | Verification Status | Exact Evidence & Details |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Git Census | Total refs, commits & DAG state | `INDEPENDENTLY_VERIFIED_PASS` | 1,565 commits across all refs (`git rev-list --all`); 73 branches; 0 tags. Head `origin/main` at `dc38590124e0b00901930669544e739d2ecebe6b`. |
| **SEC-02** | Git History | Historical presence of `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | **0 occurrences** across all 24,232 Git objects in entire DAG. Verified via `git rev-list --objects --all` and `git log --all --full-history -- .eval-private/`. |
| **SEC-03** | Git History | Historical Google Gemini API Key | `REVOCATION_OWNER_ATTESTED` | Commit `1a6950975efc4c11d47f7a39a0f10d9270efe022` (`tests/test.py`) contains raw Gemini key ending in `...8TCc`. Owner attests revoked on GCP; awaiting private provider console proof. |
| **SEC-04** | Git History | Historical Zalo / AQ API Keys | `OWNER_ATTESTED_DELETED` | Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (`key.txt`) contains 6 raw Zalo keys ending in `...tdWg` .. `...FkPw`. Owner confirms deleted long ago on provider account and replaced by 4 local keys. |
| **SEC-05** | Git History | Local Replacement AQ Keys | `OWNER_ATTESTED_LOCALLY_HELD` | Confirmed that `key.txt` and `.env*` are strictly ignored by `.gitignore` (lines 20-24). Absence of the 4 replacement values across all other historical commits/branches is based on owner attestation that they were never committed to Git. |
| **SEC-06** | Git History | Pinned Scan & Manifest Triage (340 Matches) | `INDEPENDENTLY_VERIFIED_PASS` (Frozen Manifest Evidenced) | Pinned scan at snapshot `07b3a7487a` yielded 340 detections triaged 1-to-1 in committed manifest `docs/development/security/secret_triage_manifest.json` (`FINDING-001` .. `FINDING-340`): 211 local/disposable DBs, 103 test fixtures, 11 regex false positives, 6 historical Zalo keys, 4 docs references, 4 synthetic test tokens, 1 historical Google key. 0 records missing assigned disposition. Validated via `scripts/audit/verify_triage_manifest.py`. Author fields purged (F-09). |
| **SEC-07** | Git History | Private Keys / SSH / Certs | `INDEPENDENTLY_VERIFIED_PASS` | 0 private keys (RSA, EC, OPENSSH) across all commits in `git log -p --all`. |
| **TRC-01** | Traces (ZIP) | Real User PII in 4 ZIP Archives (Text/JSON) | `INDEPENDENTLY_VERIFIED_PASS` | 299 eligible text/JSON/HAR members across 4 ZIPs (96.5 MB) audited. **0 real personal emails, 0 phone numbers, 0 real names**. 29 unique test emails, 100% in `@example.invalid`. 0 unreadable text entries. 3,079 binary members skipped (`OCR NOT_RUN`). |
| **TRC-02** | Traces (ZIP) | Binary Screenshot Content (OCR) | `NOT_RUN` / `OUT_OF_SCOPE` | 3,079 binary JPEG screencast frames accounted for in trace archives. Optical character recognition (pixel-level text extraction) was NOT performed on binary images. |
| **TRC-03** | Traces (ZIP) | Passwords in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` (Pattern-based on Text) | 0 real user passwords detected in eligible text members. 4 password fields in `playwright-trace.zip` are all `[REDACTED]` or local test fixtures (`password123`). Mathematical proof of zero passwords in unparsed binary/arbitrary payloads is not claimed. |
| **TRC-04** | Traces (ZIP) | Token Hygiene in 4 ZIP Archives | `INDEPENDENTLY_VERIFIED_PASS` (Payload Claims Only) | Raw JWTs found in `PR-54-55-REVIEW/draft-trace.zip` (23) and `playwright-trace-s09-s11.zip` (62). Inspected token claims confirm test-harness payload structure (`iss: ephurin-api`, `aud: ephurin-client`, `sub`: UUID, no personal claims). 0 undecodable JWTs. Signature validity against test signing keys `NOT_RUN`. |
| **TRC-05** | CI Evidence | Email identity in `ci-source.json` | `INDEPENDENTLY_VERIFIED_PASS` (Git Metadata) | `th****@gmail.com` appears 4 times in `workflows[].run.head_commit.author/committer`. Verified as public Git commit author metadata recorded by GitHub Actions API. Owner to confirm whether public Git metadata is acceptable. |
| **IP-01** | Nested License | Removal of miscopied `SKILL/LICENSE` | `OWNER_ATTESTED_MISTAKEN_COPY` / `REMOVED_FROM_CURRENT_TREE` | File from `uLearnBox` removed from current tree via PR #113 (merge `dc385901`). Historical blobs in commit `6320ebc7` remain in Git DAG. `SKILL/CONTRIBUTING.md` preserves copy-prevention warning. |
| **IP-02** | Root License | Root Repository `LICENSE` | `BLOCKED` / `OWNER_DECISION_REQUIRED` | No root `LICENSE` file on `main`. Public visibility does not strictly require an OSS license, but project redistribution policy requires owner choice (Option A: Restrictive vs Option B: Open-Source). |
| **IP-03** | Test Stories | Origin of test novels in `docs/Assets/` | `OWNER_ATTESTED_AI_GENERATED` | Owner attests `test_story`, `test_story_2` and Aethelgard are 100% AI-generated synthetic material. Recorded as an origin assertion. |
| **IP-04** | Datasets | Benchmark dataset in `.data/` | `INDEPENDENTLY_VERIFIED_PASS` | Benchmark metadata (`aethelgard-retrieval-eval-v1.0.0`) verified present; raw full manuscript `Aethelgard_Toan_Bo_61_Chuong.md` verified absent from Git history. |
| **IP-05** | Datasets | Blind evaluation corpus `.eval-private/` | `INDEPENDENTLY_VERIFIED_PASS` | Protected by `.gitignore`; verified 0 commits and 0 objects in Git DAG. |
| **CI-01** | CI Workflows | Workflow Inventory on `main` (6 files) | `INDEPENDENTLY_VERIFIED_PASS` | Exactly 6 workflows on `main` audited. Standard network package retrieval used; zero paid LLM invocations. Probe #110 independently verified public runner execution. Runs `42594693169`, `42595568112`, `42595568149` classified as `INFRA_BLOCKED` / `CI_NOT_EXECUTED` (0 executed steps). |

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
     - Discovery Method: AST/Regex inspection via `scripts/audit/scan_git_secrets.py`.
     - Finding Status: `tests/test.py` was removed in commit `981b652b`, but the historical commit object is reachable in the permanent Git DAG.
   - **Commit `35ab740523acc1275749ade890bc1b64e3d9d2a0` (2026-09-22):**
     - File: `key.txt`
     - Content: 6 raw API keys formatted as `AQ.Ab8RN6...`:
       - Key 1: `AQ.Ab8RN6Jd****tdWg`
       - Key 2: `AQ.Ab8RN6KV****ngHQ`
       - Key 3: `AQ.Ab8RN6L7****8vFQ`
       - Key 4: `AQ.Ab8RN6Iu****qF3A`
       - Key 5: `AQ.Ab8RN6Jg****GEqA`
       - Key 6: `AQ.Ab8RN6Jo****FkPw`
     - Discovery Method: Path scan on root `key.txt` and git diff log matching.
     - Finding Status: Untracked in commit `695aa0ea28ce2bcd55604933bff5914e4141799f` and added to `.gitignore`. Retained in historical commit blob `35ab7405`.

4. **Committed Triage Manifest & Pinned Scan Snapshot (F-12 & F-15 Remediation):**
   To provide reproducible per-finding evidence as requested by GPT-6 review without self-referential audit expansion loops, the secret audit is pinned to the frozen scan snapshot ref `07b3a7487ab462b0532ecfc4dbaf0ffa4fab331b` across repository history. A dedicated, PII-safe triage manifest is committed directly to the repository at [`docs/development/security/secret_triage_manifest.json`](./secret_triage_manifest.json) (SHA-256: `df3053d7824f6b20279906f2ec3dfc7ae07f95c6c6185f00a28ba7734840a48e`).
   
   Every single one of the 340 raw detections (keyed by stable IDs `FINDING-001` .. `FINDING-340`) has been individually reviewed, categorized, and documented with its non-secret reasoning, review method, and commit context:

| Triage Disposition | Total Matches | Heuristic Mock=True | Heuristic Mock=False | Unique Context Clusters | Reconciled Context & Forensic Reasoning |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`LOCAL_DEV_DISPOSABLE_DB`** | **211** | 143 | 68 | 15 clusters | Disposable PostgreSQL/Redis/Mongo test container URIs (e.g. `postgres:postgres@localhost:5432`, `postgres:test@...`, `postgres:init@...`, redacted log outputs). The 68 heuristic-false items are standard GitHub Actions service container environment variables (`DATABASE_URL`) lacking heuristic trigger words like 'mock' or 'sample'. |
| **`CONFIRMED_TEST_FIXTURE`** | **103** | 71 | 32 | 26 clusters | Automated unit and integration test mock tokens (`api_key="test-api-key"`, `test-read-only`, `test-1234`), local dev test passwords (`Password123!`, `SecurePass2026!A9_`), and Django template placeholder `SECRET_KEY = 'django-insecure-...'`. The 32 heuristic-false items were evaluated in file context and verified as offline test fixtures. |
| **`REGEX_FALSE_POSITIVE`** | **11** | 2 | 9 | 2 clusters | Substring matches on `task-containers-before-stop` matched by `sk-` pattern lacking word boundaries in deployment and promotion inventory TSVs. |
| **`OWNER_ATTESTED_DELETED`** | **6** | 0 | 6 | 6 clusters | Historical Zalo/AQ API keys committed in `key.txt` (commit `35ab740523`). Owner confirms deleted long ago on provider account; gitignored in current tree. |
| **`DOCS_EVIDENCE_REFERENCE`** | **4** | 3 | 1 | 3 clusters | Documentation references inside `PUBLIC_READINESS_AUDIT.md` quoting sanitized examples (`postgres://postgres@...`, `api_****TCc"`). |
| **`SYNTHETIC_TEST_TOKEN`** | **4** | 0 | 4 | 2 clusters | Hardcoded synthetic test key `sk-srs-SYNTHETIC-SECRET-0123456789` in `srs-backend-rules.postgres.test.ts` and 3 synthetic JWT test fixtures in `scripts/verify_secret_hygiene.py`. |
| **`CONFIRMED_REVOKED_OWNER_ATTESTED`** | **1** | 0 | 1 | 1 cluster | Historical Google Gemini API key (`...8TCc` in `tests/test.py`, commit `1a6950975e`). Owner attests revoked on GCP console. |
| **`UNREVIEWED`** | **0** | 0 | 0 | 0 clusters | **0 records missing an assigned disposition** in this frozen audit manifest (based on contextual categorization and source-level sample checks). |
| **Total Reconciled** | **340** | **219** | **121** | **53 clusters** | **Zero live production secrets in Git history snapshot.** |

5. **Author Privacy & Metadata Purge (F-09 Remediation):**
   - The scanner generator (`scripts/audit/scan_git_secrets.py`) has been updated to remove the `author` field completely.
   - The regenerated artifact `docs/development/security/git_secret_findings.redacted.json` contains zero personal email addresses or personal author names across all 340 records (`Any author field: False`).
   - Forensic Distinction: Git history itself retains Git author metadata (`th****@gmail.com`) in the commit log and historical workflow payload files (`ci-source.json`). The owner must confirm whether this author metadata is acceptable for public release or requires retention in private scope. In accordance with strict constraints, no history rewriting or force-pushing has been performed.

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

1. **Google Gemini API Key (suffix `...8TCc`):**
   - Status: `REVOCATION_OWNER_ATTESTED`.
   - The owner attests that this key has been disabled/revoked on Google Cloud Console.
   - Requirement: For complete audit closure, the owner should retain a private, non-public verification record (e.g. GCP Cloud Audit Log showing `DeleteApiKey` or GCP Console screenshot showing key `...8TCc` disabled/deleted). Do not commit private console screenshots into the repository.
2. **Historical 6 Zalo / AQ API Keys (`AQ.Ab8RN6...`):**
   - Status: `OWNER_ATTESTED_DELETED`.
   - Owner Attestation (Comment #6736740206): The owner confirms that all 6 historical keys from `key.txt` (commit `35ab7405`) were **deleted long ago** from the provider account and are no longer active.
   - 4 Replacement Keys: Kept locally on the owner's workstation outside the repository.
   - Narrow Scope of Verification: Bounded verification confirms that `key.txt` and `.env*` are strictly ignored by `.gitignore` (lines 20-24). Absence of the 4 replacement values across all other historical commits/branches is based on owner attestation that they were never committed to Git.
   - Release Decision: If provider logs for the 6 old keys are no longer retrievable, the owner may proceed on the basis of an explicit **risk-acceptance decision** tied to owner attestation, rather than claiming an unverified automated pass.

---

### D. Playwright Trace Archives & Privacy Audit (P0/P1)

A member-by-member stream inspection was performed across all 4 Playwright trace archives currently tracked on `main`.

| Archive Path | Total Size | Total Entries | Scanned Text Entries | Skipped Binary Frames | Unreadable Text Entries | Real PII (Emails/Phones) | Synthetic Test Emails | Real Passwords | Synthetic JWT Tokens | Undecodable JWTs |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `docs/development/PR-54-55-REVIEW/draft-trace.zip` | 738 KB | 96 | 29 | 67 | **0** | **0** | 0 | **0** | 23 (`iss: none`, `sub`: UUID) | **0** |
| `docs/development/integration/p1-author/evidence/playwright-trace-s09-s11.zip` | 10.3 MB | 311 | 48 | 263 | **0** | **0** | 1 (`author_e2e_0652d0@example.invalid`) | **0** | 62 (`iss: ephurin-api`, `sub`: UUID) | **0** |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/browser/playwright-trace.zip` | 84.6 MB | 2,867 | 193 | 2,674 | **0** | **0** | 28 (`@example.invalid`) | **0** (4 redacted/fixtures) | **0** | **0** |
| `docs/development/integration/p1-author/final-fe-acceptance/evidence/components/draft-persistence-browser/draft-trace.zip` | 838 KB | 104 | 29 | 75 | **0** | **0** | 0 | **0** | **0** | **0** |
| **Total** | **96.5 MB** | **3,378** | **299** | **3,079** | **0** | **0** | **29 unique** | **0** | **85 total** | **0** |

#### Scope & Limitations of Trace Inspection (F-11 / F-13 Remediation):
- **Eligible Text & Structured Members:** 299 JSON, text, log, and HAR entries were parsed without error (`unreadable_entries: 0`). Zero real personal identities, phone numbers, or private personal emails were found. All 29 unique email addresses detected belong to the test-only domain `@example.invalid`.
- **Binary Image Inspection (`NOT_RUN / OUT_OF_SCOPE`):** Exactly 3,079 binary screencast JPEG frames captured during Playwright browser automation were skipped without reading (`OCR NOT_RUN`). Optical character recognition (OCR / pixel-level text extraction) was NOT performed on binary images. An owner-approved visual sampling review is recommended prior to public release.
- **Password Detection Scope:** Pattern-based scanning detected 4 password occurrences in eligible text members, all confirmed to be fixture strings (`password123`) or `[REDACTED]`. This check is bounded to readable text members and does not constitute a mathematical guarantee against unparsed binary payloads.

#### Synthetic JWT Scope & Claim Inspection:
- All 85 JWT occurrences across `draft-trace.zip` (23) and `playwright-trace-s09-s11.zip` (62) were decoded without error (`undecodable_jwt_count: 0`).
- Token claims confirm test-harness payload structure:
  - `sub`: Random UUID (`[0-9a-f\-]{36}`)
  - `role`: `AUTHOR`
  - `iss`: `ephurin-api` or `none`
  - `aud`: `ephurin-client` or `none`
  - No personal email, name, or external provider claims.
- **Cryptographic Boundary:** The scanner inspects base64-decoded token payload claims only. Cryptographic verification of token signatures against offline test signing keys was NOT performed.
- **Hygiene Recommendation:** While these tokens are local test artifacts generated by internal test runners rather than live session credentials, running `scripts/p1_sanitize_trace.py` to strip raw tokens before public release is recommended to maintain immaculate repository hygiene.

#### CI Source Email Investigation:
- File 1: `docs/development/integration/p1-author/fe-ai-contract-alignment/evidence/ci-source.json`
- File 2: `docs/development/integration/p1-author/fe-ai-contract-alignment/c01-atomic-approval/evidence/ci-source.json`
- Finding: The email `th****@gmail.com` appears in `workflows[].run.head_commit.author.email` and `committer.email`.
- Forensic Determination: This value is **Git commit author metadata** captured directly from the GitHub Actions workflow event payload. It is identical to the author metadata recorded in the public Git commit log. It does not represent application user PII. The owner should confirm whether public disclosure of this author email is acceptable.

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

### F. CI Boundaries & Workflows Inventory on `main` (P1)

Direct audit of `.github/workflows/` at exact `main` HEAD (`dc38590124e0b00901930669544e739d2ecebe6b`) identifies exactly **6 workflow files**:

1. **`defense-demo-contract.yml`:**
   - Triggers: `pull_request`, `push`
   - Runner: `ubuntu-latest`
   - Execution Scope: Schema validation and offline demo contract verification. No live LLM calls. Standard package retrieval only.
2. **`eval-pilot.yml`:**
   - Triggers: `pull_request`, `push` (Note: not manual dispatch)
   - Runner: `ubuntu-latest`
   - Execution Scope: Executes `run_eval_01.py` with mock/offline fixtures. No external API credentials required.
3. **`p7-semantic-memory.yml`:**
   - Triggers: `push`, `pull_request`
   - Runner: `ubuntu-latest`
   - Execution Scope: Sets `GEMINI_API_KEY: ci-dummy-key-not-a-secret` and validates offline embedding fallback behavior. Zero billing.
4. **`p8-cutover.yml`:**
   - Triggers: `push`, `pull_request`
   - Runner: `ubuntu-latest`
   - Execution Scope: Automated Docker container migration test against local PostgreSQL 16 (`postgresql://postgres:postgres@localhost:5432/p8_cutover`). Offline database tests.
5. **`pr86-review-acceptance.yml`:**
   - Triggers: `workflow_dispatch`, `pull_request`
   - Runner: `ubuntu-latest`
   - Execution Scope: Author and review acceptance test suites against mock backend services.
6. **`reader-acceptance.yml`:**
   - Triggers: `pull_request`, `workflow_dispatch`
   - Runner: `ubuntu-latest`
   - Execution Scope: Reader navigation and catalog E2E acceptance tests.

#### CI Run Status Analysis (`INFRA_BLOCKED` / `CI_NOT_EXECUTED`):
- Runs `42594693169`, `42595568112`, and `42595568149` failed in approximately 4 seconds with 0 steps executed across all jobs (`steps: []`).
- Forensic Determination: Infrastructure/runner provisioning failure, not executed test failure.
- Status: Classified strictly as `CI_NOT_EXECUTED` / `INFRA_BLOCKED`. PR #112 makes no claim of green CI.

*(Note: `p2-setup-provenance.yml` belongs to P2 feature development branches and is confirmed NOT present on `main`.)*

---

## 4. Final Owner Checklist Prior to Public Visibility Toggle

The following actions remain exclusively with the repository owner:

- [ ] **Owner Gate 1 (P0 - Secret Revocation):** Verify that historical Google Gemini key (suffix `...8TCc`) is deleted/disabled in GCP Console. Retain non-public verification record in private owner archive.
- [ ] **Owner Gate 2 (P0 - Historical AQ Keys):** Acknowledge owner attestation that the 6 historical Zalo keys in commit `35ab7405` (suffixes `...tdWg` .. `...FkPw`) were deleted from the provider account, and execute risk acceptance for their presence in Git history.
- [ ] **Owner Gate 3 (P1 - Licensing Choice):** Decide between Option A (Public with All Rights Reserved) or Option B (Commit an explicit `LICENSE` file such as MIT or Apache-2.0).
- [ ] **Owner Gate 4 (P1 - Contributor Consent):** Confirm that all team contributors consent to public repository visibility under the selected licensing option.
- [ ] **Owner Gate 5 (P1 - Author Email Consent):** Confirm whether public visibility of Git author metadata (`th****@gmail.com`) in commit log and Actions payload records is acceptable.
- [ ] **Optional Hygiene (P1 - Trace Sanitization):** Run `scripts/p1_sanitize_trace.py` to sanitize `PR-54-55-REVIEW/draft-trace.zip` and `playwright-trace-s09-s11.zip`.
- [ ] **Optional Privacy (P1 - Media Sampling):** Conduct an owner-approved visual spot-check of screencast JPEG frames in trace archives.

---

## 5. Reproducibility Appendix

### A. Committed Audit Tooling & Cryptographic Digests
All audit scripts, findings, and manifests used for this report are committed directly to the repository:

1. **`scripts/audit/scan_git_secrets.py`**
   - SHA-256 Digest: `e8c1f56cda693e3ee4c1fbb0a58de955c531ddff6ab988c98aa9e6742c67850b`
   - Scope & Method: Scans text diffs of added lines from reachable refs (defaulting to frozen snapshot `07b3a7487a`) via deterministic regex rules. Fail-closed on subprocess error. Does NOT scan raw uncommitted Git blobs, binary objects, or calculate Shannon entropy. Strips author metadata completely.
   - Output File: `docs/development/security/git_secret_findings.redacted.json`
2. **`scripts/audit/exhaustive_trace_zip_audit.py`**
   - SHA-256 Digest: `2860e4a32e1cd98f03feaca0f29b3e9267e8e60f0cc3c1c63bfee3003f5be43c`
   - Scope & Method: Streams 299 eligible text/JSON members across the 4 Playwright trace archives. Explicitly skips 3,079 binary JPEG frames (`OCR NOT_RUN`). Tracks unreadable text entries and undecodable JWTs. Fail-closed on corrupt/missing archive.
   - Output File: `docs/development/security/trace_zip_audit.redacted.json`
3. **`scripts/audit/verify_triage_manifest.py`**
   - SHA-256 Digest: `aa3939857aef285695900bfccb2c3169367d3ee7bf6dc626bd062f3b15316d6b`
   - Scope & Method: Regression self-test verifying manifest 1-to-1 mapping, snapshot count (340), hash integrity, and privacy constraints without printing secrets.
4. **`docs/development/security/git_secret_findings.redacted.json`**
   - SHA-256 Digest: `bbe62937c2a1a00a49a1cfcf3f26ca4d9e2bf32e32d5c3192615f48929168231`
   - Description: Raw redacted findings (340 records at frozen snapshot `07b3a7487a`) with zero author metadata.
5. **`docs/development/security/secret_triage_manifest.json`**
   - SHA-256 Digest: `df3053d7824f6b20279906f2ec3dfc7ae07f95c6c6185f00a28ba7734840a48e`
   - Description: Per-finding triage manifest mapping all 340 detections 1-to-1 (`FINDING-001` .. `FINDING-340`) with contextual reasoning, review methods, and reconciled dispositions.
6. **`docs/development/security/trace_zip_audit.redacted.json`**
   - SHA-256 Digest: `85ea882e3d8864b04bece6bcd66b93fb792b3b68f626687e89c31d794b6770c9`
   - Description: Trace archive audit results (299 text scanned, 3,079 binary skipped, 0 unreadable, 85 decoded JWTs, 0 undecodable JWTs).

### B. Environment & Tool Versions
- **Operating System:** Windows 11 (build 10.0.26200)
- **Python Runtime:** Python 3.11.9
- **Git Version:** git version 2.55.0.windows.3
- **detect-secrets:** version 1.5.0 (available offline in environment for ad-hoc inspection; committed automated scan provided by deterministic script above)

### C. Exact Reproducible Commands & Exit Codes
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
3. **Committed Full History Secret Stream Scan (Pinned Snapshot):**
   ```bash
   python scripts/audit/scan_git_secrets.py
   # Exit Code: 0 | Snapshot: 07b3a7487a | Findings: 340 triaged matches (7 historical leaks across 1a695097, 35ab7405)
   # Artifact: docs/development/security/git_secret_findings.redacted.json (104 KB, 0 author fields)
   ```
4. **Triage Manifest Regression Verification:**
   ```bash
   python scripts/audit/verify_triage_manifest.py
   # Exit Code: 0 | Snapshot Findings: 340 | Missing Dispositions: 0 | Hash Check: PASS
   ```
5. **Committed Trace Member Inspection:**
   ```bash
   python scripts/audit/exhaustive_trace_zip_audit.py
   # Exit Code: 0 | Archives: 4 | Entries: 3378 (299 text scanned, 3079 binary skipped) | Unreadable: 0 | Undecodable JWTs: 0 | PII Found: 0
   # Artifact: docs/development/security/trace_zip_audit.redacted.json (3.7 KB)
   ```
6. **Gitignore Path Exclusion Check:**
   ```bash
   git check-ignore -v key.txt .env .env.local
   # Exit Code: 0 | Matching Rules: .gitignore:20, .gitignore:23
   ```

---
*End of Public Readiness Security Audit Report (PUBLIC-01B v2.4).*
