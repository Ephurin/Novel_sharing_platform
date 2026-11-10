# P2-07D — Shared Effective World Setup Rule Authority for Memory + Writing Context

- **Issue:** `#120` (`[P2-07D][Gemini 4 Argon][P1] Shared effective World Setup rule authority for Memory + Writing Context`)
- **Parent:** `#114` (`[P2-07][P1] Amendment-safe Setup & Planning Authority before UX-05`)
- **Stage-0 Diagnostic Baseline:** PR `#119` (unmerged; diagnostic evidence only)
- **Target Branch:** `integration/p2-planning-studio`
- **Deliverable Branch:** `gemini/p2-07d-world-rule-effective-head`

---

## 1. Contract Sufficiency & Scope Evaluation

Before implementing the shared effective-head resolver, we audited `FactRecord` (`narrative.facts`), `SetupItemProposalRecord` (`narrative.setup_item_proposals`), `SetupDecisionRecord` (`narrative.setup_decisions`), and `StoryBrainRecord` (`narrative.story_brains`) against the P2-07D contract requirements:

1. **Unique Fact Identity & Lineage Pointer:**
   - Every canonized setup rule row in `narrative.facts` has a primary UUID (`id`), a nullable lineage parent UUID (`supersedes_id`), `tenant_id`, `novel_id`, `story_brain_id`, `fact_type`, `fact_key`, `value_json`, `is_locked`, `confirmation_status`, `source_type`, `created_by`, and `created_at`.
   - Lineage identity is strictly anchored by Fact UUID (`id` and `supersedes_id`), never by `fact_key` or display text (`statement` / `value_json`).
2. **Global World Setup Rule Family Classification:**
   - Accepted World Setup rules materialized by `SetupReviewRepository.accept_proposal` (`ai-service/infrastructure/setup_review.py`) have:
     - `fact_type == "world_rule"`
     - `subject_entity_id is None`
     - `source_revision_id is None`, `chapter_number is None`, `source_start is None`, `source_end is None`
     - `source_type in {"author_setup", "model_suggestion", "author"}` for root rules (`supersedes_id is None`), and `source_type in {"author_setup", "author"}` for amended successor rules (`supersedes_id is not None`)
     - non-empty `created_by` matching the active setup actor when enforced by writing authority.
3. **Verdict:** **CONTRACT SUFFICIENT (`PASS`)** for deterministic, fail-closed read-side effective-head resolution across Approved Memory, Writing Context, state projection, context budget packing, pre-provider dispatch fencing, and draft validation. No destructive DDL or loosening of M0 (`M0_REVIEW_STALE`, `M0_ARTIFACT_INCONSISTENT`) is required.

---

## 2. Shared Effective-Head Resolver Architecture

Implemented in [`ai-service/domain/projection.py`](../../../ai-service/domain/projection.py) via `resolve_effective_facts(...)`:

```python
def resolve_effective_facts(
    facts: list[dict],
    *,
    tenant_id: str | None = None,
    novel_id: str | None = None,
    story_brain_id: str | None = None,
    expected_setup_actor: str | None = None,
) -> list[dict]:
```

### Enforced Invariants (Fail-Closed with `ProjectionError`)

| Invariant Category | Rule Enforced | Failure Outcome |
|---|---|---|
| **Identity & Duplicate Guard** | Every fact must carry a non-empty `id`/`fact_id`; duplicate IDs in the input set are rejected. | `ProjectionError` |
| **Tenant / Novel / Brain Scope** | If `tenant_id`, `novel_id`, or `story_brain_id` is supplied by the repository/route caller, any fact with a mismatched scope attribute is rejected. | `ProjectionError` |
| **Confirmation Status** | Active facts must have `confirmation_status == "confirmed"` (or legacy `None` for in-memory fixtures). Any `rejected`/`pending` root or leaf without a valid confirmed successor is rejected; any `retired` leaf without a confirmed successor is rejected. | `ProjectionError` |
| **Global Setup `world_rule` Family** | A fact is classified as a global setup `world_rule` iff `fact_type == "world_rule"` and `subject_entity_id`, `source_revision_id`, `chapter_number`, `source_start`, and `source_end` are all `None`. | `ProjectionError` on invalid provenance (`source_type` outside allowed set, missing `created_by`, or actor mismatch) |
| **Supersession Lineage Validity** | For global setup `world_rule` chains: parent (`supersedes_id`) must exist in the loaded novel/brain scope, must also be a valid global setup `world_rule`, must match `(tenant_id, novel_id, story_brain_id)` and `created_by` actor, and must have `confirmation_status in {"confirmed", "retired"}`. | `ProjectionError` on orphan parent, cross-novel/cross-tenant/cross-brain parent, cross-family parent (`character_trait`/chapter-scoped rule), or unapproved parent/child |
| **Graph Topology** | Exactly one active confirmed head is permitted per lineage chain. Self-loops (`id == supersedes_id`), cycles (`A -> B -> A`), and forks (`B -> A` and `C -> A`) are rejected. | `ProjectionError` |
| **Independent Rule Preservation** | Multiple distinct global `world_rule` chains with identical or different `fact_key` values coexist independently as long as each chain has its own valid linear `supersedes_id` history. | All independent active heads returned |
| **Locked Parent Retirement** | When a parent rule (`is_locked=True` or `is_locked=False`) is superseded by a valid successor (`is_locked=True` or `is_locked=False`), the parent is excluded from the returned effective facts and only the head is returned with its own `is_locked` flag. | Superseded locked rule never remains in `locked_rules` or active memory |

---

## 3. Consumer Synchronization Matrix

All read-side consumers now resolve through the same `resolve_effective_facts` authority before filtering, projecting, or packing:

1. **Approved Memory Readback (`GET /v1/story-brains/{novel_id}/memory`)**
   - File: [`ai-service/api/entity_hitl_routes.py`](../../../ai-service/api/entity_hitl_routes.py)
   - Calls `resolve_effective_facts(brain.facts, novel_id=str(novel_id), story_brain_id=brain.metadata.get("brain_id"))`.
   - Passes the resolved effective heads (with `supersedes_id` cleared on the projection copy to prevent double-resolution) into `project(...)`.
   - Converts `ProjectionError` into `HTTP 409` with `detail.code == "INVALID_CANON_HISTORY"`.
2. **PostgreSQL Story Brain & Projection Inputs**
   - File: [`ai-service/infrastructure/postgres_narrative_repository.py`](../../../ai-service/infrastructure/postgres_narrative_repository.py)
   - `get_story_brain` orders `FactRecord` rows deterministically by `(created_at.asc(), id.asc())` and retains lineage ancestors (`confirmation_status == "confirmed" or supersedes_id is not None` plus any referenced parent rows) so `resolve_effective_facts` can verify full chain integrity and reject retired leaves without successors.
   - `_projection_inputs` resolves `FactRecord` rows via `resolve_effective_facts(...)` and filters `StateTransitionRecord` rows with `fact_id` to only effective head IDs before calling `project(...)`.
3. **Writing Context & Budget Packing (`get_structured_context`)**
   - Files: [`ai-service/infrastructure/postgres_narrative_repository.py`](../../../ai-service/infrastructure/postgres_narrative_repository.py), [`ai-service/infrastructure/in_memory_narrative_repository.py`](../../../ai-service/infrastructure/in_memory_narrative_repository.py)
   - Resolves `active_facts = resolve_effective_facts(...)` **before** applying `_is_fact_allowed(..., up_to_chapter)` and **before** partitioning `locked_rules` vs `other_rules`.
   - Prevents chapter-cutoff resurrection and prevents superseded `is_locked=True` rules from bypassing `ContextBudgetPacker` token budgets.
4. **Context Preview Route (`GET /v1/story-brains/{brain_id}/context-preview`)**
   - File: [`ai-service/api/narrative_routes.py`](../../../ai-service/api/narrative_routes.py)
   - Catches `ProjectionError` from `writing_service.preview_context(...)` and fails closed with `HTTP 409` (`detail.code == "INVALID_CANON_HISTORY"`).
5. **Writing Generation Worker & Pre-Provider Dispatch Fence (`process_generation`)**
   - Files: [`ai-service/application/writing_service.py`](../../../ai-service/application/writing_service.py), [`ai-service/infrastructure/postgres_narrative_repository.py`](../../../ai-service/infrastructure/postgres_narrative_repository.py)
   - `writing_authority_snapshot` validates all novel facts with `resolve_effective_facts(..., expected_setup_actor=str(actor))` and raises `WritingContextAuthorityError` on `ProjectionError`.
   - `writing_rule_authority_snapshot` captures a repeatable-read frozen snapshot of `(brain_version, tuple_of_effective_world_rule_heads)` before `preview_context` and re-verifies equality at the pre-provider dispatch fence immediately before `provider.generate_writing_draft(...)`.
   - Any concurrent supersession, retirement, value/lock mutation, or fork between context packing and provider dispatch aborts the job with `error_code = "WRITING_CONTEXT_AUTHORITY_DENIED"` and **zero** provider calls (`len(provider.calls) == 0`).

---

## 4. Verification & Test Evidence

### Automated Test Suites Added / Updated

1. **Unit & Domain Projection Tests:** [`ai-service/tests/test_state_projection.py`](../../../ai-service/tests/test_state_projection.py)
   - `test_resolve_effective_facts_valid_chains_and_independent_rules`: verifies 2-hop/3-hop chains, `is_locked=True -> is_locked=False`, `is_locked=False -> is_locked=True`, retired parent with confirmed head, and independent chains sharing `fact_key`.
   - `test_resolve_effective_facts_rejects_malformed_lineage`: 19 parametrized malformed lineage cases (missing id, duplicate id, orphan parent, fork, self-loop, 2-node cycle, unconfirmed root/successor, retired leaf without successor, cross-tenant/cross-novel/cross-brain edges, non-global-setup parent/child, invalid `source_type`, missing/mismatched `created_by`).
2. **Real PostgreSQL Integration Suite:** [`ai-service/tests/test_world_rule_effective_head_postgres.py`](../../../ai-service/tests/test_world_rule_effective_head_postgres.py)
   - `test_single_setup_rule_and_p1_facts_regression_baseline`: single setup rule + P1 `character_trait` + chapter-scoped `world_rule` baseline.
   - `test_valid_world_rule_chains_unlocked_and_locked_parity`: 8 parametrized combinations (`hops in {2, 3}`, `parent_locked in {False, True}`, `head_locked in {False, True}`, `retire_parent in {False, True}`) verifying exact parity across `/memory`, `/context-preview`, `ContextBudgetPacker`, `process_generation`, `provider.calls[0].context`, and `_validate_draft`, plus durable snapshot invariance (`novel_chapters`, `chapter_revisions`, `outbox_events`, `entities`, `setup_item_proposals`, `setup_decisions`, `story_brains.m0_status`).
   - `test_chapter_cutoff_and_tight_budget_do_not_resurrect_superseded_locked_rule`: proves a superseded `is_locked=True` rule is never resurrected under `up_to_chapter=1` and never bypasses `max_tokens=1` budget when replaced by an unlocked successor.
   - `test_malformed_and_adversarial_world_rule_lineage_fails_closed`: 18 parametrized malformed/adversarial cases across `/memory` (`409 INVALID_CANON_HISTORY`), `/context-preview` (`409 INVALID_CANON_HISTORY`), and `process_generation` (`WRITING_CONTEXT_AUTHORITY_DENIED`, `0` provider calls).
   - `test_pre_provider_dispatch_fence_blocks_mid_flight_rule_mutation`: 4 concurrent mutation scenarios (`supersede_during_packing`, `retire_during_packing`, `mutate_value_during_packing`, `fork_during_packing`) blocked before `provider.generate_writing_draft`.
   - `test_m0_activation_remains_strict_under_rule_lineage_changes`: confirms `M0_REVIEW_STALE` and `M0_ARTIFACT_INCONSISTENT` remain strictly enforced.
3. **CI Workflow Integration:** [`.github/workflows/p2-setup-provenance.yml`](../../../.github/workflows/p2-setup-provenance.yml)
   - Added `tests/test_world_rule_effective_head_postgres.py` to the real PostgreSQL A16 verification step.

### Local Reproduction Commands

```bash
cd ai-service
export TEST_DATABASE_URL="postgresql+psycopg://p207a_user:p207a-offline-fixture@127.0.0.1:57437/p207a_db"
export DATABASE_URL="$TEST_DATABASE_URL"

python -m pytest -q \
  tests/test_state_projection.py \
  tests/test_world_rule_effective_head_postgres.py \
  tests/test_setup_review_postgres.py \
  tests/test_setup_activation_postgres.py \
  tests/test_writing_plan_authority_postgres.py \
  -o addopts= -p no:cacheprovider
```
