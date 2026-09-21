# P7-01A — Aethelgard corpus consolidation and freeze

**Dataset version:** `aethelgard-retrieval-eval-v1.0.0`  
**Source snapshot:** `.data/Batch_7` from commit `b60647c792d79f970fbe34850337611cc144671f`  
**Story:** AETHELGARD: THE SOUL OF THE MORTAL BLADE — 61 chapters

## Result

The working extraction corpus is frozen for the Phase 7 embedding benchmark without modifying Batch_1..Batch_7.

- Full source memories: **232**
- Canonical benchmark memories: **216**
- Retrieval queries: **40**
- Core-gold queries: **21**
- Challenge queries: **19**
- Source entities: **80**
- Relationship histories: **16**
- Ambiguities retained in source snapshot: **35**
- Open questions retained in source snapshot: **25**

## Files

Primary benchmark:

- `.data/Frozen_v1/story_manifest.json`
- `.data/Frozen_v1/memory_chunks_canonical.json`
- `.data/Frozen_v1/core_gold_queries.json`

Secondary diagnostics:

- `.data/Frozen_v1/challenge_queries.json`
- `.data/Frozen_v1/retrieval_queries.json`

Raw extraction/audit remains in `.data/Batch_7`. Do not concatenate Batch_1..Batch_7 because they are cumulative snapshots.

## Label model

Every judged query-memory pair has one normalized grade:

| Grade | Meaning |
|---:|---|
| 3 | highly relevant |
| 2 | relevant |
| 1 | acceptable context |
| 0 | explicit hard negative |
| -1 | prohibited future/invalid memory |

Unlisted memories are **unjudged**, not automatically irrelevant.

Temporal/provenance filtering is mandatory before ranking:

```text
memory.chapter_number <= query.chapter_cutoff
```

Grade `-1` items are explicit regression traps and must never survive that gate.

## Conflict corrections

Three source-label conflicts were corrected:

1. **rq-0019 / mem-000151** — removed from hard-negative. The contested Hẻm Vực testimony is necessary context for the grievance the query asks about. It remains an uncertain/inferred positive, so the query stays in challenge.
2. **rq-0032 / mem-000053** — removed from hard-negative. The earlier Varian-attributed claim is the object explicitly compared with chapter-54 confirmation. It remains uncertain, so the query stays in challenge.
3. **rq-0035 / mem-000170 + mem-000178** — removed from acceptable positives and kept as hard negatives. They are earlier/incomplete sabotage events, not answers to the final-cable ecological state change. This moves rq-0035 into core gold.

## Core-gold policy

A query enters core gold only when:

1. query `review_status == high_confidence`;
2. every positive label (grade 1..3) points to a `canonical` memory;
3. every positive memory has `review_status == high_confidence`;
4. every memory reference resolves.

Queries failing any rule stay in challenge instead of being silently promoted or discarded.

## Benchmark policy

P7-01 embedding/model selection MUST use:

- corpus: `memory_chunks_canonical.json` (216 memories);
- queries: `core_gold_queries.json` (21 queries).

The 19-query challenge split is diagnostic only until human review promotes uncertain labels.

Primary metrics:

- Recall@K;
- MRR or nDCG@K;
- latency;
- embedding dimension;
- storage/index footprint estimate.

The same frozen corpus/query set must be used for recent-only baseline and every embedding candidate.

## Next action

Proceed with the embedding benchmark + ADR. Do not freeze a production pgvector migration until the benchmark selects a model/dimension with evidence.
