# ASTRA Review — EVAL-01 Attempt 1

**Reviewed evidence commit:** `0d7fa3e40db9bfa06218c11931d26e40b2d8665a`  
**Handoff commit:** `67cf385e841d8bc9360358957977834d7308e61f`  
**Attempt status:** PARTIAL — RERUN REQUIRED  
**Architecture change authorized:** NO

## Valid evidence from attempt 1

- PostgreSQL 16 + pgvector 0.8.6 runtime was exercised.
- Gemini live query embeddings were called.
- Accepted 768-dim embedding version was used.
- SQL temporal cutoff was present before vector ranking.
- No future/stale rows were observed in the returned candidates inspected.
- Live Gemini generation calls executed and outputs/latencies were preserved.
- P8-05 stayed blocked.

These observations remain useful.

## Invalid or overstated evidence

### 1. Primary retrieval aggregate was not the 21 core-gold split

The attempt grouped primary results using numeric query IDs (`rq-N <= 21`).

That is invalid because the frozen core-gold set contains IDs above 21, while the Vietnamese diagnostic set deliberately reuses source `rq-*` IDs.

The resulting `core_gold_queries_count=17` aggregate mixed core and Vietnamese cases.

Therefore the reported Semantic Recall@10 `0.7501` and Hybrid Recall@10 `0.7898` are not valid 21-core-gold metrics.

### 2. Challenge corpus policy was not exercised correctly

Frozen v1 policy is:

- 21 core-gold -> 216 canonical memories;
- 19 challenge queries -> 232-memory full audit corpus;
- 10 Vietnamese diagnostics -> canonical 216 corpus.

Attempt 1 did not preserve these source-defined corpus/split policies.

### 3. Generation quality rubric was hard-coded

The runner wrote 5/5 quality values directly after each generation call.

This is execution evidence, not quality evaluation.

Even a case returning insufficient-context text received 5/5.

Generation quality from attempt 1 is invalid and must be marked `REVIEW_REQUIRED` on rerun.

### 4. Context packing used placeholder semantic content

The attempt used strings equivalent to `Memory <id> details.` instead of real corpus memory content and hard-coded protected truncation to zero.

Only deterministic packer execution was demonstrated.

Rerun must use real retrieved memory content. Full protected entity/state/rule truncation should remain `not_measured` unless the full locked canonical package is actually reconstructed.

### 5. Materialization result fields were read incorrectly

The materializer returns:

- `memory_chunk_count`
- `embedded_count`
- `reused_embedding_count`

Attempt 1 queried non-existent shortened keys and therefore reported `Embeddings requested/stored: 0` even though coverage was fresh.

Rerun must distinguish embeddings generated this run from reused embeddings.

### 6. Hybrid signal seeding was incomplete

`get_hybrid_ranking_signals()` reads normalized `event_participants`.

Attempt 1 only populated `EventRecord.participants` JSON and did not seed `event_participants`.

Therefore claims about entity-overlap / relationship-signal behavior were not proven.

### 7. Summary copied stale numbers

Attempt 1 summary/failure analysis included accepted proxy numbers such as `0.6747 -> 0.7186` while the artifact table contained different runtime numbers.

It also stated SQL p50 <10 ms and embedding p50 ~600 ms, while the actual latency artifact recorded roughly 62.85 ms and 915.58 ms respectively.

Rerun summary must be generated directly from measured artifacts.

### 8. Token/cost was not measured

`LLMClient` returns text but not provider usage metadata.

Use `not_measured` plus reason. Do not infer token/cost from quota tier.

### 9. Raw ingestion/extraction was not tested

The harness seeds already-consolidated frozen memories.

Therefore `INGESTION_EXTRACTION` must be `NOT_MEASURED`, not PASS.

## Corrected harness contract

The corrected runner on branch `astra/eval-01-harness-correction`:

- uses source-defined split membership;
- namespaces duplicate query IDs with split-qualified `case_id`;
- uses canonical 216 corpus for core + VI;
- uses full audit 232 corpus for challenge;
- backfills normalized event participants;
- uses real retrieved memory content for context packing;
- does not self-score generation quality;
- records provider token/cost as not measured when unavailable;
- derives summary values from runtime artifacts;
- separates measured / partial / not-measured layers.

CI guard:

`python scripts/check_eval01_fixture_contract.py`

Expected contract:

```text
40 frozen retrieval queries
21 core-gold
19 challenge
10 Vietnamese diagnostics
216 canonical memories
232 audit memories
```

## Rerun acceptance target

EVAL-01 can be reviewed again after Gemini runs the corrected harness on merged `main` and replaces the evidence artifacts.

Until then:

```text
EVAL-01 = PARTIAL / RERUN REQUIRED
architecture defect = none demonstrated
P8-05 destructive cleanup = BLOCKED
```
