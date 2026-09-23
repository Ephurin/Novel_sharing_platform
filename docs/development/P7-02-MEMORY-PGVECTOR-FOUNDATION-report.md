# P7-02 — Memory + pgvector Foundation Report

Status: **ACCEPTED — 2026-09-23**

Merged PR: `#1`  
Merge commit: `382442dad84a99446ee0174426dc5e0c1b2a2dff`  
Migration: `0007_semantic_memory_foundation`  
CI run: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35825994127

## Result

P7-02 introduces the production semantic-memory storage/materialization foundation without changing the Phase 6 serving retrieval path.

The architecture is now split into three lifecycles:

```text
canonical Story Brain
        ↓
memory_chunks
derived narrative content + provenance
        ↓
memory_embeddings
model/version-specific pgvector representation
```

Deleting/rebuilding embeddings does not mutate memory chunks or canonical event/fact/state data.

## Implemented

- Root and AI-service Compose use PostgreSQL 16 with `pgvector/pgvector:pg16`.
- Python `pgvector` SQLAlchemy integration added.
- Alembic `0007_semantic_memory_foundation` creates:
  - `narrative.memory_chunks`
  - `narrative.memory_embeddings`
  - `CREATE EXTENSION IF NOT EXISTS vector`
- Embedding generation v1 is physically frozen at `VECTOR(768)`.
- `memory_chunks` contains no vector column.
- `memory_embeddings` supports parallel versions with `UNIQUE(memory_chunk_id, embedding_version)`.
- Separate `SemanticMemoryRepository` boundary implemented.
- PostgreSQL semantic-memory repository is tenant/novel/story-brain scoped.
- Initial materialization source is confirmed, active/non-superseded canonical events.
- Event summaries become `event_summary` memory chunks with provenance and content hashes.
- Gemini document embedding adapter follows ADR-012:
  - model `gemini-embedding-2`
  - dimension 768
  - document instruction prefix
  - explicit L2 normalization before persistence
  - version `gemini-embedding-2-768-v1`
- Production adapter uses one authorized credential; benchmark multi-key rotation is not reused.
- Provider calls occur after the chunk write transaction closes.
- Provider failure leaves a valid retryable memory chunk without an embedding.
- Content-hash mismatch exposes stale vectors.
- Multiple embedding versions can coexist and one version can be deleted without deleting the chunk or another version.
- No HNSW/IVFFlat index added.
- No semantic query retrieval, hybrid ranking, context compression, or WritingService retrieval change added.

## CI evidence

GitHub Actions run `35825994127` completed successfully.

| Job | Result |
|---|---|
| unit | PASS |
| pgvector-integration | PASS |
| root-compose-smoke | PASS |

Executed results:

```text
semantic-memory unit tests          6 passed
P7 embedding benchmark regressions  6 passed
live PostgreSQL + pgvector tests    5 passed
root Compose smoke                  PASS
```

The live PostgreSQL test deliberately verifies wrong-dimension rejection; PostgreSQL emits `expected 768 dimensions, not 2`, which is expected test evidence rather than a failure.

## Acceptance gate

```text
ADR-012 contract preserved                         PASS
PostgreSQL runtime supports pgvector               PASS
memory_chunks independent from embeddings          PASS
memory_embeddings uses VECTOR(768)                 PASS
confirmed/non-superseded event filtering           PASS
provider outside DB transaction                    PASS
dimension validation + L2 normalization            PASS
parallel embedding versions                        PASS
stale content-hash detection                       PASS
version deletion preserves canonical/chunk data    PASS
live pgvector integration                          PASS
migration downgrade/re-upgrade                     PASS
root Compose + web + auth smoke                    PASS
Phase 6 serving retrieval unchanged                PASS
no ANN/hybrid/compression scope                     PASS
```

## Acceptance

P7-02 was accepted and squash-merged to `main` on 2026-09-23 as commit:

`382442dad84a99446ee0174426dc5e0c1b2a2dff`

No implementation blocker remains. P7-03 semantic retrieval is the next planned slice but is not active yet.
