# ASTRA Final Review — EVAL-01J Adaptive Story Brain Budget / Scale Stress

**Harness merge:** `659b022297b8e16b82249e6d8a441713983847de`  
**Official tested commit:** `58100e69bcaa6e6590590ea642df4fe904ba3cca`  
**Evidence commit:** `ae8a089dc0342b86bc3b262a4ea8d2bb1680e506`  
**Status:** PASS — ADAPTIVE POLICY SURVIVES ENTITY/STATE BREADTH STRESS

## Policy under test

```text
broad estimate <=20k
  -> broad@20k

20k < broad estimate <=24k
  -> broad@24k

broad estimate >24k
  -> retrieval-scoped@12k
```

## Execution

```text
provider calls             0
contract failures          0
protected overflow         0 / 21 traces
production changes         false
P8-05                      BLOCKED
```

All three branches were exercised:

```text
broad@20k             7
broad@24k             5
retrieval-scoped@12k  9
```

## 1x source-grounded load

```text
mean broad size      16239.57
mean entities           69.57
branch                broad@20k 7/7

semantic              8/8
recent               20/20
evidence complete     7/7
```

## 2x entity/state breadth

```text
mean broad size      24047.71
mean entities          123.43

broad@24k             5/7
scoped@12k            2/7

semantic              8/8
recent               20/20
evidence complete     7/7
```

The two cases crossing the 24k threshold were:

```text
challenge:rq-0032     26911
core_gold:rq-0038     28261
```

The five broad@24k cases still retained complete evidence. Several are intentionally close to the ceiling:

```text
rq-0023   23709 used / 291 headroom
rq-0025   23359 used / 641 headroom
rq-0020   23338 used / 662 headroom
```

This supports treating 24k as a tolerance band rather than a comfortable normal target.

## 4x entity/state breadth

```text
mean broad size      39664.00
mean entities          231.14
branch                scoped@12k 7/7

semantic              8/8
recent               20/20
evidence complete     7/7
```

## Interpretation

For growth dominated by entity/state breadth, the adaptive policy behaves as intended:

```text
normal load       broad@20k
moderate load     broad@24k
large load        scoped@12k
```

It prevents Story Brain size from scaling indefinitely with broad entity/state count while preserving all measured query/retrieval evidence.

## Limitation

EVAL-01J scales only entity/current-state breadth.

It does not stress:

- world-rule count;
- world-rule payload size;
- selected semantic-memory payload size;
- selected recent-event payload size;
- relationship complexity;
- actual chapter/plot complexity.

Because production retrieval limits remain fixed at semantic=8 and recent=20, larger novels do not automatically increase item counts in those lanes. The remaining budget risk is growth in rule count and per-item payload complexity.

## Architecture verdict

```text
20k normal broad tier                SUPPORTED
24k broad tolerance tier             SUPPORTED, TIGHT
>24k entity-pressure scoped fallback SUPPORTED
adaptive concept                     STRONGLY PROMISING
production adaptive policy           NOT AUTHORIZED YET
```

## Next diagnostic

EVAL-01K — Multi-Lane Payload Growth Stress.

Keep production counts:

```text
semantic memories = 8
recent events     = 20
```

Stress independently and jointly:

1. world-rule count / rule payload;
2. semantic payload size;
3. recent-event payload size;
4. combined multi-lane pressure.

The current adaptive policy should be evaluated unchanged first.

Critical question:

```text
When broad >24k and the policy falls back to retrieval-scoped@12k,
does the scoped package itself still fit once rule/evidence payloads grow?
```

If not, do not hide the failure by increasing the scoped budget inside the same experiment. Record the failure and use it to design a second-stage adaptive budget policy.
