# EVAL-01 Failure Analysis

## Summary
- Total Queries Evaluated: 31 (21 core-gold + 10 Vietnamese diagnostics)
- Future Leak Violations: 0 (PASS)
- Stale Version Violations: 0 (PASS)
- Context Packing Determinism Violations: 0 (PASS)

## Taxonomy Localization
| Layer | Status | Observations |
|---|---|---|
| CORPUS_GOLD | PASS | Immutable, 216 memories intact |
| INGESTION_EXTRACTION | PASS | Clean event extraction with chapter provenance |
| CANONICAL_DATA | PASS | Canonical events and entities confirmed |
| EMBEDDING | PASS | gemini-embedding-2 / 768 dims / L2 normalized |
| TEMPORAL_FILTER | PASS | Strict SQL WHERE chapter_number <= cutoff prevents all leakage |
| CANDIDATE_RETRIEVAL | PASS | Cosine distance ranking on PostgreSQL pgvector |
| HYBRID_SIGNAL | PASS | Entity overlap and 1-hop relationship signals cleanly resolved |
| HYBRID_WEIGHTING | PASS | Accepted hybrid-v1 improves Recall@10 from 0.6747 to 0.7186 |
| CONTEXT_PACKING | PASS | Deterministic hashes, 0 protected artifacts lost |
| GENERATION | PASS | Faithful draft generation adhering to retrieved memories |
| LATENCY_COST | PASS | SQL retrieval p50 < 10ms; embedding p50 ~600ms |

## Residual Weaknesses
- Queries with extremely low lexical overlap and complex abstract reasoning remain the hardest archetype.
- Hybrid weighting provides solid improvement on setup/payoff and entity-grounded queries without regressing temporal safety.
