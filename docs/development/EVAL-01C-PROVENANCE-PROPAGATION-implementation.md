# EVAL-01C Provenance Propagation — Implementation Contract

Status: IMPLEMENTATION SLICE  
Scope: provenance propagation only  
Production ranking changes: NONE  
Embedding/model changes: NONE  
Schema migration: NONE

## Evidence basis

EVAL-01C established:

- neutralizing temporal recency does not remove the 3 replay inversions;
- inverse recency does not remove them and regresses core retrieval;
- global suppression of provenance variants is unsafe;
- all 5 same/past replay-negative hits can be identified as provenance variants;
- 26 valid positives also belong to the variant lane.

Therefore this slice does not change ranking. It only preserves compact provenance so downstream context/generation can distinguish canonical/high-confidence evidence from replay/ambiguous/attributed variants.

## Exact implementation scope

Preserve these compact fields from `EventRecord` into semantic-memory metadata when present:

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

Path:

```text
EventRecord.event_metadata / EventRecord fields
  -> EventMemorySource.metadata
  -> SemanticMemoryMaterializationService
  -> MemoryChunkRecord.memory_metadata
  -> SemanticMemoryMatch.metadata
  -> WritingService._semantic_match_payload()
```

The existing materializer and WritingService already preserve metadata. The production code change is intentionally localized to the EventRecord -> EventMemorySource projection.

## Non-goals

Do not:

- change hybrid-v1 weights;
- add intent-conditioned reranking;
- change semantic candidate retrieval;
- change chapter-cutoff behavior;
- change embedding model/version/dimension;
- add ANN/HNSW/IVFFlat;
- delete or suppress replay/ambiguous memories;
- change frozen evaluation labels;
- add a database migration;
- automatically create a new context lane in generation prompts.

This slice makes provenance available. A later experiment may decide how to present/use it.

## Safety / boundedness

Only a compact allowlist is propagated. Arbitrary event metadata is not copied into semantic memory.

This avoids silently injecting large or unrelated metadata into generation context.

Provenance metadata is descriptive only. It must not affect:

- materialization eligibility;
- semantic candidate filtering;
- hybrid score;
- temporal cutoff;
- memory deletion.

## Acceptance tests

### Unit/regression

Existing semantic-memory and writing regressions remain green.

### PostgreSQL integration

`test_event_provenance_metadata_survives_to_writing_payload` must prove:

1. an accepted EventRecord carries tags/status/review_status;
2. `list_event_memory_sources()` preserves the allowlisted fields;
3. unrelated arbitrary metadata is not propagated;
4. materialization stores the fields in `MemoryChunkRecord.memory_metadata`;
5. exact semantic retrieval returns them in `SemanticMemoryMatch.metadata`;
6. `WritingService._semantic_match_payload()` exposes them unchanged.

### Invariants

- ranking order for existing fixtures is unchanged;
- no schema migration;
- no destructive data operation;
- P8-05 remains BLOCKED.

## Post-merge Gemini verification

After implementation merges to `main`, Gemini/Antigravity should run the standard local verification plus a provenance-focused smoke.

Required evidence directory:

```text
docs/development/EVAL-01C-PROVENANCE-PROPAGATION/
  environment.txt
  tests.txt
  provenance-smoke.json
  summary.md
```

The smoke should create/use a disposable event with replay-style provenance, rebuild semantic memory, retrieve it, and record only non-secret metadata fields.

Expected result:

```text
tags survive                      PASS
review_status survives             PASS
status survives                    PASS
source_type survives               PASS
confirmation_status survives       PASS
arbitrary unallowlisted metadata   ABSENT
ranking contract                   UNCHANGED
P8-05 cleanup gate                 BLOCKED
```

Supervisor acceptance remains separate from implementation merge and test success.


## Merge / CI status

Implementation PR: #13  
Merge commit: `ce51efef225d7a45ef89e6b54c66a74f07fe4eb2`

PR verification:

```text
Evaluation Pilot Harness          PASS
P7 unit/full regression           PASS
P7 live PostgreSQL + pgvector     PASS
P7 root Compose smoke             PASS
P8 unit                           PASS
P8 PostgreSQL integration         PASS
P8 rollback rehearsal             PASS
P8 root Compose cutover smoke     PASS
P8 frontend/API cutover           PASS
P8 final cleanup gate             PASS / still BLOCKED
```

One initial integration-test failure was test-only: the fake query embedding was not L2-normalized. The test was corrected to use the same normalization contract required by production retrieval; the full rerun then passed.

Current state:

```text
implementation = MERGED
CI verification = PASS
Gemini local verification = PENDING
Supervisor acceptance = PENDING
```
