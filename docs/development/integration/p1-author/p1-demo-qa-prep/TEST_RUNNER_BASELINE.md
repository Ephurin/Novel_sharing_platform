# Test Runner Baseline & Environment Isolation Assessment

**Repository:** `Ephurin/Novel_sharing_platform`  
**Initial Baseline Commit:** `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`  
**Working Tree SHA:** `ad0092004cfbd5d042b5c687fb31010e9638835b`  
**QA Branch:** `gemini/p1-demo-qa-prep`  
**Clean Worktree Location:** `C:\Users\Laptop\Novel_sharing_platform_qa`  
**Timestamp:** 2026-10-26T22:40:00+07:00  

---

## 1. Baseline Verification & Integrity

The worktree was established directly from baseline commit `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` (HEAD of `origin/main`).  
Status verified:
```text
HEAD: 749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb
Tree: ad0092004cfbd5d042b5c687fb31010e9638835b
Branch: gemini/p1-demo-qa-prep
Working tree clean: 2,702 tracked files present
```
*Note on Historical Context:* Past PASS evidence from prior commits (e.g. `c5a015a`, `5754419`, `94d5072`) is documented for reference only; zero PASS status is carried over retroactively to current or new branches.

---

## 2. Test Runner Status on Baseline `main`

The repository employs a multi-tier test architecture across Python (AI service), TypeScript/Node (Backend), and Vite/React/Playwright (Web Frontend).

| Runner / Tier | Command | Execution Scope | Status on Current `main` |
|---|---|---|---|
| **Python Unit (ai-service)** | `python -m pytest ai-service/tests/test_settings.py` etc. | In-process pure unit tests, mock LLM/Embeddings | **RUNNABLE** (10/10 passed in test_settings, 353 pass in full unit suite) |
| **Python Integration (ai-service)** | `python -m pytest -m postgres_integration` | Tests requiring live PostgreSQL + pgvector + Alembic head `0013` | **RUNNABLE via isolated Docker stack** |
| **Node Unit (web)** | `npx --prefix web tsx --test <test-file>` | Frontend utility & pure logic unit tests (`wallet-earnings.test.mjs`, `project-sorting.test.mjs`, `author-context.test.ts`, `entity-casefold-python.test.ts`) | **RUNNABLE** (Verified passing with tsx) |
| **Node Unit (backend)** | `npm --prefix backend test` (`tsx --test "src/**/*.test.ts"`) | Backend unit & deterministic controllers | **RUNNABLE** |
| **Mounted Browser (web)** | `node --test web/tests/*.browser.test.mjs` | Playwright browser component tests against local mock fixtures (`author-ide.browser.test.mjs`, `draft-persistence.browser.test.mjs`, `p1-hitl-interactions.browser.test.mjs`) | **RUNNABLE** (Offline component scope) |
| **HTTP/DB Integration E2E** | `python scripts/p1_final_acceptance.py <stage> --output <dir>` | Orchestrates full Docker Compose stack (Gateway, Backend, AI Worker, PostgreSQL, MongoDB, Fake Upstream) | **RUNNABLE** (Verified `provision`, `bridge-config`, `cleanup-owned`) |
| **Mounted Browser Full Stack E2E** | `node --test web/tests/p1-full-stack-s09-s11.browser.test.mjs` | Full end-to-end browser user journey against real backend & gateway | **RUNNABLE** (Executes as part of `browser-review` stage in acceptance runner) |

---

## 3. Four-Tier Test Classification & Boundaries

To prevent false claims and ambiguous pass reports, all tests must strictly adhere to the following four boundary levels:

```
+-------------------------------------------------------------------------+
| Level 1: OFFLINE FAKE-PROVIDER UNIT TESTS                               |
|   - Scope: Pure unit logic, in-memory mocks, zero network/DB required.  |
|   - Proof: Validates algorithms, state reducers, schema serializers.    |
|   - Limitation: Cannot prove database transactions or API contracts.    |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Level 2: MOUNTED BROWSER COMPONENT TESTS                                |
|   - Scope: Playwright in headless Chromium/Edge with mocked HTTP routes |
|   - Proof: UI rendering, local debouncing, Undo/Redo ABA, local forms.  |
|   - Limitation: Explicitly NOT counted as full-stack real-DB acceptance.|
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Level 3: HTTP/DB INTEGRATION & FULL-STACK E2E (FAKE UPSTREAM)           |
|   - Scope: Real Docker stack (PostgreSQL, MongoDB, Backend, AI Worker,  |
|            Budget Gateway, Fake Upstream Provider).                     |
|   - Proof: Real CAS 409, revisions, outbox events, Story Brain Canon,   |
|            real browser interacting with live APIs.                     |
|   - Upstream: Budget Gateway routed to fake-upstream (127.0.0.1:18091). |
|   - Zero live cloud calls. Default test mode for QA preparation.        |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Level 4: REAL-PROVIDER ACCEPTANCE (LIVE MODELS)                         |
|   - Scope: Real Google Gemini 3.5 Flash Lite / Cloud Embeddings API.    |
|   - Requirement: Explicit user authorization and budget approval.       |
|   - Status: FORBIDDEN / NOT AUTHORIZED in baseline QA preparation.     |
+-------------------------------------------------------------------------+
```

---

## 4. Isolated Environment & Security Constraints

In accordance with Step 2 instructions:
1. **Namespaced Project & Storage:**
   - Every acceptance execution generates a unique suffix `codex-p1-final-<suffix>`.
   - Dedicated PostgreSQL database name: `ephurin_test_p1_final_<suffix>`.
   - Ephemeral random host ports for Web, Backend, AI, Gateway, Fake Upstream, PostgreSQL, and MongoDB to avoid port collisions with host services or concurrent runs.
   - Dedicated Docker networks allocated from available `/24` subnets in `172.29.0.0/16`.
2. **Zero Pollution of Shared Resources:**
   - No shared production or development databases are ever touched.
   - Volumes and containers belonging to other projects (e.g. `p123-core-*`, `ephurin-ui-retest_*`) are never inspected, stopped, or removed.
   - `docker compose down -v` is strictly forbidden.
   - Cleanup is strictly leased via `cleanup-owned` targeting only the project ID assigned to that run.
3. **Secret Hygiene:**
   - Generated passwords, JWT secrets, and worker tokens are placed into a private JSON/env file in an external output directory (`C:/task-evidence/<run-id>/`) outside the git repository.
   - All log output is scrubbed using regex redaction (`[REDACTED]`, `[REDACTED_JWT]`) before saving evidence.
   - No secret, JWT, or private key is committed to Git.
4. **HITL Feature Flag Isolation:**
   - `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` is explicitly activated for Human-In-The-Loop review runs.
   - A negative test verifies that the factory default `ENTITY_CANDIDATE_VERIFICATION_ENABLED=false` routes correctly to legacy fallback without breaking.
