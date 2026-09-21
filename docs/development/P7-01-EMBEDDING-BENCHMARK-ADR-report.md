# P7-01 — Embedding Benchmark + ADR

Status: **IN PROGRESS**

## Completed in this increment

1. Frozen Aethelgard evaluation corpus accepted as benchmark input.
2. Recent-only baseline measured on 21 core-gold queries.
3. Benchmark harness added at `ai-service/benchmarks/p7_embedding_benchmark.py`.
4. Deterministic metric/temporal tests added at `ai-service/tests/test_p7_embedding_benchmark.py`.
5. Vietnamese cross-lingual diagnostic split added (10 queries).
6. Candidate matrix prepared:
   - `gemini-embedding-001 @ 768`;
   - `gemini-embedding-2 @ 768`;
   - optional `text-embedding-3-small @ 768`;
   - 1536-dimension sweep after the first model round.

## Recent-only baseline

| K | Recall@K | MRR@K | nDCG@K |
|---:|---:|---:|---:|
| 5 | 0.2955 | 0.3286 | 0.2782 |
| 10 | 0.4095 | 0.3286 | 0.3160 |
| 20 | 0.6256 | 0.3482 | 0.4038 |

## Blocker

This environment does not have access to the repository owner's provider credentials/runtime, so real embedding API quality and latency have **not** been measured here.

The benchmark must run in an authorized local/CI environment that already has the relevant provider key. Do not paste API keys into chat or commit them to the repository.

## Gate status

```text
labeled retrieval dataset exists       PASS
recent-only baseline measured          PASS
>=2 embedding candidates measured      PENDING
quality + latency + dimension recorded PENDING
ADR selects model/dimension             PENDING
reindex/version policy explicit         PENDING ADR
production pgvector schema frozen       NO (correct)
```
