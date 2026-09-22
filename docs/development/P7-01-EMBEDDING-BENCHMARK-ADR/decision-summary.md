# Decision Summary — P7-01 Embedding Benchmark

Status: **DECISIVE WINNER IDENTIFIED — READY FOR ADR-012**

Evaluation completed on 2026-09-22 against the frozen `aethelgard-retrieval-eval-v1.0.0` corpus (216 canonical memories, 21 core-gold queries, 10 Vietnamese cross-lingual diagnostic queries).

---

## 1. Selected Model and Configuration

- **Recommended model**: `gemini-embedding-2`
- **Recommended dimension**: `768`
- **Distance metric**: Cosine distance (`<=>` in pgvector) / Inner product (`<#>`) on L2-normalized vectors
- **Normalization policy**: Explicit L2 normalization at both write (indexing) and query time
- **Instruction policy**:
  - Query prefix: `"Represent this narrative retrieval query for semantic search: "`
  - Document prefix: `"Represent this canonical narrative memory for semantic search: "`
- **Confidence**: High (supported by consistent multi-metric wins across K=5, 10, 20 and query archetype breakdowns)

---

## 2. Why `gemini-embedding-2 @ 768` Won

1. **Superior Ranking Quality over Candidate A (`gemini-embedding-001`)**:
   - **Recall@5**: `0.5342` vs `0.4856` (+10.0%)
   - **MRR@5**: `0.9024` vs `0.8571` (+5.3%)
   - **Hit Rate@5**: `1.0000` vs `0.9048` (Every single core-gold query retrieved at least one relevant memory within top 5)
   - **Recall@10**: `0.6747` vs `0.6440` (+4.8%)
   - **MRR@10**: `0.9024` vs `0.8719` (+3.5%)
   - **nDCG@10**: `0.7097` vs `0.7039` (+0.8%)
   - **Recall@20**: `0.8437` vs `0.7557` (+11.6%)
   - **nDCG@20**: `0.7550` vs `0.7272` (+3.8%)

2. **Substantial Improvement over Recent-Only Baseline**:
   - **Recall@10**: `0.6747` vs `0.4095` (+64.8% relative gain)
   - **MRR@10**: `0.9024` vs `0.3286` (+174.6% relative gain)
   - **nDCG@10**: `0.7097` vs `0.3160` (+124.6% relative gain)
   - Complete resolution of recent-only blind spots: on `old_but_important` (`rq-0005`) and `temporal_supersession` (`rq-0011`), recent-only achieved `0.00` recall, whereas `gemini-embedding-2` achieved `1.00` and `0.80` recall respectively with high nDCG.

3. **Decisive Dimension Sweep (768 vs 1536)**:
   - At 1536 dimensions, Recall@10 dropped to `0.6600` (vs `0.6747` at 768), nDCG@10 dropped to `0.7046` (vs `0.7097` at 768), and Recall@20 dropped to `0.8116` (vs `0.8437` at 768).
   - Mean request latency increased from `1395.7 ms` to `1501.3 ms` (+7.6%).
   - Storage footprint doubled from `0.633 MiB` to `1.266 MiB` for the 216-memory evaluation corpus.
   - Conclusion: **768 dimensions offers better retrieval quality, lower latency, and 50% smaller vector storage.**

4. **Cross-Lingual / Vietnamese Diagnostic Behavior**:
   - On 10 Vietnamese queries against English canonical memories, `gemini-embedding-2` achieved MRR=`0.8500` (vs `0.8000`), Recall@5=`0.5647` (vs `0.5202`), and Recall@20=`0.8667` (vs `0.8302`).
   - Confirms strong zero-shot cross-lingual transfer without degrading retrieval performance.

5. **Operational Trade-offs**:
   - Provider: Google Gemini API (already utilized for the LLM pipeline, requiring no new third-party vendor relationships or billing setups).
   - Request latency: `1366.8 ms` p50, `1395.7 ms` mean, substantially faster than Candidate A (`1919.5 ms` p50).
   - Recommended batch size: 16 texts per request to remain comfortably within API payload and rate limits.
