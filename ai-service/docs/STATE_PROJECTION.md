# Phase 4 — Event sourcing and state projection

## Workflow

Revision analysis supports `options.extract_state_transitions: true` (default: `false`).
The state extractor creates pending `state_transition` proposals after each event proposal,
including relationship changes under `active_relationships`. No current state changes during
analysis. Accept the dependency group to materialize its events, participants and transitions.

Each transition references exactly one confirmed event or entity fact. Event transitions
must target a participant in that event. Entity references accept canonical IDs or an
unambiguous canonical name; persisted transitions contain canonical IDs. Author-locked
entities, facts and relationships reject conflicting changes. Entity facts accepted through
this workflow create initial transitions automatically.

The PostgreSQL adapter locks the Story Brain row and writes artifacts, decisions and
projections in one transaction with one brain-version increment. Any projection error rolls
back the entire acceptance. JSON uses an atomic file replacement; it remains a single-writer
compatibility adapter, not a concurrent worker store.

## API

The `{brain_id}` route parameter retains the existing API convention: supply the novel ID.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/story-brains/{brain_id}/state` | Read canonical attributes and per-attribute provenance |
| `POST /v1/story-brains/{brain_id}/projections/rebuild` | Rebuild at `expected_brain_version` |
| `POST /v1/story-brains/{brain_id}/events/{event_id}/corrections` | Create a pending correction group |

Correction request example:

```json
{
  "expected_brain_version": 2,
  "replacement": {
    "event_type": "injury",
    "summary": "Minh suffered a minor injury.",
    "participants": ["Minh"],
    "chapter": 1
  },
  "transitions": [
    {"entity_id": "Minh", "attribute_key": "health", "new_value": 95}
  ]
}
```

The response contains proposal IDs and a dependency group ID. Review them using the
existing group accept endpoint and `X-Request-Id`. A correction does not take effect until
accepted. Replacement transitions are the complete replacement for the original event's
effects; omitted attributes lose that event's contribution.

Corrections append a new event whose metadata contains `supersedes_id`. Original events and
transitions remain unchanged. Replay applies the latest correction at the original event's
position, followed by later events. Competing corrections to the same superseded event are
rejected; a subsequent correction must target its active replacement.

State response `data` contains:

- `entities`: canonical entity ID → attribute values.
- `provenance`: entity ID → attribute → transition ID and event/fact ID.
- `relationships`: relationship projections with transition provenance.
- `projection_version`: currently `1`.

Invalid provenance, duplicate event IDs, invalid health values or ambiguous corrections
return `422 INVALID_PROJECTION` on acceptance. Missing artifacts return `404`; stale brain
versions and author-lock conflicts return `409`. Rebuild does not advance `brain_version`.

## Migration and rebuild

From the `ai-service` directory, with the intended repository and database configured:

```powershell
python -m alembic upgrade head
python -m application.rebuild_projection NOVEL_ID --expected-brain-version 2
```

For JSON, optionally pass `--json-storage PATH`. The command emits the rebuilt state as
JSON and logs completion/failure, duration and entity count. PostgreSQL scoping uses the
configured `DEFAULT_TENANT_ID` and `DEFAULT_ACTOR_ID`.

Migration `0002_state_projection` adds `event_participants`, `state_transitions` and
`current_entity_states`. The foundation migration explicitly excludes these new tables,
allowing both clean installation and incremental upgrade. The MVP stores state attributes
and provenance in JSON columns; typed searchable state columns remain a later optimization.
Correction links remain in event metadata, validated within the scoped transaction.

Rebuild uses confirmed transitions, including initial-fact transitions, and never calls the
LLM. Repeating it produces the same state. Existing legacy snapshots without transitions
are not promoted into canonical state; reanalyze their immutable revisions and review the
resulting proposals to establish provenance. Legacy `/v1/ai/kb/confirm` remains a separate
compatibility workflow; Phase 4 guarantees apply to the revision/proposal API.

Before production rollout, take a restorable database backup. To roll back a disposable
test database, run `python -m alembic downgrade 0001_narrative_foundation`. This removes the
new tables, including confirmed transitions. For production rollback after accepting new
artifacts, restore the pre-upgrade backup and corresponding application version together;
the old application does not interpret event correction metadata.

## Validation and operational limits

- Shared contracts exercise memory, JSON reloads and the SQL adapter with SQLite foreign
  keys enabled: replay parity, retries, group rollback, initial facts, immutable corrections,
  relationships, locks and cross-novel references.
- SQL tests exercise tenant isolation; migration tests cover upgrade, downgrade and
  preservation of existing foundation rows. PostgreSQL offline SQL is also compiled.
- Live PostgreSQL transaction/concurrency validation passed on 2026-09-17 in the isolated
  `postgres-integration` Compose service: all 7 migration, rollback, isolation and concurrent
  acceptance/rebuild tests passed. The default unit suite deselects these tests; run the
  explicit Compose profile shown in the Phase 4 verification report.
- The existing HTTP service binds a configured tenant/actor. Repository isolation is tested,
  but this is not public multi-tenant authentication. Keep it behind the trusted internal
  deployment boundary until request authentication and author/novel authorization are wired.
- Replay is synchronous and scans the story's artifacts. Large-story job queues, incremental
  projector checkpoints and public metrics export remain operational follow-up work.
