# P7-04 ranking contract

Ranking version: `hybrid-v1`

```text
P7-03 exact semantic candidates
  -> hybrid rerank
  -> final semantic memories
```

Weights:

```text
semantic      0.75
entity        0.03
temporal      0.08
importance    0.10
relationship  0.04
```

Candidate pool:

```text
min(64, max(final_limit * 4, 20))
```

Temporal and canonical filters are upstream invariants. The hybrid ranker cannot create candidates or resurrect rows excluded by P7-03.

Hybrid signal/ranker failure preserves the successful semantic-only ordering. Embedding/vector retrieval failure preserves the pre-existing Phase 6 fallback.

Trace fields include ranking version plus semantic/entity/temporal/importance/relationship/hybrid component scores. These are deterministic retrieval provenance, not hidden reasoning.
