# P2-07D — Shared World Setup rule authority for Memory + Writing Context

- **Issue:** #120 (parent #114). Stage-0 diagnostics: PR #119 (not merged, not used as acceptance).
- **Branch:** `gemini/p2-07d-world-rule-effective-head` → base `integration/p2-planning-studio` (`30dc39e1`).
- **Revision:** R3, addressing GPT-6 review comments #6758396923 (F-01, F-02) and #6758755619 (F-03).

## 0. Verdict

| Item | Status |
|---|---|
| **F-01 — approved successor authority** | **`CONTRACT_BLOCKED`** for "replace a World Setup rule with an approved successor". Delivered instead: a conservative, fail-closed gate (review option A). |
| **F-02 — resolver scope** | **FIXED.** World Setup restrictions apply only to edges touching a global World Setup rule; P1 / non-setup families keep the pre-existing semantics. |
| **F-03 — state projection synchronization** | **FIXED.** `_projection_inputs` in `PostgresNarrativeRepository` and `rebuild_projection` in `InMemoryNarrativeRepository` now resolve effective facts through `resolve_effective_facts` and filter fact-bound `StateTransitionRecord` rows to `effective_fact_ids`. Persisted `CurrentEntityStateRecord`, `/memory`, and `WritingContextPackage` remain 100% synchronized across corrections (unlocked/locked) and retirement. |
| Shared resolver across Memory / Context / Writer / dispatch fence | Delivered (fail-closed for unverified setup successor). |

R1's claims "CONTRACT SUFFICIENT" and "author-approved successor" remain **withdrawn**.

## 1. Why F-01 is `CONTRACT_BLOCKED`

Inventory on the baseline (`git grep supersedes_id|is_retired` over `ai-service/`, excluding tests):

- **No production writer sets `narrative.facts.supersedes_id`.** The column exists (migration `0010_fact_supersession`), but nothing creates fact successors.
- **Setup review only creates roots.** [`setup_review.py`](../../../ai-service/infrastructure/setup_review.py) creates each accepted `world_rule` with a deterministic id (`uuid5(job.id, 'setup-fact:'+proposal_id)`). It writes a receipt in `narrative.proposal_decisions.edited_payload` (`artifact_ids`, `actor_id`, `tenant_id`, `novel_id`, setup provenance). It also **rejects key collisions** (`SETUP_FACT_COLLISION`), so it never writes an amendment.
- **No decision type, receipt field or audit row links a successor fact to the parent it replaces** under an author decision. That linkage would be the UX-05 amendment contract, which is out of scope here.

As a result, `confirmation_status`, `source_type`, `created_by`, scope and `supersedes_id` cannot tell an author-approved amendment apart from an unaudited row written directly to the table. The PG tests prove this with a well-formed successor that matches source, actor, scope and brain. Per Issue #120, the result is `CONTRACT_BLOCKED`, and we did not add a workaround.

### Conservative policy delivered (fail closed)

When a confirmed `supersedes_id` edge touches a global World Setup rule (the child has global world-rule shape, or the parent is a global setup root), [`resolve_effective_facts`](../../../ai-service/domain/projection.py) raises `WorldRuleLineageError`:

- `WORLD_RULE_SUCCESSOR_UNVERIFIED`: the edge is well-formed, but no approval receipt contract exists.
- `WORLD_RULE_LINEAGE_MALFORMED`: self-loop, unknown parent, or out-of-scope parent.

Effect on each consumer:

- `GET /v1/story-brains/{id}/memory` → `409 INVALID_CANON_HISTORY`, `detail.reason` set to the code above.
- `GET /v1/story-brains/{id}/context-preview` → `409 INVALID_CANON_HISTORY`, with the same `reason`.
- Writer (`process_generation`) → `WRITING_CONTEXT_AUTHORITY_DENIED`, **0 provider calls**.

So an unaudited successor never silently replaces the approved root. The old root is never served as current while a competing successor exists, and the successor never reaches the AI. Pending or rejected successors are ignored, so the approved root stays effective.

### Minimal contract proposal to unblock (not implemented)

1. An amendment decision row in the proposal/decision audit, e.g. `decision='amend_accept'`. It must carry `parent_fact_id`, `successor_fact_id`, `actor_id`, `tenant_id`, `novel_id`, `story_brain_id`, `expected_brain_version`, `decided_at`. It must be written in the same transaction that inserts the successor (with `supersedes_id = parent_fact_id`) and bumps `brain_version`.
2. A uniqueness guarantee: at most one accepted amendment per `parent_fact_id`, which makes forks unrepresentable.
3. A resolver input `verified_successor_ids`, loaded only from (1) by the repository. The resolver would accept a World Setup edge only if the child id is in that set and the actor/scope match the receipt. Every other edge stays fail-closed.
4. M0 policy decision: does an amendment after activation require re-activation, or does it extend M0? Today M0 stays strict (`M0_REVIEW_STALE` / `M0_ARTIFACT_INCONSISTENT`).

## 2. F-02 — Compatibility policy

| Fact family / pattern | Behavior (R2/R3) | Baseline reference |
|---|---|---|
| Non-setup confirmed fact superseded by a non-setup confirmed fact (P1 trait, chapter-scoped rule) | Parent hidden, child effective. No World Setup validation. | Baseline `memory` route: `replaced = {supersedes_id}` filter |
| Non-setup fact with unknown/legacy `supersedes_id` | Fact kept, no error | Baseline ignored unknown parents |
| `is_retired=True` standalone fact (any family, incl. setup rule) | Hidden, **no error** | Baseline `memory` hid retired facts; `test_p1_memory_entity_hitl` retires all facts |
| Unconfirmed fact (any family) | Ignored | Baseline filtered to `confirmed` |
| Any edge touching a global World Setup rule | Fail closed (see §1) | New, required by #120 |
| Non-setup fact attached to a setup root (P1 trait, entity-/chapter-/revision-bound) | Fail closed | New |

## 3. F-03 — State Projection Synchronization with Memory & Writing Context

In R2, `_projection_inputs` was reverted to baseline, which loaded all historical facts and fact-bound transitions. As identified by GPT-6 review F-03:
- If a locked P1 fact was superseded or retired, `project()` in `_persist_projection` could crash with `OptimisticLockError` against stale locks or replay obsolete transitions.
- `CurrentEntityStateRecord` (persisted state read when `chapter_number is None`) could diverge from `/memory` live state.

**Delivered in R3:**
1. [`PostgresNarrativeRepository._projection_inputs`](../../../ai-service/infrastructure/postgres_narrative_repository.py):
   - Loads scoped facts ordered deterministically and passes them to `resolve_effective_facts`.
   - Passes only effective facts (`{**f, "is_locked": bool(f.get("is_locked", False))}`) to `project`.
   - Filters `StateTransitionRecord` rows so only transitions where `event_id is not None` OR `str(fact_id) in effective_fact_ids` are replayed.
2. [`InMemoryNarrativeRepository.rebuild_projection`](../../../ai-service/infrastructure/in_memory_narrative_repository.py):
   - Synchronized using `effective_facts = resolve_effective_facts(brain.facts)` and identical transition filtering.
3. **Parity Outcome:**
   - `rebuild_projection`, `CurrentEntityStateRecord`, `/memory` live state, `get_structured_context(chapter_number=None)`, and `get_structured_context(chapter_number=...)` all agree on identical entity attributes.
   - Superseded or retired locked facts never cause `OptimisticLockError` during projection rebuilds.

## 4. Consumers sharing the resolver

- [`entity_hitl_routes.py`](../../../ai-service/api/entity_hitl_routes.py) `memory`: resolver errors map to 409 with reason. `project` errors keep the baseline `invoke` mapping.
- [`narrative_routes.py`](../../../ai-service/api/narrative_routes.py) `preview_writing_context`: 409 with reason.
- [`postgres_narrative_repository.py`](../../../ai-service/infrastructure/postgres_narrative_repository.py):
  - `_projection_inputs`: resolves effective facts and filters transitions for `_persist_projection` and `rebuild_projection`.
  - `get_structured_context`: resolves before the chapter cutoff and the locked/ordinary budget split.
  - `writing_authority_snapshot`: validates with `expected_setup_actor`.
  - `writing_rule_authority_snapshot`: the REPEATABLE READ pre-provider dispatch fence.
- [`in_memory_narrative_repository.py`](../../../ai-service/infrastructure/in_memory_narrative_repository.py):
  - `get_structured_context` and `rebuild_projection`.
- [`writing_service.py`](../../../ai-service/application/writing_service.py) `process_generation`: snapshot before packing, recheck before `generate_writing_draft`.

## 5. Tests

[`test_state_projection.py`](../../../ai-service/tests/test_state_projection.py) (unit):
- independent setup roots + standalone retirement + pending successor ignored;
- P1 corrections / retirement / unknown-parent preserved;
- 16 well-formed-but-unaudited successor variants → `WORLD_RULE_SUCCESSOR_UNVERIFIED`;
- 4 non-setup attachments to a setup root;
- 8 malformed topologies;
- 3 cross-scope rows.

[`test_world_rule_effective_head_postgres.py`](../../../ai-service/tests/test_world_rule_effective_head_postgres.py) (real PostgreSQL, fake providers):
- `test_baseline_single_setup_rule_and_p1_extracted_facts_unchanged` (locked / unlocked).
- `test_well_formed_but_unaudited_successor_chain_never_replaces_root`: 5 variants (2/3 hops, locked/unlocked, retired parent).
- `test_real_setup_review_root_with_receipt_is_not_replaced_by_unaudited_successor`: genuine setup-review root with receipt; unaudited successor fails closed.
- `test_p1_fact_corrections_standalone_retirement_and_pending_setup_successor_preserved` (F-02).
- `test_p1_state_projection_parity_with_memory_and_writing_context_under_corrections_and_retirement` (F-03, locked and unlocked):
  - Evaluates Phase 1 baseline, Phase 2 supersession (with locked/unlocked fact and transition), and Phase 3 retirement.
  - Verifies exact attribute parity between `rebuild_projection`, `CurrentEntityStateRecord`, `/memory`, and `WritingContextPackage` (both unconstrained and chapter-scoped).
  - Verifies zero `OptimisticLockError` and correct state in generation dispatch.
- `test_chapter_cutoff_and_tight_token_budget_never_resurrect_retired_locked_rules`.
- `test_malformed_or_unauthorized_rule_lineage_fails_closed`: 17 cases.
- `test_rule_lineage_context_to_dispatch_fence`: 4 mutation scenarios during packing blocked before provider.
- `test_m0_activation_remains_strict_when_setup_rule_is_superseded_or_retired_pre_activation`.

Reproduce:

```bash
cd ai-service
export TEST_DATABASE_URL=postgresql+psycopg://<user>:<pw>@127.0.0.1:<port>/<db>
export DATABASE_URL="$TEST_DATABASE_URL"
python -m pytest -q -o addopts= -p no:cacheprovider \
  tests/test_state_projection.py tests/test_world_rule_effective_head_postgres.py \
  tests/test_p1_memory_entity_hitl.py tests/test_setup_review_postgres.py \
  tests/test_setup_activation_postgres.py tests/test_writing_plan_authority_postgres.py
```

## 6. Limits

- Roots are not checked against `proposal_decisions` receipts. Legacy and bootstrap roots without receipts are still served, so this PR adds no new root authority.
- Hiding a standalone `is_retired` setup rule follows the baseline Memory semantics. No production writer sets `is_retired` on setup rules today. M0 activation still rejects retired accepted rules.
- No UX-05 amendment API/UI, no schema migration, no live LLM.
