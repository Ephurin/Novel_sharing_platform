# AI Core Pipeline System Validation Report — AI-PIPE-02A

**Execution Timestamp:** 2026-10-09T10:08:24Z  
**Branch:** `astra/ai-pipe-02-idea-bootstrap`  
**Base Commit SHA (CODE_SHA):** `4f4c3eb73e0c1bcc6aa877845181198e651a8f2b`  
**Live Evidence File:** `docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json`  
**Offline Evidence Validator:** `scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py` $\to$ **PASS (0 errors, 8/8 negative self-tests pass)**  
**Gate Verdict:** `CI_PASS / MERGED` — local 13/13 reproduced by GitHub Actions and merged via PR #40

---

## Remote Acceptance Closure — PR #40

- PR: `#40 — AI-PIPE-02A: add idea-to-Story-Brain bootstrap and P1 loop reuse`
- merged SHA: `510351fa074ee360c580188e18fe3c4ee6813ae4`
- accepted PR head: `7218f2a718755f6c555fc68c42b21d5cbbfcd047`
- P8 Cutover and Migration run `37958919258`: **PASS**
- P7 Semantic Memory Foundation run `37958919259`: **PASS**
- Evaluation Pilot Harness run `37958919448`: **PASS**

Within P8 `root-compose-cutover-smoke`, the AI-PIPE-02A remote gates all passed:

```text
Run Gate AI-PIPE-02A Idea Bootstrap Validation              PASS
Verify Gate AI-PIPE-02A Evidence Schema and Invariants      PASS
Run AI-PIPE-02A Idea Bootstrap Route Unit Suite             PASS
```

The first PR-head P8 run `37958543378` already showed the full AI-PIPE-02A system runner and validator passing. Its targeted route-unit step failed only because the test was invoked inside the production Compose container with `APP_ENV=production`, conflicting with the test's in-memory repository configuration. The CI-only fix changed that invocation to `APP_ENV=test`; the accepted head `7218f2a...` then passed the complete P8 suite. No production code change was required for that CI failure.

This upgrades AI-PIPE-02A from `LOCAL_PASS_CI_PENDING` to `CI_PASS / MERGED`.

Scope remains deliberately narrow: AI-PIPE-02A proves Idea/Premise -> Reviewable World Bible -> Canonical Story Brain -> First Chapter/Revision -> reuse of the P1 writing loop. Durable outline-plan persistence and plan-guided multi-chapter steering remain deferred to AI-PIPE-02B.

---

## 1. Executive Summary & Scope Qualification

Gate **AI-PIPE-02A** implements and validates the **Idea $\to$ Reviewable World Bible $\to$ Canonical Story Brain $\to$ P1 Writing Loop Adapter**.

### Scope Qualification (Preferred Narrow Closure):
1. **Gate Scope:** This gate proves `Idea/Premise -> Reviewable World Bible -> Story Brain -> First Chapter/Revision -> P1 Writing Loop Reuse`.
2. **Durable Outline-Plan Persistence:** The bootstrap API accepts optional `outline` and incorporates it into request identity and blueprint generation prompt. However, durable outline-plan persistence and plan-guided multi-chapter steering is explicitly deferred to **AI-PIPE-02B** to prevent premature future-plot beat leakage into historical narrative memory.
3. **UC-01 Parity Qualification:** The current implementation materializes `premise` (fact), `world_rules` (fact), `author_constraints` (world rule fact), and key `entities` (character, location). Extended UC-01 proposal types (`initial_state`, `relationship`, `open_question`) are future extensions and are honestly not claimed in this minimal World Bible gate.
4. **Reproducible Lineage:** Code and tests were committed first as clean `CODE_SHA` (`4f4c3eb`), and the full Docker 13/13 runner was executed on that exact commit.

---

## 2. All 13 Acceptance Checkpoints

All 13 acceptance checkpoints executed against live Docker services (`backend:4000`, `ai-service:8000`, `postgres:5432`) and passed with zero errors:

| Checkpoint | Scope | Verified Invariants / Artifacts | Status |
|---|---|---|---|
| **01** | Idea Bootstrap Request | Node API `POST /api/v1/ai/story-brains/bootstrap/from-idea` forwards to AI service; returns 202 with job ID in `waiting_review` | **PASS** |
| **02** | Repeatable Bootstrap Idempotency | Identical bootstrap request (including normalized `locale`) returns existing job ID without duplicate job execution | **PASS** |
| **03** | Structured Initial Proposals | Blueprint generated into 7 proposals covering `fact` (premise, world rules) and `entity` proposals | **PASS** |
| **04** | Author Review & Proposal Acceptance | Node API `POST /api/v1/ai/proposal-groups/:groupId/accept` accepts proposals; Story Brain advances to version 2 | **PASS** |
| **05** | Baseline Activation | Node API `POST /api/v1/ai/story-brains/:novelId/baseline/activate` marks Story Brain active (safely handling empty revision bootstrap) | **PASS** |
| **06** | First Canonical Chapter & Revision | Created Chapter 1 via Node API and created canonical base revision snapshot (`POST /api/v1/chapters/:id/revisions/snapshot`) | **PASS** |
| **07** | Direct PostgreSQL Schema Verification | Verified 3 entities and 4 facts in `narrative.entities`/`narrative.facts`, `brain_version=2`, `status=active` in PostgreSQL; NO parallel ad-hoc store | **PASS** |
| **08** | Context Preview Retrieval | Node GET `/api/v1/ai/story-brains/:novelId/context-preview` retrieves active brain entities and world rules for Chapter 1 | **PASS** |
| **09** | Standard P1 Assisted Generation | Node POST `/api/v1/ai/writing/generations` generates deterministic patch draft (`status=completed`, `validation_status=passed`) | **PASS** |
| **10** | Canonical Draft Acceptance | Node POST `/revisions/accept-draft` inserts `chapter_revisions` (`source_type='AI_DRAFT_ACCEPT'`) and updates chapter latest pointer | **PASS** |
| **11** | Transactional Outbox Dispatch | Node Outbox Processor dispatches `INCREMENTAL_ANALYSIS` event to `COMPLETED`; Story Brain advances version 2 $\to$ 3 in PostgreSQL | **PASS** |
| **12** | Second Context Preview | Subsequent context preview observes updated `brain_version=3`, proving closed-loop memory feedback | **PASS** |
| **13** | Acceptance Idempotency & Author Control | Retry `acceptDraft` returns existing revision with count=1; real second unaccepted generation leaves canonical revision and Story Brain untouched | **PASS** |

---

## 3. Architecture Traceability & Modifications

### 3.1 AI Service (`ai-service`)
- **Schemas (`ai-service/api/schemas.py`):**
  - `IdeaBootstrapPreferences`: `genre: list[str] = []`, `tone: str = "neutral"`, `target_length: str = "long_form"`.
  - `IdeaBootstrapRequest`: `novel_id: str`, `idea: str`, `outline: str | None`, `locale: str = "vi-VN"`, `preferences: IdeaBootstrapPreferences = default`, `author_constraints: list[str] = []`.
- **Deterministic Fake LLM (`ai-service/core/fake_llm.py`):**
  - Implemented `generate_story_blueprint` producing structured premise facts, world rules, and key entity proposals.
  - Added prompt branch routing `"story blueprint"` to deterministic blueprint generation.
- **Bootstrap Application Service (`ai-service/application/bootstrap_service.py`):**
  - Implemented `start_from_idea(*, tenant_id, novel_id, idea, outline, locale, preferences, author_constraints)`:
    - Normalizes `locale` (`(locale or "vi-VN").strip().lower()`) and incorporates it into deterministic identity hash and job UUID.
    - Catches only `KeyError` during existing-job lookup, allowing unexpected database errors to propagate.
    - Creates bootstrap job with status `waiting_review`.
    - Generates premise fact, world rule facts, and entity proposals.
    - Persists proposals in `narrative.proposals` grouped by `dependency_group_id`.
  - Implemented `_generate_blueprint`:
    - Real provider calls fail closed with `RuntimeError` if the provider fails or returns invalid structured output missing `premise`.
    - Explicit no-provider / offline path derives rules strictly from user-supplied inputs (`preferences` and `author_constraints`), without inventing phantom fantasy lore.
  - Updated `activate_baseline`:
    - Safely handles `baseline_revision_id = job.revisions[-1].revision_id if job.revisions else None` so idea-bootstrapped novels without initial chapters activate cleanly.
- **PostgreSQL Repository (`ai-service/infrastructure/postgres_narrative_repository.py`):**
  - Updated `activate_baseline` to assign `self._stable_uuid(...) if baseline_revision_id else None`.
- **FastAPI Narrative Routes (`ai-service/api/narrative_routes.py`):**
  - Added `POST /v1/story-brains/bootstrap/from-idea` returning 202 Accepted with job status and proposal counts.

### 3.2 Backend Gateway (`backend`)
- **Gateway Controller (`backend/src/modules/ai/ai-gateway.controller.ts`):**
  - Added `startIdeaBootstrapController` with author ownership validation via `assertNovelOwnership`.
  - Forwards `POST /v1/story-brains/bootstrap/from-idea` to AI service.
- **Gateway Routes (`backend/src/modules/ai/ai-gateway.routes.ts`):**
  - Registered `POST /story-brains/bootstrap/from-idea`.

### 3.3 Test Harness & Validation Scripts
- **E2E Integration Runner:** `scripts/run_ai_pipe_02a_idea_bootstrap.py`
  - Executes all 13 checkpoints end-to-end against live Node backend, AI service, and PostgreSQL.
  - Checkpoint 13b creates a real second writing generation via Node API, observes completion, explicitly omits draft acceptance, and verifies that `chapters.latest_revision_id`, `chapter_revisions` count, and `story_brains.brain_version` are completely unmutated.
  - Automatically cleans up disposable novel fixtures in teardown.
- **Offline Evidence Validator:** `scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py`
  - Verifies evidence artifact schema, checkpoint count, and architectural invariants.
  - Enforces mandatory Checkpoint 13 fields: `unaccepted_generation_id`, `latest_revision_before == latest_revision_after`, `unaccepted_generation_revision_count == 0`, `brain_version_before == brain_version_after`.
  - Includes 8 negative mutant self-tests verifying fail-closed validation.

---

## 4. Evidence Artifacts

1. **JSON Evidence:** `docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json`
2. **Offline Validator:** `python scripts/verify_ai_pipe_02a_idea_bootstrap_evidence.py` $\to$ **PASS (8/8 mutants rejected)**
3. **AI Service Unit Tests:** `pytest ai-service/tests/test_idea_bootstrap_routes.py` $\to$ **6 passed in 2.05s**
   - Includes locale-sensitive identity test (`test_bootstrap_locale_distinct_jobs`).
   - Includes provider fail-closed tests (`test_provider_failure_fails_closed`, `test_provider_invalid_json_fails_closed`).
   - Includes offline fallback test verifying no invented lore (`test_no_provider_fallback_derives_only_from_user_inputs`).
4. **Backend Gateway Unit Tests:** `npx tsx --env-file=.env.example --test src/modules/ai/p1-closed-loop-gateway.test.ts` $\to$ **5 passed in 1.36s**
5. **Backend Typecheck:** `npm run typecheck` $\to$ **PASS (0 errors)**

---

## 5. Status & Handoff

- **Current Status:** `CI_PASS / MERGED`
- **Remote Acceptance:** PR #40 merged as `510351fa074ee360c580188e18fe3c4ee6813ae4`; P8 `37958919258`, P7 `37958919259`, and Evaluation Pilot `37958919448` all passed on accepted head `7218f2a718755f6c555fc68c42b21d5cbbfcd047`.
- **Scope Boundary:** AI-PIPE-02A is closed. Durable outline-plan persistence / multi-chapter steering is explicitly deferred to AI-PIPE-02B.
