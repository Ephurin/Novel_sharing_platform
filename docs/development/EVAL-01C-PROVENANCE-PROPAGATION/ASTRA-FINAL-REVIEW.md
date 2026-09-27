# ASTRA Final Review — EVAL-01C-PROV Provenance Propagation

**Implementation PR:** #13  
**Merge commit:** `ce51efef225d7a45ef89e6b54c66a74f07fe4eb2`  
**Correct tested commit:** `96cbf963d2e1b83d08a074f29ae8b42dc53db707`  
**Original evidence commit:** `94177a67f9920e04b4997cebfa892c135a0d1afa`  
**Review status:** VERIFIED — READY FOR SUPERVISOR DECISION

## Scope reviewed

This slice was intentionally limited to compact provenance propagation:

```text
EventRecord fields/event_metadata
  -> EventMemorySource.metadata
  -> MemoryChunkRecord.memory_metadata
  -> SemanticMemoryMatch.metadata
  -> WritingService._semantic_match_payload()
```

Allowlisted fields:

```text
event_type
chapter_number
source_type
confirmation_status
importance_score
memory_id
chapter_title
tags
status
review_status
supersedes_id
```

No ranking, filtering, embedding, temporal cutoff, schema, or cleanup behavior was changed.

## Implementation verification

GitHub CI after the implementation change:

```text
Evaluation Pilot Harness          PASS
P7 unit/full regression           PASS
P7 live PostgreSQL + pgvector     PASS
P7 root Compose smoke             PASS
P8 unit                           PASS
P8 PostgreSQL integration         PASS
P8 rollback rehearsal             PASS
P8 frontend/API cutover           PASS
P8 root Compose cutover smoke     PASS
P8 final cleanup gate             PASS / remains BLOCKED
```

The first CI attempt had one test-only failure because the newly added integration test passed an unnormalized fake query embedding. The test was corrected to obey the existing L2-normalization contract; the full rerun passed.

## Gemini local verification

Live local verification used PostgreSQL 16.15 + pgvector 0.8.6 on a disposable database.

Integration suite:

```text
6 passed
```

Provenance smoke:

```text
tags propagation                         PASS
review_status propagation                PASS
status propagation                       PASS
chapter_title propagation                PASS
memory_id propagation                    PASS
importance_score propagation             PASS
supersedes_id propagation                PASS
source_type propagation                  PASS
confirmation_status propagation          PASS
unallowlisted metadata absent            PASS
embedding reuse on metadata-only update  PASS
temporal cutoff invariance               PASS
hybrid ranking invariance                PASS
```

Metadata-only rematerialization:

```text
embedded_count = 0
reused_embedding_count = 1
fresh_embedding_count = 1
```

So provenance updates do not force unnecessary embedding regeneration when the embedded content itself is unchanged.

## Safety / regression review

Verified unchanged:

- `gemini-embedding-2`, 768 dimensions, explicit L2;
- embedding version `gemini-embedding-2-768-v1`;
- exact cosine retrieval;
- chapter cutoff before semantic ranking;
- accepted `hybrid-v1` weights;
- no ANN/HNSW/IVFFlat;
- no database migration;
- no frozen-gold mutation;
- no replay/global suppression policy;
- P8-05 destructive cleanup remains blocked.

The allowlist also prevents arbitrary large/internal event metadata from silently entering semantic-memory context.

## Bookkeeping correction

Gemini's report contained two mistyped commit SHAs. GitHub verification shows the valid references are:

```text
Tested commit:
96cbf963d2e1b83d08a074f29ae8b42dc53db707

Original evidence commit:
94177a67f9920e04b4997cebfa892c135a0d1afa
```

The evidence files were corrected without changing measured results.

## Final verdict

```text
implementation scope              PASS
CI verification                   PASS
local PostgreSQL/pgvector         PASS
provenance propagation            PASS
allowlist boundedness             PASS
embedding reuse                   PASS
ranking regression                NONE OBSERVED
temporal regression               NONE OBSERVED
schema migration                  NONE
P8-05 cleanup                     BLOCKED
```

**EVAL-01C-PROV is technically VERIFIED and ready for Supervisor ACCEPT.**

This does not by itself claim that the broader Evaluation/Pilot is complete.

Still outside this slice:

- provenance-aware prompt/lane presentation to the LLM;
- full context packing under token pressure;
- broader generation-quality evaluation;
- raw 61-chapter ingestion/extraction evaluation.

Those should remain experiment questions, not be silently folded into this implementation acceptance.
