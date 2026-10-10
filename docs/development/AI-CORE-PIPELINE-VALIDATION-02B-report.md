# AI Core Pipeline System Validation Report — AI-PIPE-02B

**Execution Timestamp:** 2026-10-10T16:52:43Z  
**Branch:** `astra/ai-pipe-02b-outline-planning`  
**Base Commit SHA (CODE_SHA):** `598f418db5f127aac48a025692668658028d7370`  
**Live Evidence File:** `docs/development/AI-CORE-PIPELINE-VALIDATION-02B/ai-pipe-02b-outline-planning.json` (records `git_commit = 598f418...`)  
**Offline Evidence Validator:** `scripts/verify_ai_pipe_02b_outline_planning_evidence.py` $\to$ **PASS (0 errors, 10/10 negative self-tests pass)**  
**Gate Verdict:** `LOCAL_PASS_CI_PENDING` (16/16 Checkpoints PASS)

---

## Remote Code Review Repairs Summary

All three blockers raised in ChatGPT remote review have been fully implemented, verified, and locked in commit `598f418db5f127aac48a025692668658028d7370`:

1. **Blocker 1 (GET story plan read ownership enforcement):**
   - Node `getStoryPlanController` now enforces `assertNovelOwnership(userId, userRole, data.novel_id)` before returning the plan body to the caller.
   - Non-owner users receive HTTP 403 `FORBIDDEN` without exposing outline content or plan details.
   - Admin roles retain legitimate access per the system ownership contract.
   - Verified via unit test `P2B-Gateway: Non-owner cannot read another novel plan by UUID (403 FORBIDDEN)` in `p1-closed-loop-gateway.test.ts` and `ai-gateway.test.ts`, plus live Checkpoint 02 assertions against reader04 (403) and reader02 (200 admin).

2. **Blocker 2 (Tenant & novel scoped objective mutation):**
   - `PostgresNarrativeRepository.update_objective_status()` now strictly scopes mutations by `(id, plan_id, novel_id, tenant_id)`.
   - Matching semantics applied to `InMemoryNarrativeRepository` and `JsonNarrativeRepository`.
   - Negative test proves that mismatched `novel_id` with valid plan and objective IDs fails closed (HTTP 404) and leaves the underlying database state untouched (`status` remains `pending`).
   - Verified in `test_story_plan_routes.py` and live Checkpoint 13.

3. **Blocker 3 (True idempotency contract with canonical hashing):**
   - `compute_plan_input_hash()` deterministically computes SHA-256 over canonical JSON of `novel_id`, normalized `source_outline`, and ordered canonical objectives (`order_index`, `title`, `description`, `target_chapter`, `objective_type`, metadata).
   - `StoryPlanRecord` and domain model now persist both `idempotency_key` and `input_hash`.
   - Same idempotency key + identical payload $\to$ returns existing plan (HTTP 201) without duplicate insertion.
   - Same idempotency key + conflicting payload $\to$ HTTP 409 `IDEMPOTENCY_CONFLICT`.
   - Different key + modified plan $\to$ creates new plan version (`plan_version = 2`).
   - Verified in `test_story_plan_routes.py` and live Checkpoint 02.

---

## 1. Executive Summary & Invariant Qualification

Gate **AI-PIPE-02B** completes the second phase of Pipeline P2: **Durable Outline Planning Without Future-Canon Leakage**.

### Core Invariant: `FUTURE PLAN != HISTORICAL CANON`
A fundamental risk in AI novel generation is the premature contamination of canonical narrative memory with future outline beats. If an outline specifies that character A will betray character B in chapter 5, materializing that plot beat into canonical facts/events in chapter 1 causes the model to perceive the betrayal as an already-occurred historical fact or omniscient canon.

AI-PIPE-02B strictly enforces and machine-verifies that:
1. **Durable Plan Persistence:** Outline plans and chapter objectives are persisted in dedicated PostgreSQL narrative schema tables (`narrative.story_plans` and `narrative.story_plan_objectives`), completely decoupled from historical memory (`narrative.events` and `narrative.facts`).
2. **Explicit Lifecycle & Versioning:** Plans have explicit versions (`plan_version = 1, 2, ...`) and lifecycle states (`draft` $\to$ `active` $\to$ `superseded`).
3. **Deterministic Objective Selection:** When preparing context for a chapter/scene, the active plan selects the objective matching the chapter index deterministically.
4. **Isolated Provenance:** Context preview carries `planning_context` and `current_objective` in designated separate package envelopes, while keeping `recent_events`, `world_rules`, and `entities` clean of future beat leakage.
5. **Machine-Checkable Assertion:** Checkpoint 08 executes a direct database and context scan proving future beats (e.g. "Roland", "ma vương") are 100% absent from canonical events and facts.
6. **Author Control & Acceptance Semantics:** Unaccepted generations mutate neither canonical revisions nor plan progress. Only accepted drafts advance the canonical revision pointer, dispatch transactional outbox events (`INCREMENTAL_ANALYSIS`), advance Story Brain memory version, and allow explicit objective advancement.
7. **Non-Destructive Plan Edits:** Modifying the outline creates a new version (`plan_version = 2`), superseding version 1 while leaving the existing historical Story Brain canon intact.

---

## 2. All 16 Acceptance Checkpoints

All 16 acceptance checkpoints verified with status **PASS**:

| Checkpoint | Scope | Verified Invariants / Artifacts | Status |
|---|---|---|---|
| **01** | Application-Facing Outline/Plan Request | Node API `POST /api/v1/ai/story-plans` accepts request and creates Story Plan draft with 3 objectives | **PASS** |
| **02** | Deterministic Repeat / Idempotency Semantics | Repeated plan request returns identical `plan_id`; conflicting payload produces 409 `IDEMPOTENCY_CONFLICT`; non-owner plan read rejected with 403 `FORBIDDEN` | **PASS** |
| **03** | Durable PostgreSQL Persistence via Repository Layer | Durably written to PostgreSQL in `narrative.story_plans` and `narrative.story_plan_objectives` | **PASS** |
| **04** | Explicit Plan Version & Lifecycle State | Initial plan has explicit `plan_version = 1` and `status = 'draft'` | **PASS** |
| **05** | Author Review / Activation Semantics | Author explicitly activates plan via Node API `POST /api/v1/ai/story-plans/:id/activate`; reaches `status = 'active'` | **PASS** |
| **06** | Deterministic Current Objective Selection | Context preview for Chapter 1 deterministically selects Objective #1 (`order_index: 1`, `target_chapter: 1`) | **PASS** |
| **07** | Context Preview Carries Plan Version & Objective Provenance | `planning_context` and `current_objective` carried in context preview envelope with `plan_id` and `plan_version` | **PASS** |
| **08** | Future-Information Leakage Guard (Machine-Checkable) | **Assertion verified:** Future objectives #2 and #3 are 100% absent from `narrative.events`, `narrative.facts`, and context preview canon lanes | **PASS** |
| **09** | Standard P1 Generation Reuse | AI writing generation reuses active plan context, completing with `validation_status = 'passed'` and valid patch | **PASS** |
| **10** | Unaccepted Generation Safety (Author Control) | Unaccepted generation creates no revision rows, leaves `chapters.latest_revision_id` untouched, and leaves objective status `pending` | **PASS** |
| **11** | Accepted Generation Persists via `acceptDraft()` & Outbox | Accepted draft persists revision with `source_type = 'AI_DRAFT_ACCEPT'` and enqueues `INCREMENTAL_ANALYSIS` outbox event | **PASS** |
| **12** | Story Brain Memory Advances Only from Accepted Content | Incremental analysis of accepted draft advances Story Brain version from 2 to 3; outbox marked `COMPLETED` | **PASS** |
| **13** | Explicit Plan Progress Update | Objective #1 status explicitly patched to `completed` via Node API; mismatched novel update rejected without mutating DB state | **PASS** |
| **14** | Next Chapter / Scene Receives Next Objective | Context preview for Chapter 2 deterministically advances to next sequential Objective #2 | **PASS** |
| **15** | Plan Edit Creates Version 2 without Rewriting Historical Canon | Plan edit creates Version 2; Plan 1 superseded, Plan 2 active, historical Story Brain canon version 3 intact | **PASS** |
| **16** | Subsequent Context Observes Active Plan Version 2 | Context preview for Chapter 2 observes updated Plan Version 2 objective with canon intact | **PASS** |

---

## 3. Test Suite & Validation Evidence

### Offline Evidence Validator
- Script: `scripts/verify_ai_pipe_02b_outline_planning_evidence.py`
- Self-test mutants: 10 negative mutants tested and successfully rejected (fail-closed verification).
- Result: **0 errors, 16/16 checkpoints verified**.

### Route Unit Tests & Gateway Tests
- `ai-service/tests/test_story_plan_routes.py`: 5/5 passed (lifecycle, idempotency match, idempotency 409 conflict, version advancement, mismatched novel scoping).
- `ai-service/tests/test_narrative_repository_contract.py`: 27/27 passed across InMemory, Json, and Postgres repository implementations.
- `backend`: 41/41 unit/integration tests passed, including Story Plan gateway forwarding, cross-author ownership guards, and transactional outbox.
- TypeScript typecheck: `npm run typecheck` passed with 0 errors.

---

## 4. Lineage & Next Steps

1. **Clean Code Commit (`CODE_SHA`):** `598f418db5f127aac48a025692668658028d7370`
2. **Child Evidence & Documentation Commit:** This commit records the live evidence JSON, this updated execution report, and updates `promt.md`.
3. **Handoff Status:** `LOCAL_PASS_CI_PENDING`. Full local gate passed on clean code SHA; branch pushed to remote.
4. **Ownership:** ChatGPT owns remote PR opening, CI oversight, and final merge into `main`.
