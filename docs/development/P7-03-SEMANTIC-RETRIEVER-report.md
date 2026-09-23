# P7-03 — Semantic Retriever Report

Status: **ACCEPTED — 2026-09-23**

Merged PR: `#2`  
Merge commit: `40ded408a48bac83ea1d1373a9388204796fae8a`  
Final HEAD CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35830009532

## Goal

P7-03 wires semantic retrieval into the writing context without replacing Phase 6 canonical SQL context.

```text
Phase 6 canonical context
        +
author instruction / selected text
        ↓
ADR-012 query embedding
        ↓
L2 normalize
        ↓
tenant + novel + story-brain
+ active embedding version
+ fresh content hash
+ confirmed active event
+ chapter cutoff
        ↓
exact pgvector cosine
        ↓
semantic_memories
        ↓
writing context hash + LLM context
```

## Implemented behavior

- Added ADR-012 query embedding recipe:
  `Represent this narrative retrieval query for semantic search: ...`
- Document/query recipes are distinct.
- Query vectors are explicitly L2-normalized.
- PostgreSQL repository performs exact cosine ranking using pgvector.
- Retrieval is scoped by tenant, novel, story brain and embedding version.
- Stale vectors are excluded by `memory_embeddings.content_hash = memory_chunks.content_hash`.
- Event memories require a canonical chapter cutoff; missing cutoff skips semantic retrieval.
- Future event memories are filtered before vector ranking.
- Superseded events are excluded even during the short race before background chunk cleanup.
- Semantic results are additive `semantic_memories`; canonical `recent_events` remain unchanged.
- Semantic memory IDs/status/version are traceable in `context_summary`.
- Semantic content participates in `context_hash`.
- Provider/repository failures return deterministic Phase 6 fallback instead of failing writing generation.
- Semantic runtime is feature-flagged and disabled by default.
- Production Gemini credentials are supplied through `GEMINI_API_KEY` or `GOOGLE_API_KEY`; production adapter uses one credential and does not reuse benchmark key rotation.

## Materialization lifecycle closure

P7-02 supplied the rebuildable materializer. P7-03 closes the production lifecycle:

```text
canonical proposal acceptance transaction COMMIT
        ↓
background semantic refresh
        ↓
upsert memory_chunks
        ↓
embedding provider call outside canonical transaction
        ↓
upsert current embedding version
```

Embedding failure cannot roll back accepted canonical Story Brain data.

An authenticated internal endpoint is available for backfill/rebuild:

```text
POST /internal/v1/story-brains/{brain_id}/semantic-memory/rebuild
```

It queues best-effort semantic materialization and returns 202 when semantic runtime is enabled.

## Safety boundaries

- Semantic similarity is relevance, not narrative truth.
- No pending/rejected proposal is made semantic canonical data.
- No future event memory is searched without a cutoff.
- No cross-version vector mixing.
- No stale vector usage.
- No semantic cross-tenant enrichment when request tenant differs from configured semantic runtime scope.
- No HNSW/IVFFlat/ANN.
- No P7-04 hybrid weighting.
- No P7-05 context compression.

## Verification

Authoritative PR CI run `35830009532` at runtime HEAD `1ce446d34ba01c11267051afd8a65ced83c6b83e`:

```text
semantic/materialization/retriever unit tests   18 passed
P7 embedding benchmark regressions              6 passed
Phase 6 temporal/writing regressions            25 passed
live PostgreSQL + pgvector integration           9 passed
root Compose smoke                               PASS
```

Root Compose verifies PostgreSQL/pgvector, MongoDB, AI service, backend and web; semantic retriever + materializer composition; internal rebuild HTTP 202; `VECTOR(768)`; and service-auth 401/403/200.

## Acceptance gate

```text
ADR-012 query recipe preserved                    PASS
explicit query L2 normalization                   PASS
exact cosine retrieval                            PASS
embedding_version isolation                       PASS
freshness hash filtering                          PASS
temporal cutoff fail-closed                       PASS
future-memory leakage guard                       PASS
superseded-event race guard                       PASS
tenant semantic scope guard                       PASS
Phase 6 fallback                                  PASS
semantic context traceability/context hash        PASS
post-accept background materialization            PASS
internal backfill/rebuild                         PASS
live PostgreSQL + pgvector                        PASS
Phase 6 regression suite                          PASS
root Compose production path                      PASS
ANN/hybrid/compression scope                      NOT INTRODUCED
```

## Rollout

Default Compose configuration keeps semantic retrieval disabled:

```text
SEMANTIC_RETRIEVAL_ENABLED=false
EMBEDDING_PROVIDER=none
```

For Gemini rollout:

```text
SEMANTIC_RETRIEVAL_ENABLED=true
EMBEDDING_PROVIDER=gemini
ACTIVE_EMBEDDING_VERSION=
GEMINI_API_KEY=<one authorized project key>
SEMANTIC_RETRIEVAL_LIMIT=8
```

Leaving `ACTIVE_EMBEDDING_VERSION` empty lets Settings choose the provider's frozen default `gemini-embedding-2-768-v1`.

## Acceptance

P7-03 was accepted and squash-merged to `main` on 2026-09-23 as:

`40ded408a48bac83ea1d1373a9388204796fae8a`

Final HEAD CI `35830009532` passed unit, live PostgreSQL/pgvector integration, and root Compose smoke. No implementation blocker remains. P7-04 hybrid ranking is the next planned slice and is not active yet.
