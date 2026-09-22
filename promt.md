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

# 4. ACTIVE TASK — P7-02-MEMORY-PGVECTOR-FOUNDATION

**Type:** production storage/materialization foundation.

**Goal:** introduce pgvector-capable PostgreSQL, versioned `memory_chunks`, and rebuildable embedding materialization without changing production context retrieval yet.

P7-02 ends **before** semantic retrieval is wired into Context Builder.

## 4.1 Runtime / dependency foundation

Current root Compose still uses:

```yaml
postgres:16-alpine
```

This image does not provide the required pgvector extension by default.

Implement a pgvector-enabled PostgreSQL 16 runtime using the official `pgvector/pgvector` image compatible with PG16.

Requirements:

- preserve PostgreSQL major version 16;
- do not wipe/reset existing volumes;
- keep root Compose health behavior working;
- add Python `pgvector` integration compatible with SQLAlchemy;
- no external/specialized vector database.

Do not silently fall back to plain PostgreSQL if the extension cannot be enabled.

## 4.2 Alembic migration

Create the next migration after:

`0006_fix_revision_provenance`

Expected new revision name may be:

`0007_semantic_memory_foundation`

Migration must:

1. `CREATE EXTENSION IF NOT EXISTS vector`;
2. create `narrative.memory_chunks`;
3. freeze the accepted vector dimension at `VECTOR(768)`;
4. create deterministic relational indexes needed for version/timeline access;
5. support downgrade without damaging pre-existing canonical Story Brain tables.

Do **not** create HNSW/IVFFlat yet. Exact vector search is sufficient for the next retriever task; ANN needs production-scale evidence first.

Recommended fields:

```text
id
story_brain_id
tenant_id
novel_id
chapter_id
revision_id
event_id
entity_id
memory_type
content
content_hash
importance_score
narrative_order
entity_ids
embedding VECTOR(768)
embedding_model
embedding_version
metadata
created_at
```

Required uniqueness at minimum:

```text
(story_brain_id, content_hash, embedding_version)
```

Indexes at minimum:

```text
(story_brain_id, narrative_order)
(story_brain_id, embedding_version)
```

If `entity_ids` is retained as a UUID array, it is derived metadata for future hybrid ranking; do not make it a source of truth.

## 4.3 ORM/domain boundary

Add the production ORM/domain representation for semantic memory.

Prefer a **separate semantic-memory repository/port** instead of forcing JSON/InMemory NarrativeRepository implementations to pretend they support vectors.

Suggested boundary:

```python
class SemanticMemoryRepository(Protocol):
    def upsert_memory_chunk(...): ...
    def list_memory_chunks(...): ...
    def delete_embedding_version(...): ...
```

The exact method names may differ, but preserve:

- tenant + novel + story-brain scoping;
- idempotency;
- embedding version isolation;
- derived/rebuildable semantics.

Do not couple semantic-memory persistence to API schemas.

## 4.4 Canonical memory materialization

For the first production vertical slice, derive memory from **confirmed canonical events** rather than raw chapter text.

Initial supported memory type:

```text
event_summary
```

Source:

```text
confirmed/non-superseded canonical event
→ event.summary
→ derived memory chunk
```

Carry provenance:

- story_brain_id;
- tenant_id;
- novel_id;
- chapter_id;
- revision_id;
- event_id;
- narrative_order;
- participating entity IDs when available;
- content_hash.

Rules:

- pending/rejected proposals MUST NOT materialize;
- superseded/inactive event must not become an active canonical semantic memory;
- retry must not duplicate the same content/version;
- deleting/rebuilding semantic memory must not mutate canonical event/fact/state data.

Do not add LLM-generated chapter/arc summaries in this batch.

## 4.5 Embedding port + implementation

Create a dedicated embedding abstraction; do not route embeddings through the prose-writing LLM interface.

Accepted recipe:

```text
provider/model: gemini-embedding-2
dimension:      768
normalization:  explicit L2
version:        gemini-embedding-2-768-v1
distance:       cosine
```

Document prefix:

```text
Represent this canonical narrative memory for semantic search:
```

Query prefix is reserved for P7-03:

```text
Represent this narrative retrieval query for semantic search:
```

Requirements:

- fake embedding provider for deterministic tests;
- real Gemini adapter may read one authorized provider credential from environment;
- never commit/paste keys;
- do **not** copy benchmark-only multi-key rotation into production;
- provider call happens outside DB transaction;
- L2-normalize before persistence;
- verify returned vector dimension is exactly 768;
- provider/parsing/dimension failures are explicit failures, never silent zero/empty vectors.

## 4.6 Reindex/version behavior

P7-02 must make this possible:

```text
embedding-v1 active
↓
build embedding-v2 rows in parallel
↓
verify v2 completeness
↓
later switch active version
↓
keep v1 for rollback
↓
purge v1 only after verification
```

Do not overwrite v1 vectors in place when embedding recipe/model changes.

Changes to any of these require a new embedding version:

- provider/model;
- output dimension;
- query/document instruction recipe;
- normalization policy with semantic effect.

## 4.7 Production retrieval behavior

**Must remain unchanged in P7-02.**

Current Context Builder / WritingService continues to use the Phase 6 structured SQL/recent-event path.

Do not yet:

- call vector search from `preview_context()`;
- change `WritingService`;
- change generation context selection;
- implement hybrid ranker;
- implement context compression;
- claim Phase 7 exit criteria.

P7-03 will introduce the semantic retriever after the storage/materialization foundation is accepted.

## 4.8 Tests required

### Unit / deterministic

Cover at minimum:

- memory chunk content-hash/idempotency;
- only confirmed canonical event materializes;
- pending/rejected artifact cannot materialize;
- superseded event handling;
- embedding dimension == 768;
- L2 normalization;
- provider failure is explicit;
- different embedding versions coexist;
- reindex does not delete old version.

### PostgreSQL integration

Must run against **real PostgreSQL with pgvector**, not SQLite/mock.

Verify:

1. Alembic upgrade from current head succeeds.
2. `vector` extension exists.
3. `memory_chunks.embedding` is dimension 768.
4. Insert/read a 768-d vector succeeds.
5. Wrong vector dimension fails.
6. Exact cosine ordering works.
7. tenant/novel/story-brain isolation holds.
8. retry/upsert is idempotent.
9. downgrade back to 0006 does not damage pre-existing canonical tables/data.
10. re-upgrade succeeds.

### Root Compose smoke

Verify at minimum:

- pgvector PostgreSQL container healthy;
- AI service starts with PostgreSQL repository;
- existing Phase 6 health/auth/gateway path does not regress.

Do not describe unit tests as live integration evidence.

---

## 5. P7-02 evidence

Create:

```text
docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION-report.md
docs/development/P7-02-MEMORY-PGVECTOR-FOUNDATION/
```

Evidence should include:

```text
migration-up-down.txt
pgvector-capability.txt
semantic-memory-integration.txt
compose-smoke.txt
test-summary.md
schema-summary.md
```

Do not store secrets or raw embedding request payloads containing private manuscript text.

---

## 6. P7-02 acceptance criteria

P7-02 may be handed off only when:

```text
ADR-012 contract preserved
AND
root PostgreSQL runtime supports pgvector
AND
migration freezes VECTOR(768)
AND
memory_chunks is derived + versioned + rebuildable
AND
canonical-only materialization is enforced
AND
embedding adapter validates + L2-normalizes vectors
AND
provider call is outside DB transaction
AND
parallel embedding versions can coexist
AND
live PostgreSQL pgvector integration passes
AND
migration downgrade/re-upgrade is verified
AND
Phase 6 recent-context behavior is unchanged
AND
no ANN index is added without evidence
AND
no semantic retriever/hybrid/context-compression scope is introduced
```

If live pgvector integration cannot be run, hand off **PARTIAL/BLOCKED**, not Completed.

---

## 7. Expected Gemini handoff

Append only a short block:

```markdown
---

### Gemini handoff — P7-02-MEMORY-PGVECTOR-FOUNDATION

Status: Completed, awaiting Astra review
# or Partial / Blocked

- Migration: <revision>
- PostgreSQL image/pgvector: <result>
- Memory schema: <summary>
- Canonical materialization: <summary>
- Embedding adapter: <summary>
- Version/reindex behavior: <summary>
- Unit tests: <result>
- Live pgvector integration: <result>
- Root Compose smoke: <result>
- Report: <path>
- Evidence: <dir>
- Production semantic retrieval changes: NONE
- Remaining blocker: none | <exact blocker>
```

Do not paste long raw logs into `promt.md`.
