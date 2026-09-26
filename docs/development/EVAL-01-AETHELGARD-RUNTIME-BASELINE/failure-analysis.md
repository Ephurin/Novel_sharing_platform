# EVAL-01 Failure Analysis — Corrected Harness

## Measured status

| Layer | Status | Evidence |
|---|---|---|
| CORPUS_GOLD | PASS | Frozen v1 split contract: 21 core + 19 challenge; 10 VI diagnostic cases separate |
| INGESTION_EXTRACTION | NOT_MEASURED | Harness seeds frozen canonical memories; raw 61-chapter extractor is not executed |
| CANONICAL_DATA | PARTIAL | Frozen canonical corpus is immutable and seeded; full canonical extraction pipeline not evaluated |
| EMBEDDING | PASS | Live Gemini query embeddings + repository embedding coverage |
| TEMPORAL_FILTER | PASS | Future/stale candidates surviving final retrieval: 0/0 |
| CANDIDATE_RETRIEVAL | PASS | PostgreSQL pgvector exact cosine runtime measured |
| HYBRID_SIGNAL | PASS | 39 evaluated cases exposed entity/relationship signals after participant-table backfill |
| HYBRID_WEIGHTING | MEASURED | Reported separately for core/challenge/VI; no split mixing |
| CONTEXT_PACKING | PARTIAL | Real memory content + deterministic packing measured; protected canonical artifacts not reconstructed |
| GENERATION | PARTIAL | Live execution 4/4; quality rubric requires independent review |
| LATENCY_COST | PARTIAL | Latency measured; provider token/cost usage not exposed by current client |
| EVALUATION_HARNESS | PASS | Source-defined split identities; duplicate query IDs namespaced by case_id |

## Known limitations

- Challenge metrics are diagnostic and must not be promoted to the primary core-gold claim.
- Vietnamese diagnostics reuse source query IDs; case_id preserves split identity.
- Generation quality is intentionally not self-scored.
- Protected canonical entity/state/rule truncation remains not_measured in this runner.
