# ASTRA FINAL REVIEW — EVAL-01M Sealed Live Adaptive Context Validation

## Verdict

**SUPPORTED_FOR_IMPLEMENTATION_PROPOSAL**

This does **not** authorize a production rollout.

EVAL-01M provides live, sealed, blind-reviewed evidence that the EVAL-01L adaptive context policy materially improves Story Brain evidence retention in generation compared with the current fixed broad@12k behavior, especially under context pressure.

## Protocol integrity

Capture:
- model: `gemini-3.5-flash-lite`
- temperature: `0.0`
- fixed key slot: `slot-1`
- successful calls: `72 / 72`
- backoff events: `0`

Reveal:
- sealed SHA256 commitment: **MATCH**
- blind review present before reveal: **YES**
- provider calls during reveal: `0`
- condition mapping committed only after blind review: **YES**

Blind review commit:

`07141f468d53957ecf0aab6fc17b1fb84bf1b132`

Reveal evidence commit:

`9c324a37896977ddb887a98604884c60adf3ff3e`

## Frozen blind preferences mapped after reveal

### NORMAL

```text
adaptive_eval01l       9
fixed_broad_12k        3
tie                    9
total                 21
```

Per-case mapping:

```text
rq-0011 sword origin               adaptive 3 / control 0 / tie 0
rq-0023 pillar repeated history    adaptive 3 / control 0 / tie 0
rq-0025 cavalry force state        adaptive 0 / control 3 / tie 0
rq-0020 old-battle attribution     adaptive 0 / control 0 / tie 3
rq-0032 Alistair supersession      adaptive 3 / control 0 / tie 0
rq-0038 seed physical identity     adaptive 0 / control 0 / tie 3
rq-0010 trust causal history       adaptive 0 / control 0 / tie 3
```

### STRESS_RESILIENCE

```text
adaptive_eval01l      12
fixed_broad_12k        0
tie                    3
total                 15
```

All 12 discriminating stress pairs favor the adaptive condition.

## Packing evidence

### NORMAL aggregate

```text
                              fixed broad@12k     adaptive
mean Story Brain used             11,925           16,242
mean semantic selected              4.71                8
mean recent selected                0.86               20
semantic dropped total                23                0
recent dropped total                 134                0
```

All seven adaptive NORMAL rows routed to `broad@20k`.

### STRESS_RESILIENCE aggregate

```text
                              fixed broad@12k     adaptive
mean Story Brain used             11,978           19,209
mean semantic selected                 0                8
mean recent selected                   0               20
semantic dropped total                40                0
recent dropped total                 100                0
```

Adaptive branches:

```text
scoped@20k   3
scoped@24k   2
```

The fixed 12k condition can spend the available budget on entities/states/rules before reaching semantic and recent evidence. The adaptive policy recovers that evidence by using a larger budget and, when needed, retrieval scoping.

## Latency

### NORMAL

```text
fixed broad@12k mean     1839.33 ms
adaptive mean            1833.72 ms
delta                       -0.3% approx.
```

No measurable latency penalty appears in this sample.

### STRESS_RESILIENCE

```text
fixed broad@12k mean     1883.42 ms
adaptive mean            1929.71 ms
delta                       +2.5% approx.
```

The observed latency increase is small relative to the evidence recovered.

Caveat: the current client does not expose exact provider token usage or provider cost. Prompt-character and application-estimator measurements are proxies, not billing-token evidence.

## Strongest confirmed gains

### Pressure Pillar No. 2

Under stress, fixed 12k can lose the semantic/recent history entirely, while adaptive preserves the conflicting chapter-40/42/45 sequence.

Blind mapped result:

```text
adaptive 3 / control 0
```

### Three-thousand cavalry under stress

Adaptive preserves chapter-45/47 burial conflicts plus incompatible chapter-49 continuation.

Blind mapped result:

```text
adaptive 3 / control 0
```

### Alistair discovery/motive

In NORMAL, fixed 12k drops all eight semantic memories and all twenty recent events for this case. Adaptive broad@20k retains both lanes.

Blind mapped result:

```text
adaptive 3 / control 0
```

## Confirmed regression / new failure mode

NORMAL `challenge:rq-0025` is a consistent regression:

```text
adaptive 0 / control 3 / tie 0
```

This is **not** an evidence-loss failure in the adaptive condition.

For the NORMAL cavalry case:

```text
fixed:
  semantic selected   5 / 8
  recent selected     0 / 20

adaptive:
  semantic selected   8 / 8
  recent selected    20 / 20
```

The fixed output nevertheless presents the required 45 -> 47 -> 49 chronology more cleanly in all three repeats.

Therefore EVAL-01M establishes a second-order failure mode:

> retaining more context can improve evidence availability while still reducing generation precision through context dilution / attention competition.

This is exactly why `always use 20k/24k` is not justified.

## Architectural interpretation

The evidence rejects both extremes:

```text
fixed universal 12k             REJECT AS GENERAL POLICY
always-on large context         NOT JUSTIFIED
adaptive budget + scoping       SUPPORTED
relevance-density control       REQUIRED BEFORE ROLLOUT
```

The next design problem is no longer “how large should the budget be?”

It is:

> once enough evidence is available, how do we keep the package dense enough that irrelevant breadth does not distract generation?

## Production decision

Authorized:

```text
prepare a narrow implementation/evaluation proposal
for adaptive budgeting + retrieval scoping
with an explicit relevance-density guard
```

Not authorized:

```text
change production default budget
change production routing
rewrite ContextBudgetPacker
enable automatic adaptive policy
unblock P8-05
```

## Next gate

Proceed to **EVAL-01N — Relevance Density / Scope-First Diagnostic**.

The diagnostic should test a narrow hypothesis:

> when a source-grounded broad package exceeds 12k, retrieval-scoping entity/state breadth before increasing budget may preserve all semantic/recent/rule evidence while reducing distracting context versus broad@20k.

Candidate policies should be evaluated offline first, with no provider calls and no production changes.

If an offline density candidate closes cleanly, a later sealed live micro-validation may compare it against the current EVAL-01L adaptive candidate, with special attention to the NORMAL cavalry regression.

## Final state

```text
EVAL-01M protocol integrity          VERIFIED
live adaptive benefit               CONFIRMED
stress resilience benefit           STRONG
normal quality effect               POSITIVE WITH ONE CONSISTENT REGRESSION
context dilution risk               CONFIRMED
production rollout                  NOT AUTHORIZED
next experiment                     EVAL-01N
P8-05                               BLOCKED_PENDING_STABILITY
```
