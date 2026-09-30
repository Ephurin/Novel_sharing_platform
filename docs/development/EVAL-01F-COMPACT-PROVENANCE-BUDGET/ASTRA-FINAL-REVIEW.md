# ASTRA Final Review — EVAL-01F Compact Provenance + Residual Semantic Budget

**Harness merge:** `ccff4caead957ce6bc040d3823f917d958129ff3`  
**Official tested commit:** `7514027abc1f4e92ffcb3c3684750b27a26ea5ea`  
**Evidence commit:** `df39431df8d5d9f8b28d91dc606b8b35247d82dd`  
**Status:** PASS — COMPACT PROVENANCE JUSTIFIED AS NEXT EXPERIMENTAL REPRESENTATION

## Execution

```text
provider calls                  0
frozen corpus mutated           false
cases                           7
conditions                      3
budget points                  11
P8-05                           BLOCKED
```

## Token result

```text
mean full provenance overhead      799.71 estimated tokens
mean compact provenance overhead   370.29 estimated tokens
compact reduction                   53.70%
target >= 50%                       PASS
```

Compact representation:

```text
pre metadata
+ provenance="status=...|review=...|tags=...|supersedes=..."
```

It omits prompt-redundant fields:

```text
confirmation_status
memory_id       # already present as memory_chunk_id
chapter_title
```

## Residual semantic-budget result

Across all 7 cases × 11 residual budgets:

```text
compact selected_count          >= full
compact retained positives      >= full
compact retained criticals      >= full

dominance failures                 0
```

Positive-evidence frontier improvements:

```text
rq-0011
  full     3500
  compact  3000

rq-0032
  full     3500
  compact  2750

rq-0010
  full     4500
  compact  4000
```

Four remaining cases retain all positive evidence down to the minimum tested 2000-token residual budget under all conditions.

Critical-evidence frontier:

```text
6/7 cases:
  all conditions retain all critical memories at 2000

rq-0010:
  pre      3500
  full     4500
  compact  4000
```

## Interpretation

EVAL-01F establishes that the full verbose EVAL-01E provenance representation is not the preferred candidate for further prompt experiments.

Compact provenance:

1. preserves the source-status fields that matter for replay/ambiguity reasoning;
2. cuts mean provenance overhead by more than half;
3. never retains fewer semantic memories than full provenance at the same tested residual budget;
4. never retains fewer positive or critical memories than full provenance;
5. recovers 500–750 estimated tokens of evidence headroom on the three cases where provenance overhead reaches the positive-evidence frontier.

## Limitation

The reduced-budget sweep is a **residual semantic-memory model**.

It does not reconstruct the real full production context package containing:

- locked world rules;
- author constraints;
- entities;
- current entity states;
- recent events;
- semantic memories.

Therefore:

```text
full-system 12k budget pressure = NOT_MEASURED
```

must remain unchanged.

## Architecture verdict

```text
provenance propagation                 KEEP
full verbose provenance candidate      DROP FROM NEXT LIVE EXPERIMENT
compact provenance candidate           JUSTIFIED FOR FURTHER TESTING
production compact prompt policy       NOT AUTHORIZED YET
ranking/filtering change               NOT JUSTIFIED
full-system 12k pressure               NOT_MEASURED
```

## Next diagnostic

EVAL-01G should reconstruct a production-shaped 12k `WritingContextPackage` from source-grounded Aethelgard artifacts and compare:

```text
pre_provenance
full_provenance
compact_provenance
```

The fixture should include all context layers used by `ContextBudgetPacker`:

```text
locked world rules
author constraints
entities
current states
recent events
semantic memories
```

Source-derived layers must trace back to Frozen_v1 or Batch_7. Any stress-only `is_locked` designation must be labeled as experimental policy, not canonical story truth.

No additional live provider calls are justified until EVAL-01G is reviewed.
