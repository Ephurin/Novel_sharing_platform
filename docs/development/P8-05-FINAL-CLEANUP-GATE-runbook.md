# P8-05 — Final Cleanup Gate Runbook

## Purpose

This runbook controls whether destructive legacy runtime cleanup may begin.

Opening P8-05 is **not** equivalent to authorizing deletion. The destructive gate remains closed until stability evidence is complete and the Supervisor explicitly accepts it.

## Evaluate current gate

From repository root:

```bash
python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
```

The expected state before post-release stability acceptance is:

```text
status=BLOCKED
cleanup_allowed=false
```

## Stability evidence required

Update `docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json` only with real operational evidence.

Required fields:

- `release_identifier`
- `observation_window_started_at`
- `observation_window_ended_at`
- `observation_window_completed=true`
- `production_json_writes_zero=true`
- `rollback_path_retained=true`
- `error_budget_status="within_budget"`
- `open_rollback_incidents=0`
- non-empty `evidence[]`
- `supervisor_cleanup_gate_accepted=true`

The final Supervisor field must come from an explicit Supervisor decision. ChatGPT/Gemini must not infer or set it from test results.

## Open-gate verification

After explicit acceptance:

```bash
python scripts/check_p8_final_cleanup_gate.py --require-open
```

Only an exit code 0 from this command, together with the explicit Supervisor instruction, permits destructive runtime cleanup work to begin.

## What may be removed after the gate opens

Use `cleanup-manifest.json` as the baseline.

Primary runtime candidates:

- deprecated `/v1/ai/kb/confirm`;
- deprecated `/v1/ai/sync-story`;
- deprecated `/v1/ai/suggest-next`;
- fail-closed `/v1/enhanced/process-interactions`;
- route-only schemas/imports;
- `get_story_kb` and `app.state.story_kb` only after runtime dependency count reaches zero.

## What is retained

Do not delete by default:

- legacy JSON source files;
- `StoryKBManager`;
- `JsonNarrativeRepository`;
- JSON→PostgreSQL cutover/migration tooling;
- rollback backups;
- PostgreSQL canonical data.

These can support archive reading, recovery, migration replay and tests without being production canonical write paths.

## Post-cleanup verification

A destructive cleanup PR must prove:

- no browser/mobile direct FastAPI regression;
- canonical PostgreSQL APIs remain healthy;
- no production JSON write path exists;
- P7 semantic contract remains `VECTOR(768)`, exact cosine, no unapproved ANN;
- P8 migration tooling still reads legacy fixtures if retained;
- rollback backup remains usable;
- full AI-service + PostgreSQL integration + root Compose green;
- no user/prod data deleted.
