# P7-04 — Hybrid Ranker Report

Status: **ACCEPTED — 2026-09-23**

Merged PR: `#3`  
Merge commit: `4303fb3ae6bc4fc01e031a016de3a6485c55739b`  
Ranking version: `hybrid-v1`  
Final PR-head CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35832077913

## Goal

P7-04 keeps the accepted P7-03 exact semantic candidate gate and adds deterministic narrative-aware reranking:

```text
tenant/version/freshness/temporal/canonical filters
        ↓
exact cosine semantic candidate pool
        ↓
entity + temporal + importance + relationship signals
        ↓
deterministic hybrid-v1 rank
        ↓
final semantic_memories
```

Canonical SQL context remains authoritative and semantic memories remain additive.

## Frozen ranking recipe

```text
hybrid =
  0.75 * semantic_rank_score
+ 0.03 * entity_overlap
+ 0.08 * temporal_relevance
+ 0.10 * importance
+ 0.04 * relationship_relevance
```

Semantic rank score:

```text
1 / log2(zero_based_semantic_rank + 2)
```

Temporal relevance:

```text
age = max(0, cutoff - memory.chapter_number)
1 / (1 + age / 12)
```

All component values are bounded to [0,1]. Candidate overfetch is `min(64, max(final_limit * 4, 20))`.

## Signal safety

Query entities are resolved without an LLM. Production uses canonical entity names plus confirmed aliases, restricted to tenant/novel/story scope and to entities grounded in confirmed active event participation at or before the chapter cutoff.

Relationship relevance may use:
- prior confirmed active event co-participation available by cutoff;
- canonical relationship rows only when they carry usable narrative-time provenance at/before cutoff.

Relationship rows without usable narrative-time provenance are ignored fail-closed.

Importance is propagated from canonical event metadata when present; missing importance remains neutral at 0.5.

## Failure semantics

```text
embedding/vector retrieval failure
→ Phase 6 fallback

successful semantic candidates + hybrid signal/ranker failure
→ semantic-only ordering
→ do not discard semantic retrieval
```

Ranking mode and bounded component scores are added to context artifacts and therefore to the generation context hash.

## Offline calibration proxy

Dataset: `aethelgard-retrieval-eval-v1.0.0`, 21 core-gold queries.

@10:

| Mode | Recall | MRR | nDCG |
|---|---:|---:|---:|
| recent-only | 0.409486 | 0.328571 | 0.316010 |
| accepted semantic-only | 0.674717 | 0.902381 | 0.709746 |
| hybrid-v1 proxy | 0.718556 | 0.906349 | 0.721033 |

The chosen recipe does not regress the accepted semantic-only aggregate metrics on this frozen proxy and remains substantially above the recent-only baseline.

### Limitations

This is calibration/regression evidence, not a held-out generalization claim.

- It starts from the accepted P7-01 saved semantic top-20 order, not raw cosine magnitudes.
- Frozen corpus metadata spans memory types beyond the current production `event_summary` vertical slice.
- Entity resolution is deterministic name/alias matching.
- Relationship proxy uses the frozen canonical relationship catalog with chapter cutoff.
- The same core-gold set informed weight selection, so these values are not an unbiased estimate of future-novel quality.

A later evaluation should use held-out novels/queries before treating the current weights as generally optimal.

## Verification

Final-head CI `35832077913`:

```text
semantic/materialization/retriever/hybrid tests  23 passed
hybrid proxy regression                           1 passed
P7 embedding benchmark regressions                6 passed
Phase 6 temporal/writing regressions             25 passed
live PostgreSQL + pgvector integration            10 passed
root Compose production path                     PASS
```

Root Compose verifies the runtime composes `HybridRanker` with ranking version `hybrid-v1`, while keeping pgvector, semantic materializer/rebuild, backend/web and auth smoke healthy.

## Scope held

Not introduced:
- ANN/HNSW/IVFFlat;
- specialized vector DB;
- LLM reranker;
- context compression/token packing;
- automatic online weight learning;
- automatic embedding-version cutover.

## Acceptance

P7-04 was accepted and squash-merged to `main` on 2026-09-23 as:

`4303fb3ae6bc4fc01e031a016de3a6485c55739b`

Final PR-head CI `35832077913` passed unit/regression, live PostgreSQL+pgvector integration, and root Compose smoke. No implementation blocker remains. P7-05 context compression/token-budget packing is the next planned slice and is not active yet.
