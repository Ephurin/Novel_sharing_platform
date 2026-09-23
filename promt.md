# Active Agent Handoff — Ephurin Novel Platform

> File này chỉ chứa context đang hoạt động cho coding agent.
> Lịch sử Phase 6/6.5 đã archive tại:
> `docs/development/archive/promt-history-through-P6.5-R6-2026-09-21.md`
>
> Không đọc archive cho task thường ngày trừ khi cần audit quyết định cũ.

---

## 1. Vai trò và quy tắc

- **Astra = architect / planner / reviewer.**
- **Gemini = coding worker.**
- Gemini chỉ làm đúng lô đang active, không tự mở scope/phase.
- Test pass không đồng nghĩa nghiệm thu; Astra/người dùng quyết định ACCEPT.
- Không reset/clean/force-push, không xóa thay đổi hiện có.
- Không commit credential/secret/local key file.
- Không gọi mock/unit test là integration/system evidence.
- Báo cáo + evidence đặt dưới `docs/development/`.
- `promt.md` chỉ giữ active state + bàn giao ngắn.

Đọc tối thiểu trước khi sửa code:

1. `SKILL/AGENTS.md`
2. `SKILL/AI_CODING_STANDARDS.md`
3. `SKILL/ARCHITECTURE.md`
4. `ai-service/docs/IMPLEMENTATION_PLAN.md`
5. `ai-service/docs/ADRS.md`
6. `ai-service/docs/DATA_MODEL.md`
7. `ai-service/docs/ADR-012-EMBEDDING-MODEL.md`
8. migration/ORM/repository code liên quan.

---

## 2. Phase status

### Phase 6 / 6.5 — ACCEPTED

Accepted: **2026-09-21**.

Các invariant đã đóng:

- Browser/Frontend → Node AI Gateway → AI Service.
- Ownership + service credential boundary.
- Protected routes fail closed.
- Canonical revision/chapter provenance.
- Temporal cutoff chống future leakage.
- Structured context + context hash + generation trace.
- Accept-time freshness.
- Transactional outbox + lease/fencing.
- Mongo reconciliation.
- PostgreSQL narrative repository.
- Legacy `/suggest-next` delegate qua WritingService.

Không reopen Phase 6 trừ correctness regression trực tiếp do Phase 7.

### P7-01 — Embedding Benchmark + ADR — ACCEPTED

Accepted by Astra: **2026-09-22**.

Frozen benchmark:

- dataset: `aethelgard-retrieval-eval-v1.0.0`
- 216 canonical memories
- 21 core-gold English queries
- 10 Vietnamese cross-lingual diagnostic queries

Recent-only baseline @10:

```text
Recall = 0.4095
MRR    = 0.3286
nDCG   = 0.3160
```

Accepted embedding contract:

```text
model              = gemini-embedding-2
dimension          = 768
normalization      = explicit L2
distance           = cosine distance (<=>)
future ANN opclass = vector_cosine_ops
embedding_version  = gemini-embedding-2-768-v1
```

Primary winner @10:

```text
Recall = 0.6747
MRR    = 0.9024
nDCG   = 0.7097
```

1536 dimensions did not improve K=10/K=20 quality and doubled vector storage.

Important review note:

- Candidate A used batch size 32; Candidate B used batch size 16.
- Therefore A-vs-B latency is **recorded but not apples-to-apples comparative evidence**.
- Model selection is based on retrieval quality.
- The 768-vs-1536 comparison is valid for latency/storage because both use the same model and batch size 16.
- Independent Astra audit recomputed aggregate metrics from raw `per_query` results and found **zero future-memory cutoff violations**.

ADR:

`ai-service/docs/ADR-012-EMBEDDING-MODEL.md`

Evidence:

`docs/development/P7-01-EMBEDDING-BENCHMARK-ADR/`

---

## 3. Phase 7 architecture invariants

Semantic memory is a **derived/rebuildable index**, never canonical truth.

```text
Canonical Story Brain
        ↓
derived narrative memories
        ↓
embedding
        ↓
PostgreSQL + pgvector
        ↓
semantic candidates
        ↓
hybrid rank
        ↓
token-budget context
        ↓
Writing LLM
```

Hybrid ranking later includes:

```text
semantic similarity
+ entity overlap
+ temporal relevance
+ importance
+ relationship relevance
```

Invariant:

```text
embedding similarity != narrative truth
```

Canonical events/facts + temporal rules remain authoritative.

Never:

- index pending/rejected proposal as canonical memory;
- use raw novel text as default semantic-memory row;
- let embedding provider mutation become canonical Story Brain mutation;
- call provider while holding a long DB transaction;
- leak future memory beyond cutoff;
- add a specialized vector DB in Phase 7 MVP.

---

# 4. P7-02-MEMORY-PGVECTOR-FOUNDATION — ACCEPTED

**Status:** ACCEPTED — 2026-09-23.  
**Merged PR:** #1  
**Merge commit:** `382442dad84a99446ee0174426dc5e0c1b2a2dff`  
**Type:** production storage/materialization foundation.

**Goal:** introduce pgvector-capable PostgreSQL plus a two-layer semantic-memory model:

```text
canonical Story Brain
        ↓
memory_chunks
derived content + provenance
        ↓
memory_embeddings
model/version-specific vector representation
```

P7-02 ends **before** semantic retrieval is wired into Context Builder.

## 4.1 Runtime foundation

Root Compose and the AI-service integration Compose must use PostgreSQL 16 with pgvector support:

```text
pgvector/pgvector:pg16
```

Requirements:

- preserve PostgreSQL major version 16;
- do not reset/wipe existing user volumes as part of migration;
- Python dependency uses `pgvector` SQLAlchemy integration;
- `CREATE EXTENSION IF NOT EXISTS vector`;
- no specialized vector DB.

## 4.2 Alembic migration

Next migration after `0006_fix_revision_provenance`:

```text
0007_semantic_memory_foundation
```

It must create both tables and be safely downgradeable:

### `narrative.memory_chunks`

Contains derived narrative content/provenance only. **No vector column.**

Required identity:

```text
UNIQUE(story_brain_id, memory_type, source_key)
```

Initial supported memory type:

```text
event_summary
```

Initial source:

```text
confirmed + active/non-superseded canonical event
→ event.summary
→ memory_chunk
```

### `narrative.memory_embeddings`

Contains representation-specific data:

```text
memory_chunk_id
story_brain_id
tenant_id
novel_id
embedding_model
embedding_version
embedding_dimension
normalization
content_hash
embedding VECTOR(768)
created_at
```

Required identity:

```text
UNIQUE(memory_chunk_id, embedding_version)
```

Embedding generation v1:

```text
model              = gemini-embedding-2
dimension          = 768
normalization      = l2
distance           = cosine
embedding_version  = gemini-embedding-2-768-v1
```

Do not create HNSW/IVFFlat in P7-02.

## 4.3 Lifecycle invariant

```text
DELETE memory_embeddings
!= DELETE memory_chunks
!= DELETE canonical Story Brain
```

Changing provider/model/dimension/instruction recipe creates a new embedding version. Do not overwrite a verified old version in place.

`memory_chunks.content_hash` is SHA-256 of the un-prefixed derived content.

`memory_embeddings.content_hash` is the snapshot hash used to create that vector.

If:

```text
memory_embeddings.content_hash != memory_chunks.content_hash
```

that embedding is stale and must be rebuilt.

A future model with a different dimension may require a forward vector-storage migration, but must not require Story Brain re-extraction or duplication of unchanged memory content.

## 4.4 Repository boundary

Use a separate `SemanticMemoryRepository`; do not force JSON/InMemory `NarrativeRepository` implementations to fake vector support.

Required capabilities include:

```text
list_event_memory_sources
upsert_memory_chunk
list_memory_chunks
delete_memory_chunks_not_in_sources
get_embedding
upsert_embedding
list_embeddings_for_version
delete_embedding_version
embedding_coverage
```

All PostgreSQL operations remain tenant + novel + story-brain scoped.

Superseded/inactive events must not remain retrievable semantic memory. Their derived event-summary chunks may be deleted/rebuilt; canonical historical events remain untouched.

## 4.5 Materialization flow

```text
read confirmed active canonical events
        ↓
derive/upsert memory_chunk
        ↓
commit short DB transaction
        ↓
call embedding provider OUTSIDE DB transaction
        ↓
validate dimension = 768
        ↓
explicit L2 normalize
        ↓
upsert memory_embedding(version)
```

Provider failure may leave a valid `memory_chunk` without an embedding. This is a legal retryable state and must not delete/corrupt the chunk.

Do not add LLM-generated chapter/arc summaries in this batch.

## 4.6 Embedding adapter

Production adapter:

```text
GeminiEmbeddingProvider
model: gemini-embedding-2
dimension: 768
version: gemini-embedding-2-768-v1
```

Document instruction:

```text
Represent this canonical narrative memory for semantic search:
```

Requirements:

- one authorized credential from environment;
- no key logging/committing;
- no benchmark multi-key rotation in production adapter;
- explicit provider/dimension failures;
- deterministic fake provider for tests.

P7-03 owns query embeddings.

## 4.7 Production retrieval behavior

**Must remain unchanged in P7-02.**

Do not:

- vector-search from Context Builder;
- modify WritingService context selection;
- implement hybrid ranking;
- implement context compression;
- create ANN index;
- claim Phase 7 exit criterion.

Phase 6 recent/structured SQL retrieval remains the serving path.

## 4.8 Tests required

### Deterministic/unit

Verify:

- L2 normalization and dimension rejection;
- content-hash/idempotent chunk identity;
- provider failure leaves chunk retryable;
- parallel embedding versions coexist;
- deleting v2 preserves v1 + chunk;
- content changes make old embedding stale;
- inactive source cleanup does not touch canonical data.

### Live PostgreSQL + pgvector

Must verify:

1. Alembic upgrade from 0006 to head.
2. `vector` extension exists.
3. `memory_chunks` has no vector ownership.
4. `memory_embeddings.embedding` is `VECTOR(768)`.
5. wrong vector dimension fails.
6. exact cosine ordering works.
7. only confirmed/non-superseded event sources materialize.
8. tenant/novel/story-brain isolation.
9. parallel embedding versions coexist.
10. downgrade to 0006 preserves canonical tables/data.
11. re-upgrade succeeds.

### Root Compose smoke

Verify:

- pgvector PostgreSQL healthy;
- AI service starts with PostgreSQL repository;
- backend/web health path remains healthy;
- direct AI service-auth boundary still rejects unauthenticated access and accepts valid service credential.

Connector-only review cannot claim these live checks. If they have not run, handoff remains **PARTIAL/BLOCKED**.

---

## 5. Evidence

Create/update:

```text
docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION-report.md
docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION/
```

Expected evidence:

```text
schema-summary.md
test-summary.md
migration-up-down.txt
pgvector-capability.txt
semantic-memory-integration.txt
compose-smoke.txt
```

Evidence files must distinguish static review from executed live commands. Never fabricate PASS.

---

## 6. Acceptance criteria

P7-02 is accepted only when:

```text
ADR-012 contract preserved
AND
PostgreSQL runtime supports pgvector
AND
memory_chunks lifecycle is independent from embedding lifecycle
AND
memory_embeddings freezes v1 at VECTOR(768)
AND
confirmed/non-superseded canonical-only materialization is enforced
AND
provider call occurs outside DB transaction
AND
dimension validation + L2 normalization are enforced
AND
parallel embedding versions coexist
AND
stale embedding detection works via content_hash
AND
reindex/version deletion cannot delete canonical Story Brain data
AND
live PostgreSQL pgvector integration passes
AND
migration downgrade/re-upgrade is verified
AND
root Compose smoke passes
AND
Phase 6 retrieval behavior remains unchanged
AND
no ANN/hybrid/context-compression scope is introduced
```

---

## 7. Handoff format

When implementation + live evidence are complete, append only:

```markdown
---

### Handoff — P7-02-MEMORY-PGVECTOR-FOUNDATION

Status: Completed, awaiting Astra review
# or Partial / Blocked

- Migration: 0007_semantic_memory_foundation
- Schema:
  - memory_chunks: <result>
  - memory_embeddings: <result>
- Embedding v1: gemini-embedding-2 / 768 / L2 / cosine
- Canonical source filtering: <result>
- Parallel versions: <result>
- Stale hash detection: <result>
- Provider failure behavior: <result>
- Unit tests: <result>
- Live pgvector integration: <result>
- Migration downgrade/re-upgrade: <result>
- Root Compose: <result>
- Phase 6 retrieval changes: NONE
- Semantic retriever changes: NONE
- Report: <path>
- Evidence: <path>
- Remaining blocker: none | <exact blocker>
```

Do not open P7-03 until P7-02 is reviewed and accepted.


---

### Handoff — P7-02-MEMORY-PGVECTOR-FOUNDATION

Status: ACCEPTED — merged to `main` on 2026-09-23

- Merge commit: `382442dad84a99446ee0174426dc5e0c1b2a2dff`
- Migration: `0007_semantic_memory_foundation`
- Schema:
  - memory_chunks: derived content/provenance; no vector column
  - memory_embeddings: versioned representation; `VECTOR(768)`
- Embedding v1: `gemini-embedding-2 / 768 / L2 / cosine`
- Canonical source filtering: PASS — confirmed + active/non-superseded events only
- Parallel versions: PASS
- Stale hash detection: PASS
- Provider failure behavior: PASS — chunk survives and is retryable
- Unit tests: PASS — 6 semantic-memory + 6 benchmark regression
- Live pgvector integration: PASS — 5 tests
- Migration downgrade/re-upgrade: PASS
- Root Compose: PASS — postgres/mongo/AI/backend/web + pgvector + auth 401/403/200
- CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35825994127
- Phase 6 retrieval changes: NONE
- Semantic retriever changes: NONE
- Report: `docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION-report.md`
- Evidence: `docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION/`
- Remaining blocker: none

P7-02 is accepted. P7-03 is the next planned task but is **NOT ACTIVE** until explicitly opened.


---

## 8. P7-03-SEMANTIC-RETRIEVER — ACCEPTED

**Status:** ACCEPTED — 2026-09-23  
**Merged PR:** #2  
**Merge commit:** `40ded408a48bac83ea1d1373a9388204796fae8a`

Goal:

```text
Phase 6 structured SQL context (authoritative baseline)
        +
author/query text
        ↓
query embedding using ADR-012 query recipe
        ↓
tenant/novel/story-brain
+ embedding_version
+ freshness
+ temporal cutoff
        ↓
exact pgvector cosine ordering
        ↓
semantic_memories added to writing context
```

### Invariants

- Phase 6 structured SQL context remains authoritative and always available as deterministic fallback.
- Query embedding recipe:
  `Represent this narrative retrieval query for semantic search: {query_text}`
- Query vector is explicitly L2-normalized.
- Retrieval must use only the configured/active embedding version.
- Stale rows where embedding.content_hash != chunk.content_hash are excluded.
- Temporal filtering occurs in SQL before vector ranking semantics; future event memories must never be candidates.
- Exact cosine distance `<=>`; no ANN/HNSW/IVFFlat in P7-03.
- Semantic similarity is candidate relevance, not canonical truth.
- Provider/repository failure must not fail writing generation; fallback is Phase 6 context.
- Retrieved semantic memories must be traceable in context hash/summary.

### Initial production integration

P7-03 may add an optional `semantic_memories` field to `WritingContextPackage` and pass it to WritingService/LLM context. Do not replace canonical `recent_events` with semantic results.

Generation query may combine author instruction with selected/revision text when available. Empty queries skip semantic retrieval.

### Required tests

Deterministic:
- query instruction differs from document instruction;
- query dimension validation + L2 normalization;
- retrieval failure returns Phase 6 fallback unchanged;
- semantic matches are additive, traceable, and included in context hash.

Live PostgreSQL + pgvector:
- exact cosine ordering via `<=>`;
- strict embedding_version isolation;
- stale embedding exclusion;
- tenant/novel/story-brain isolation;
- temporal cutoff excludes future event memory before ranking;
- no future-memory leakage at multiple cutoffs.

Regression:
- WritingService works unchanged when semantic retriever is absent/disabled.
- Existing Phase 6 temporal/golden tests remain green.

### Out of scope

- hybrid ranker;
- entity-overlap weighting;
- importance/relationship weighted scoring;
- context compression;
- ANN indexes;
- embedding-version quality cutover automation;
- specialized vector DB.

P7-04 remains the hybrid-ranker slice.


---

### Handoff — P7-03-SEMANTIC-RETRIEVER

Status: ACCEPTED — merged to `main` on 2026-09-23

- Merge commit: `40ded408a48bac83ea1d1373a9388204796fae8a`
- Query recipe: ADR-012 query prefix + explicit L2
- Retrieval: exact pgvector cosine
- Temporal cutoff: PASS — required/fail-closed before semantic search
- Embedding version isolation: PASS
- Stale content-hash exclusion: PASS
- Superseded-event race guard: PASS
- Tenant semantic scope mismatch: PASS — semantic layer skips/falls back
- Phase 6 fallback: PASS
- Semantic memories additive to canonical recent_events: PASS
- Context hash includes semantic memory content: PASS
- Post-accept semantic refresh: PASS — background, canonical acceptance independent
- Internal semantic rebuild/backfill endpoint: PASS
- Unit/semantic tests: PASS — 18
- P7 benchmark regression: PASS — 6
- Phase 6 temporal/writing regressions: PASS — 25
- Live pgvector integration: PASS — 9
- Root Compose: PASS — retriever + materializer + rebuild 202 + pgvector/auth/backend/web
- CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35830009532
- ANN/HNSW/IVFFlat: NONE
- Hybrid ranker: NONE
- Context compression: NONE
- Report: `docs/development/P7-03-SEMANTIC-RETRIEVER-report.md`
- Evidence: `docs/development/P7-03-SEMANTIC-RETRIEVER/`
- Remaining blocker: none

P7-03 is accepted. P7-04 is the next planned task but is **NOT ACTIVE** until explicitly opened.


---

## 9. NEXT TASK — P7-04-HYBRID-RANKER — NOT ACTIVE

P7-03 is closed. The next planned Phase 7 slice combines semantic candidates with narrative signals.

Do not begin P7-04 until the owner explicitly opens it.

Expected boundary when opened:

```text
semantic candidates
        +
entity overlap
temporal relevance
importance
relationship relevance
        ↓
deterministic hybrid score
        ↓
ranked context candidates
```

Keep these out unless explicitly scoped:
- context compression/token packing changes beyond ranking output;
- ANN/HNSW/IVFFlat;
- specialized vector database;
- automatic embedding-version quality cutover.
