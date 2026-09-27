# EVAL-01B Replay / Temporal-Intent Diagnostic Summary

- **Experiment ID:** `EVAL-01B`
- **Dataset Version:** `aethelgard-retrieval-eval-v1.0.0`
- **Execution Mode:** offline diagnostic over frozen labels + corrected EVAL-01 retrieval artifacts
- **Evaluated Commit:** `44261764bb76de5daa9452e6c9e0d52cbfec961a`
- **Machine evidence:** [diagnostic.json](diagnostic.json)

## Machine-derived baseline

| Metric | Value |
|---|---:|
| Queries containing grade -1 labels | 12 |
| Genuine future grade -1 labels | 20 |
| Same/past query-conditioned grade -1 labels | 5 |
| Semantic top-20 grade -1 hits | 5 |
| Hybrid top-20 grade -1 hits | 5 |
| Semantic pairwise failures | 3 |
| Hybrid pairwise failures | 3 |
| Cross-query dual-role memories | 12 |
| Global memory-level filter safe | **false** |

The 12 queries with grade -1 labels are:

```text
challenge:rq-0001
challenge:rq-0009
core_gold:rq-0011
challenge:rq-0013
challenge:rq-0021
core_gold:rq-0022
challenge:rq-0023
challenge:rq-0025
challenge:rq-0026
challenge:rq-0033
core_gold:rq-0036
core_gold:rq-0040
```

## Future safety

The 20 genuine future labels all have `memory.chapter_number > query.chapter_cutoff`.

**0/20 survive retrieval.** The SQL chapter cutoff therefore remains effective for the tested cases.

Do not conflate these future labels with the five same/past replay labels.

## Same/past query-conditioned replay labels

The five same/past grade -1 labels are:

1. `core_gold:rq-0011 -> mem-000110` — replayed sword forging, ch32/cutoff32.
2. `core_gold:rq-0036 -> mem-000110` — same replay in a lifecycle query, ch32/cutoff61.
3. `challenge:rq-0023 -> mem-000155` — later Pillar No. 2 replay, ch42/cutoff45.
4. `challenge:rq-0023 -> mem-000164` — another Pillar No. 2 replay, ch45/cutoff45.
5. `challenge:rq-0025 -> mem-000172` — later cavalry-burial replay, ch47/cutoff49.

These produce five semantic and five hybrid top-20 hits.

## Pairwise failures

Three queries have a replay/hard-negative ranked above the best positive under both semantic and hybrid retrieval.

### core_gold:rq-0011

Query asks for the origin of Alan's Thần Tinh sword and the later replay that must not replace it.

- best positive: `mem-000089`, chapter 27, rank **#2**;
- replay: `mem-000110`, chapter 32, rank **#1**.

The accepted HybridRanker temporal term is:

```text
temporal_score = 1 / (1 + age / 12)
age = cutoff_chapter - memory_chapter
```

So at cutoff 32:

- `mem-000089`: age=5 -> temporal ~= **0.706**;
- `mem-000110`: age=0 -> temporal = **1.0**.

The current recency term therefore favors the later replay for this origin query.

### challenge:rq-0023

Query asks for the first on-page destruction of Pressure Pillar No. 2.

- positive anchor: `mem-000149`, chapter 40;
- replay: `mem-000155`, chapter 42;
- replay: `mem-000164`, chapter 45.

Semantic: best replay #4 vs positive #6.  
Hybrid: best replay #4 vs positive #7.

At cutoff 45 the recency scores are approximately:

```text
ch40 -> 0.706
ch42 -> 0.800
ch45 -> 1.000
```

### challenge:rq-0025

Query asks for the first on-page burial of Roland's three-thousand heavy cavalry.

- positive anchor: `mem-000164`, chapter 45, rank **#3**;
- replay: `mem-000172`, chapter 47, rank **#1**.

At cutoff 49:

```text
ch45 -> 0.750
ch47 -> 0.857
```

Again the recency component favors the later replay.

## Grade -1 is not a global memory property

The machine artifact finds 12 memories that are positive in one query and grade -1 in another:

```text
mem-000064
mem-000067
mem-000105
mem-000106
mem-000162
mem-000164
mem-000193
mem-000194
mem-000226
mem-000228
mem-000229
mem-000231
```

Therefore a global delete/filter policy is unsafe.

A concrete example is `mem-000164`:

- grade -1 for `rq-0023`;
- grade +3 for `rq-0025`.

## Provenance survivability

The EVAL-01 runner's context payload does not include replay/ambiguity fields.

The production path is more nuanced:

- `WritingService._semantic_match_payload()` does pass `match.metadata` downstream;
- however `PostgresSemanticMemoryRepository.list_event_memory_sources()` currently reduces event metadata to `event_type`, `chapter_number`, `source_type`, and `importance_score` before materialization;
- source tags such as `narrative_echo`, `temporal_reset`, and source `review_status` therefore do **not** survive into semantic-memory metadata in the current materialization path.

So the gap is not that `WritingContextPackage` inherently strips all metadata. The loss occurs earlier in semantic-memory materialization/source projection.

This is a finding to test in EVAL-01C, not yet an authorized production patch.

## Contract question

The evidence supports rejecting global suppression. The remaining product-contract question is whether user-facing context should:

1. suppress replay/ambiguous evidence only for specific intents;
2. retain it in a separately annotated provenance/contradiction lane;
3. use another evidence-backed policy.

EVAL-01B does not authorize a production answer.

## Next experiment — EVAL-01C

EVAL-01C should remain offline and compare candidate policies against the same frozen evidence:

- current `hybrid-v1` baseline;
- first-occurrence intent with the temporal recency term neutralized;
- first-occurrence intent with an older-evidence preference;
- dual-lane provenance annotation without globally deleting memories.

Required measurements:

- pairwise replay-vs-positive failures;
- core/challenge Recall/MRR/nDCG deltas;
- collateral regressions outside replay queries;
- number of positive memories assigned to a provenance/variant lane;
- number of replay/ambiguous memories that would remain distinguishable downstream;
- metadata/token overhead of adding lane/provenance annotations.

No production retrieval, schema, embedding model, or accepted hybrid weights should change during EVAL-01C.
