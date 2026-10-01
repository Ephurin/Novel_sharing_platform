# ASTRA REVIEW — ARCH-CTX-RD-01

## Verdict

**APPROVED_FOR_IMPLEMENTATION_SLICE**

The proposal is consistent with EVAL-01 evidence and current production composition.

It preserves the accepted retrieval stack and limits the change to context scoping/routing.

## Reviewed against current code

Current production path:

```text
PostgresNarrativeRepository.get_structured_context()
  -> WritingService.preview_context()
  -> SemanticRetrieverService.retrieve()
  -> ContextBudgetPacker.pack()
  -> context hash
  -> LLM
```

Composition point:

`ai-service/main.py` constructs `WritingService` and is the correct place to inject policy components/settings.

## Required implementation invariants

Implementation must preserve:

```text
embedding model/version/dimension
hybrid-v1 weights
chapter cutoff
semantic top-8
recent top-20
ContextBudgetPacker selection semantics
context hash definition
Phase 6 fallback
P8-05 blocked state
```

## Approved design details

1. **Scope before budget** at application layer.
2. Reuse existing hybrid query-entity resolution rather than duplicating name/alias logic.
3. Use normalized `event_participants` identity for newest-five recent participant expansion.
4. Scope only entity/current-state lanes.
5. Keep semantic/recent/rules/constraints unchanged.
6. Select minimum no-drop tier from 12k/16k/20k/24k.
7. Fail closed above 24k rather than silently truncating or auto-growing context.
8. Feature flag default remains `legacy-v1`.
9. Explicit token-budget and non-default retrieval-limit callers stay on compatibility path.
10. No DB migration.

## Implementation risk notes

### Normalized recent participant identity

Do not scope from raw `recent_events[].participants`: those strings are not guaranteed canonical entity IDs.

The implementation should derive newest-five participant IDs from existing normalized `EventParticipantRecord` rows and expose them outside the prompt payload.

### Hybrid fallback

Balanced-v1 is eligible only for successful `hybrid-v1` ranking with successfully resolved hybrid signals.

`semantic-only-fallback-v1`, provider fallback, missing cutoff, or semantic-disabled paths must preserve legacy behavior.

### Full-fit definition

A tier is accepted only when:

```text
protected_overflow == false
budget_overflow == false
dropped_artifact_count == 0
```

Existing semantic/recent deduplication is allowed and is not a drop.

### Trace typing

Keep `context_summary` as `dict[str, list[str]]`.

Numeric routing counters/tier belong in `token_budget`.

## Required implementation slice

Suggested slice name:

`CTX-RD-01 — Balanced Scope + Adaptive Tier Routing`

Expected new modules:

```text
application/context_scope.py
application/context_routing.py
tests/test_context_scope.py
tests/test_context_routing.py
```

Expected narrow modifications:

```text
domain/models.py
application/semantic_retriever.py
infrastructure/postgres_narrative_repository.py
application/writing_service.py
core/settings.py
main.py
env/compose configuration
composition/regression tests
```

## Acceptance gate

Implementation is acceptable only if:

```text
legacy-v1 behavior regression      PASS
scope/routing unit tests           PASS
PostgreSQL identity/cutoff tests   PASS
future leakage                     0
protected overflow accepted route  0
source_1x exact semantic/recent/rules
source_1x full-fit 12k              7/7
stress tier escalation             PASS
Compose smoke                      PASS
default policy                     legacy-v1
P8-05                              BLOCKED
```

No additional live A/B generation test is required unless implementation differs from the evaluated policy or exposes a new reproducible failure.

## Decision

The architecture proposal is ready to merge and the implementation slice may be opened separately.

Production activation remains a later reviewed action.
