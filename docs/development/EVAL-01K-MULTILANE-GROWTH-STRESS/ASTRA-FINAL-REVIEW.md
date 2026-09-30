# ASTRA Final Review — EVAL-01K Multi-Lane Growth Stress

**Harness merge:** `9519fc30532ad0d64f6e0ec3cd1ebd1edaff34ce`  
**Official tested commit:** `3a94fc2a289a83aa2ce70e78214dfa61da6c3750`  
**Evidence commit:** `a224d2457589114d95a1b3417322689cf563113a`  
**Status:** INTEGRITY PASS / ADAPTIVE POLICY FAIL AT COMBINED_4X

## Execution

```text
provider calls              0
integrity failures          0
adaptive policy failures    5
protected overflow          0
P8-05                       BLOCKED
```

## Stable region

All seven cases retain complete core evidence through:

```text
source_1x
rules_2x
evidence_payload_2x
combined_2x
```

At `combined_2x`:

```text
mean broad estimate   19379.29
mean scoped estimate  12002.00
core evidence         7 / 7
semantic              8 / 8
recent               20 / 20
```

## Failure frontier

At `combined_4x`:

```text
mean broad estimate   25658.43
mean scoped estimate  18281.14

broad@24k             2 / 7  PASS
scoped@12k            5 / 7  FAIL
```

The five scoped failures form a clear pressure curve:

```text
rq-0023
  scoped estimate 16731
  semantic 8/8
  recent   6/20
  positive/critical retained

rq-0020
  scoped estimate 17352
  semantic 8/8
  recent   5/20
  positive/critical retained

rq-0025
  scoped estimate 19261
  semantic 7/8
  recent   1/20
  positive/critical retained

rq-0032
  scoped estimate 20078
  semantic 5/8
  recent   1/20
  positive/critical 2/3

rq-0038
  scoped estimate 22609
  semantic 0/8
  recent   0/20
  positive/critical 0/4
```

Original source-grounded rules remain retained in all five failures.

Therefore the measured degradation order is:

```text
recent events
  -> optional semantic candidates
  -> positive/critical semantic evidence
```

## Interpretation

Entity scoping is still the correct response to broad entity/state growth.

However, a fixed `scoped@12k` fallback is not sufficient when rule and selected-evidence payload pressure remains after entity scoping.

The next solution should not raise the broad ceiling. It should make the scoped budget itself adaptive.

## Architecture verdict

```text
broad@20k normal tier                 KEEP
broad@24k tolerance tier              KEEP
>24k -> retrieval scope               KEEP
fixed scoped@12k                      REJECT FOR MULTI-LANE PRESSURE
second-stage scoped budget tiers      JUSTIFIED FOR OFFLINE TEST
production policy                     NOT AUTHORIZED
```

## Next and final offline diagnostic

EVAL-01L — Secondary Scoped Budget Frontier.

Sweep:

```text
12000
16000
20000
24000
```

for the retrieval-scoped package across all EVAL-01K scenarios.

Measure minimum scoped budget per case/scenario for:

- all semantic top-8;
- all recent top-20;
- all original source-grounded rules;
- all positive/critical semantic evidence;
- full scoped input fit.

Then validate a two-stage policy using only estimated package size:

```text
BROAD STAGE

broad_estimate <=20k
  -> broad@20k

20k < broad_estimate <=24k
  -> broad@24k

broad_estimate >24k
  -> retrieval scope


SCOPED STAGE

scoped_estimate <=12k
  -> scoped@12k

12k < scoped_estimate <=16k
  -> scoped@16k

16k < scoped_estimate <=20k
  -> scoped@20k

20k < scoped_estimate <=24k
  -> scoped@24k

scoped_estimate >24k
  -> unresolved pressure / compression required
```

Do not silently add a >24k scoped tier in EVAL-01L. If any scoped package exceeds 24k, record it as unresolved.
