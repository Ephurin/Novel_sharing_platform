# Schema Verification Matrix: Tier A Narrow Stubs vs. Tier B Real Alembic Schema

**Branch:** `gemini/p1-ci-isolation`  
**Commit:** `55036fd5314b98ae2d3637e163b276709841893c`  
**Date:** 2026-10-23  

---

## 1. Schema Verification Architecture

In strict response to review finding 3, schema handling is split into two formal, non-interchangeable tiers:

```
+-----------------------------------------------------------------------------------------------------+
|                                 DATABASE SCHEMA VERIFICATION TIERS                                  |
+--------------------------------------------------+--------------------------------------------------+
| TIER A: Narrow Contract Fixture Stubs            | TIER B: Real Supported Alembic & Core Schema     |
+--------------------------------------------------+--------------------------------------------------+
| - Scope: Offline contract testing                | - Scope: Dedicated CI Integration & Live E2E     |
| - Preconditions: Backend migrations ONLY (001-017)| - Preconditions: Backend (001-017) + Alembic head|
| - Tooling required: Node.js only                 | - Tooling required: Node.js + Python 3.12/Alembic|
| - Tables provisioned: 3 minimal stub tables      | - Tables provisioned: 34 public + 21 narrative   |
| - Label: NARROW_STUB_CONTRACT_PASS               | - Label: ALEMBIC_SCHEMA_VERIFIED                 |
+--------------------------------------------------+--------------------------------------------------+
```

---

## 2. Tier A — Narrow Contract Fixture

### 2.1 Definition & Intent
Tier A is invoked solely when running `accept-draft-contract.test.ts` in an environment where Python and Alembic are not installed or have not been executed on the target database.

The test detects the absence of `alembic_version` and provides the minimal shape necessary for `assertControllerIntent()` in `backend/src/modules/novels/controller-intent.ts` to execute its `SELECT ... FOR UPDATE` query without syntax or relation errors.

### 2.2 Provisioned Tables
1. `narrative.autonomous_runs` (columns: `id`, `novel_id`, `tenant_id`, `created_by`, `plan_id`, `plan_version`, `current_objective_id`, `current_chapter_id`, `last_generation_id`, `current_iteration`, `current_retries`, `status`)
2. `narrative.story_plans` (columns: `id`, `novel_id`, `tenant_id`, `plan_version`, `status`)
3. `narrative.story_plan_objectives` (columns: `id`, `plan_id`, `novel_id`, `tenant_id`, `intent_version`, `status`)

### 2.3 Explicit Limitations
- **No Alembic Verification:** Tier A does **not** verify indexes (e.g. `uq_autonomous_runs_active_novel`), foreign key constraints, or non-controller narrative memory tables.
- **Reporting Rule:** Tier A runs **must never** be labeled as `ALEMBIC_SCHEMA_VERIFIED`.

---

## 3. Tier B — Real Integration Schema

### 3.1 Definition & Intent
Tier B is executed in the dedicated `backend-integration` GitHub Actions job and local full integration runs.

The environment applies:
1. All 17 backend SQL migrations via `npx tsx src/core/database/migrate.ts`.
2. All 13 AI-service Alembic migrations via `python -m alembic upgrade head`.

### 3.2 Real Migration Provenance

| Component | Source Path | Version Range | Verifiable Artifact |
|---|---|---|---|
| Backend Core Schema | `backend/src/core/database/migrations/` | `001_auth_user_wallet.sql` to `017_transactional_moderation_evidence.sql` | `schema_migrations` table (18 entries) |
| AI Service Narrative Schema | `ai-service/migrations/versions/` | `0001_narrative_foundation.py` to `0013_objective_intent.py` | `alembic_version` table (head `0013_objective_intent`) |

### 3.3 Verified Tables in `narrative` Schema (21 Tables Total)

```text
 narrative.analysis_runs         | table | postgres
 narrative.autonomous_runs       | table | postgres
 narrative.bootstrap_jobs        | table | postgres
 narrative.current_entity_states | table | postgres
 narrative.entities              | table | postgres
 narrative.entity_aliases        | table | postgres
 narrative.entity_mentions       | table | postgres
 narrative.event_participants    | table | postgres
 narrative.events                | table | postgres
 narrative.facts                 | table | postgres
 narrative.memory_chunks         | table | postgres
 narrative.memory_embeddings     | table | postgres
 narrative.proposal_decisions    | table | postgres
 narrative.proposals             | table | postgres
 narrative.relationships         | table | postgres
 narrative.revision_provenances  | table | postgres
 narrative.state_transitions     | table | postgres
 narrative.story_brains          | table | postgres
 narrative.story_plan_objectives | table | postgres
 narrative.story_plans           | table | postgres
 narrative.writing_generations   | table | postgres
```

### 3.4 Key Real Migration Invariants Verified
1. **Monotone Objective Intent Epoch:**
   Migration `0013_objective_intent` provides `narrative.story_plan_objectives.intent_version` (`INTEGER NOT NULL DEFAULT 0`). Checked by `assertControllerIntent()` to prevent ABA acceptance races.
2. **Single-Writer Active Run Uniqueness:**
   Migration `0009_autonomous_runs` creates partial index:
   ```sql
   CREATE UNIQUE INDEX uq_autonomous_runs_active_novel
   ON narrative.autonomous_runs (tenant_id, novel_id)
   WHERE status IN ('queued', 'running');
   ```
3. **Automatic Detection in Test Suite:**
   When `accept-draft-contract.test.ts` runs on `ephurin_test_integration`, `schemaProbe` confirms `has_alembic=true` and `has_real_runs=true`, bypassing all stub creation and executing directly against the production-grade Alembic schema.
