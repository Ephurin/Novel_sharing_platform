# AI Core Pipeline System Validation Report — AI-PIPE-02A

**Execution Timestamp:** 2026-10-09T09:32:32Z  
**Branch:** `astra/ai-pipe-02-idea-bootstrap`  
**Base Commit SHA:** `40f8fb8a5d2b39b94d5520375ffdda6f059434f4`  
**Live Evidence File:** `docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json`  
**Offline Evidence Validator:** `scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py` $\to$ **PASS (0 errors, 5/5 negative self-tests pass)**  
**Gate Verdict:** `LOCAL_PASS_CI_PENDING (13/13 checkpoints passed)`

---

## 1. Executive Summary

Gate **AI-PIPE-02A** implements and validates the **Idea/Outline $\to$ Canonical Story Brain (P2 Adapter)** pipeline. It proves that a new story starting from a pure idea, premise, or outline can be bootstrapped into a canonical Story Brain, reviewed and activated by the author, associated with its first canonical chapter and revision, and seamlessly enter the existing P1 assisted-writing closed loop without introducing a second writing architecture or ad-hoc memory store.

### Key Architecture Achievements:
1. **Zero Architecture Duplication:** P2 reuses the exact same canonical narrative schema in PostgreSQL (`narrative.story_brains`, `narrative.entities`, `narrative.facts`, `narrative.proposals`). No separate or ad-hoc JSON stores were introduced.
2. **Author-Control Invariant Preserved:** The idea bootstrap produces structured proposals with status `waiting_review`. Proposals require explicit author review and acceptance before advancing the Story Brain to version 2 and activating the baseline.
3. **Seamless P1 Reuse:** Once the initial Story Brain is activated and the first canonical chapter/revision is established, AI drafting uses standard P1 routes (`POST /api/v1/ai/writing/generations`), canonical draft acceptance (`POST /api/v1/chapters/:chapterId/revisions/accept-draft`), transactional outbox dispatch (`INCREMENTAL_ANALYSIS`), and memory feedback (`brain_version` advances 2 $\to$ 3).
4. **Deterministic & Quota-Safe:** Validation ran against local Docker services (`node:4000`, `ai-service:8000`, `postgres:5432`) using `LLM_PROVIDER=fake` (`FakeDeterministicLLMService`).

---

## 2. All 13 Acceptance Checkpoints

All 13 acceptance checkpoints executed against the live services and passed with zero errors:

| Checkpoint | Scope | Verified Invariants / Artifacts | Status |
|---|---|---|---|
| **01** | Idea Bootstrap Request | Node API `POST /api/v1/ai/story-brains/bootstrap/from-idea` forwards to AI service; returns 202 with job ID in `waiting_review` | **PASS** |
| **02** | Repeatable Bootstrap Idempotency | Identical bootstrap request returns existing job ID without duplicate job execution | **PASS** |
| **03** | Structured Initial Proposals | Blueprint generated into 7 proposals covering `fact` (premise, world rules) and `entity` (protagonist, faction, location) | **PASS** |
| **04** | Author Review & Proposal Acceptance | Node API `POST /api/v1/ai/proposal-groups/:groupId/accept` accepts proposals; Story Brain advances to version 2 | **PASS** |
| **05** | Baseline Activation | Node API `POST /api/v1/ai/story-brains/:novelId/baseline/activate` marks Story Brain active (safely handling empty revision bootstrap) | **PASS** |
| **06** | First Canonical Chapter & Revision | Created Chapter 1 via Node API and created canonical base revision snapshot (`POST /api/v1/chapters/:id/revisions/snapshot`) | **PASS** |
| **07** | Direct PostgreSQL Schema Verification | Verified 3 entities and 4 facts in `narrative.entities`/`narrative.facts`, `brain_version=2`, `status=active` in PostgreSQL | **PASS** |
| **08** | Context Preview Retrieval | Node GET `/api/v1/ai/story-brains/:novelId/context-preview` retrieves active brain entities and world rules for Chapter 1 | **PASS** |
| **09** | Standard P1 Assisted Generation | Node POST `/api/v1/ai/writing/generations` generates deterministic patch draft (`status=completed`, `validation_status=passed`) | **PASS** |
| **10** | Canonical Draft Acceptance | Node POST `/revisions/accept-draft` inserts `chapter_revisions` (`source_type='AI_DRAFT_ACCEPT'`) and updates chapter latest pointer | **PASS** |
| **11** | Transactional Outbox Dispatch | Node Outbox Processor dispatches `INCREMENTAL_ANALYSIS` event to `COMPLETED`; Story Brain advances version 2 $\to$ 3 in PostgreSQL | **PASS** |
| **12** | Second Context Preview | Subsequent context preview observes updated `brain_version=3`, proving closed-loop memory feedback | **PASS** |
| **13** | Acceptance Idempotency & Author Control | Retry `acceptDraft` returns existing revision with count=1; unaccepted generation leaves canonical revision untouched | **PASS** |

---

## 3. Architecture Traceability & Modifications

### 3.1 AI Service (`ai-service`)
- **Schemas ([ai-service/api/schemas.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/api/schemas.py)):**
  - Added `IdeaBootstrapPreferences` (genre, tone, target_audience, core_conflict).
  - Added `IdeaBootstrapRequest` (novel_id, idea, outline, preferences, locale, idempotency_key).
- **Deterministic Fake LLM ([ai-service/core/fake_llm.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/fake_llm.py)):**
  - Implemented `generate_story_blueprint` producing structured premise facts, world rules, and key entity proposals.
  - Added prompt branch routing `"story blueprint"` to deterministic blueprint generation.
- **Bootstrap Application Service ([ai-service/application/bootstrap_service.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/application/bootstrap_service.py)):**
  - Implemented `start_from_idea(tenant_id, novel_id, idea, outline, preferences, idempotency_key)`:
    - Creates bootstrap job with status `waiting_review`.
    - Generates premise fact, world rule facts, and entity proposals.
    - Persists proposals in `narrative.proposals` grouped by `dependency_group_id`.
  - Updated `activate_baseline`:
    - Safely handled `baseline_revision_id = job.revisions[-1].revision_id if job.revisions else None` so idea-bootstrapped novels (without pre-existing chapters) activate smoothly.
- **PostgreSQL Repository ([ai-service/infrastructure/postgres_narrative_repository.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/infrastructure/postgres_narrative_repository.py)):**
  - Updated `activate_baseline` to assign `self._stable_uuid(...) if baseline_revision_id else None`.
- **FastAPI Narrative Routes ([ai-service/api/narrative_routes.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/api/narrative_routes.py)):**
  - Added `POST /v1/story-brains/bootstrap/from-idea` returning 202 Accepted with job status and proposal counts.

### 3.2 Backend Gateway (`backend`)
- **Gateway Controller ([backend/src/modules/ai/ai-gateway.controller.ts](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/backend/src/modules/ai/ai-gateway.controller.ts)):**
  - Added `startIdeaBootstrapController` with author ownership validation via `assertNovelOwnership`.
  - Forwards `POST /v1/story-brains/bootstrap/from-idea` to AI service.
- **Gateway Routes ([backend/src/modules/ai/ai-gateway.routes.ts](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/backend/src/modules/ai/ai-gateway.routes.ts)):**
  - Registered `POST /story-brains/bootstrap/from-idea`.

### 3.3 Test Harness & Validation Scripts
- **E2E Integration Runner:** [scripts/run_ai_pipe_02a_idea_bootstrap.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/scripts/run_ai_pipe_02a_idea_bootstrap.py)
  - Executes all 13 checkpoints end-to-end against live Node backend, AI service, and PostgreSQL.
  - Automatically cleans up disposable novel fixtures in teardown.
- **Offline Evidence Validator:** [scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py)
  - Verifies evidence artifact schema, checkpoint count, and architectural invariants.
  - Includes 5 negative mutant self-tests verifying fail-closed validation.

---

## 4. Evidence Artifacts

1. **JSON Evidence:** [docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json)
2. **Offline Validator:** `python scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py` $\to$ **PASS**
3. **AI Service Unit Tests:** `pytest tests/test_idea_bootstrap_routes.py` $\to$ **3 passed in 1.08s**
4. **Backend Gateway Unit Tests:** `npx vitest run src/modules/ai/p1-closed-loop-gateway.test.ts` $\to$ **5 passed in 589ms**

---

## 5. Status & Next Actions

- **Current Status:** `LOCAL_PASS_CI_PENDING`
- **Scope Boundary:** Gemini stops here. All local implementation, live Docker validation, evidence generation, and reporting are complete.
- **Handoff to ChatGPT:** Inspect pushed branch `astra/ai-pipe-02-idea-bootstrap`, open PR, and monitor remote CI.
