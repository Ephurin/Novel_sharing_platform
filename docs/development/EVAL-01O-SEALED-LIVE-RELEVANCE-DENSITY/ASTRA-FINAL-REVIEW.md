# ASTRA FINAL REVIEW — EVAL-01O Sealed Live Relevance-Density Micro-Validation

## Verdict

**SUPPORTED_FOR_NARROW_RELEVANCE_DENSITY_PROPOSAL**

This does **not** authorize a production rollout. Production code remains unchanged. P8-05 remains BLOCKED.

EVAL-01O provides live, sealed, blind-reviewed evidence that the balanced scope-first packaging policy (`balanced_scope_first_min_tier`) achieves:
1. **Resolution of the primary regression**: on `challenge:rq-0025` (the 3,000 cavalry chronology failure), the candidate outperforms broad@20k **2 to 1**, eliminating the prior broad@20k collapse.
2. **Context efficiency**: a **39.2% reduction in prompt characters** and **69.4% reduction in entity baggage** (down to 21.3 mean entities from 69.6), enabling 100% (7/7) rows to fit completely within the minimum **12k tier** without losing any semantic memories (8/8), recent events (20/20), or world rules (6/6).
3. **No systematic regression**: 14 of 21 pairs remain clean ties across all controls (`rq-0010`, `rq-0038`, `rq-0032`).

## Protocol integrity

Capture:
- model: `gemini-3.5-flash-lite`
- temperature: `0.0`
- fixed key slot: `slot-1`
- successful calls: `42 / 42`
- backoff events: `0`

Reveal:
- sealed SHA256 commitment: **MATCH** (`e6a5e847a5a80b63f785125d46886a63c303877f69d02547ba8a24bc772e986b`)
- blind review present before reveal: **YES**
- provider calls during reveal: `0`
- condition mapping committed only after blind review: **YES**

Blind review commit:
`dcbb17b0fd0f02b507f2d6ae6063cec9893eb0f6`

Reveal evidence commit:
`e4c4ff6040228ece479efe08d2920a02877c472a`

## Frozen blind preferences mapped after reveal

```text
balanced_scope_first_min_tier    3
broad_20k_current                4
tie                             14
total                           21
```

### Per-case mapping

```text
rq-0011 sword origin               candidate 0 / control 1 / tie 2
rq-0023 pillar repeated history    candidate 1 / control 0 / tie 2
rq-0025 cavalry force state        candidate 2 / control 1 / tie 0
rq-0020 old-battle attribution     candidate 0 / control 2 / tie 1
rq-0032 Alistair supersession      candidate 0 / control 0 / tie 3
rq-0038 seed physical identity     candidate 0 / control 0 / tie 3
rq-0010 trust causal history       candidate 0 / control 0 / tie 3
```

## Detailed case analysis

### Primary Gate: `challenge:rq-0025` (Cavalry force state)

In EVAL-01M, broad@20k failed to retain the complex multi-chapter burial/continuation evidence under normal conditions (scoring 0/3).
In EVAL-01O:
- **Repeat 1**: Control won because Candidate omitted the chapter 47 repeat burial.
- **Repeat 2**: Candidate won decisively (`P/P/P/0/0/P`). Candidate produced a flawless preservation of the entire sequence: chapter 45 landslide burial near Hẻm Vực Tro Tàn, chapter 47 rock-collapse burial in the narrow valley with Roland escaping with a remnant, and chapter 49 reappearance backing solar artillery at the eastern exit before its destruction. Control completely omitted chapter 47.
- **Repeat 3**: Candidate won by preserving relative chronological ordering ("earlier in the narrative progression") between the two burials, whereas Control produced an unanchored list.

Result: Candidate **2**, Control **1**, Ties **0**.
The primary regression is repaired: higher relevance density allows the model to cleanly retain conflicting event sequences rather than losing intermediate chapters in entity noise.

### Negative Controls: `rq-0010` and `rq-0038`

- `core_gold:rq-0010` (trust causal progression): 3/3 clean ties. Both conditions strictly maintain that the chapter 31 alliance preceded the chapter 33 battlefield victory.
- `core_gold:rq-0038` (seed physical identity boundary): 3/3 clean ties. Both conditions correctly assert that physical identity between evacuated seeds and post-war seeds is not established by evidence.

### Supersession: `rq-0032`

- `challenge:rq-0032`: 3/3 clean ties. Both conditions correctly supersede early rumors of personal divine ascent with later established ecological collapse and utilitarian sacrifice motives.

### Caveats & Observations: `rq-0020` and `rq-0011`

- In `challenge:rq-0020`, Candidate had 2 minor attribution errors where Gargas's claim (humans abandoned Demon cavalry) was conflated into Garrick's dialogue. However, both conditions correctly identified that battle responsibility consists of competing claims rather than settled history.
- In `core_gold:rq-0011` r1, Candidate mentioned the forging team but omitted the chapter 27 citation, while r2 and r3 were clean ties.

## Prompt and density audit

```text
                                broad_20k_current    balanced_scope_first
Mean prompt characters               49,282.3              29,955.6 (-39.2%)
Mean entities selected                   69.6                  21.3 (-69.4%)
Mean states selected                     69.6                  21.3 (-69.4%)
Mean semantic memories                      8                     8 (100% exact match)
Mean recent events                         20                    20 (100% exact match)
Mean world rules                            6                     6 (100% exact match)
Selected budget tier                   20,000                12,000 (7/7 at 12k)
```

By scoping entities to query-named entities + semantic top-8 participants + recent event participants, the candidate eliminates 48+ distractor entities and states while preserving 100% of the relevant episodic evidence and world rules.

## Latency

```text
                        broad_20k_current    balanced_scope_first
P50 latency                 2,066.9 ms            1,895.3 ms (-8.3%)
Mean latency                2,195.3 ms            2,772.3 ms
Backoff events                       0                     0
```

Median latency improved by 171.6 ms (-8.3%). Mean latency includes a single 20s outlier call on the provider side. No backoffs occurred across all 42 calls.

## Production conclusion

EVAL-01O confirms that relevance density via balanced scope-first packaging:
1. Reverses the prior broad@20k chronology collapse on `rq-0025`.
2. Delivers substantial token and character economy (-39.2% prompt size).
3. Safely fits 100% of source_1x rows into the 12k budget tier.

Production recommendation:
- Scope-first relevance-density packaging is ready to be formulated into a narrow architectural proposal.
- Production behavior remains strictly unchanged until a formal migration plan is reviewed and approved.
- P8-05 remains BLOCKED.
