# P8-01 — JSON → PostgreSQL Migration Parity Report

**Status:** ACCEPTED — 2026-09-23  
**Merged PR:** #5  
**Merge commit:** `d639979f59b7867ee4863e886afb6065214b4f7d`  
**Final validated PR head:** `792ac0676471b3b17fa7e75967b3c54aa93019d9`  
**P8 push CI:** https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845116695  
**P8 PR CI:** https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845120791  
**P7 regression CI:** https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845120781  
**Date:** 2026-09-23

## Scope

P8-01 adds a dry-run-first, one-way legacy StoryKB JSON → PostgreSQL cutover tool.

It does **not**:
- switch production repository configuration;
- make JSON read-only;
- delete JSON data;
- delete legacy adapters;
- start P8-02/P8-03 cleanup;
- automatically apply committed/user legacy JSON into PostgreSQL in CI.

## Implemented contract

`ai-service/application/migrate_json_to_postgres.py`:
- defaults to dry-run;
- requires explicit `--apply`;
- supports one/multiple `--story-id` or `--all`;
- emits machine-readable JSON plans/reports;
- exits non-zero for unsafe plans.

`ai-service/infrastructure/json_postgres_cutover.py`:
- strictly parses/validates StoryKB JSON before planning;
- derives parity from the current `JsonNarrativeRepository` canonical StoryBrain view;
- preserves stable IDs and canonical fields;
- validates canonical references and projection replay before apply;
- detects global PostgreSQL primary-key collisions before INSERT;
- treats existing same-scope canonical/analysis-run rows as occupied target state;
- refuses conflicting non-empty target stories;
- applies a story in one PostgreSQL transaction;
- checks source SHA-256 before/during/after apply;
- verifies post-apply canonical snapshot parity;
- supports idempotent reapply;
- preserves proposal dependency-group/materialization-order and analysis-run provenance;
- keeps legacy-only/noncanonical fields archived in untouched source JSON and reports them as warnings.

## Canonical parity surface

Snapshot comparison covers:
- entities: identity, name/type, status/location/mentions, lock;
- aliases and mentions;
- facts + locks;
- explicit/locked relationships;
- events including deterministic narrative order;
- proposals including analysis-run identity, dependency group and materialization order;
- state transitions;
- current projection state + normalized provenance/relationships;
- Story Brain status/version/baseline metadata.

Projection rebuild is tested after migration to ensure the stored transition history reconstructs the migrated state.

## Committed legacy inventory

The committed StoryKB inventory contains six files:

- `writing_session_550`
- `writing_session_599`
- `writing_session_968`
- `writing_session_492`
- `test2`
- `test_narrative_v2`

All six dry-run as:
- `action=ready`;
- `safe_to_apply=true`;
- no unsupported canonical rows;
- no global ID collisions.

Legacy-only fields and unresolved human-readable relation/event labels are reported as warnings, not silently promoted into canonical FK truth.

The four `data/writing_session_*.json` files are intentionally excluded from the production image by `ai-service/.dockerignore`. Compose CI copies the committed checkout snapshot to a temporary container directory and executes the production migration runtime against that snapshot. The image-shipping policy is unchanged.

## Executed evidence

### Full AI-service regression

```text
176 passed, 2 skipped, 32 deselected
```

### Live PostgreSQL integration

```text
34 passed, 178 deselected, 5 warnings
```

Coverage includes:
- dry-run no-write behavior;
- apply into empty scoped target;
- canonical snapshot parity;
- projection rebuild parity;
- idempotent second apply;
- conflicting target rejection;
- strict malformed JSON rejection;
- event narrative-order drift rejection;
- unknown canonical FK rejection;
- global legacy PK collision rejection;
- proposal analysis-run provenance preservation;
- analysis-run PK collision rejection;
- existing same-scope analysis-run occupancy rejection;
- tenant isolation;
- source hash unchanged;
- committed six-file legacy inventory dry-run.

### Root Compose

PASS:
- production-path PostgreSQL/pgvector, MongoDB, AI service, backend and web started healthy;
- all six committed JSON files were dry-run through the production AI image runtime;
- synthetic cutover fixture dry-run returned `ready`;
- explicit synthetic apply returned `parity=true` and `source_unchanged=true`;
- second synthetic apply returned `applied=false, idempotent=true`;
- source file SHA-256 was unchanged;
- pgvector extension remained available;
- auth boundary returned 401/403/200 on expected probes.

## Acceptance

P8-01 is **ACCEPTED**. PR #5 was merged to `main` as `d639979f59b7867ee4863e886afb6065214b4f7d`.

No real committed/user JSON was automatically applied to PostgreSQL by CI. Real cutover remains an explicit operator action after review.
