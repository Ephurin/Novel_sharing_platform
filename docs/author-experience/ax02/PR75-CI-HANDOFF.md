# PR75 CI dependency handoff

2026-10-27, Asia/Saigon. AX-02 preparation only; frontend implementation is NOT_STARTED and depends on resolving backend CI.

- Draft PR: https://github.com/Ephurin/Novel_sharing_platform/pull/75
- Head: ed207b409aa903c950b03b9400a8a556bdb077e3
- Head tree: bfd76dd021bb2b76fb834c5da3e6f8d7131860aa
- Offline-reviewed source:47b194bb1b7783105827c08c27d42dfe7c984e54; source tree61e689aaef2787f859b7328e83a31c4e2fd69a30.
- Base: integration/p1-demo-20261109 at749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb.
- Current source working tree was clean and remains unchanged. All new preparation files are on this separate AX-02 branch.

## Final checks

P7 run https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40525096128

- unit: PASS
- pgvector-integration: FAIL, job122262386144
- root-compose-smoke: PASS

P8 run https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40525096067

- unit: PASS
- postgres-integration: FAIL, job122262387350
- rollback-rehearsal: PASS
- frontend-api-cutover: PASS
- backend-integration: PASS
- root-compose-cutover-smoke: PASS
- final-cleanup-gate: PASS

Total8 successful jobs,2 failures. Both workflows conclude failure. No manual rerun was used to hide the failure. Inherited CI exercises existing fake-provider P2/P3 compatibility fixtures; no P2/P3 code was added or developed.

## Shared failure

Both failures are test_semantic_memory_postgres_integration.py::test_migration_downgrade_reupgrade_preserves_canonical_data. It downgrades0014 to0006_fix_revision_provenance and then calls current PostgresNarrativeRepository.list_entities before re-upgrading. The ORM selects entities.author_profile even though0014 downgrade removed it: psycopg.errors.UndefinedColumn.

P7 step result:1 failed,10 passed. P8 PostgreSQL result:1 failed,186 passed,8 skipped,405 deselected.

Reproduction on unchanged PR HEAD, from ai-service with TEST_DATABASE_URL set to a fresh disposable PostgreSQL/pgvector16 database:

```powershell
python -m pytest tests/test_semantic_memory_postgres_integration.py::test_migration_downgrade_reupgrade_preserves_canonical_data -m postgres_integration -q --tb=short --basetemp=.pytest_tmp_pr75_repro
```

Exit1,1 failed with same UndefinedColumn. Task-owned container ephurin-ax01-pr75-ci used host port55441 and database pr75_repro. Post-failure raw SQL readback: Alembic version0006, fixture entity Persistent Canonical Entity still present, three profile columns absent. This establishes a rollback-schema/reader failure, not missing core entity data. No production data or real provider was used.

CI logs are linked by job/run IDs above. Local downloaded logs and reproduction log are retained outside the source checkout at the chat task's pr75-handoff directory. No original evidence, source, tests, schema or CI workflow was modified to make checks pass.

## Stop and review

Status: AX01_REMEDIATION_OFFLINE_ACCEPTED, but CI_BLOCKED. Keep Draft. GPT-6 should review rollback-reader/schema expectations and authorize a bounded resolution. Do not silently skip the test or weaken version/Canon checks. AX-02 remains preparation-only until backend readiness and coordinated integrated acceptance are established. Gemini mounted browser acceptance remains NOT_RUN. No merge/deploy/rebase/P2/P3 expansion.
