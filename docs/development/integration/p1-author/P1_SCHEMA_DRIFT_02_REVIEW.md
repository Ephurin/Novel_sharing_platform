# P1-SCHEMA-DRIFT-02 — Entity profile audit timestamp contract repair

Date: 2026-10-28 (Asia/Saigon).

**Verdict: P1_SCHEMA_DRIFT_02_READY_FOR_REVIEW**

## Locked source and scope

Base/integration HEAD verified before coding: `993493704308b53332ab2cd404097a5d6736c531`. Branch: `codex/p1-schema-drift-02`.

Tested source: `bee3702ad1c600f66fc0ddb2724e16a9d8ec626e`; tested tree: `6064e288179ac5e84e30f6f3bdd78c6cc8dd8001`. Evidence is a separate later commit. No main/integration push, merge or deployment.

Source changes: new0016 migration, focused audit migration tests, and one test-target correction in the existing0015 test. The0015 fresh scenario now explicitly upgrades to its own0015 constant rather than future head while asserting0015; its version assertion is retained, and the new fresh scenario covers0016. Historical0014/0015 migration files, ORM, repository, Gateway, frontend and writing service are unchanged; blob IDs and worktree SHA256 values are in source-hashes.json.

## Root cause and supported contract

Read0014/0015, ORM, prior drift review and actual repository implementation before coding. `python -m alembic heads` from ai-service confirmed `0015_provenance_timestamp`.

Migration0014's audit created_at omits nullable=False. EntityProfileAuditRecord.created_at is Mapped[datetime], so ORM nullability is False.0001 imports current ORM metadata; a fresh path can pre-create a non-null audit table and mask0014's contract. Reproduction therefore used real Alembic `empty→0015→0013→0015`, recreating this table through0014. Phase A readback: nullable=YES, default=now(), total audit rows=0, NULL rows=0, on the new isolated DB only.

`update_entity_profile()` atomically inserts EntityProfileAuditRecord with tenant/novel/entity/actor, request key, input hash and before/after DTOs. It omits created_at, relying on the server default. The idempotency read path looks up actor-scoped request keys and returns the durable after snapshot; timestamps are neither cleared nor accepted as author patch fields. No supported NULL audit timestamp write or compatibility requirement was found. No semantic changes to these paths are included.

## Revision0016 and transaction behavior

File: `ai-service/migrations/versions/0016_entity_profile_audit_created_at_not_null.py`.

- Revision ID: `0016_entity_profile_audit_timestamp`.
- Down revision: `0015_provenance_timestamp`.
- Online connection required; offline SQL generation is explicitly rejected.
- PostgreSQL ACCESS EXCLUSIVE lock holds across NULL count and ALTER, preventing a concurrent NULL insertion between them.
- Existing NULLs raise `DATA_REPAIR_DECISION_REQUIRED: entity_profile_audits.created_at contains N NULL row(s); no timestamps or audits modified`. No invented timestamp, deletion or repair is attempted.
- A nullable audit timestamp becomes NOT NULL. An already non-null column remains unchanged. Timestamp defaults, all audit fields/snapshots, indexes and other constraints remain untouched.

**Necessary Alembic metadata compatibility:** the requested revision ID is35 characters; Alembic initializes version_num as VARCHAR(32). After successful NULL validation, the same transactional revision conditionally widens only that metadata field to VARCHAR(35), enabling the requested head to be recorded. Otherwise every PostgreSQL upgrade would fail when Alembic writes this exact ID. NULL-data failure leaves metadata at32 and the old head intact. No historical revision is edited or ID silently shortened. Migration permissions must allow this metadata ALTER as well as the audit-table ALTER.

Downgrade only relaxes the audit timestamp NOT NULL constraint. Data, defaults, indexes, request uniqueness, entity FK and provenance timestamp protection remain intact. Widened Alembic metadata stays35: the current35-character head is still stored while downgrade() runs, and shrinking it then would fail; old IDs remain compatible. Re-upgrade repeats the NULL guard. No backfill can be undone because none is performed.

## Regression matrix — actual PostgreSQL revisions

Each test uses an owned disposable DB. Existing-schema scenarios recreate the audit table through actual0014 rather than only Base.metadata.create_all(). Six new cases plus five existing provenance migration cases passed.

| Scenario | Assertions | Result |
| --- | --- | --- |
| A Fresh install→0016 | Both timestamp columns non-null; both now() defaults intact; ORM tables/columns present and nullabilities match; requested35-character head persists | PASS |
| B Existing0015→0016 | Two real repository audit rows preserved exactly by IDs, tenant/novel/entity/actor, keys/input hashes, exact timestamps and hashes of both snapshots; constraints/indexes unchanged; new default timestamp and same-key retry work | PASS |
| C Existing NULL audits | Two injected NULLs cause explicit count2 error; rows/hashes/constraints unchanged; nullable remains true; Alembic remains0015; version metadata remains32; no partial state | PASS (expected fail-closed) |
| D0016→0015→0016 | Only audit nullability relaxes/restores; all rows/defaults/constraints/indexes unchanged; provenance stays non-null; metadata width stays35 | PASS |
| E Already NOT NULL | Real0015 table manually initialized non-null before upgrade; rows/default/constraints preserved; new head recorded | PASS |
| Offline SQL mode | Explicit online-validation error before migration actions | PASS |

A separate real upgrade of the owned base DB preserved two realistic audit records. audit-preservation.json contains public metadata and snapshot SHA256 values only; no raw snapshots. Equality compares every audit column with before/after represented by canonical JSON hashes. Later legacy Canon rollback regression intentionally drops0014's audit table inside the disposable DB, as that historical test is designed to do; this is not0016 data loss. A subsequent repository save/readback/retry smoke produced two new audits with non-null timestamps, unchanged same-key retry and private readback hash only. This is not a timestamp backfill.

## Focused functional regression and commands

Exact commands/cwd/source hashes/exits: [evidence/schema-drift-02/commands.json](evidence/schema-drift-02/commands.json). All commands below ran from ai-service at the tested source, against project-owned PostgreSQL/pgvector. Logs are adjacent. Private connection configuration remains outside the checkout. LLM/embedding settings use fakes; the final provider call is captured in-process.

| Command | Exit/results |
| --- | --- |
| `python -m pytest -o addopts= -q -ra tests/test_entity_profile_audit_timestamp_migration.py tests/test_revision_provenance_timestamp_migration.py` |0;11 passed |
| `python -m alembic upgrade head` |0; owned existing DB0015→0016, exact audit preservation readback |
| `python -m pytest -o addopts= -q -ra tests/test_entity_profiles.py tests/test_entity_profile_remediation.py` |0;49 passed,1 expected SQLite row-lock skip; PostgreSQL locking and separate AX01 migration DB enabled |
| `python -m pytest -o addopts= -q -ra tests/test_semantic_memory_postgres_integration.py -k migration_downgrade_reupgrade_preserves_canonical_data` |0;1 passed,5 deselected |

Focused regressions cover tenant/author scope, profile version increments, audit actor/timestamps and before/after content, idempotent retry, CAS conflicts and private-note exclusion from generation. Fake-generation ledger contains15 captures:13 completed job captures match provider-bound context to persisted writing-job context hashes and2 budget overflow cases stop before transport. Per-capture transport counts can overlap and are not summed as a total. No live calls. The full eight-scenario browser suite was NOT_RUN because no application behavior beyond the constraint changed.

Diagnostics: `docker compose` plugin was unavailable (exit125); the installed standalone `docker-compose` provisioned the new project successfully, before any migration. An initial Alembic heads invocation from the repository root used the wrong script-location cwd; running it from ai-service confirmed0015. No SQL migration error was hidden. Automatic approval review rejected an extra audit-row export due possible private snapshot exposure; the replacement exports only explicitly allowlisted scalar counts/booleans/hashes. All committed audit-preservation rows are independently checked to contain only public metadata and snapshot hashes.

## Live schema verification — explicitly separated scopes

Readback after0016 and the final repository smoke:

1. **Existence:** all22 narrative ORM tables and291 mapped columns checked; none missing. Extra unmodeled objects/types are not asserted globally equivalent.
2. **Nullability:** all291 mapped column nullabilities compared with live PostgreSQL; zero mismatches found. Both target timestamp columns are non-null.
3. **Defaults:** only the two timestamp defaults were semantically checked: ORM func.now() vs PostgreSQL now(), both preserved. No global default equivalence claim.
4. **Constraints/indexes:** audit PK(id), entity_id→entities.id FK with CASCADE, tenant/novel/actor/request-key uniqueness and reflected audit indexes checked; before/after objects preserved in upgrade/downgrade/already-initialized tests. No global index/constraint equivalence claim.
5. **Alembic metadata:** head is the exact requested0016 ID; version width35. Final isolated audit count2, NULL count0. Production was not examined and its NULL count is unknown.

No additional mismatch was found within these checked scopes. Schema readback is in schema-readback.json. This is not a blanket claim of all-schema equivalence.

## Evidence, recovery and remaining risks

[evidence/schema-drift-02](evidence/schema-drift-02) includes source hashes, Phase A, exact-source logs, safe audit projections/hash equality, schema readbacks, allowlisted fake-generation ledger and cleanup. No credentials, private snapshots/notes, raw prompts or browser traces are committed. Secret hygiene verifies the new evidence/report, including negative scanner self-tests.

The new owned Compose project was stopped with `docker-compose -p <owned-project> -f <private-file> down`; only its containers/network were removed, volumes retained privately for authorized review. Shared/production resources were untouched.

Before any deployment, authorized operators must count NULLs read-only. NULL rows require a separate evidence-backed repair decision; source revision/chapter times are not automatically trustworthy audit insertion timestamps. No recovery timestamps were inferred. ACCESS EXCLUSIVE locking and full NULL scan can block/wait; use a maintenance window and deployment-level lock timeout/monitoring, not a bypass of validation. CREATE DATABASE permission is needed for disposable test fixtures. SQLite migration behavior is not separately certified by these PostgreSQL tests.

If rollback is approved, downgrade only to0015; audit data/defaults remain, but the permissive column temporarily diverges from ORM, so it must not become a normal operating mode. Do not downgrade0014 on real audit data: its historical downgrade drops audits/profile fields. Keep Alembic metadata widened. Re-upgrade after any newly introduced NULLs must fail closed again.

Keep Draft; stop for independent review. No merge, deployment, main change or direct integration push.
