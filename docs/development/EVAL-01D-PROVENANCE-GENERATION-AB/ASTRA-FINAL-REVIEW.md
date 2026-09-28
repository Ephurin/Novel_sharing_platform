# ASTRA Final Review — EVAL-01D Provenance-Aware Generation A/B

**Harness merge:** `3fdaca001585f1b6cdd567b8eb8e20517040145e`  
**Correct tested commit:** `03af3d735f894ffce0a15e87e34ba3df1dcf65e7`  
**Correct evidence commit:** `e06fede23f792bbd9ca712a57baa6f7f4d164fde`  
**Execution status:** VALID  
**Quality conclusion:** EXPLORATORY / NOT SUFFICIENT FOR PRODUCTION PROMPT CHANGE

## Execution integrity

```text
model                         gemini-3.5-flash-lite
temperature                   0.0
fixed key slot                slot-1
calls                         30 / 30 successful
provider backoff              0
prompt isolation              PASS 5/5
same selected memories        PASS 5/5
same dropped memories         PASS 5/5
same system prompt            PASS 5/5
P8-05                         BLOCKED
```

No retrieval, ranking, embedding, schema, frozen-label, or production prompt behavior was changed by the experiment.

## Review-protocol limitation

The intended blind protocol was compromised during Astra's execution-integrity inspection because `raw-generations.json` contains explicit `pre_provenance` / `post_provenance` labels.

Astra therefore does **not** claim a valid blinded human review.

Before intentionally opening `condition-key.json`, the X/Y judgments were frozen in:

`ASTRA-PRE-REVEAL-REVIEW.md`

That review must be interpreted as a pre-reveal qualitative record with contamination disclosed, not as blinded evidence.

## Frozen X/Y review

Before reveal:

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

After opening `condition-key.json`, those frozen judgments map to:

```text
pre_provenance:
PASS     11
PARTIAL   4
FAIL      0

post_provenance:
PASS     12
PARTIAL   3
FAIL      0
```

For the four provenance-focused cases only:

```text
pre_provenance:
PASS     11 / 12
PARTIAL   1 / 12

post_provenance:
PASS     12 / 12
PARTIAL   0 / 12
```

The only rubric-level improvement is `core_gold:rq-0036 repeat 1`, where the pre-provenance output introduces a local chronology ordering error while the post-provenance output preserves lifecycle chronology.

The negative-control case `core_gold:rq-0010` remains PARTIAL in all six outputs because both conditions compress a multi-step trust history into the chapter-33 battlefield payoff.

## Provenance-expression effect

Simple output diagnostics show explicit replay/ambiguity/provenance language in:

```text
pre_provenance   8 / 15 outputs
post_provenance 10 / 15 outputs
```

This is directionally consistent with provenance making the model's rationale more explicit, but it is not a quality metric by itself.

## Critical confound — editorial provenance already exists in memory content

The experiment's largest limitation is not the model. It is the context corpus.

Several replay memories already encode the replay judgment directly in `memory.content`.

Examples:

```text
mem-000110:
"... even though the same sword was already forged in chapter 27 ..."

mem-000155:
"Chapter 42 again depicts ... destroys ... Pillar No. 2 ..."

mem-000164:
"Chapter 45 destroys Pressure Pillar No. 2 yet again ..."

mem-000172:
"Chapter 47 again depicts Roland's three-thousand heavy cavalry ..."
```

Therefore the pre-provenance condition is not truly provenance-free at the semantic level. The editorial narrative judgment is already embedded in the text supplied to the LLM.

This explains why both A/B branches perform very well on the replay cases.

## What EVAL-01D does establish

EVAL-01D supports these narrower statements:

1. Compact provenance can reach the production prompt without changing retrieval.
2. Adding provenance does not degrade the tested replay cases.
3. It can make replay/ambiguity reasoning more explicit.
4. It may prevent some local chronology mistakes; one such improvement was observed.
5. Provenance does not solve unrelated multi-step causal-history reasoning by itself.
6. The selected frozen replay summaries are too editorially enriched to measure the marginal necessity of provenance cleanly.

## What EVAL-01D does not establish

Do not conclude that:

- provenance materially improves generation quality in general;
- a dual-lane prompt should now be implemented;
- provenance should be surfaced verbatim to the user;
- the ~786-800 token overhead is acceptable under full 12k budget pressure;
- replay handling is solved for production-like neutral memory summaries.

## Architecture decision

```text
provenance propagation              KEEP
production dual-lane prompt change  NOT JUSTIFIED YET
ranking change                      NOT JUSTIFIED
global suppression                  REJECTED
```

The already-merged provenance propagation remains useful infrastructure because it preserves evidence semantics for downstream policies.

The next experiment should remove the editorial-content confound before testing prompt policy.

## Recommended next experiment

EVAL-01E should compare pre/post provenance while using **source-faithful or content-neutralized evidence text** that does not itself say "replay", "again", "yet again", "even though already", or otherwise reveal the evaluator's provenance judgment.

The frozen corpus must not be mutated. Any neutralized/source-faithful context must be a derived experimental view with a recorded transformation or direct source provenance.

EVAL-01E should also repair the review protocol:

1. first evidence commit contains only reviewer-safe blind outputs + rubric + mapping commitment hash;
2. no condition-labelled raw generations or prompt hashes are committed before review;
3. Astra commits the blind review;
4. only then is the condition key/raw audit committed and revealed.

This creates a genuinely auditable blind sequence.
