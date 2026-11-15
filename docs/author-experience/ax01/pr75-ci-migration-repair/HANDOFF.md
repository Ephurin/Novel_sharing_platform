# PR75 CI migration regression repair

2026-10-27, Asia/Saigon. Scope: one test correction, no production code/schema/workflow changes. PR75 stays Draft pending independent review.

## Provenance and exact diff

- Original PR HEAD: ed207b409aa903c950b03b9400a8a556bdb077e3.
- Repair/test source SHA: **c55749b6363e84ecaffb20a21dbd43455dd35deb**.
- Repair tree: **6009abbb14e21ef5fbcdefea9b25b99ed4c3c753**.
- Branch: codex/p1-ax01-storybrain-core -> integration/p1-demo-20261109.
- Only test source changed: ai-service/tests/test_semantic_memory_postgres_integration.py,44 additions/10 deletions. Exact patch: evidence/repair.patch; GitHub commit view https://github.com/Ephurin/Novel_sharing_platform/commit/c55749b6363e84ecaffb20a21dbd43455dd35deb.
- Source was unchanged throughout final full-suite execution; git diff against the source SHA for ai-service/backend/web was empty. Evidence follows as a separate documentation commit.

## Why the test failed / what changed

The existing regression downgrades0014->0006 and verifies Canon survives before re-upgrade. Its current-version ORM entity mapping includes0014 profile columns that correctly do not exist at0006. The failure is not proof of lost Canon rows or a defective production migration.

The test now captures a tenant/novel/entity-scoped snapshot of15 stable entity columns, including UUID/Brain ownership, name/type, description/static attributes, confirmation/source/lock and creation identity. At0006 it uses only version-compatible SQL and compares the complete snapshot exactly. It still verifies memory tables are absent and entities remain, additionally proving the profile columns/audit table are absent and Alembic is at0006.

After upgrade to head it verifies the same Canon snapshot again, restored memory/profile-audit tables, nonnullable profile columns and actual defaults ({}, empty private notes, version0). Then it compares current production repository entity readback to the original and checks current get_entity_profile identity/default DTO. No exception swallowing, conditional skip, xfail, shortened downgrade, historical schema alteration, or weakened CAS/HITL/provenance assertions.

Production migrations, ORM models, repositories, application/domain logic, backend/FE, P2/P3 source and CI workflows have zero diff for this repair. No live LLM call, merge, deploy or rebase.

## Commands and logs

Run from ai-service. TEST_DATABASE_URL points to a NEW disposable database pr75_repair in task-owned container ephurin-ax01-pr75-ci (PostgreSQL/pgvector16,127.0.0.1:55441). This is not a production/agent-shared database.

1. Before editing, on original HEAD:

```powershell
python -m pytest tests/test_semantic_memory_postgres_integration.py::test_migration_downgrade_reupgrade_preserves_canonical_data -m postgres_integration -q --tb=short --basetemp=.pytest_tmp_pr75_repair
```

**Exit1:1 failed**, UndefinedColumn entities.author_profile after downgrade. Log evidence/red.txt; failure is deliberately preserved.

2. Same focused command after correction: **exit0:1 passed**. Log evidence/focused-green.txt.

3. Set AX01_TEST_DATABASE_URL to that same isolated DB as well, then:

```powershell
python -m pytest -m postgres_integration -q --tb=short --basetemp=.pytest_tmp_pr75_full_pg
```

**Exit0:194 passed,1 skipped,405 deselected,5 inherited warnings**. Log evidence/postgres-green.txt. This includes the relevant P7/P8 PostgreSQL tests and existing AX-01/P1/CAS/HITL/provenance tests. The unrelated additive-upgrade test requires a separate AX01_MIGRATION_DATABASE_URL and retains its existing skip; the repaired regression is RUN/PASS. AX01_TEST_DATABASE_URL enables7 remediation cases that default CI otherwise skips without that fixture URL. Full suite used the exact bytes committed as c55749b; no further source edits were made.

4. Readback via raw PostgreSQL (exit0): Alembic0014; all3 retained Persistent Canonical Entity fixtures from red/green executions exist, have author_profile={}, empty private notes and profile_version0. evidence/readback.json records booleans rather than private contents. Each green test independently compares the exact scoped UUID and15-column data snapshot at each lifecycle phase.

5. Source-only git diff --check and zero production-path diff: exit0. Raw logs are retained verbatim, including upstream warning whitespace. Generated test temp files were removed only after checking their absolute task-owned path.

## GitHub verification / handoff

Push repair and evidence to update Draft PR https://github.com/Ephurin/Novel_sharing_platform/pull/75. P7/P8 pull_request workflows will run on the final pushed HEAD. Their final run URLs, job conclusions and any failure reproduction are posted in the PR handoff comment after execution; local results above are not substituted for GitHub success.

Historical failed runs remain unchanged: P7 https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40525096128 and P8 https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40525096067. Do not relabel those runs PASS or skip the regression to obtain green checks.

Acceptance remains offline/CI only; production and independent review are separate gates. Stop at handoff with PR still Draft.
