# P8-01 — JSON → PostgreSQL Migration Parity Report

**Status:** Completed, awaiting Astra review  
**Branch:** `astra/p8-cutover`  
**Validated HEAD:** `f6b97813b4d67820d4b7aecbc7b5367c0e61cbc3`  
**CI run:** https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35844244069  
**Date:** 2026-09-23

## Scope

P8-01 adds a dry-run-first, one-way legacy StoryKB JSON → PostgreSQL cutover tool.

It does **not**:
- switch production repository configuration;
- make JSON read-only;
- delete JSON data;
- delete legacy adapters;
- start P8-02/P8-03 cleanup;
- automatically apply committed legacy JSON into PostgreSQL in CI.

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
- detects global PostgreSQL PK collisions before INSERT;
- refuses conflicting non-empty target stories;
- applies a story in one PostgreSQL transaction;
- checks source SHA-256 before/during/after apply;
- verifies post-apply canonical snapshot parity;
- supports idempotent reapply;
- keeps legacy-only/noncanonical fields archived in untouched source JSON and reports them as warnings.

## Canonical parity surface

Snapshot comparison covers:
- entities: identity, name/type, status/location/mentions, lock;
- aliases and mentions;
- facts + locks;
- explicit/locked relationships;
- events including deterministic narrative order;
- proposals including dependency group + materialization order;
- state transitions;
- current projection state + normalized provenance/relationships;
- Story Brain status/version/baseline metadata.

Projection rebuild is tested after migration to ensure the stored transition history reconstructs the migrated state.

## Safety findings

Committed legacy StoryKB inventory contains six files:

- `writing_session_550`
- `writing_session_599`
- `writing_session_968`
- `writing_session_492`
- `test2`
- `test_narrative_v2`

All six currently dry-run as:
- `action=ready`
- `safe_to_apply=true`
- no unsupported canonical rows
- no global ID collisions

Legacy-only fields and unresolved human-readable relation/event labels are reported as warnings, not silently promoted into canonical FK truth.

The four `data/writing_session_*.json` files are intentionally excluded from the production image by `ai-service/.dockerignore`. Compose CI therefore copies the committed checkout snapshot to a temporary container directory and executes the production migration runtime against that snapshot. The image-shipping policy is unchanged.

## Executed evidence

### Full AI-service regression

```text
176 passed, 2 skipped, 32 deselected
```

### Live PostgreSQL integration

```text
32 passed, 178 deselected
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
- global legacy primary-key collision rejection;
- tenant isolation;
- source hash unchanged;
- committed six-file legacy inventory dry-run.

### Root Compose

PASS:
- production-path PostgreSQL/pgvector, MongoDB, AI service, backend and web started healthy;
- all six committed JSON files were dry-run through the production AI image runtime;
- synthetic cutover fixture dry-run returned `ready`;
- explicit apply returned parity=true and source_unchanged=true;
- second apply returned `applied=false, idempotent=true`;
- source file SHA-256 was unchanged;
- pgvector extension remained available;
- auth boundary returned 401/403/200 on expected probes.

## Review conclusion

P8-01 acceptance criteria are satisfied by the implementation and CI evidence at the validated HEAD.

No real committed/user JSON was automatically applied to PostgreSQL by CI. Real cutover remains an explicit operator action after review/acceptance.
