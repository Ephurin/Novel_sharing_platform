# Dataset — P7-01 Embedding Benchmark

Dataset version: `aethelgard-retrieval-eval-v1.0.0`

Primary model-selection set:

- Corpus: `.data/Frozen_v1/memory_chunks_canonical.json`
- Canonical memories: **216**
- Queries: `.data/Frozen_v1/core_gold_queries.json`
- Core-gold queries: **21**
- Temporal gate: `memory.chapter_number <= query.chapter_cutoff`

Secondary diagnostics:

- Challenge queries: `.data/Frozen_v1/challenge_queries.json` against the full 232-memory audit corpus.
- Vietnamese cross-lingual queries: `.data/Frozen_v1/vietnamese_diagnostic_queries.json` (**10 Vietnamese queries**, English memory corpus).

Primary metrics use only the 21-query core-gold split. Challenge and Vietnamese splits are diagnostics and do not decide the ADR by themselves.
