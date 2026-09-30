# ASTRA Final Review — EVAL-01H Production-Limit Context Scope

**Harness merge:** `9dc2f92935a134c9e8f300d7cd853a1ffd3ff792`  
**Official tested commit:** `2c8b4df65ecd6cd26051008d13f419f696c6b34e`  
**Evidence commit:** `66dffab6d5d72cd4001edc77663f9f3d29e66da8`  
**Status:** PASS — INPUT BREADTH BOTTLENECK STRONGLY SUPPORTED

## Production-shaped defaults

```text
semantic limit        8
recent-event limit   20
provenance            compact
ContextBudgetPacker   unchanged
provider calls        0
```

## 12k result

```text
baseline_prod8
  mean input entities        69.57
  mean recent retained        1.00 / 20
  mean semantic retained      4.71 / 8
  positive retention          0.571
  critical retention          0.667
  zero-semantic cases         2 / 7
  zero-recent cases           4 / 7

retrieval_scoped_entities
  mean input entities        15.71
  mean recent retained       20.00 / 20
  mean semantic retained      8.00 / 8
  positive retention          1.000
  critical retention          1.000
  scope coverage              1.000

balanced_scoped_entities
  mean input entities        21.57
  mean recent retained       20.00 / 20
  mean semantic retained      8.00 / 8
  positive retention          1.000
  critical retention          1.000
  scope coverage              1.000
```

## Sensitivity

At 10k:

```text
baseline
  mean semantic 0.57 / 8
  recent        0
  zero-semantic 5 / 7

retrieval-scoped
  semantic      8 / 8
  recent       20 / 20

balanced
  semantic      8 / 8
  recent       18.29 / 20
```

At 8k:

```text
baseline
  semantic      0 / 8
  recent        0 / 20

retrieval-scoped
  semantic      8 / 8
  recent       14.71 / 20

balanced
  semantic      8 / 8
  recent        9.86 / 20
```

Both scoped policies retain all positive/critical semantic evidence down to 8k.

## Interpretation

The production-limit test confirms that EVAL-01G was not merely a top-20 artifact.

Broad entity/state input is a strong budget bottleneck even with the actual default semantic limit of 8.

The scoped result does **not** require a ContextBudgetPacker rewrite. The same packer retains substantially more rules, recent events, and semantic evidence once irrelevant entity/state breadth is removed.

## retrieval-scoped vs balanced

Balanced scope does not improve the measured semantic/critical result.

At lower budgets it retains fewer recent events because it spends additional tokens on participants from the newest five events.

Therefore:

```text
retrieval_scoped_entities   preferred experimental scope
balanced_scoped_entities    no measured advantage; worse under pressure
```

## Architecture verdict

```text
entity/state breadth bottleneck       STRONGLY SUPPORTED
production-shaped starvation          VERIFIED IN FIXTURE
ContextBudgetPacker rewrite           NOT JUSTIFIED YET
retrieval-scoped entity/state input   BEST CURRENT SCOPING CANDIDATE
balanced scope                        DROP FROM NEXT TEST
production scoping change             NOT AUTHORIZED YET
```

## Remaining competing explanation

The 12k budget itself may simply be too conservative.

Before implementing query/retrieval scoping, measure whether increasing the Story Brain budget alone eliminates the loss while keeping the current broad entity/state input.

## Next diagnostic

EVAL-01I — Context Budget Scaling.

Hold constant:

```text
semantic limit       8
recent limit        20
compact provenance
same production-shaped packages
same ContextBudgetPacker
```

Compare:

```text
baseline full entity/state input
retrieval-scoped entity/state input
```

Sweep:

```text
12000
16000
20000
24000
32000
```

Measure the minimum budget at which each policy retains:

- all 8 semantic memories in every case;
- all 20 recent events in every case;
- all world rules;
- all protected artifacts;
- all positive and critical semantic memories.

Also record token usage and unused Story Brain budget/headroom.

Do not infer that a larger budget is preferable until this cost/retention curve is measured.
