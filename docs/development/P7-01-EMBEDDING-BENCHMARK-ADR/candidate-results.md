# Embedding candidate results

Status: **PENDING REAL PROVIDER RUN**

No quality/latency values are fabricated in this file.

## Candidate A

- Provider: Google Gemini API
- Model: `gemini-embedding-001`
- First-pass dimension: **768**
- Retrieval task types: `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`
- Normalization: explicit L2 normalization in benchmark harness
- Reason for inclusion: already compatible with the repository's `google-genai` dependency; text retrieval-specific task types.

## Candidate B

- Provider: Google Gemini API
- Model: `gemini-embedding-2`
- First-pass dimension: **768**
- Retrieval instruction: explicit document/query instruction prefix in benchmark harness
- Normalization: benchmark applies L2 normalization consistently
- Reason for inclusion: current-generation Gemini embedding model; same provider/key permits a low-friction model comparison.

## Optional Candidate C

- Provider: OpenAI
- Model: `text-embedding-3-small`
- First-pass dimension: **768**
- Normalization: explicit L2 normalization
- Only run if `OPENAI_API_KEY` is already available in the execution environment.

## Dimension decision

Do not choose the production dimension from vendor benchmarks alone.

1. Compare Candidate A vs B at 768.
2. Run the better model again at 1536.
3. Prefer 768 unless 1536 produces a material retrieval-quality gain on this dataset.
4. Record raw float32 vector footprint:
   - 216 × 768 × 4 bytes = **663,552 bytes (~0.633 MiB)**;
   - 216 × 1536 × 4 bytes = **1,327,104 bytes (~1.266 MiB)**.

Provider latency, Recall@K, MRR/nDCG and Vietnamese diagnostic metrics remain pending.
