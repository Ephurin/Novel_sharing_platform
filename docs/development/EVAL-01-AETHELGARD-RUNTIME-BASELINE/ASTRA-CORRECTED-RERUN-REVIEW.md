# ASTRA Review — EVAL-01 Corrected Rerun

**Reviewed tested commit:** `8bae8276633ec9a9dae56d6f314907b9d12ee16d`  
**Evidence commit:** `1cdee38c5dd7fe3a865123b93a670177b6fd8129`  
**Gemini handoff:** `ef21ba0cdb5de004054f37b2bccd9a387536f561`  
**Review status:** PARTIAL — QUERY-CONDITIONED REPLAY CONTRACT GAP  
**Production architecture change authorized:** NO

## Validated runtime results

The corrected run preserves the frozen split/corpus policies:

- core-gold: 21 queries / 216 canonical memories;
- challenge: 19 queries / 232 audit memories;
- Vietnamese diagnostic: 10 queries / 216 canonical memories.

Primary core-gold @10:

| Metric | Recent | Semantic | hybrid-v1 |
|---|---:|---:|---:|
| Recall | 0.409486 | 0.674717 | 0.738964 |
| MRR | 0.328571 | 0.902381 | 0.906349 |
| nDCG | 0.316010 | 0.709746 | 0.731047 |

The live semantic runtime reproduces the accepted P7 semantic baseline. Hybrid-v1 improves the aggregate core-gold metrics and materially improves the Vietnamese diagnostic.

Challenge behavior is mixed: hybrid-v1 raises aggregate nDCG but slightly lowers Recall/MRR, with clear regressions on `rq-0021` and `rq-0039`.

Materialization is also valid:

- canonical 216: 216 reused / 216 fresh / 0 stale / 0 missing;
- challenge 232: 232 generated this run / 232 fresh / 0 stale / 0 missing.

## Temporal/version safety

The actual safety checks pass:

- chapter-after-cutoff survivors: **0**;
- stale/wrong-version survivors: **0**.

This means no observed future-chapter leak and no stale embedding leak in the corrected run.

## Query-conditioned grade -1 finding

Frozen v1 also contains query labels with grade `-1` = `prohibited_future_or_invalid`.

Astra compared `retrieval-raw.json` against those labels and found **10 stage-level grade -1 hits across 4 query cases**:

| Case | Stage | Rank | Memory | Interpretation |
|---|---|---:|---|---|
| core_gold:rq-0011 | semantic | 1 | mem-000110 | replayed “first forging” |
| core_gold:rq-0011 | hybrid | 1 | mem-000110 | replay remains rank 1 |
| core_gold:rq-0036 | semantic | 7 | mem-000110 | replayed sword origin |
| core_gold:rq-0036 | hybrid | 8 | mem-000110 | replay remains |
| challenge:rq-0023 | semantic | 4 | mem-000155 | later Pillar No. 2 replay |
| challenge:rq-0023 | semantic | 7 | mem-000164 | third Pillar No. 2 replay |
| challenge:rq-0023 | hybrid | 4 | mem-000155 | replay remains |
| challenge:rq-0023 | hybrid | 6 | mem-000164 | replay remains |
| challenge:rq-0025 | semantic | 1 | mem-000172 | later cavalry-burial replay |
| challenge:rq-0025 | hybrid | 1 | mem-000172 | replay remains rank 1 |

These are **not future-chapter leaks**. Every listed memory is at or before the query cutoff.

They are query-conditioned replay/hard-negative ranking failures.

### Why a global filter is invalid

The same memory can be positive for one query and prohibited for another.

Examples:

- `mem-000164` is grade `-1` for `rq-0023`, but grade `+3` for `rq-0025`;
- `mem-000149` is a positive anchor for `rq-0023` while also carrying `do_not_use_as_clean_ground_truth` source tags.

Therefore neither `do_not_use_as_clean_ground_truth` nor grade `-1` can be interpreted as a global DB-level “delete/filter this memory” flag.

The contract is query-specific.

### Benchmark-contract ambiguity

Some benchmark queries explicitly ask to identify the replay that should not replace the canonical event:

- `rq-0011`: asks which later “first forging” scene should not replace the true origin;
- `rq-0023`: asks which later matches are narrative-replay hard negatives;
- `rq-0025`: asks which later Hẻm Vực matches are chronology-replay negatives.

For such wording, surfacing a replay memory may be useful to a reasoning model **if the context identifies it as replay/ambiguous**.

At the same time, the retrieval labels mark those replay memories grade `-1`.

So the frozen benchmark currently conflates two possible product contracts:

1. **answer-context contract** — exclude replay/hard-negative memories from canonical answer context;
2. **diagnostic reasoning contract** — retrieve the replay but preserve provenance so the model can explicitly reject it.

That ambiguity must be resolved before changing production retrieval.

## Hybrid temporal-signal weakness

Even without changing the benchmark semantics, the rankings reveal a real limitation.

For `core_gold:rq-0011`:

- true origin `mem-000089` is chapter 27;
- replay `mem-000110` is chapter 32;
- semantic ranks replay #1 and origin #2;
- hybrid also ranks replay #1;
- hybrid temporal score gives the newer replay `1.0`, while the true origin receives ~`0.706`.

For “origin / first occurrence” intent, simple recency relevance points in the wrong direction.

Similarly:

- `challenge:rq-0023` asks for the first Pillar No. 2 destruction, but later replay memories rank above the true first event;
- `challenge:rq-0025` asks for the first burial, but the later replay ranks #1 while the earlier positive anchor ranks #3.

This is evidence of a **query-intent temporal reasoning gap**, not a chapter-cutoff safety failure.

Potential future category:

`HYBRID_SIGNAL / TEMPORAL_INTENT`

No weight tuning is authorized yet.

## Manual generation review

The corrected harness preserved four outputs without self-scoring. Astra reviewed each against the exact query and retrieved memories.

### generation:core_gold:rq-0002 — PASS

The answer correctly identifies the corrupted-root countermeasure and its brief effect on Alistair's vulnerable armor joint.

- factual consistency: PASS;
- context adherence: PASS;
- future leakage: none;
- unsupported facts: none material.

### generation:core_gold:rq-0007 — PASS

The answer correctly uses the chapter-28 Garen fight as observed confirmation of the Thần Tinh anti-mana property.

- factual consistency: PASS;
- context adherence: PASS;
- future leakage: none;
- unsupported facts: none material.

### generation:core_gold:rq-0010 — PARTIAL

The answer correctly identifies the joint victory and Valora's recognition of Oakhaven's battlefield value, but it says that victory “leads her to ... commit Demon Thần Tinh resources and forge access.”

The evidence shows:

- resource/forge commitment: chapter 31;
- joint victory and explicit belief revision: chapter 33.

This is a real causal/temporal inversion.

Failure category: `GENERATION`.

### generation:challenge:rq-0001 — PASS

The answer preserves the distinction between evidence supporting suspicion and independently verified intent.

It correctly uses Roland's statement and Elena's observed/attributed evidence without promoting Alistair's intent to established fact.

### Generation pilot result

```text
clean cases: 3/4
partial causal/temporal error: 1/4
future leakage in generated outputs: 0
```

The sample is too small for a broad quality claim, but it demonstrates at least one reproducible temporal-reasoning weakness.

## Context-packing review

The corrected runner uses real frozen-memory content and produces deterministic hashes for 6/6 cases.

However, each measured input is only about **1,971–2,248 estimated tokens** against a **12,000-token budget**.

No semantic item is dropped.

Therefore the run establishes:

- deterministic packing: PASS;
- real-memory payload path: PASS;
- no-drop behavior under light load: PASS.

It does not establish:

- prioritization under token pressure;
- relevant-memory retention when candidates compete for budget;
- protected locked entity/state/rule behavior.

Those remain `not_measured`.

## Latency

Measured:

- query embedding p50: ~1478 ms; p95: ~2618 ms;
- SQL retrieval p50: ~62.75 ms; p95: ~69.34 ms;
- hybrid rerank p50: ~16.67 ms; p95: ~78.05 ms;
- generation p50: ~1398 ms; p95: ~2280 ms.

Provider token/cost usage remains `not_measured`.

## EVAL-01 verdict

```text
runtime semantic reproduction        = PASS
core hybrid aggregate improvement    = PASS
Vietnamese hybrid diagnostic         = PASS
challenge hybrid behavior            = MIXED
chapter-cutoff future leakage        = PASS (0)
embedding-version freshness          = PASS (0 stale/wrong)
query-conditioned replay negatives   = PARTIAL / CONTRACT GAP
context determinism                  = PASS
context budget-pressure quality      = NOT_MEASURED
generation execution                 = PASS
generation quality pilot             = PARTIAL (3 clean / 1 temporal-causal error)
raw ingestion/extraction             = NOT_MEASURED
production architecture defect       = NOT YET DEMONSTRATED
```

Overall:

**EVAL-01 = PARTIAL — follow-up replay/temporal-intent experiment required before acceptance.**

P8-05 destructive cleanup remains BLOCKED.

## Required next step — EVAL-01B

Do not tune hybrid weights or change the embedding model.

Run a focused **Replay / Temporal-Intent Diagnostic** that separates:

1. genuine future information that must be filtered;
2. query-conditioned replay negatives;
3. replay memories that may need to be surfaced with explicit provenance for contradiction/replay reasoning.

EVAL-01B should measure:

- positive-vs-replay pairwise rank for origin/first-occurrence queries;
- whether recency temporal score promotes the wrong replay;
- whether replay provenance survives into semantic memory/context;
- answer quality under two offline policies:
  - suppress replay from canonical answer context;
  - retain replay but annotate it as ambiguous/replay evidence.

No production implementation slice should open until that experiment identifies the intended product contract and measurable target.
