# Test Partition Matrix & Acceptance Reporting — PR #57 / P8

**Branch:** `gemini/p1-ci-isolation`  
**Target PR Base:** `integration/p1-author`  
**SHA:** `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`  
**Date:** 2026-10-23  

---

## 1. Acceptance Reporting Labels

In strict accordance with the testing mandate, the test suite is partitioned into clearly demarcated operational tiers. No mocked test is conflated with database-backed integration, and no fixture-based test is conflated with full production-router end-to-end testing.

| Test Scope / Component | Execution Context | Required Label | Status |
|---|---|---|---|
| Pure Unit Tests (18 files, 91 tests) | Deterministic CI (`frontend-api-cutover`) & Local without DB | `UNIT_PASS` | **88 PASS, 0 FAIL, 3 SKIPPED** (Workflow stubs) |
| Accept-Draft Trust Contract (14 tests) | Dedicated CI (`backend-integration`) & Compose backend | `DATABASE_INTEGRATION_PASS` | **14/14 PASS** |
| PostgreSQL Production Persistence (5 tests) | Dedicated CI (`backend-integration`) & Compose backend | `DATABASE_INTEGRATION_PASS` | **5/5 PASS** |
| Gate AI-PIPE-01A Runner (15 checkpoints) | Compose root smoke (`scripts/run_ai_pipe_01a...`) | `DATABASE_INTEGRATION_PASS` | **15/15 PASS** |
| Gate AI-PIPE-03A Autonomous Controller (18 checks) | Compose root smoke (`scripts/run_ai_pipe_03a...`) | `DATABASE_INTEGRATION_PASS` | **18/18 PASS** (13/13 mutants rejected) |
| Author IDE Playwright Component Smoke | Local browser execution with React mounted component | `REAL_COMPONENT_BROWSER_PASS` | **13/13 PASS** |
| Author IDE Hook & Store Fixture Tests | Local vitest mock environment | `MOCKED_UI_PASS` | **13/13 PASS** |
| Node Gateway Route Contracts & S10 Offline Tests | In-memory HTTP mock against Gateway handlers | `OFFLINE_GATEWAY_PASS` | **PASS** |
| Full Production Nginx-to-Browser E2E Writing Flow | Full production multi-tier deployment | `FULL_APPLICATION_ROUTE_NOT_TESTED` | **DEFERRED TO PRODUCTION CUTOVER** |
| External Live LLM Providers (OpenAI, Anthropic, Gemini) | Real third-party API credentials | `LIVE_PROVIDER_NOT_RUN` | **OFFLINE MODE (LLM_PROVIDER=fake)** |

---

## 2. Test Discovery Partition Matrix

### 2.1 Partition A: Deterministic Unit Suite (`frontend-api-cutover`)
- **Discovery Filter:** `find src -name '*.test.ts' ! -name '*.live.test.ts' ! -name '*.postgres.test.ts' ! -name 'accept-draft-contract.test.ts'`
- **Target Environment:** Standard Ubuntu runner without database services.
- **Dependencies:** None. In-memory execution only.
- **Execution Command:** `npx tsx --test "${tests[@]}"`
- **Discovered Files (18 files):**
  1. `src/modules/ai/llm-provider-health.test.ts`
  2. `src/modules/ai/ai-gateway.test.ts`
  3. `src/modules/ai/p1-writing-ide-contract.test.ts`
  4. `src/modules/ai/autonomous-controller.test.ts`
  5. `src/modules/novels/p1-manuscript-import-provenance.test.ts`
  6. `src/modules/novels/p1-node-gateway-flow.test.ts`
  7. `src/modules/novels/chapter-revisions.service.test.ts`
  8. `src/modules/novels/controller-intent.test.ts`
  9. `src/modules/novels/p65-outbox-worker.test.ts`
  10. `src/modules/users/author-workspace-seed.test.ts`
  11. `src/modules/users/author-workspace-checklist.test.ts` (contains intentional skip stub)
  12. `src/modules/users/author-workspace-workflow.test.ts` (contains intentional skip stub)
  13. `src/modules/novels/chapter-comments.test.ts` (contains intentional skip stub)
  14. `src/modules/upload/upload.test.ts`
  15. `src/modules/novels/chapters.service.test.ts`
  16. `src/modules/novels/draft-chapters.repository.test.ts`
  17. `src/modules/novels/reading-history.service.test.ts`
  18. `src/modules/novels/novels.service.test.ts`
- **Result:** 91 tests, 88 passed, 3 skipped, 0 failed, 0 cancelled. Duration: ~1.5s.

### 2.2 Partition B: Database Integration Suite (`backend-integration`)
- **Target Environment:** GitHub Actions runner with `pgvector/pgvector:pg16` and `mongo:7` services.
- **Dependencies:** Fresh PostgreSQL and MongoDB instances with backend schema migrations applied (`migrate.ts`).
- **Included Suites:**
  1. `backend/src/modules/novels/accept-draft-contract.test.ts`:
     - 14 child tests verifying the server-to-server trust contract.
     - Preserves all negative authorization, validation, patch integrity, Brain version pinning, and controller intent assertions.
     - Result: **14/14 PASS**.
  2. `backend/src/modules/novels/p1-production-persistence.postgres.test.ts`:
     - 5 integration tests verifying PostgreSQL draft acceptance persistence, latest revision pointer updates, transactional outbox emission, idempotency, and author-control semantics.
     - Result: **5/5 PASS**.
- **Combined Total:** 19 integration tests, 19 PASS, 0 FAIL, 0 CANCELLED.

### 2.3 Partition C: Compose Smoke Gate (`root-compose-cutover-smoke`)
- **Target Environment:** Full Docker Compose multi-service container mesh.
- **Validations Executed:**
  - AI-PIPE-01A Production Persistence Integration: **15/15 PASS**
  - AI-PIPE-01 Closed Loop Evidence Verification: **PASS**
  - Backend Accept Draft Contract in Container: **14/14 PASS**
  - Backend PostgreSQL Production Persistence in Container: **5/5 PASS**
  - AI-PIPE-02A Idea Bootstrap Validation & Route Suite: **PASS**
  - AI-PIPE-02B Story Plan Validation & Route Suite: **PASS**
  - AI-PIPE-03A Autonomous Controller Validation & Route Suite: **18/18 PASS** (13/13 mutants rejected)
  - Backend Autonomous Controller Gateway Suite: **PASS**

---

## 3. Critical Architectural & Operational Notes

1. **Author IDE Fixture Distinction:**
   The Author IDE Playwright test suite (`web/src/features/author-workspace/__tests__/author-ide.spec.ts`) tests the real mounted React component within a synthetic browser context using mocked API handlers (`window.__authorIdeMockState`). It is classified as `REAL_COMPONENT_BROWSER_PASS` and `MOCKED_UI_PASS`, and **is not labeled as verified production-router E2E**.

2. **S10 Phrase Matching Distinction:**
   The current S10 consistency checking implementation employs lexical and phrase-matching heuristics on the client and gateway. It is classified as `OFFLINE_GATEWAY_PASS` and **is not labeled as full semantic consistency validation**. Runtime S10 logic remains untouched in this task.

3. **Two-Tab Conflict Testing Concurrency Model:**
   The two-tab conflict integration test verifies state conflict handling via a secondary concurrent HTTP writer (`chapter-writer.ts` / REST client) competing against the primary session lock, rather than running two separate headless browser instances.

4. **Zero Live Provider Calls:**
   All validations operated under `LLM_PROVIDER=fake`, `EMBEDDING_PROVIDER=fake`, and mock HTTP dispatchers. Zero egress network calls were made to third-party AI APIs (`LIVE_PROVIDER_NOT_RUN`).
