# P1-SCHEMA-DRIFT-01 — Revision provenance timestamp contract repair

Date: 2026-10-28 (Asia/Saigon).

**Verdict: P1_SCHEMA_DRIFT_FIX_READY_FOR_REVIEW** — narrowly scoped to revision_provenances.created_at. This is not a statement that every migration contract is drift-free or that production data has been inspected.

## Exact source and independent verification

- Locked integration/base: `9646b147eca1aacb9a12db00ee11e99923c71e97`.
- Source/test commit: `5bd448012f7b16399d82abc94faec2f545895aa2`.
- Tested source tree: `0bf657a4705ea1fbe99b43ee02334fc2b083bcef`.
- Branch: `codex/p1-schema-drift-01`; evidence is committed separately after source/tests. Integration/main were not updated.
- Before coding, `python -m alembic heads` reported only `0014_entity_profiles`. A new task-owned PostgreSQL/pgvector container applied that existing chain successfully.
- Phase A read-only information_schema query returned `YES`, `timestamp with time zone`, `now()`. The isolated fresh DB had total_rows=0, null_rows=0. This reproduces structural drift, not evidence that production has zero invalid rows.

Historical `0005_revision_provenance.py:27` declares the PostgreSQL timestamp without NOT NULL; its SQLite branch also omits an explicit non-null constraint. `RevisionProvenanceRecord.created_at` uses Mapped[datetime] (non-null inference) and server_default=func.now(). Only historical0006 subsequently touches this table: it repairs revision_id/identity constraints, not created_at. No later existing revision repairs this column.

`PostgresNarrativeRepository.record_revision_provenance()` omits created_at on insert, relying on its database default; repeat recording only updates chapter identity/number and preserves the timestamp. get_revision_provenance() returns it; list/query paths and the semantic repository consume the same typed record. Repository/application searches found no supported explicit NULL creation path or compatibility requirement for NULL timestamps. Existing raw SQL permissiveness is the inherited schema mismatch, not a supported nullable application contract. No ORM/application semantics were changed.

## New revision and safety

File: `ai-service/migrations/versions/0015_revision_provenance_created_at_not_null.py`.

Revision ID: `0015_provenance_timestamp`; parent: `0014_entity_profiles`. This is a new forward revision, not a rewrite of historical migrations.

Online upgrade acquires the PostgreSQL ACCESS EXCLUSIVE table lock inside Alembic's transactional DDL boundary, counts NULL timestamps, and only then sets NOT NULL. The lock prevents a concurrent NULL write between validation and ALTER. If NULLs exist, it raises `DATA_REPAIR_DECISION_REQUIRED: revision_provenances.created_at contains N NULL row(s); no timestamps or rows modified`. The transaction does not advance Alembic or partially constrain the table. Default now(), row identity/content and all timestamps remain unchanged. Offline upgrade is rejected because the safety query must run online. The SQLite batch path is provided but was not separately migration-tested; PostgreSQL is the acceptance target.

No trustworthy repair timestamp can be inferred merely from revision/chapter creation time: those identify source material, not necessarily the original provenance insertion time. This migration never fabricates a timestamp, deletes a record, or treats now() as historical recovery. A deployment with NULL rows must stop for a separately reviewed deterministic repair backed by an authoritative source.

Downgrade to0014 only drops NOT NULL on this column. It preserves rows, timestamp values, default, indexes and unrelated constraints; it does not undo data repair. Re-upgrade checks NULLs again. This reversibility is explicitly tested and is not permission to downgrade profile/audit migrations.

## PostgreSQL scenario results

Each new migration case creates its own UUID-named disposable DB, applies real migrations and drops only that owned DB after the case. Five cases passed at the exact source above.

| Case | Readback/assertions | Result |
| --- | --- | --- |
| Fresh empty DB → head | Head0015; created_at nullable=False; now() default; every ORM table/column exists and fresh-chain nullability matches ORM | PASS |
|0014 with two valid historical fixture rows →0015 | Full row snapshots, count2 and exact microsecond timestamps unchanged; default unchanged; omitted timestamp on a new repository insert is non-null; explicit NULL write rejected transactionally | PASS |
|0014 with two explicit NULL rows → upgrade attempt | Expected error contains affected count2; both rows remain NULL and unchanged; column stays nullable; Alembic remains0014 | PASS (expected fail-closed migration) |
|0015 →0014 →0015 | All rows/timestamps/default and unique constraints preserved; only nullability relaxed/restored | PASS |
| Production repository write/query/repeat | Default timestamp exists; repeated revision updates chapter_number without duplicate row or timestamp change | PASS |

Known historical fixture instant used by the test: 2020-02-03T04:05:06.123456Z; it is inserted before upgrade as test data, never a migration backfill.

Final isolated base DB readback: head0015, column `NO / timestamp with time zone / now()`, total provenance rows=1, NULL rows=0. All ORM tables/columns exist. Backend ledger contains all18 SQL files through017. See phase-a.json and final-readback.json. Production and shared databases were not queried.

## Focused smoke and exact commands

All commands ran against the new task-owned PostgreSQL container, not the previous integration stack. Private connection config is outside the checkout; no credentials or raw prompts/notes are published. DATABASE_URL/TEST_DATABASE_URL/AX01_TEST_DATABASE_URL target the owned DB. LLM_PROVIDER and EMBEDDING_PROVIDER are fake; writing tests override the final transport in-process. Backend migrations use existing dependency packages via a local node_modules junction. No Gateway/React/runtime source change was needed.

Exact subprocess arguments, cwd, source SHA/tree and exit codes: [evidence/schema-drift-01/commands.json](evidence/schema-drift-01/commands.json). Logs are adjacent. Commands below run from ai-service except backend db:migrate.

| Command | Exit/result |
| --- | --- |
| `python -m pytest -o addopts= -q -ra tests/test_revision_provenance_timestamp_migration.py` |0;5 passed |
| `npm.cmd run db:migrate` (backend) |0;18 migrations applied |
| `python -m alembic upgrade head` |0;0014→0015 |
| `python -m pytest -o addopts= -q -ra tests/test_postgres_integration.py -k "revision_provenance_lifecycle or migration_upgrade_from_legacy_0005_schema"` |0;2 passed,11 deselected |
| `python -m pytest -o addopts= -q -ra tests/test_semantic_memory_postgres_integration.py -k "migration_downgrade_reupgrade_preserves_canonical_data or event_provenance_metadata_survives_to_writing_payload"` |0;2 passed,4 deselected |
| `python -m pytest -o addopts= -q -ra tests/test_entity_profiles.py tests/test_entity_profile_remediation.py` |0;48 passed,2 skipped |
| `python -m pytest -o addopts= -q -ra tests/test_entity_profiles.py -k test_additive_upgrade_and_rollback_preserve_existing_identity` with separate AX01_MIGRATION_DATABASE_URL |0;1 passed,29 deselected; explicitly resolves prior missing-env migration skip |
| `python -m pytest -o addopts= -q -ra tests/test_entity_profile_remediation.py -k test_h01_generation_without_character_or_events` |0;3 passed,17 deselected; fake-generation readbacks |

The remaining skip is the existing SQLite row-lock case; its PostgreSQL parametrization runs. Tests cover author profile save/reload, durable audit, CAS/HITL/provenance assertions and generation context. Three captured minimal production WritingService generation cases completed; provider-bound context hashes equal persisted writing job hashes, approved profiles included and private notes excluded. See fake-generation-ledger.json (allowlisted hashes/counts only). Other remediation tests also use fake final transport; no live calls occurred. The full eight-scenario browser acceptance suite was intentionally NOT_RUN because this repair changes only a constraint.

Diagnostic attempts are retained honestly: initial final-readback asserted all ORM nullabilities and failed on the unrelated audit field below; it did not expose a failure of the provenance repair. Earlier Phase A shell searches used an incorrect relative search path once (no data mutation). All recorded migration/test subprocesses above exited0; no SQL migration failure was suppressed.

## Remaining risks and review decisions

1. **Additional inherited mismatch, outside this fix:** after existing rollback/re-upgrade regression, migration0014 creates `narrative.entity_profile_audits.created_at` nullable, while its ORM field is non-null. A fresh-chain path can mask this because0001 creates tables from current ORM metadata; the real0014 upgrade path reveals it. This was not repaired or hidden. final-readback.json records the difference. A separate reviewed contract repair is needed before claiming all-schema drift-free integration acceptance.
2. Real deployed NULL counts are unknown. Authorized operators must perform the two read-only preflight queries from the task before applying this migration to any non-disposable database. NULLs require an authoritative data-repair decision; no arbitrary timestamp assignment is approved.
3. ACCESS EXCLUSIVE locking may wait/block readers and writers. Schedule a maintenance window and use deployment-level lock timeout/monitoring; do not bypass the NULL guard to reduce lock time. No live concurrency load/performance claim is made.
4. Migration tests require CREATE DATABASE permission on a disposable PostgreSQL server. They isolate each scenario and do not mutate shared or production DBs.
5. A downgrade restores the permissive historical schema and therefore temporarily diverges from ORM. Do not use it as a normal operating mode; do not downgrade0014, which can lose profile/audit data. A repair decision remains necessary if new NULLs are introduced while relaxed.

The task-owned container is stopped, with private configuration and data retained locally for authorized review; no shared resources were touched. No main/integration push, merge or deploy. Stop for GPT-6 independent review.
