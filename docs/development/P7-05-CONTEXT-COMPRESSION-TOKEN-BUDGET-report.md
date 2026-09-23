# P7-05 — Context Compression / Token Budget Report

Status: **ACCEPTED — 2026-09-23**

Merged PR: `#4`  
Merge commit: `db1dd06034b0a22278b56fcb0ff0531b032c96ae`  
Packing version: `context-budget-v1`  
Estimator version: `utf8-json-bytes-3-v1`  
Final PR-head CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35834820452

## Goal

P7-05 turns the previous split budget behavior into one final deterministic packing stage:

```text
canonical structured candidates
+ P7-04 hybrid-ranked semantic candidates
        ↓
semantic/recent dedup
+ protected-artifact preservation
+ deterministic priority packing
        ↓
bounded Story Brain prompt context
        ↓
context hash
        ↓
Writing LLM
```

The packer is an application component. Production WritingService asks the repository for untrimmed canonical candidates, adds semantic memories, then applies the final budget exactly once.

Repository-level Phase 6 fixed-cost budgeting remains available only as a compatibility behavior for direct repository callers.

## Compression contract

P7-05 v1 does **not** ask an LLM to summarize or rewrite context. It selects whole artifacts and removes redundancy.

Protected artifacts:
- locked world rules/facts;
- package-level author constraints;
- locked entity + current-state bundles.

If protected artifacts alone exceed the requested maximum, they remain intact and the result reports `protected_overflow=true`. P7-05 does not silently truncate them.

Optional priority:
1. entity/current-state bundles;
2. non-locked world rules;
3. hybrid-ranked semantic memories;
4. remaining recent events, newest first for selection and chronological in final output.

A candidate that is too large may be skipped while later smaller candidates are still considered.

## Semantic/recent dedup

If a semantic memory and canonical recent event share `event_id`:
- emit the canonical recent-event representation;
- do not emit the duplicate semantic payload;
- use semantic order to promote that event into the semantic-priority packing lane;
- trace the deduplicated semantic memory ID.

Canonical truth remains the canonical event representation.

## Estimator and serialization

Frozen estimator:

```text
serialization = JSON(
  ensure_ascii=false,
  sort_keys=true,
  separators=(",", ":")
)
bytes = UTF-8(serialization)
estimated_tokens = ceil(bytes / 3)
```

WritingService context hash and real LLMService context serialization use the same canonical JSON contract, so the estimator, hash and sent Story Brain payload no longer measure different serializations.

### Important limitation

This is an estimated **Story Brain context payload** budget. It is not an exact provider tokenizer and is not a cap on the complete model request.

Not counted by this estimator:
- system prompt;
- selected/current chapter text;
- author instruction;
- style;
- request-level constraints;
- response/output tokens.

A future model-specific total-prompt budget would be a separate capability.

## Traceability

Final `token_budget` includes:
- used;
- maximum;
- estimated_before;
- budget_overflow;
- protected_overflow;
- packing_version;
- estimator_version;
- deduplicated_semantic_count;
- dropped_artifact_count.

`context_summary` records final retained IDs plus dropped entity/event/fact/semantic IDs and deduplicated semantic IDs. No chain-of-thought is exposed.

## Verification

Code-head CI `35834820452`:

```text
semantic/retrieval/hybrid/context-budget selective  35 passed
hybrid proxy regression                              1 passed
embedding benchmark regressions                      6 passed
Phase 6 temporal/writing regressions                25 passed
full AI-service non-PostgreSQL regression          176 passed
                                                     2 skipped
                                                    22 deselected
live PostgreSQL + pgvector integration              10 passed
root Compose production path                       PASS
```

Root Compose additionally exercised:

```text
GET context-preview?token_budget=80
maximum=80
estimated_before=46
used=46
budget_overflow=false
protected_overflow=false
packing_version=context-budget-v1
estimator_version=utf8-json-bytes-3-v1
```

Existing pgvector `VECTOR(768)`, semantic rebuild, AI service auth boundary and backend/web health smoke remained green.

## Scope held

Not introduced:
- LLM-generated context summaries;
- sentence-level clipping of protected artifacts;
- ANN/HNSW/IVFFlat;
- specialized vector DB;
- schema migration;
- online learned packing weights;
- embedding-version auto-cutover.

## Acceptance

P7-05 was accepted and squash-merged to `main` on 2026-09-23 as:

`db1dd06034b0a22278b56fcb0ff0531b032c96ae`

Final PR-head CI `35834820452` passed selective and full AI-service regression, live PostgreSQL+pgvector integration, and root Compose smoke. No implementation blocker remains.

P7-05 completes the planned Phase 7 scope. Phase 8 cutover/cleanup is the next planned phase and is not active yet.
