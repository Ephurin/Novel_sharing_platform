# ASTRA Final Review — EVAL-01G Full 12k Context Pressure

**Harness merge:** `a1759b3e33031248abaa746aee7b71377ce96b40`  
**Official tested commit:** `41155020f0c249f6c20d44fa59b97fbd9ae722c8`  
**Evidence commit:** `d49bf0da77f654e2adfdb82844b63541091cd36f`  
**Status:** PASS AS STRESS DIAGNOSTIC — PRODUCTION STARVATION NOT YET PROVEN

## Execution

```text
provider calls                  0
frozen corpus mutated           false
contract failures               0
deterministic packing           PASS
protected overflow              false
P8-05                           BLOCKED
```

## 12k stress result

EVAL-01G reconstructed all ContextBudgetPacker lanes in one 12k package:

```text
entities
current states
world rules
author constraints
recent events
semantic memories
```

At 12k:

```text
pre_provenance
  mean entities            69.57
  mean rules                8.29
  mean recent               0.29 / 20
  mean semantic             6.43 / 20
  positive retention        0.690
  critical retention        0.690

full_provenance
  mean recent               0.14 / 20
  mean semantic             4.57 / 20
  positive retention        0.519
  critical retention        0.595

compact_provenance
  mean recent               0.29 / 20
  mean semantic             5.43 / 20
  positive retention        0.519
  critical retention        0.643
```

Late-story stress cases are severe:

```text
rq-0032 cutoff 55
  entities selected   77
  recent selected      0
  semantic selected    0

rq-0038 cutoff 61
  entities selected   80
  recent selected      0
  semantic selected    0
```

At 10k, 5/7 cases retain zero semantic memories. At 8k, all 7 cases retain zero semantic and zero recent memories.

## Critical production-path caveat

The generation path does **not** normally request semantic top-20.

Current production code:

```text
SemanticRetrieverService.default_limit = 8
Settings semantic_retrieval_limit default = 8
WritingService generation calls preview_context(... semantic_query=...)
without overriding semantic_limit
```

Therefore the live generation default is:

```text
semantic memories requested = 8
recent events requested      = 20
```

EVAL-01G intentionally used the preserved benchmark top-20 to create a stronger pressure fixture.

This means:

```text
EVAL-01G proves:
  broad entity/state context can dominate a 12k package under heavy evidence load

EVAL-01G does NOT yet prove:
  the default production generation path starves semantic evidence at 12k
```

The top-20 finding must be treated as a stress result, not a direct production-defect verdict.

## What remains valid

1. ContextBudgetPacker priority is deterministic and preserves protected artifacts.
2. Entity/state breadth is the dominant fixed cost in the reconstructed late-story packages.
3. Full provenance worsens evidence retention relative to compact provenance.
4. Compact provenance remains preferable to full provenance.
5. Recent events are the lowest-priority lane after semantic and can be starved under pressure.
6. Input breadth should be tested before changing packer scheduling.

## Architecture verdict

```text
compact provenance                     KEEP AS EXPERIMENTAL CANDIDATE
full verbose provenance                DROP FROM NEXT TEST
full-package pressure                  MEASURED AS STRESS
production default starvation          NOT YET PROVEN
packer algorithm defect                NOT YET PROVEN
entity/state input breadth bottleneck  PLAUSIBLE / NEEDS PROD-LIMIT TEST
production change                      NOT AUTHORIZED
```

## Next diagnostic

EVAL-01H should use production-shaped defaults:

```text
semantic limit = 8
recent limit   = 20
budget         = 12000 primary
```

Use compact provenance only to isolate allocation policy.

Compare:

1. `baseline_prod8`
   - current full entity/state input;
   - current ContextBudgetPacker unchanged.

2. `retrieval_scoped_entities`
   - protected entities;
   - entities explicitly named in the query;
   - entities appearing in the semantic top-8;
   - current states only for retained entities;
   - all rules/recent/semantic inputs unchanged.

3. `balanced_scoped_entities`
   - retrieval-scoped set;
   - plus participants from the newest five recent events;
   - current states only for retained entities;
   - all rules/recent/semantic inputs unchanged.

All three should run through the **same production ContextBudgetPacker**. This isolates input scoping from packer scheduling.

Measure:

- protected retention;
- query/retrieval entity coverage;
- entity/state count and token cost;
- semantic positive/critical retention;
- recent-event retention;
- world-rule retention;
- 12k/10k/8k sensitivity;
- determinism.

Do not modify ContextBudgetPacker until this diagnostic distinguishes input-breadth pressure from scheduling pressure.
