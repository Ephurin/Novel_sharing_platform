# ASTRA FINAL REVIEW — EVAL-01N Relevance Density / Scope-First Diagnostic

## Verdict

**SUPPORTED_FOR_LIVE_MICRO_VALIDATION**

EVAL-01N confirms offline that scope-first context construction can preserve all source-grounded evidence lanes while materially reducing Story Brain breadth versus EVAL-01L's source_1x broad@20k route.

This review does **not** authorize a production routing or budget change.

## Official evidence

Tested commit:

`adaacaa528351c2353ac5a28d2c0605461971f85`

Evidence commit:

`2949187dc475326772fcb857854b7b659e082b76`

Execution:

```text
provider calls             0
contract                   PASS
failures                   0
production code modified   false
ContextBudgetPacker        unchanged
gold used for scope        false
```

## Aggregate result

```text
                              broad@20k   retrieval scope-first   balanced scope-first
mean Story Brain used          16,242              8,826                  9,638
mean entity count               69.57              15.43                  21.29
mean context reduction              —              45.55%                 40.66%
resolved at 12k                     —               7 / 7                  7 / 7
```

Both scope-first candidates preserve across all seven source_1x cases:

```text
semantic                         8 / 8
recent                          20 / 20
all source-derived rules         retained
required entity scope            retained
full scoped input                fit
protected overflow               0
deterministic packing            true
```

## Known live regression — challenge:rq-0025

EVAL-01M showed:

```text
NORMAL live blind result
adaptive broad@20k    0
fixed broad@12k       3
```

even though broad@20k retained more evidence.

EVAL-01N now shows:

```text
broad@20k
  used          16,135
  entities          68
  semantic         8/8
  recent         20/20

retrieval scope-first
  used           9,308
  entities          18
  semantic         8/8
  recent         20/20
  reduction       42.31%

balanced scope-first
  used           9,593
  entities          20
  semantic         8/8
  recent         20/20
  reduction       40.55%
```

This strongly supports context dilution from irrelevant entity/state breadth as the failure mechanism.

## Retrieval-only versus balanced scope

Retrieval-only is the densest candidate.

Balanced scope adds participants from the newest five recent events.

For the known regression case:

```text
retrieval scope entities    18
balanced scope entities     20
extra estimated context    +285
```

The extra cost is small while preserving current-state context for recent participants that semantic retrieval alone may not expose.

Therefore:

```text
retrieval-only
  strongest density
  higher risk of dropping useful recent participant state

balanced scope-first
  slightly larger
  still ~41% smaller than broad@20k
  safer live candidate
```

## Architectural conclusion

The evidence now supports the following ordering:

```text
1. build source-grounded evidence lanes
2. derive a relevance scope
3. keep query/semantic entities
4. include a small recent-participant safety expansion
5. try minimum fitting scoped tier
6. increase budget only if the scoped package actually requires it
7. leave >24k scoped unresolved/compression-bound
```

This is more precise than the EVAL-01L rule:

```text
broad <=20k -> broad@20k
```

because NORMAL packages can be substantially smaller after relevance scoping.

## Candidate for next live test

Use:

`balanced_scope_first_min_tier`

against:

`broad_20k_current`

The live follow-up should be deliberately small and sealed.

Primary purpose:

> determine whether higher relevance density repairs the rq-0025 NORMAL regression without regressing the cases where broad@20k previously performed well.

Suggested cases:

```text
challenge:rq-0025   primary regression
core_gold:rq-0011   prior adaptive gain
challenge:rq-0023   prior adaptive gain
challenge:rq-0032   prior adaptive gain
core_gold:rq-0038   negative/identity stability
core_gold:rq-0010   causal-history stability
```

`challenge:rq-0020` may remain optional because EVAL-01M NORMAL was a complete tie and the core question is dilution repair.

## Decision boundary

Authorized:

```text
sealed live micro-validation harness
balanced scope-first candidate
no production changes
```

Not authorized:

```text
production routing change
production budget change
ContextBudgetPacker rewrite
P8-05 cleanup
```

## Final state

```text
EVAL-01N official evidence       VERIFIED
scope-first hypothesis           STRONGLY SUPPORTED OFFLINE
retrieval-only candidate         VALID / DENSEST
balanced scope-first candidate   SELECTED FOR LIVE MICRO-VALIDATION
production policy                UNCHANGED
P8-05                            BLOCKED_PENDING_STABILITY
```
