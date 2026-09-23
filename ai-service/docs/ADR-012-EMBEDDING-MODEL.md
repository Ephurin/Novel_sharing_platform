# ADR-012 — Embedding Model, Vector Dimension, and Reindexing Strategy

- **Status**: Accepted (Astra review, 2026-09-22)
- **Deciders**: Astra (Planner / Reviewer), Gemini (Worker / Benchmark Runner)
- **Task Reference**: `P7-01-EMBEDDING-BENCHMARK-ADR`
- **Dataset Reference**: `aethelgard-retrieval-eval-v1.0.0` (216 canonical memories, 21 core-gold queries, 10 Vietnamese cross-lingual diagnostic queries)

---

## 1. Context

In Phase 6 / 6.5, the Narrative Memory MVP stabilized context building and generation using deterministic SQL filtering: entity matching, recent events, importance thresholding, and temporal cutoff (`memory.chapter_number <= query.chapter_cutoff`).

While recency-based retrieval ensures no future event leakage, its ranking quality is fundamentally constrained:
- **Baseline Recall@10**: `0.4095`
- **Baseline MRR@10**: `0.3286`
- **Baseline nDCG@10**: `0.3160`
- **Baseline Failure Modes**: Recent-only ranking completely misses critical historical narrative setups (`old_but_important`, `setup_payoff`, `temporal_supersession`, `low_lexical_overlap`) where relevant memories occurred many chapters prior to the current cut-off.

Phase 7 introduces Semantic Retrieval via PostgreSQL + `pgvector`. According to the architecture gates defined in `ai-service/docs/IMPLEMENTATION_PLAN.md` and `ai-service/docs/ADRS.md`:
> "Phase 7 gate: chốt embedding model + vector dimension bằng benchmark trước khi freeze migration/vector column."

This ADR documents the empirical benchmark results comparing candidate models, establishes the chosen embedding configuration, and defines the versioning, reindexing, and operational policies for semantic retrieval.

---

## 2. Decision

We decide to:

1. **Select `gemini-embedding-2`** as the primary embedding model for Narrative Memory semantic retrieval.
2. **Standardize on `768` dimensions**.
3. **Use Cosine Distance only** (`<=>` in pgvector; `vector_cosine_ops` for any future ANN index) over **strictly L2-normalized float32 vectors**. Inner-product operators are not part of the production contract for embedding-v1.
4. **Apply asymmetric instruction prefixes**:
   - Query embedding prefix: `"Represent this narrative retrieval query for semantic search: "`
   - Memory embedding prefix: `"Represent this canonical narrative memory for semantic search: "`
5. **Assign the active version identifier**: `gemini-embedding-2-768-v1`.
6. **Implement non-destructive, parallel reindexing**: New embedding versions must be indexed alongside active embeddings before an atomic cutover, preventing downtime or data loss during model upgrades.
7. **Separate semantic content from vector representation**: `memory_chunks` stores rebuildable narrative content/provenance; `memory_embeddings` stores model/version-specific vectors. Changing embedding model/recipe re-embeds representation rows and must not duplicate or rewrite memory content.

---

## 3. Benchmark Evidence

All measurements were performed using the frozen `aethelgard-retrieval-eval-v1.0.0` dataset under strict temporal filtering (`chapter_number <= chapter_cutoff` enforced prior to ranking).

### 3.1 Primary Aggregate Benchmark (21 Core-Gold Queries, K=5, 10, 20)

| Model | Dimension | Batch Size | Recall@5 | Recall@10 | Recall@20 | MRR@5 | MRR@10 | MRR@20 | nDCG@5 | nDCG@10 | nDCG@20 | Hit Rate @10 | Mean Latency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Recent-only Baseline | N/A | N/A | 0.2955 | 0.4095 | 0.6256 | 0.3286 | 0.3286 | 0.3482 | 0.2782 | 0.3160 | 0.4038 | 0.7143 | N/A |
| `gemini-embedding-001` (Candidate A) | 768 | 32 | 0.4856 | 0.6440 | 0.7557 | 0.8571 | 0.8719 | 0.8719 | 0.6508 | 0.7039 | 0.7272 | 1.0000 | 1846.2 ms |
| **`gemini-embedding-2` (Candidate B)** | **768** | **16** | **0.5342** | **0.6747** | **0.8437** | **0.9024** | **0.9024** | **0.9024** | **0.6768** | **0.7097** | **0.7550** | **1.0000** | **1395.7 ms** |
| `gemini-embedding-2` (Dimension Sweep) | 1536 | 16 | 0.5514 | 0.6600 | 0.8116 | 0.9024 | 0.9024 | 0.9024 | 0.6750 | 0.7046 | 0.7513 | 1.0000 | 1501.3 ms |

### 3.2 Dimension Sweep Analysis (768 vs 1536)

Comparing `gemini-embedding-2` at 768 dimensions versus 1536 dimensions:
- **Quality**: At K=10, 768 dimensions yields higher Recall (`0.6747` vs `0.6600`) and higher nDCG (`0.7097` vs `0.7046`). At K=20, 768 dimensions outperforms 1536 by +3.2% Recall (`0.8437` vs `0.8116`).
- **Latency**: 1536 dimensions increases mean request latency by +7.6% (1501.3 ms vs 1395.7 ms) and ranking latency by +83.1% (366.5 ms vs 200.2 ms).
- **Storage**: 1536 dimensions requires double the vector footprint (1.266 MiB vs 0.633 MiB for 216 memories), scaling linearly with novel size.
- **Verdict**: 1536 dimensions provides no retrieval benefit and degrades ranking at production-relevant cutoffs. **768 dimensions is optimal.**

### 3.3 Vietnamese Cross-Lingual Diagnostic (10 Diagnostic Queries)

Evaluating Vietnamese author queries against English canonical memories:
- **`gemini-embedding-2 @ 768`**: Recall@5 = `0.5647`, MRR@5 = `0.8500`, nDCG@5 = `0.6163`, Recall@20 = `0.8667`, nDCG@20 = `0.7419`.
- Cross-lingual behavior is mixed but strong: `gemini-embedding-2` is better at Recall/MRR/nDCG@5 and Recall/MRR/nDCG@20, while `gemini-embedding-001` is better at Recall@10 and nDCG@10. Cross-model latency is recorded but not used as comparative evidence because the two candidates were run with different batch sizes.

### 3.4 Key Archetype Resolutions

- `rq-0005` (`old_but_important`): Recent baseline Recall@10 = `0.00`, nDCG = `0.0000`. `gemini-embedding-2` Recall@10 = `1.00`, nDCG = `0.9014`.
- `rq-0011` (`temporal_supersession`): Recent baseline Recall@10 = `0.00`. `gemini-embedding-2` Recall@10 = `0.80`, nDCG = `0.6289`.
- `rq-0027` (`location_history_world_rule`): Recent baseline Recall@10 = `0.00`. `gemini-embedding-2` Recall@10 = `1.00`, nDCG = `0.7365`.

---

## 4. Query & Document Embedding Policy

To maximize asymmetric semantic alignment:

1. **Document Embedding (Memory Chunks)**:
   - Format: `f"Represent this canonical narrative memory for semantic search: {memory_content}"`
   - Normalization: Vector must be L2-normalized upon receipt before persistence.
   - Batching: Chunking batches up to 16 items per API request with bounded retry/backoff.

2. **Query Embedding (Author Writing / Context Builder Prompt)**:
   - Format: `f"Represent this narrative retrieval query for semantic search: {query_text}"`
   - Normalization: Vector must be L2-normalized before performing vector distance comparison.

3. **Temporal Invariant**:
   - Query filters must unconditionally enforce `memory_chunks.narrative_order <= cutoff_order` (or `chapter_number <= chapter_cutoff`) prior to ANN/vector similarity ranking. Future memories must never enter candidate evaluation.

---

## 5. Reindexing & Versioning Policy

### 5.1 Version Identifier and storage lifecycle
`memory_chunks` and `memory_embeddings` have independent lifecycles.

- `memory_chunks.content_hash`: SHA-256 of the derived narrative content before any embedding instruction prefix.
- `memory_embeddings.embedding_model`: `gemini-embedding-2` for generation v1.
- `memory_embeddings.embedding_version`: `gemini-embedding-2-768-v1`.
- `memory_embeddings.content_hash`: snapshot of the chunk hash used to build that vector.
- A vector is stale when `memory_embeddings.content_hash != memory_chunks.content_hash`.
- `UNIQUE(memory_chunk_id, embedding_version)` allows multiple verified embedding versions to coexist without duplicating memory content.

`VECTOR(768)` is the physical representation for embedding generation v1. A future model with a different dimension requires a forward schema/storage migration for its vectors, but does **not** require Story Brain re-extraction or duplication of `memory_chunks`.

### 5.2 Zero-Downtime Parallel Reindexing Pipeline
When upgrading embedding models (e.g., from v1 to a future v2):
```text
embedding-v1 active (serving production queries)
        ↓
Trigger background reindex worker
        ↓
Generate embedding-v2 rows in parallel for the same memory_chunks (distinct embedding_version)
        ↓
Run automated evaluation suite on frozen queries for the story
        ↓
Validate quality parity or improvement
        ↓
Switch active serving version pointer in settings / story_brain config
        ↓
Verify production retrieval latency & error budgets
        ↓
Retire and purge v1 embeddings after verification observation period
```

**Invariant**: Under no circumstances may an existing embedding version be truncated or dropped before the candidate version is fully populated and verified. Reindex operates on `memory_embeddings`; it must not rewrite canonical Story Brain data or duplicate unchanged `memory_chunks`.

---

## 6. Rollback Strategy

1. If an embedding provider outage or severe rate limit occurs during generation:
   - Fall back gracefully to Phase 6 deterministic SQL retrieval (entities, importance, recent events).
   - Never block author typing or chapter generation on semantic retrieval unavailability.
2. If an embedding version regression is identified in production:
   - Revert the `active_embedding_version` configuration pointer to the previously verified version (`embedding-v0` / `embedding-v1`).
   - Old version rows remain intact due to the parallel reindexing policy.

---

## 7. Operational Dependencies & Limits

1. **Provider**: Google Gemini API via `google-genai` SDK.
2. **Credential**: Managed via `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
3. **Rate Limits**: Quotas are provider/account/project dependent and may change. Production background workers must use bounded retries, provider-directed backoff when available, and conservative batching. API-key rotation must not be used to bypass provider quotas.
4. **Storage Estimate**:
   - Float32 raw storage: 768 × 4 bytes = 3,072 bytes per memory chunk.
   - A 100-chapter novel (~500 canonical memory chunks) requires ~1.5 MB of vector data, well within standard PostgreSQL heap capabilities without requiring premature external vector databases.

---

## 8. Rejected Alternatives

1. **`gemini-embedding-001 @ 768`**:
   - Rejected due to lower primary retrieval quality (MRR@5 `0.8571` vs `0.9024`, Recall@20 `0.7557` vs `0.8437`). The A-vs-B request-latency numbers are not treated as a fair speed comparison because the candidates used different batch sizes.
2. **`gemini-embedding-2 @ 1536`**:
   - Rejected because doubling the dimension yielded worse ranking performance at K=10 and K=20 while doubling storage costs and increasing latency.
3. **Specialized Vector Databases (Pinecone, Qdrant, Milvus)**:
   - Rejected per ADR-006. The measured dataset scale (several hundred to thousands of memories per novel) is natively and efficiently served by PostgreSQL + `pgvector`.
4. **Auto-indexing Proposed / Unconfirmed Artifacts**:
   - Rejected per ADR-004. Only confirmed/canonical memory chunks are embedded and indexed into the semantic retrieval space.

---

## 9. Consequences

- **Positive**:
  - Dramatic quality uplift over baseline (+64.8% Recall@10, +174.6% MRR@10, +124.6% nDCG@10).
  - Substantial reduction of long-range retrieval blind spots; some archetypes such as low-lexical-overlap remain only partially recalled and are expected to benefit from later hybrid ranking.
  - Zero-shot cross-lingual retrieval works reliably for Vietnamese queries against English canonical lore.
  - 768 dimensions keeps vector storage lightweight and indexing fast.
- **Negative**:
  - Requires network round-trip to Gemini Embedding API during background memory chunk creation and author query formulation.
  - Requires careful asynchronous queuing to prevent author editor latency from coupling to embedding latency.
- **Next Steps (Phase 7 Implementation)**:
  - P7-02: add the pgvector-capable PostgreSQL runtime, separate `memory_chunks` + `memory_embeddings`, freeze embedding generation v1 at `VECTOR(768)`, and implement rebuildable/versioned embedding materialization.
  - P7-03: implement semantic retrieval with temporal filtering before vector ranking and deterministic SQL fallback.
  - P7-04: implement Hybrid Ranker combining semantic score, entity overlap, temporal relevance, importance, and relationship relevance.
