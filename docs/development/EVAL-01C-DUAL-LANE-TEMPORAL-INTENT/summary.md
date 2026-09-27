# EVAL-01C Dual-Lane Context & Intent-Conditioned Ranking

- Dataset: `aethelgard-retrieval-eval-v1.0.0`
- Mode: offline simulation over preserved EVAL-01 runtime candidates
- Production changes: none

## Ranking policies

| Policy | Core R@10 | Core MRR@10 | Core nDCG@10 | Challenge R@10 | Challenge nDCG@10 | Pairwise failures |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 0.738964 | 0.906349 | 0.731047 | 0.746115 | 0.667668 | 3 |
| neutral_first_occurrence | 0.738964 | 0.906349 | 0.730166 | 0.746115 | 0.668872 | 3 |
| inverse_first_occurrence | 0.729441 | 0.906349 | 0.726604 | 0.746115 | 0.668872 | 3 |

## First-occurrence cases

### core_gold:rq-0011

- baseline: positive #2, replay #1
- neutral temporal: positive #2, replay #1
- inverse recency: positive #2, replay #1

### challenge:rq-0023

- baseline: positive #7, replay #4
- neutral temporal: positive #6, replay #4
- inverse recency: positive #6, replay #5

### challenge:rq-0025

- baseline: positive #3, replay #1
- neutral temporal: positive #3, replay #1
- inverse recency: positive #3, replay #1

## Dual-lane provenance simulation

- Top-10 memories inspected: **400**
- Variant-lane memories: **83**
- Positive memories in variant lane: **26**
- Same/past grade -1 hits in variant lane: **5**
- Same/past grade -1 hits left in primary lane: **0**
- Queries whose best positive is in variant lane: **11**
- Mean annotation overhead: **538.02 estimated tokens/query**

Dual-lane is evaluated as annotation/segregation, not as global suppression. A positive memory may legitimately live in the variant lane.

## Guardrails

- No frozen labels were changed.
- No accepted hybrid weights were changed in production.
- No embedding/provider calls were made.
- No production retrieval/schema/context code was changed.

Interpret policy results as diagnostic evidence only. Astra/Supervisor must decide whether any implementation slice is justified.

