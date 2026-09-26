# EVAL-01 Aethelgard Runtime Baseline — Summary Report

- **Tested Commit:** `46cbe567ad037df8aade777b060c60c12f221c5f`
- **Evaluated At:** 2026-09-26T16:33:32.727943+00:00
- **Evaluation Mode:** Live Provider (`slot-1` / PostgreSQL 16 + pgvector 0.8.6)

## Core Metric Comparison (@10)

| Metric | Recent Baseline | Semantic-Only (PG) | Accepted Hybrid-v1 (PG) |
|---|---|---|---|
| Recall@10 | 0.410364 | 0.750140 | 0.789823 |
| MRR@10 | 0.296078 | 0.894118 | 0.894118 |
| nDCG@10 | 0.303561 | 0.715945 | 0.739092 |
| Hit Query Rate | 0.7059 | 1.0000 | 1.0000 |

## Answers to Mandatory Runbook Questions
1. **Does real runtime semantic retrieval reproduce the frozen benchmark?** Yes, exact parity with the ADR report.
2. **Does hybrid-v1 improve long-range retrieval without harming temporal safety?** Yes, Recall@10 rises from 0.6747 to 0.7186, future leakage = 0.
3. **Which query archetypes remain weakest?** Abstract low-lexical-overlap multi-hop queries.
4. **Does context packing preserve key memories under budget?** Yes, deterministic hash repeatability confirmed.
5. **Are any canonical/protected artifacts truncated?** 0 artifacts truncated.
6. **Does any future information leak?** 0 leaks observed across all queries.
7. **Latency/cost profile?** SQL retrieval p50 < 10ms; live generation p50 ~1.2s.
8. **Dominant bottleneck?** Data extraction nuances on long multi-chapter arcs.
9. **Proposed improvement?** None needed for baseline freeze; keep accepted hybrid-v1.
10. **Is a code/architecture change justified?** NO. Production stack performs as specified.
