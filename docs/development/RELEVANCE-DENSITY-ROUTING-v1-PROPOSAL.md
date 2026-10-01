# Narrow Architecture Proposal — Relevance-Density Context Routing v1

## Status

**PROPOSED — NOT YET AUTHORIZED FOR IMPLEMENTATION**

Evidence basis:

- EVAL-01 final closure: `docs/development/EVAL-01-FINAL-CLOSURE.md`
- EVAL-01N scope-first diagnostic
- EVAL-01O sealed live relevance-density validation

This proposal changes only how entity/current-state breadth and context budget tier are selected before the existing deterministic packer.

It does not change:

- embedding model/version/dimension;
- semantic retrieval algorithm;
- hybrid-v1 weights;
- temporal cutoff;
- ContextBudgetPacker packing semantics;
- LLM prompt renderer;
- P8-05 cleanup state.

## 1. Current production path

Current `WritingService.preview_context()`:

```text
repository.get_structured_context(...)
    ↓
optional semantic retrieval
    ↓
attach semantic_memories
    ↓
ContextBudgetPacker.pack(package, maximum=token_budget)
```

The repository returns broad entity/current-state context.

Therefore the current packer must simultaneously absorb:

- broad entities/states;
- world rules;
- recent events;
- semantic memories;
- author constraints.

Under pressure this can either displace semantic/recent evidence at 12k or create context dilution when the broad package is given a larger budget.

## 2. Proposed production path

```text
repository.get_structured_context(...)
    ↓
semantic retrieval + hybrid ordering
    ↓
UNSCOPED WritingContextPackage
    ↓
RelevanceScopeBuilder
    ↓
SCOPED WritingContextPackage
    ↓
ContextBudgetRouter
    ↓
selected tier: 12k / 16k / 20k / 24k
    ↓
ContextBudgetPacker.pack(scoped_package, maximum=tier)
    ↓
prompt context
```

Principle:

> scope first, budget second, pack last.

## 3. New component: RelevanceScopeBuilder

Suggested module:

`ai-service/application/context_scope.py`

Responsibility:

- derive deterministic entity IDs from runtime evidence;
- filter entity/current-state breadth;
- preserve all protected entities;
- leave semantic/recent/rules/constraints unchanged;
- record scope observability.

It must not:

- query the LLM;
- inspect benchmark gold labels;
- change semantic ordering;
- change recent-event ordering;
- drop world rules;
- choose the budget tier;
- perform token packing.

### balanced-v1 scope

The initial production proposal uses the live-validated balanced policy:

```text
required entity IDs =
    locked entity IDs
  ∪ query-named entity IDs
  ∪ entity IDs referenced by semantic top-8
  ∪ participants from newest 5 recent events
```

Then:

```text
entities =
  every locked entity
  + every entity whose stable entity_id is in required IDs

current_states =
  states whose entity_id is retained
```

All retained entity/state bundles remain atomic.

### Query-named detection

V1 uses deterministic canonical-name/alias matching only.

Rules:

- case-insensitive Unicode string match;
- ignore empty names;
- ignore names shorter than 3 characters;
- canonical names and aliases come only from the current Story Brain entity set;
- no fuzzy matching in v1;
- no LLM NER in the routing decision.

Input query for scope construction is the same generation semantic query already derived from:

```text
instruction + selected_text
```

This avoids a second independently generated query.

### Semantic-participant IDs

Use the exact semantic results already returned by the accepted retriever.

Production default:

```text
semantic scope window = top 8
```

For each retained semantic memory, collect its canonical entity IDs.

No additional retrieval call is allowed.

### Recent-participant safety expansion

Use only the newest five events from the already-loaded recent-event lane.

```text
recent scope window = 5
```

Collect every stable participant entity ID.

This safety expansion is intentionally small and was selected over retrieval-only scope after EVAL-01N/O.

## 4. New component: ContextBudgetRouter

Suggested module:

`ai-service/application/context_routing.py`

Responsibility:

- test whether the already-scoped package fully fits a supported tier;
- choose the smallest tier that preserves the complete scoped input;
- return an explicit unresolved result above the supported frontier.

Supported v1 tiers:

```text
12_000
16_000
20_000
24_000
```

Algorithm:

```python
for tier in (12000, 16000, 20000, 24000):
    packed = packer.pack(scoped_package, maximum=tier)
    if full_fit(scoped_package, packed):
        return tier, packed

return unresolved
```

### Definition of full fit

Full fit means artifact identity/count preservation for:

- scoped entities;
- scoped current states;
- world rules;
- recent events;
- semantic memories;
- author constraints.

And:

```text
protected_overflow == false
dropped_artifact_count == 0
```

Do not require original tuple ordering where the packer intentionally canonicalizes output order.

Prompt-level deterministic order remains the packer's responsibility.

## 5. >24k behavior

If the complete scoped package does not fit 24k:

```text
status = context_scope_unresolved
reason = scoped_package_exceeds_supported_frontier
```

V1 must not:

- silently truncate protected artifacts;
- silently choose an arbitrary subset;
- increase context to 32k/64k;
- invoke an LLM summarizer;
- mutate semantic limits to force a pass.

The generation path should follow an explicit compatibility fallback policy.

Proposed initial fallback:

```text
feature flag rollout phase:
  fall back to legacy current routing
  record unresolved reason

after balanced-v1 becomes default:
  return/record explicit routing fallback state
  still preserve legacy rollback path
```

A future compression architecture requires separate evidence.

## 6. WritingService integration

Current insertion point:

`WritingService.preview_context()`

Proposed responsibilities:

```text
1. load broad structured context
2. run semantic retrieval if available
3. create package with semantic memories
4. if routing policy == legacy:
       current ContextBudgetPacker behavior
5. if routing policy == balanced-v1:
       scope = RelevanceScopeBuilder.build(...)
       route = ContextBudgetRouter.route(scope.package)
       return route.packed_package
```

Do not move relevance logic into `ContextBudgetPacker`.

Reason:

- retrieval decides evidence relevance;
- scope decides entity/state accompaniment;
- router decides budget tier;
- packer decides deterministic whole-artifact packing.

These are separate responsibilities and should remain independently testable.

## 7. Semantic retrieval fallback

If semantic retrieval is unavailable or returns fallback status:

- do not fail generation solely because semantic scope is unavailable;
- construct scope from:
  - locked entities;
  - query-named entities;
  - newest-five recent participants;
- keep the existing deterministic fallback semantics of the semantic retriever;
- record semantic fallback reason in context summary.

No fake semantic IDs may be synthesized.

## 8. Explicit user token_budget override

Current `preview_context(... token_budget=...)` accepts a direct maximum.

Compatibility proposal:

- under `legacy`, preserve existing behavior exactly;
- under `balanced-v1`, an explicit token budget is a hard caller ceiling;
- router may choose the smallest supported tier <= caller ceiling;
- if no full-fit tier exists under that ceiling, mark unresolved/fallback rather than silently exceeding it.

Example:

```text
caller ceiling = 16k
scoped package fits 12k -> choose 12k
scoped package fits 16k -> choose 16k
scoped package needs 20k -> unresolved under caller ceiling
```

## 9. Observability contract

Add context-summary fields:

```text
context_routing_policy
context_scope_version
context_budget_routing_version

scope_query_named_entity_ids
scope_semantic_entity_ids
scope_recent_participant_ids
scope_required_entity_ids

scope_entity_count_before
scope_entity_count_after
scope_state_count_before
scope_state_count_after

context_estimated_tokens_before_scope
context_estimated_tokens_after_scope
context_selected_budget

context_routing_status
context_routing_reason
```

Existing packer observability remains authoritative for:

```text
dropped_entity_ids
dropped_event_ids
dropped_fact_ids
dropped_semantic_memory_ids
protected_overflow
budget_overflow
packing_version
estimator_version
```

Generation jobs already persist `context_summary` and `context_hash`, so no new tracing subsystem is required for v1.

## 10. Version identifiers

Proposed constants:

```text
CONTEXT_SCOPE_VERSION = "balanced-scope-v1"
CONTEXT_BUDGET_ROUTING_VERSION = "scoped-tier-router-v1"
```

Existing:

```text
CONTEXT_PACKING_VERSION = "context-budget-v1"
```

Keep these independent so future scope/routing changes do not invalidate packer-version semantics.

## 11. Feature flag / rollout boundary

Proposed runtime setting:

```text
CONTEXT_ROUTING_POLICY=legacy
CONTEXT_ROUTING_POLICY=balanced-v1
```

Initial default:

`legacy`

Rollout sequence:

```text
1. merge implementation with default legacy
2. CI regression suite
3. local/live smoke with balanced-v1
4. compare observability against EVAL frontier
5. enable balanced-v1 in demo/staging
6. only then consider default switch
```

Rollback:

```text
CONTEXT_ROUTING_POLICY=legacy
```

No schema rollback or embedding rebuild should be required.

## 12. Required implementation tests

### Scope unit tests

Must prove:

- locked entities always retained;
- query-named canonical name retained;
- query-named alias retained;
- semantic top-8 participants retained;
- newest-five recent participants retained;
- unrelated entities removed;
- current state follows retained entity;
- orphan/unstable IDs do not create accidental inclusion;
- output is deterministic;
- gold labels are not inputs.

### Router unit tests

Must prove:

- 9k scoped package -> 12k;
- 14k -> 16k;
- 18k -> 20k;
- 22k -> 24k;
- >24k -> unresolved;
- explicit caller ceiling is respected;
- no protected overflow is accepted as full fit;
- no dropped artifact is accepted as full fit.

### Regression tests

Reuse frozen EVAL fixtures to prove:

- source_1x 7/7 balanced packages fit 12k;
- semantic IDs remain exact;
- recent IDs remain exact;
- rule IDs remain exact;
- rq-0025 scope remains equivalent to the sealed EVAL-01O candidate;
- stress fixtures still select 16/20/24k where required;
- no future-information leakage is introduced.

### WritingService tests

Must prove:

- default legacy path remains behaviorally unchanged before rollout;
- balanced-v1 is feature-flagged;
- semantic failure still generates via fallback;
- routing metadata is persisted to the generation job;
- context hash is based on the final packed prompt context.

## 13. API compatibility

No public writing-request API change is required.

Existing generation response can continue exposing `context_summary`.

No database migration is required for the first implementation slice if context summary remains JSON-compatible in the current persistence model.

If later analytics require first-class routing columns, that is a separate observability migration.

## 14. Security and correctness invariants

The implementation must preserve:

- tenant isolation;
- pinned Story Brain version behavior;
- temporal chapter cutoff before semantic ranking;
- confirmed/locked canonical data semantics;
- author constraints;
- future-leak guarantees;
- deterministic context hash;
- no benchmark gold access from runtime code.

Evaluation fixture helpers must never be imported by production application modules.

## 15. Files expected in the implementation slice

Likely:

```text
ai-service/application/context_scope.py            NEW
ai-service/application/context_routing.py          NEW
ai-service/application/writing_service.py          MODIFY
ai-service/tests/test_context_scope.py             NEW
ai-service/tests/test_context_routing.py           NEW
ai-service/tests/test_writing_service.py           MODIFY
ai-service/docs/PIPELINE.md                        UPDATE
ai-service/docs/API_CONTRACTS.md                   UPDATE observability notes if needed
```

`ai-service/application/context_budget.py` should remain unchanged unless a narrowly identified testability hook is required and separately reviewed.

## 16. Non-goals

Not part of this slice:

- LLM compression;
- summaries of oversized packages;
- context windows >24k;
- embedding changes;
- hybrid weight changes;
- ANN/vector infrastructure changes;
- relationship-graph expansion beyond IDs already represented in evidence;
- P8-05 cleanup;
- frontend changes.

## 17. Acceptance criteria for proposal approval

Implementation may begin only if review accepts all of these:

```text
scope is deterministic
gold-free runtime inputs
semantic/recent/rules preserved
locked entities preserved
tier selection minimum-full-fit
>24k is explicit, not silently truncated
legacy remains rollback path
packer stays single deterministic budget owner
production default remains legacy for first merge
```

## Recommendation

Approve a narrow implementation slice for `balanced-scope-v1 + scoped-tier-router-v1` behind a legacy-default feature flag.

This is the smallest production change consistent with the complete EVAL-01 evidence chain.
