# ASTRA FINAL REVIEW — EVAL-01O Sealed Live Relevance-Density Micro-Validation

## Verdict

**SUPPORTED_FOR_NARROW_RELEVANCE_DENSITY_PROPOSAL**

This does **not** authorize a production rollout.

EVAL-01O provides sealed live evidence that balanced scope-first packaging can repair the known NORMAL cavalry chronology regression while preserving quality on the rest of the source-grounded suite, with substantially smaller context.

The effect is **localized rather than a broad overall win**: after mapping the canonical frozen blind review, candidate and control each win two pairs overall, with seventeen ties.

## Canonical review lineage

Two EVAL-01O blind-review commits were created on divergent branches after capture.

The canonical frozen review used for this final interpretation is:

`2e923e2cb89a8388ae98016befa8ac53df370c21`

Reasons:
- it was committed on 2026-09-30T14:46:43Z, before reveal;
- it was created by the blind reviewer without access to the local private state;
- its judgments were already frozen publicly before the reveal branch was created;
- restoring this exact file content does not change any post-reveal judgment.

A later divergent blind-review commit (`dcbb17b0...`) is not used for scoring this final review.

Reveal evidence remains valid because it independently verifies the original sealed private-state commitment.

## Protocol integrity

Capture:

```text
model                 gemini-3.5-flash-lite
temperature           0.0
fixed key slot        slot-1
successful calls      42 / 42
backoff events        0
```

Reveal:

```text
private-state SHA256  e6a5e847a5a80b63f785125d46886a63c303877f69d02547ba8a24bc772e986b
commitment match      true
blind review present  true
provider calls        0
```

Reveal evidence commit:

`e4c4ff6040228ece479efe08d2920a02877c472a`

## Frozen blind preferences mapped after reveal

Using the canonical frozen judgments from `2e923e2...`:

```text
balanced_scope_first_min_tier    2
broad_20k_current                2
tie                             17
total                           21
```

Per case:

```text
rq-0011 sword origin               candidate 0 / control 1 / tie 2
rq-0023 pillar repeated history    candidate 0 / control 0 / tie 3
rq-0025 cavalry force state        candidate 2 / control 1 / tie 0
rq-0020 old-battle attribution     candidate 0 / control 0 / tie 3
rq-0032 Alistair supersession      candidate 0 / control 0 / tie 3
rq-0038 seed physical identity     candidate 0 / control 0 / tie 3
rq-0010 trust causal history       candidate 0 / control 0 / tie 3
```

This means EVAL-01O does **not** demonstrate a general quality superiority for the dense condition.

It does demonstrate a targeted improvement on the regression that motivated the experiment.

## Primary gate — challenge:rq-0025

EVAL-01M had shown the broad@20k route losing all three repeats on the cavalry chronology case.

EVAL-01O:

```text
candidate    2
control      1
tie          0
```

Detailed mapped result:

- repeat 1: control is preferred; candidate omits the chapter-47 repeated burial;
- repeat 2: candidate is preferred and cleanly preserves chapter 45 -> chapter 47 -> incompatible chapter 49 continuation;
- repeat 3: candidate is preferred because it preserves the relative ordering of the two burial accounts more clearly.

Therefore the previous broad@20k `0 / 3` collapse is no longer present under balanced scope-first packaging.

This is sufficient to support a narrow architectural proposal, but not a claim of global model-quality improvement.

## Regression guard

Outside rq-0025:

```text
candidate wins     0
control wins       1
ties              17
```

The sole non-tie is rq-0011 repeat 1, where the broad control explicitly states the chapter-27 source-status anchor while the candidate gives the correct forging facts without that explicit chronology anchor.

All other cases are ties under the canonical blind review.

Stability remains clean:

```text
rq-0023 repeated pillar history   3 / 3 ties
rq-0020 competing attribution     3 / 3 ties
rq-0032 source supersession       3 / 3 ties
rq-0038 physical identity         3 / 3 ties
rq-0010 causal-history control    3 / 3 ties
```

No future leakage was observed in the frozen review.

No systematic unsupported-claim pattern was observed.

## Prompt and density audit

Across all seven source_1x rows:

```text
                                broad_20k_current    balanced_scope_first
mean Story Brain estimate             16,242.4               9,637.9
mean prompt characters                49,282.3              29,955.6
mean entities                             69.6                  21.3
mean states                               69.6                  21.3
semantic memories                            8                     8
recent events                               20                    20
candidate tier                           20k control            12k candidate
```

Reductions:

```text
Story Brain estimate     -40.66%
prompt characters        -39.22%
entity/state breadth     -69.40%
```

Isolation remains exact:

```text
semantic IDs             exact match
recent IDs               exact match
world-rule IDs           exact match
candidate protected overflow   false
candidate 12k fit              7 / 7
```

Thus the quality comparison is substantially isolated to entity/current-state breadth and resulting context density.

## Latency

```text
                               broad        candidate
sample count                      21              21
mean latency                 2195 ms         2772 ms
p50 latency                  2067 ms         1895 ms
max latency                  3464 ms        20033 ms
backoff events                   0               0
```

Median latency improves by about 8.3%.

The candidate mean is worse because of one approximately 20-second provider-side outlier. No backoff event was recorded.

Exact provider token usage and cost remain unavailable from the current client.

## Architectural interpretation

The combined EVAL-01M -> N -> O evidence supports:

```text
fixed universal broad@12k        rejected as general policy
always-on broad@20k              not justified
scope-first packaging            supported
recent-participant safety scope  supported for proposal
minimum fitting scoped tier      supported
12k NORMAL scoped fit            observed on all 7 source_1x rows
```

The important distinction is:

> the candidate is supported because it fixes the targeted dilution regression while preserving almost all other behavior, not because it wins the benchmark overall.

## Production decision

Authorized:

```text
prepare a narrow production architecture proposal for:
  balanced relevance scope
  -> minimum fitting scoped tier
  -> explicit unresolved handling above scoped 24k
```

Not authorized:

```text
production rollout
automatic routing change
ContextBudgetPacker rewrite
P8-05 cleanup
```

## Final state

```text
EVAL-01O protocol commitment       VERIFIED
canonical blind review             2e923e2...
mapped overall quality             candidate 2 / control 2 / tie 17
primary rq-0025 gate               candidate 2 / control 1
systematic regression              NOT OBSERVED
prompt size reduction              39.2%
entity/state reduction             69.4%
candidate 12k full-fit             7 / 7
production rollout                 NOT AUTHORIZED
next step                          NARROW ARCHITECTURE PROPOSAL
P8-05                              BLOCKED_PENDING_STABILITY
```
