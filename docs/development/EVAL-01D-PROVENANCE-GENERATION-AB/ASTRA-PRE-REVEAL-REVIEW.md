# ASTRA Pre-Reveal Review — EVAL-01D

**Status:** QUALITATIVE REVIEW COMPLETE — BLINDNESS COMPROMISED  
**Important limitation:** During execution-integrity review, Astra opened `raw-generations.json`, which contains the true condition labels. Therefore this review must **not** be described as a valid blinded review, even though the X/Y scoring below was performed from `review-blind.json` before intentionally opening `condition-key.json`.

The purpose of preserving this artifact before reveal is to freeze the X/Y judgments and prevent post-hoc editing after the mapping is inspected.

## Rubric

For each output:

- canonical/earliest answer;
- replay/ambiguity handling;
- chronology/causality;
- future leakage;
- unsupported claims;
- completeness.

No stylistic preference is scored.

## X/Y review

| Case | Repeat | X | Y | Notes |
|---|---:|---|---|---|
| core_gold:rq-0011 | 1 | PASS | PASS | Both anchor ch27 and reject ch32 as replacement origin. |
| core_gold:rq-0011 | 2 | PASS | PASS | Both correct; Y gives explicit metadata-based replay rationale. |
| core_gold:rq-0011 | 3 | PASS | PASS | Both correct; Y gives richer provenance explanation. |
| challenge:rq-0023 | 1 | PASS | PASS | Both correctly select ch40 and treat ch42/ch45 as later replay matches. |
| challenge:rq-0023 | 2 | PASS | PASS | Both correct; Y adds extra supported arc-conflict context but does not change answer. |
| challenge:rq-0023 | 3 | PASS | PASS | Both correct; X expresses replay metadata more explicitly. |
| challenge:rq-0025 | 1 | PASS | PASS | Both select ch45 as earliest and treat later Hẻm Vực occurrences as replay/state-conflict variants. |
| challenge:rq-0025 | 2 | PASS | PASS | Both preserve ch45 as first burial; later ch47/ch49 do not replace it. |
| challenge:rq-0025 | 3 | PASS | PASS | Both preserve chronology; X relies on chapter/event descriptions while Y cites provenance markers. |
| core_gold:rq-0036 | 1 | PASS | PARTIAL | Y says the ch32 replay appears before later active use including ch29, which introduces a local chronology inversion. X preserves lifecycle chronology. |
| core_gold:rq-0036 | 2 | PASS | PASS | Both start ch27 and end ch61; Y explicitly calls ch32 a parallel recounting. |
| core_gold:rq-0036 | 3 | PASS | PASS | Both preserve origin, wartime uses, ch60 non-melting state, and ch61 retirement. |
| core_gold:rq-0010 | 1 | PARTIAL | PARTIAL | Both identify ch33 battlefield payoff; Y also mentions ch31 pact. Neither fully traces rescue/proof/negotiation/joint-combat trust formation. |
| core_gold:rq-0010 | 2 | PARTIAL | PARTIAL | Both avoid the earlier causal inversion but compress the relationship evolution to the ch33 operation. |
| core_gold:rq-0010 | 3 | PARTIAL | PARTIAL | Same limitation: correct immediate turning point, incomplete multi-step relationship history. |

## Aggregate before reveal

```text
X:
PASS     12
PARTIAL   3
FAIL      0

Y:
PASS     11
PARTIAL   4
FAIL      0
```

### Provenance-relevant cases only

Excluding the negative-control rq-0010:

```text
X:
PASS     12 / 12
PARTIAL   0

Y:
PASS     11 / 12
PARTIAL   1 / 12
```

The single Y partial is `core_gold:rq-0036 repeat 1`, caused by sentence-level chronology ordering, not by choosing the wrong canonical origin/final state.

## Pre-reveal observations

1. Memory content itself already contains strong chronology/replay cues. The model often answers correctly without explicit provenance metadata.
2. Some X/Y outputs explicitly cite `ambiguous`, `narrative_echo`, `temporal_reset`, or similar provenance, while their counterpart reaches the same answer from chapter ordering and content.
3. The negative control remains incomplete in both labels: provenance does not obviously solve the broader causal-history reasoning problem.
4. There is no future leakage in the reviewed outputs.
5. No output promotes the known replay memory above the canonical/earliest answer in the four provenance-focused cases.
6. Because blindness was compromised, these observations are **exploratory**, not sufficient by themselves to authorize a production prompt policy.

## Next protocol step

After this artifact is committed, Astra may inspect `condition-key.json` and aggregate the frozen X/Y judgments by condition.

Any final EVAL-01D conclusion must explicitly carry the blindness limitation.
