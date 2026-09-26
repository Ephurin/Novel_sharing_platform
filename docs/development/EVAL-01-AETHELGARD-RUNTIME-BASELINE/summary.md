# EVAL-01 Aethelgard Runtime Baseline — Corrected Harness Summary

- **Dataset:** `aethelgard-retrieval-eval-v1.0.0`
- **Primary corpus:** 216 frozen canonical memories for 21 core-gold queries
- **Challenge corpus:** 232 frozen audit memories for 19 challenge queries
- **Cross-lingual diagnostic:** 10 Vietnamese queries on the canonical corpus
- **Evaluation mode:** live Gemini provider + PostgreSQL/pgvector
- **Generation quality:** REVIEW_REQUIRED (not self-scored)

## Primary core-gold runtime metrics @10

| Metric | Recent | Semantic-only | hybrid-v1 |
|---|---:|---:|---:|
| Recall@10 | 0.409486 | 0.674717 | 0.738964 |
| MRR@10 | 0.328571 | 0.902381 | 0.906349 |
| nDCG@10 | 0.316010 | 0.709746 | 0.731047 |
| Hit query rate | 0.714286 | 1.000000 | 1.000000 |

Challenge and Vietnamese metrics are preserved in `retrieval-metrics.json` and are not mixed into the primary aggregate.

## Safety

- Future candidates surviving final retrieval: **0**
- Stale/wrong-version candidates surviving final retrieval: **0**

## Context

- Deterministic packing cases: **6/6**
- Real corpus memory content used: **YES**
- Protected canonical entity/state/rule truncation: **not_measured** (full locked package is not reconstructed by this harness)

## Generation

- Live execution successes: **4/4**
- Quality scores: **not_scored / independent review required**
- No automatic 5/5 rubric is permitted.

## Latency

- Query embedding p50: **1478.2939499709755 ms**
- SQL retrieval p50: **62.753899954259396 ms**
- Generation p50: **1397.8420000639744 ms**
- Tokens/cost: **not_measured** — current LLMClient does not expose usage metadata.

## Interpretation

This runner can establish runtime retrieval, temporal safety, hybrid behavior, deterministic semantic-memory packing, and live generation execution. It must not claim raw-ingestion quality, protected-artifact packing quality, generation quality, or token/cost quality without separate evidence.
