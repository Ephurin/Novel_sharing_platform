# P8-05 — Final Cleanup Gate

**Status:** MERGED — DESTRUCTIVE CLEANUP BLOCKED  
**PR:** #9  
**Merge commit:** `160f2f4a1ac879dce528854cb49e6899a8d192c2`  
**Execution branch:** `main`

## Goal

Prepare the final legacy cleanup gate without deleting production data or runtime compatibility paths before the post-release stability window is explicitly accepted.

```text
P8-01 parity
  -> P8-02 canonical API cutover
  -> P8-03 production JSON read-only
  -> P8-04 rollback rehearsal
  -> P8-05 final cleanup gate
       -> BLOCKED until post-release stability evidence + Supervisor approval
       -> only then remove approved runtime legacy paths
```

## Current gate state

`docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json` is intentionally initialized as blocked.

Required to open the destructive cleanup gate:

- a concrete release identifier;
- completed observation window;
- evidence that production JSON writes remained zero;
- rollback path still retained;
- error budget reported `within_budget`;
- zero open rollback incidents;
- non-empty stability evidence references;
- explicit `supervisor_cleanup_gate_accepted=true`.

The assistant must never set the Supervisor acceptance field on its own.

## Cleanup classification

### Production runtime removal candidates after gate opens

- legacy `POST /v1/ai/kb/confirm`;
- legacy `POST /v1/ai/sync-story`;
- legacy `POST /v1/ai/suggest-next`;
- fail-closed `POST /v1/enhanced/process-interactions`;
- `get_story_kb` runtime dependency if no route still needs it;
- `app.state.story_kb` production composition after runtime references reach zero.

### Retain unless separately approved

- `StoryKBManager` as legacy archive/migration/test support;
- `JsonNarrativeRepository` repository contract/offline compatibility;
- `json_postgres_cutover.py`;
- `application.migrate_json_to_postgres`.

These are not production canonical writers under the accepted P8-03 boundary.

## Safety

P8-05 preparation must not:

- delete any JSON source files;
- drop/truncate PostgreSQL data;
- delete rollback backups;
- auto-mark the stability gate accepted;
- remove runtime compatibility paths while the gate is blocked.

## CI contract

- P8 cleanup-readiness guard stays green.
- `check_p8_final_cleanup_gate.py --expect-blocked` must pass.
- cleanup manifest must keep `destructive_cleanup_authorized=false`.
- P7/P8 regressions stay green.

## Next destructive slice

Only after the post-release stability gate is explicitly accepted should a follow-up cleanup commit:

1. switch CI from `--expect-blocked` to `--require-open`;
2. remove only the approved production runtime compatibility paths;
3. update schemas/tests/docs for removed routes;
4. retain offline migration/archive tooling unless separately approved;
5. run full P7/P8/PostgreSQL/Compose regression;
6. verify no user/prod data is deleted.


## Merge verification

Pre-merge CI on implementation head `166c3cc183bc65ce0c26504c5019b1abbeffc211`:

- P8 Cutover and Migration run #76: SUCCESS;
- final-cleanup-gate: SUCCESS;
- gate blocked-state assertion: SUCCESS;
- synthetic gate open/blocked state transition test: SUCCESS;
- cleanup manifest safety contract: SUCCESS;
- rollback rehearsal: SUCCESS;
- PostgreSQL integration: SUCCESS;
- frontend/API cutover: SUCCESS;
- root Compose cutover smoke: SUCCESS;
- P7 Semantic Memory Foundation run #84: SUCCESS.

This validates the gate mechanism. It does **not** supply post-release stability evidence and does not authorize destructive cleanup.
