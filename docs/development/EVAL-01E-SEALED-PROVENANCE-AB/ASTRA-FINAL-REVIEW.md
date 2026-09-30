# ASTRA Final Review — EVAL-01E Sealed Provenance Generation A/B

**Harness merge:** `c0cbc09b11f18e9f96e998ae0bcdc8a69f29835e`  
**Capture tested commit:** `bb41fd2fbfc354e051f36e91d54fc61fb4e91192`  
**Blind review commit:** `ce3494e740ef0ca744d4ad7b0c107f39b333af19`  
**Reveal evidence commit:** `628297af288f8b3beb22cff29b1498b780610ffb`  
**Reveal handoff commit:** `018de27903b6ceab91cab97eb6f46fe2db682ff8`  
**Review status:** COMPLETE — DIRECTIONAL POSITIVE EFFECT, NO PRODUCTION PROMPT CHANGE YET

## Protocol integrity

The EVAL-01E sealed protocol completed correctly:

```text
live calls                    42 / 42
model                         gemini-3.5-flash-lite
temperature                   0.0
fixed key                     slot-1
provider backoff              0
prompt isolation              PASS 7/7
blind review frozen first     YES
condition mapping revealed    AFTER blind review
sealed commitment match       true
provider calls during reveal  0
frozen corpus mutated         false
```

Private-state SHA256:

`09aaa4415a6f717f49be5b67847f83b5d743aed36da3d690ecee4042100a4c7c`

## Frozen blind result mapped to conditions

The blind review was frozen before reveal:

```text
X: 15 PASS / 6 PARTIAL / 0 FAIL
Y: 15 PASS / 6 PARTIAL / 0 FAIL
```

After mapping X/Y to conditions:

```text
pre_provenance:
PASS      14 / 21
PARTIAL    7 / 21
FAIL       0 / 21

post_provenance:
PASS      16 / 21
PARTIAL    5 / 21
FAIL       0 / 21
```

Pairwise outcome:

```text
post_provenance improvements  2 / 21
post_provenance regressions   0 / 21
ties                         19 / 21
```

The two improvements are:

1. `core_gold:rq-0011 repeat 2`: PARTIAL -> PASS.
   - Pre-provenance gives forging facts but does not establish chapter 27 as the canonical origin.
   - Post-provenance explicitly anchors chapter 27 and treats chapter 32 as later evidence.

2. `challenge:rq-0025 repeat 3`: PARTIAL -> PASS.
   - Pre-provenance recognizes incompatible cavalry outcomes but compresses the dated sequence and loses the earliest-burial anchor.
   - Post-provenance preserves the chapter 45 -> 47 -> 49 chronology.

The two improvements occur under opposite call orders, so a simple first/second-call ordering effect does not explain both.

## Case-level mapped result

```text
rq-0011 origin
  pre   0 PASS / 3 PARTIAL
  post  1 PASS / 2 PARTIAL

rq-0023 repeated Pillar
  pre   3 PASS
  post  3 PASS

rq-0025 cavalry state
  pre   2 PASS / 1 PARTIAL
  post  3 PASS

rq-0020 attributed history
  pre   3 PASS
  post  3 PASS

rq-0032 source-status supersession
  pre   3 PASS
  post  3 PASS

rq-0038 physical identity
  pre   3 PASS
  post  3 PASS

rq-0010 causal-history negative control
  pre   0 PASS / 3 PARTIAL
  post  0 PASS / 3 PARTIAL
```

## Interpretation

EVAL-01E provides cleaner evidence than EVAL-01D because:

- evaluator-written replay/canonical wording was neutralized in both conditions;
- frozen corpus remained untouched;
- review was genuinely sealed and blinded before reveal;
- retrieval candidates/order/content view/model/temperature/system prompt were held constant.

The result is directionally positive and specific:

- provenance helps in exactly the kinds of source-status/chronology cases it is meant to help;
- provenance does not magically repair the unrelated multi-step causal-history weakness in `rq-0010`;
- no tested case regressed.

However, the measured effect is still small: only 2/21 paired outputs differ at the rubric level.

## Context cost

Full post-provenance metadata adds:

```text
rq-0011   +801 estimated tokens
rq-0023   +795
rq-0025   +792
rq-0020   +811
rq-0032   +836
rq-0038   +763
rq-0010   +800
```

Current test contexts remain only about 2–3k estimated tokens inside a 12k budget.

Therefore EVAL-01E does **not** establish behavior under real budget pressure.

## Architecture verdict

```text
provenance propagation               KEEP
provenance has generation value      SUPPORTED, SMALL/DIRECTIONAL
full verbose provenance in prompt    NOT JUSTIFIED YET
dual-lane prompt policy              NOT JUSTIFIED YET
ranking change                       NOT JUSTIFIED
global provenance suppression        REJECTED
full context budget pressure         NOT_MEASURED
```

No production change is authorized by this review.

## Next justified diagnostic

EVAL-01F should answer two narrower questions:

1. Can a compact provenance representation preserve the useful source-status signals while materially reducing the ~800-token overhead?
2. Under deterministic residual semantic-budget pressure, does full provenance cause relevant/contrast evidence to be dropped earlier than compact provenance?

The diagnostic should compare:

```text
pre_provenance
full_provenance
compact_provenance
```

Compact provenance should retain only evidence-semantic source-status signals and avoid redundant prompt fields already represented elsewhere.

The first EVAL-01F step should be offline/token-budget analysis. Do not spend additional live provider calls until compact encoding and pressure behavior are measured.
