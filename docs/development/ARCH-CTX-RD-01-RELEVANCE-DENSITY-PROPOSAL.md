# ARCH-CTX-RD-01 — Narrow Relevance-Density Routing Proposal

## Status

**PROPOSAL — NOT IMPLEMENTED**

Evidence basis: `docs/development/EVAL-01-FINAL-CLOSURE.md`.

This proposal converts the EVAL-01 conclusion into the smallest production change that preserves existing retrieval contracts.

It does not authorize P8-05 cleanup.

## 1. Problem

Current `WritingService.preview_context()` does:

```text
NarrativeRepository.get_structured_context()
  -> broad canonical entity/state package
SemanticRetrieverService.retrieve()
  -> semantic memories
WritingContextPackage
  -> ContextBudgetPacker(default 12k)
```

The repository intentionally returns broad canonical context. `ContextBudgetPacker` then owns the single final budget.

EVAL-01 showed two failure modes:

```text
broad@12k
  -> entity/state breadth can displace semantic/recent evidence

broad@20k
  -> restores evidence
  -> can introduce context dilution / attention competition
```

Balanced scope-first retained the same semantic/recent/rule evidence while reducing entity/state breadth and repaired the targeted rq-0025 regression.

## 2. Evidence boundary

Validated candidate:

```text
required entity scope =
  locked entities
  + query-named canonical entities
  + entities referenced by semantic top-8
  + participants from newest 5 recent events

then choose minimum full-fit tier:
  12k / 16k / 20k / 24k
```

Validated production-shaped limits:

```text
semantic limit = 8
recent limit   = 20
```

Do not generalize the first implementation beyond these limits.

## 3. Architecture decision

Keep retrieval, scoping, and packing as separate responsibilities.

```text
NarrativeRepository
  -> broad canonical package

SemanticRetrieverService
  -> semantic/hybrid result
  -> resolved query-entity signals

BalancedRelevanceScopeBuilder          NEW
  -> narrow entity/current-state breadth only

ContextBudgetRouter                    NEW
  -> minimum full-fit tier

ContextBudgetPacker                    EXISTING / unchanged role
  -> deterministic whole-artifact packing

WritingService
  -> orchestration only
```

Do not move relevance logic into `ContextBudgetPacker`.

## 4. New application component: BalancedRelevanceScopeBuilder

Suggested file:

`ai-service/application/context_scope.py`

Input:

```text
WritingContextPackage
query_entity_ids
explicit_character_name (optional)
recent_scope_participant_entity_ids
```

The package already contains semantic top-8 payloads and each semantic payload exposes `entity_id/entity_ids`.

Required IDs:

```text
locked entity IDs
UNION query_entity_ids
UNION semantic memory entity IDs
UNION newest-five recent participant entity IDs
UNION explicit character_name exact canonical match, when supplied
```

Output:

- same brain version;
- same recent events;
- same semantic memories and order;
- same world rules and order;
- same author constraints;
- only `entities` and `current_states` are scoped.

State rule:

> retain a current state only when its `entity_id` belongs to a retained entity.

No gold labels, LLM entity extraction, fuzzy matching, or relationship expansion may participate in this scope.

## 5. Query-named entities: reuse production hybrid signals

Do not duplicate EVAL's substring matcher in `WritingService`.

Production already resolves query entities for hybrid-v1 using:

- canonical entity names;
- confirmed aliases;
- tenant/novel/story scope;
- chapter-cutoff-safe active participation.

Extend `SemanticRetrievalResult` additively with:

```text
query_entity_ids: tuple[str, ...]
related_entity_ids: tuple[str, ...]
hybrid_signals_resolved: bool
```

On successful hybrid-v1 ranking, return the exact signals already computed by `SemanticRetrieverService`.

The scope builder uses `query_entity_ids` only. `related_entity_ids` is trace/diagnostic data and is not part of balanced-v1 because EVAL did not validate relationship expansion in the scope.

If hybrid signal resolution fails, set `hybrid_signals_resolved=false` and do not activate balanced-v1.

## 6. Recent participant IDs: use normalized identity

EVAL fixtures use canonical entity IDs in recent events. Production `recent_events[].participants` may contain names or IDs, so raw strings are not a safe scope key.

PostgreSQL already has normalized `event_participants(event_id, entity_id)`.

Without a schema migration, `PostgresNarrativeRepository.get_structured_context()` should add to non-prompt metadata:

```text
context_summary["recent_scope_participant_entity_ids"]
```

This list contains unique canonical entity IDs participating in the newest five active recent events after:

- chapter cutoff;
- supersede resolution;
- tenant/novel scope.

Do not add this helper list to the prompt payload itself.

The semantic runtime is already PostgreSQL-only; if normalized participant identity is unavailable, balanced-v1 is ineligible and routing falls back to legacy-v1.

## 7. New application component: ContextBudgetRouter

Suggested file:

`ai-service/application/context_routing.py`

Version:

`balanced-scope-v1`

Tiers are versioned constants, not free-form runtime tuning:

```text
12000
16000
20000
24000
```

Algorithm:

```text
for tier in tiers:
  packed = ContextBudgetPacker.pack(scoped_package, maximum=tier)

  if:
    protected_overflow == false
    AND budget_overflow == false
    AND dropped_artifact_count == 0
  then:
    select this tier
    return packed

no tier fits:
  unresolved
```

`deduplicated_semantic_count > 0` is allowed: canonical recent-event deduplication is an existing lossless representation rule, not an artifact drop.

The router never increases above 24k in v1.

## 8. >24k behavior

If the scoped package cannot full-fit at 24k:

```text
routing_status = unresolved
routing_reason = scoped_package_exceeds_max_tier
```

Generation must fail closed before the LLM call rather than:

- silently dropping protected/retrieved evidence;
- falling back to broad@12k;
- automatically growing to 32k/64k;
- invoking an unvalidated LLM compression layer.

Suggested domain/application error:

`ContextRoutingUnresolvedError`

Suggested job error code:

`CONTEXT_SCOPE_EXCEEDS_MAX_TIER`

A later compression proposal requires its own evidence.

## 9. Narrow eligibility gate

Balanced-v1 activates only when all are true:

```text
CONTEXT_ROUTING_POLICY == balanced-scope-v1
semantic retrieval status == ok
semantic ranking version == hybrid-v1
hybrid_signals_resolved == true
chapter cutoff is present
semantic limit is default 8
recent limit is default 20
no explicit token_budget compatibility override
normalized recent participant IDs are available
```

Otherwise use current behavior unchanged:

`legacy-v1 -> ContextBudgetPacker.pack(package, maximum=token_budget)`

This preserves Phase 6 fallback and direct preview compatibility.

## 10. Feature flag and rollback

Add typed setting:

`CONTEXT_ROUTING_POLICY`

Allowed values:

```text
legacy-v1
balanced-scope-v1
```

Initial default:

`legacy-v1`

Rollout:

```text
implementation/CI      legacy-v1 default
demo/staging           balanced-scope-v1
acceptance smoke       compare routing traces
default switch         separate reviewed action
rollback               set legacy-v1
```

No data migration is required for rollback.

## 11. WritingService integration

Target flow in `preview_context()`:

```text
1. repository.get_structured_context(..., enforce_token_budget=False)
2. semantic_retriever.retrieve(...)
3. attach semantic payloads + retrieval trace
4. evaluate routing eligibility
5a. legacy-v1:
      current ContextBudgetPacker behavior
5b. balanced-scope-v1:
      scope_builder.scope(...)
      budget_router.route(...)
6. return packed WritingContextPackage
```

`process_generation()` remains responsible for hashing the final prompt context after routing.

Context hash semantics do not change.

## 12. Observability contract

Add deterministic operational traces without changing existing field types.

`context_summary` remains `dict[str, list[str]]`; store only string/list trace values there:

```text
context_routing_version
context_routing_status
context_routing_reason
context_scope_policy
scope_query_entity_ids
scope_semantic_entity_ids
scope_recent_participant_entity_ids
scope_locked_entity_ids
semantic_retrieval_status
semantic_ranking_version
dropped_entity_ids
dropped_event_ids
dropped_fact_ids
dropped_semantic_memory_ids
```

Numeric routing/packing measurements belong in `token_budget`:

```text
routing_selected_tier
scope_entity_count_before
scope_entity_count_after
scope_state_count_before
scope_state_count_after
protected_overflow
budget_overflow
```

These are operational traces, not chain-of-thought.

Do not log manuscript text solely for routing diagnostics.

## 13. Compatibility invariants

Balanced-v1 must not change:

- embedding model/version/dimension/normalization;
- exact pgvector cosine retrieval;
- chapter cutoff;
- hybrid-v1 weights;
- semantic limit 8;
- recent limit 20;
- semantic memory ordering;
- recent event ordering;
- world-rule ordering;
- author constraints;
- context hash definition;
- ContextBudgetPacker whole-artifact/protected-artifact semantics.

No database migration.

No ANN/HNSW/IVFFlat.

## 14. Implementation files expected

New:

```text
ai-service/application/context_scope.py
ai-service/application/context_routing.py
ai-service/tests/test_context_scope.py
ai-service/tests/test_context_routing.py
```

Modify narrowly:

```text
ai-service/domain/models.py
  expose hybrid query-signal trace in SemanticRetrievalResult

ai-service/application/semantic_retriever.py
  return already-resolved hybrid signals

ai-service/infrastructure/postgres_narrative_repository.py
  expose normalized newest-five participant IDs in context_summary

ai-service/application/writing_service.py
  orchestrate eligibility -> scope -> tier routing

ai-service/core/settings.py
ai-service/.env.example
docker-compose.yml
ai-service/docker-compose.yml
  feature flag

ai-service/main.py
  construct/inject scope builder and budget router from typed settings

existing tests / composition tests
  dependency wiring and rollback coverage
```

Do not modify `ContextBudgetPacker` unless implementation reveals a strictly necessary interface-only helper; its selection semantics are frozen for this slice.

## 15. Required tests

Unit:

1. locked entities always retained;
2. query entities retained;
3. semantic top-8 entity IDs retained;
4. newest-five canonical recent participants retained;
5. unrelated entities/states removed;
6. states remain paired to retained entities;
7. scope deterministic;
8. no gold/evaluation fields influence scope;
9. tier selection chooses 12/16/20/24 minimum full-fit tier;
10. >24k becomes explicit unresolved;
11. deduplicated semantic/recent representation does not falsely fail full-fit.

Fallback/regression:

12. semantic provider failure -> legacy-v1;
13. hybrid signal failure -> legacy-v1;
14. semantic-only ranking fallback -> legacy-v1;
15. semantic disabled -> legacy-v1;
16. missing chapter cutoff -> legacy-v1;
17. explicit `token_budget` -> legacy compatibility path;
18. non-default semantic/recent limits -> legacy-v1;
19. feature flag legacy-v1 is byte-for-byte behavior-compatible with current packing tests.

PostgreSQL integration:

20. recent scope IDs come from normalized `event_participants`;
21. future event participants do not enter scope before cutoff;
22. superseded event participants do not enter the newest-five scope window;
23. tenant isolation remains intact.

Evaluation regression fixtures:

24. source_1x 7/7 preserve exact semantic/recent/rule IDs;
25. source_1x 7/7 full-fit candidate at 12k;
26. multilane stress still escalates tiers rather than assuming universal 12k.

## 16. Acceptance gate

Implementation may be proposed for rollout only if:

```text
legacy feature flag regressions       PASS
new unit tests                        PASS
PostgreSQL integration               PASS
future leakage                       0
protected overflow on accepted route 0
source_1x semantic/recent/rules       exact
source_1x 12k full-fit                7/7
stress tier escalation                PASS
Compose smoke                         PASS
P8-05                                 BLOCKED
```

No new live A/B generation experiment is required unless implementation produces a behavior mismatch or a new reproduced quality failure.

## 17. Decision

Recommended implementation target:

```text
balanced-scope-v1
  -> canonical relevance scope
  -> minimum full-fit 12/16/20/24k
  -> explicit unresolved above 24k
  -> legacy-v1 feature-flag rollback
```

This is the smallest production change justified by EVAL-01.
