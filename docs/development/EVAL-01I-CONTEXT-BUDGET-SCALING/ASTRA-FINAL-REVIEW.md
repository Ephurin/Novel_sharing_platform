# ASTRA Final Review — EVAL-01I Context Budget Scaling

**Harness merge:** `34a41fac2a7316d43a4abc2a7f340044940ca847`  
**Official tested commit:** `1fb48d5e563d8a0e407ec138388c6ced01e1b316`  
**Evidence commit:** `0763077e70bbfaa9db05c2b9d808d6f47aceefe7`  
**Status:** PASS — 20K BROAD BUDGET AND 12K RETRIEVAL-SCOPED BOTH RETAIN COMPLETE TEST EVIDENCE

## Execution

```text
provider calls                  0
contract failures               0
ContextBudgetPacker modified    false
production scope modified       false
P8-05                           BLOCKED
```

## Global thresholds

```text
baseline_full_entities
  all semantic retained         16000
  all rules retained            16000
  all recent retained           20000
  evidence complete             20000
  all input artifacts fit       20000

retrieval_scoped_entities
  all semantic retained         12000
  all rules retained            12000
  all recent retained           12000
  evidence complete             12000
  all input artifacts fit       12000
```

The 20k baseline threshold is a true global threshold in the seven-case fixture, not an aggregate artifact.

Cases requiring 20k broad budget:

```text
challenge:rq-0025
challenge:rq-0032
core_gold:rq-0038
```

The other four cases fit fully at 16k.

## Plateau

Once the broad package fits, its mean Story Brain size is:

```text
baseline full entities    ~16239.57 estimated tokens
retrieval scoped           ~8862.29 estimated tokens
difference                 ~7377.28 estimated tokens
```

Increasing broad budget beyond 20k adds no Story Brain artifacts in this fixture:

```text
20k used    ~16239.57
24k used    ~16239.57
32k used    ~16239.57
```

## Interpretation

The prior 12k ceiling was conservative for broad entity/state context.

A simple 20k Story Brain budget is sufficient to remove all measured retention loss in the current Aethelgard production-shaped fixture without introducing entity-scoping logic.

Retrieval scoping remains materially more token-efficient, but offline retention alone does not establish that it produces better generation quality.

## Architecture verdict

```text
broad @12k                    TOO SMALL FOR CURRENT FIXTURE
broad @16k                    SEMANTIC/RULES COMPLETE, RECENT PARTIAL
broad @20k                    COMPLETE IN CURRENT FIXTURE
broad >20k                    NO EXTRA VALUE IN CURRENT FIXTURE
retrieval-scoped @12k         COMPLETE AND ~7.4K TOKENS SMALLER
production budget change      NOT AUTHORIZED YET
production scoping change     NOT AUTHORIZED YET
```

## Scalability caveat

EVAL-01I does not prove that 20k is a permanent safe ceiling for much larger novels.

The broad entity/state lane grows with story size. A novel with substantially more entities/state records may exceed 20k even when semantic/recent limits remain fixed.

Therefore the next offline diagnostic should evaluate an adaptive ceiling policy under deterministic structural scale stress.

## Next diagnostic

EVAL-01J — Adaptive Story Brain Budget / Scale Stress.

Candidate policy:

```text
broad estimated package <= 20k
  -> broad mode, Story Brain budget 20k

broad estimated package >20k and <=24k
  -> broad mode, tolerated budget 24k

broad estimated package >24k
  -> retrieval-scoped mode, Story Brain budget 12k
```

Stress scales:

```text
1x source-grounded entity/state load
2x structural entity/state load
4x structural entity/state load
```

Synthetic scale additions must be deterministic, noncanonical, stress-only entity/state clones. They must never enter semantic/recent evidence or gold evaluation.

Measure:

- adaptive branch chosen;
- packed tokens and headroom;
- protected retention;
- semantic/recent/rule retention;
- query/retrieval scope coverage;
- number of broad entity/state bundles avoided when fallback scopes;
- deterministic behavior;
- whether any scale/budget causes protected overflow.

No production adaptive policy is authorized until this diagnostic is reviewed.
