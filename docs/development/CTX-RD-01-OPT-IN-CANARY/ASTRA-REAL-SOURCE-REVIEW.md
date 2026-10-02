# ASTRA REVIEW — CTX-RD-01 Frozen-Source Canary (branch audit)

## Verdict

**SOURCE-GROUNDED REPLAY FUNCTIONAL PASS / ACCEPTANCE PARTIAL — REPRODUCIBILITY AND CHECKLIST REPAIR REQUIRED**

Reviewed branch: `astra/ctx-rd-01-opt-in-canary`, head `0a401c12f87bbd40849641bd9a00a9d991db7569`, four commits ahead of `main` at review. No PR for these four commits at review time. Previous PR #30 merged only the synthetic-canary harness and passed P7/P8 CI.

The source-grounded run extends prior technical canary evidence. It is not a full live-PG-vector retrieval validation on the frozen corpus, nor a clean-commit reproducibility proof, nor a basis for changing production defaults.

## Factual lineage

- Previously merged canary code: `5d3d5a29ac5b8dcb0b405af3f332701d09eca331` (PR #30).
- Synthetic-canary evidence: `53a5177cd00760a338db2094cef678a2548a2918`.
- Synthetic label/report correction: `c89762a79fb251798ce3b5d2c1eb0d9a39570d87`.
- Source-grounded evidence **and new runner/validator code**: `0a401c12f87bbd40849641bd9a00a9d991db7569`.
- `real-source-canary.json` declares tested commit `c89762a79fb251798ce3b5d2c1eb0d9a39570d87`, the *parent* of the commit introducing `scripts/run_ctx_rd_01_real_source_canary.py`. That parent cannot reproduce the new script from committed code alone.
- No CI run exists for the latest evidence-plus-code commit as reviewed.

## Source provenance — important distinction

The new runner actually reads `.data/Frozen_v1/retrieval_queries.json`, `.data/Frozen_v1/memory_chunks_canonical.json`, `.data/Frozen_v1/memory_chunks.json`, `.data/Batch_7/entities.json`, `docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/retrieval-raw.json` and the frozen neutral-context fixture, then builds packages using the prior EVAL-01G builder. This is **source-derived replay**, not the manually authored Aethelgard-inspired synthetic fixture used in the first canary.

But the runner passes each preassembled package via `SourceRepoAdapter` and presorted `SemanticMemoryMatch` instances via `SourceRetrieverAdapter`. The latter returns `hybrid-v1` and `gemini-embedding-2-768-v1` as fields without actually calling `GeminiEmbeddingProvider`, production `SemanticRetrieverService`, or vector search for the source-grounded cases. PostgreSQL is used to create a staging Story Brain/job, not to retrieve the replayed source package.

The true source-grounded result is **production WritingService routing/packing plus actual Gemini LLM generation using frozen source-derived context**. Separate previous staging/synthetic canary evidence exercised genuine provider-backed embeddings and PostgreSQL retrieval, but the two paths have not been jointly verified on the original corpus.

## Case results, per committed JSON

| Case | Tier | Entities | Semantic | Recent | Rules | Drops | Protected overflow | Hash match | Reported checklist |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| `core_gold:rq-0011`, cutoff 32 | 12k | 63 -> 21 | 8/8 | 20/20 | 6/6 | 0 | false | true | canonical PASS; chronology PARTIAL |
| `challenge:rq-0025`, cutoff 49 | 12k | 68 -> 20 | 8/8 | 20/20 | 12/12 | 0 | false | true | canonical PASS; chronology PASS |

Rule **identity and multiplicity** are retained, but raw input/retained ID **order differs** in both cases, consistent with packer canonical ordering. Do not describe them as byte-for-byte exact or treat the order mismatch as a dropped-rule regression without inspecting canonical packer ordering.

The JSON reports 8 model attempts for these two jobs: 2 successes, 6 failures (429/503), with final effective model `models/gemini-3.8-flash` and no local fallback. One run reports ~50.9 s and the other ~12.1 s; these are two smoke observations, not reliable provider latency statistics.

Only legacy **preview/entity-count** comparisons were made; no legacy generation or quality/control delta was measured.

## Blockers before acceptance closure

### A. Misleading aggregate PASS and weak checklist

`real-source-canary.json` states aggregate `checklist_verdict: PASS` while `rq-0011.checklist.chronology_causality` is `PARTIAL`. The validator explicitly accepts both `PASS` and `PARTIAL`, so its PASS means the schema is acceptable, **not that narrative correctness passed**.

Both `evaluate_rq0011_checklist()` and `evaluate_rq0025_checklist()` rely primarily on string/number mentions. `future_leakage: NONE`, `unsupported_claim: NONE`, and the two `must_avoid_verified` entries are emitted as constants, without checking the source text. In particular, `rq-0025` computes `ch49_present` but does not require it in chronology/ambiguity PASS. It therefore does **not** verify the complete chapter 45 -> 47 -> incompatible chapter 49 chain.

Required: report `PARTIAL` if **any required** checklist dimension is PARTIAL; distinguish automated lexical checks from reviewed source-fact judgments; explicitly check the three-point 45/47/49 sequence and documented incompatibility, and avoid unconditional claims of no unsupported statements or no narrative future leakage.

### B. Clean tested-code lineage / CI

The latest evidence commit introduces the runner and modifies the validator, but the recorded tested SHA points to the previous commit lacking that runner. The runner uses `git rev-parse HEAD` without a clean-tree preflight. A runner added in the same evidence commit cannot be reproduced solely from the declared earlier SHA.

Required: commit runner/validator/checklist fixes *first*, add a clean-tree preflight excluding only generated evidence, open a PR and run P7/P8 CI. Execute one focused rerun on the actual clean implementation SHA and commit evidence as a separate child commit. Evidence hash/trace values from the current run must be retained as historical evidence, not silently rewritten.

### C. End-to-end provenance boundaries

If the next gate is **full source-grounded real-provider retrieval**, load indexed source memories into a disposable staging PG/pgvector environment using genuine document embeddings of the accepted version, and query with genuine query embeddings. Otherwise explicitly call the present test a `frozen_source_replay_with_retrieval_adapter` and accept only the scope/packer/generation boundary proven. Avoid representing preconstructed matches with version strings as real provider calls.

### D. Evidence consistency

Correct the synthetic stress case's old `tier16k` name to the neutral label throughout, without changing measured 20k. Preserve synthetic and frozen-source evidence as distinct tests. Label all external 429/503 retries and disclose per-case attempts.

## Status and recommended next action

```text
source-derived package replay       OBSERVED
balanced scope/packer full fit      OBSERVED on two cases
Gemini generation                   OBSERVED on two cases
source-grounded live vector query   NOT DEMONSTRATED by this runner
rq-0011 chronology correctness      PARTIAL by recorded checklist
rq-0025 three-point chronology      NOT FULLY VERIFIED by checklist
clean-SHA rerun + CI                PENDING
source-grounded canary gate         PARTIAL / DO NOT CLOSE
balanced production default         legacy-v1 (UNCHANGED)
global activation                   NOT AUTHORIZED
P8-05                               BLOCKED_PENDING_STABILITY
```

Use a **small focused remediation**; do not reopen sealed EVAL-01O or rerun broad generation A/B. Preserve the accepted previous production-provider staging and synthetic canary findings; do not overclaim what the frozen-source replay established.
