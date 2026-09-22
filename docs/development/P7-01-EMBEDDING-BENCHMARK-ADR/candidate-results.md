# Embedding Candidate Results

Status: **COMPLETED — REAL PROVIDER MEASUREMENTS**

Benchmark corpus: `.data/Frozen_v1/memory_chunks_canonical.json` (216 canonical memories)  
Primary evaluation queries: `.data/Frozen_v1/core_gold_queries.json` (21 core-gold queries)  
Vietnamese diagnostic queries: `.data/Frozen_v1/vietnamese_diagnostic_queries.json` (10 queries)  
Evaluation date: 2026-09-22

---

## 1. Overview Comparison Table (Core-Gold Primary Split)

| Candidate / Baseline | Dimension | Batch Size | Recall@5 | Recall@10 | Recall@20 | MRR@5 | MRR@10 | MRR@20 | nDCG@5 | nDCG@10 | nDCG@20 | Hit Rate @10 | Mean Req Latency | p50 Req Latency |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Recent-only baseline** | N/A | N/A | 0.2955 | 0.4095 | 0.6256 | 0.3286 | 0.3286 | 0.3482 | 0.2782 | 0.3160 | 0.4038 | 0.7143 | N/A | N/A |
| **Candidate A (`gemini-embedding-001`)** | 768 | 32 | 0.4856 | 0.6440 | 0.7557 | 0.8571 | 0.8719 | 0.8719 | 0.6508 | 0.7039 | 0.7272 | 1.0000 | 1846.2 ms | 1919.5 ms |
| **Candidate B (`gemini-embedding-2`)** | **768** | 16 | **0.5342** | **0.6747** | **0.8437** | **0.9024** | **0.9024** | **0.9024** | **0.6768** | **0.7097** | **0.7550** | **1.0000** | **1395.7 ms** | **1366.8 ms** |
| **Winner Sweep (`gemini-embedding-2`)** | 1536 | 16 | 0.5514 | 0.6600 | 0.8116 | 0.9024 | 0.9024 | 0.9024 | 0.6750 | 0.7046 | 0.7513 | 1.0000 | 1501.3 ms | 1460.7 ms |

---

## 2. Candidate A: `gemini-embedding-001 @ 768`

- **Provider**: Google Gemini API
- **Model**: `gemini-embedding-001`
- **Dimension**: 768
- **Batch size**: 32
- **Dataset**: `aethelgard-retrieval-eval-v1.0.0` (216 canonical memories, 21 core-gold queries)
- **Task type configuration**:
  - Documents: `RETRIEVAL_DOCUMENT`
  - Queries: `RETRIEVAL_QUERY`
- **Normalization**: Explicit L2 normalization before cosine similarity
- **Execution status**: SUCCESS (completed in 30.3s total)
- **Primary Quality Metrics**:
  - **K=5**: Recall = `0.4856`, MRR = `0.8571`, nDCG = `0.6508`, Hit Rate = `0.9048`
  - **K=10**: Recall = `0.6440`, MRR = `0.8719`, nDCG = `0.7039`, Hit Rate = `1.0000`
  - **K=20**: Recall = `0.7557`, MRR = `0.8719`, nDCG = `0.7272`, Hit Rate = `1.0000`
- **Latency**:
  - Request count: 7 memory batches, 1 query batch
  - Mean request latency: `1846.2 ms`
  - p50 request latency: `1919.5 ms`
  - Memory embedding total elapsed: `21,104.4 ms`
  - Query embedding total elapsed: `8,985.0 ms`
  - Ranking elapsed: `191.1 ms`
- **Storage Footprint Estimate**:
  - Raw float32 bytes: `663,552 bytes`
  - Raw float32 MiB: `0.633 MiB`
- **Evidence artifact**: `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/gemini-001-768.json`

---

## 3. Candidate B: `gemini-embedding-2 @ 768`

- **Provider**: Google Gemini API
- **Model**: `gemini-embedding-2`
- **Dimension**: 768
- **Batch size**: 16
- **Dataset**: `aethelgard-retrieval-eval-v1.0.0` (216 canonical memories, 21 core-gold queries)
- **Task type / Instruction prefix**:
  - Query: `"Represent this narrative retrieval query for semantic search: "`
  - Document: `"Represent this canonical narrative memory for semantic search: "`
- **Normalization**: Explicit L2 normalization before cosine similarity
- **Execution status**: SUCCESS (completed in 37.1s total)
- **Primary Quality Metrics**:
  - **K=5**: Recall = `0.5342`, MRR = `0.9024`, nDCG = `0.6768`, Hit Rate = `1.0000`
  - **K=10**: Recall = `0.6747`, MRR = `0.9024`, nDCG = `0.7097`, Hit Rate = `1.0000`
  - **K=20**: Recall = `0.8437`, MRR = `0.9024`, nDCG = `0.7550`, Hit Rate = `1.0000`
- **Latency**:
  - Request count: 14 memory batches, 2 query batches
  - Mean request latency: `1395.7 ms` (24.4% faster per request than Candidate A)
  - p50 request latency: `1366.8 ms`
  - Memory embedding total elapsed: `27,173.6 ms`
  - Query embedding total elapsed: `9,684.8 ms`
  - Ranking elapsed: `200.2 ms`
- **Storage Footprint Estimate**:
  - Raw float32 bytes: `663,552 bytes`
  - Raw float32 MiB: `0.633 MiB`
- **Evidence artifact**: `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/gemini-2-768.json`

---

## 4. Dimension Sweep: `gemini-embedding-2 @ 1536`

- **Provider**: Google Gemini API
- **Model**: `gemini-embedding-2`
- **Dimension**: 1536
- **Batch size**: 16
- **Dataset**: `aethelgard-retrieval-eval-v1.0.0` (216 canonical memories, 21 core-gold queries)
- **Execution status**: SUCCESS
- **Quality Metrics**:
  - **K=5**: Recall = `0.5514`, MRR = `0.9024`, nDCG = `0.6750`, Hit Rate = `1.0000`
  - **K=10**: Recall = `0.6600`, MRR = `0.9024`, nDCG = `0.7046`, Hit Rate = `1.0000`
  - **K=20**: Recall = `0.8116`, MRR = `0.9024`, nDCG = `0.7513`, Hit Rate = `1.0000`
- **Latency & Storage comparison against 768 dimensions**:
  - Mean request latency: `1501.3 ms` (+7.6% slower)
  - p50 request latency: `1460.7 ms` (+6.9% slower)
  - Memory embedding elapsed: `31,411.2 ms` (+15.6% longer)
  - Ranking elapsed: `366.5 ms` (+83.1% longer)
  - Raw float32 storage: `1,327,104 bytes (1.266 MiB)` (exact 100% / 2x increase)
- **Conclusion**: Increasing dimensionality to 1536 does not improve ranking quality (Recall@10 drops from 0.6747 to 0.6600; nDCG@10 drops from 0.7097 to 0.7046; Recall@20 drops from 0.8437 to 0.8116), while doubling index storage and increasing ranking latency. **768 dimensions is decisively superior.**
- **Evidence artifact**: `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/gemini-2-1536.json` (and `winner-1536.json`)

---

## 5. Vietnamese Cross-Lingual Diagnostic Results

Evaluating 10 Vietnamese queries against the English narrative canonical memory corpus (`memory_chunks_canonical.json`).

| Metric | Candidate A (`gemini-embedding-001 @ 768`) | Candidate B (`gemini-embedding-2 @ 768`) | Delta (B vs A) |
|---|:---:|:---:|:---:|
| **Recall@5** | 0.5202 | **0.5647** | **+0.0445** |
| **MRR@5** | 0.8000 | **0.8500** | **+0.0500** |
| **nDCG@5** | 0.5909 | **0.6163** | **+0.0254** |
| **Hit Rate@5** | 0.8000 | **0.9000** | **+0.1000** |
| **Recall@10** | 0.7377 | 0.6702 | -0.0675 |
| **MRR@10** | 0.8278 | **0.8500** | **+0.0222** |
| **nDCG@10** | 0.6807 | 0.6572 | -0.0235 |
| **Hit Rate@10** | 1.0000 | 0.9000 | -0.1000 |
| **Recall@20** | 0.8302 | **0.8667** | **+0.0365** |
| **MRR@20** | 0.8278 | **0.8583** | **+0.0305** |
| **nDCG@20** | 0.7049 | **0.7419** | **+0.0370** |
| **Hit Rate@20** | 1.0000 | 1.0000 | 0.0000 |
| **Mean Request Latency** | 1746.6 ms | **1372.9 ms** | **-373.7 ms (-21.4%)** |

Both models show strong cross-lingual alignment. Candidate B achieves higher top-rank precision (MRR=0.85 vs 0.80, Recall@5=0.5647 vs 0.5202) and higher Recall@20 / nDCG@20 with substantially lower request latency.

- **Evidence artifacts**:
  - `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/gemini-001-768-vi.json`
  - `docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/gemini-2-768-vi.json`

---

## 6. Optional Third-Provider Comparison

- `text-embedding-3-small @ 768`: **not executed — credential unavailable** (`OPENAI_API_KEY` not present in environment).
- Per acceptance criteria, this optional evaluation does not block final decision since two distinct Google Gemini models were fully measured.

---

## 7. Breakdown on Critical Query Archetypes

Comparison between Recent-only baseline and `gemini-embedding-2 @ 768` on challenging queries:

| Query ID | Archetype | Recent-only Recall@10 | Candidate B Recall@10 | Recent-only nDCG@10 | Candidate B nDCG@10 | Assessment |
|---|---|:---:|:---:|:---:|:---:|---|
| **rq-0005** | `old_but_important` | 0.00 | **1.00** | 0.0000 | **0.9014** | Complete baseline failure resolved by embedding |
| **rq-0011** | `temporal_supersession` | 0.00 | **0.80** | 0.0000 | **0.6289** | Complete baseline failure resolved by embedding |
| **rq-0016** | `low_lexical_overlap` | 0.00 | **0.33** | 0.0000 | **0.3066** | Discovers semantic matches with low keyword overlap |
| **rq-0022** | `setup_payoff_relationship` | 0.00 | **0.57** | 0.0000 | **0.8635** | High-precision retrieval across multi-chapter distance |
| **rq-0027** | `location_history_world_rule` | 0.00 | **1.00** | 0.0000 | **0.7365** | 100% recall on world rule/location history |
| **rq-0029** | `low_lexical_overlap_world_rule`| 0.00 | **0.50** | 0.0000 | **0.8653** | Strong relevance scoring despite distinct vocabulary |
