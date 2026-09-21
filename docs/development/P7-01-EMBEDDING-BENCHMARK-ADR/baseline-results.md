# Recent-only baseline results

**Dataset:** `aethelgard-retrieval-eval-v1.0.0`  
**Corpus:** 216 canonical memories  
**Queries:** 21 core-gold queries

## Ranking policy

This is an evaluation proxy for the existing recent-context strategy:

1. exclude memories after `chapter_cutoff`;
2. order remaining memories by `chapter_number DESC`;
3. tie-break by `memory_id DESC`;
4. take top K.

Production Phase 6 currently applies the analogous policy to confirmed events: temporal cutoff, supersede resolution, then the last `limit_recent_events`. The benchmark proxy expands recency to all canonical memory types so it can be compared fairly with Phase 7 semantic retrieval.

## Aggregate results

| K | Recall@K | MRR@K | nDCG@K | Hit-query rate |
|---:|---:|---:|---:|---:|
| 5 | 0.2955 | 0.3286 | 0.2782 | 0.7143 |
| 10 | 0.4095 | 0.3286 | 0.3160 | 0.7143 |
| 20 | 0.6256 | 0.3482 | 0.4038 | 1.0000 |

## Interpretation

Recency eventually finds something relevant for every query by K=20, but ranking quality is weak: nDCG@10 is only **0.3160**, and several old-but-important / low-lexical-overlap cases have no hit at K=10.

This is the baseline Phase 7 must beat on the same 21-query core-gold set.
