# P8-04 — Rollback Rehearsal + Cleanup Readiness

**Status:** IMPLEMENTED — CI/local evidence pending  
**Branch:** `astra/p8-04-rollback-cleanup-readiness`

## Scope

P8-04 proves rollback/recovery readiness without deleting any legacy data or code.

Implemented gates:

1. cleanup-readiness static guard and legacy inventory;
2. isolated PostgreSQL backup via `pg_dump --format=custom`;
3. restore into separate `p8_restore_verify` database;
4. Alembic revision parity;
5. pgvector extension/version parity;
6. canonical Story Brain snapshot parity;
7. source database unchanged proof;
8. P8-05 stays explicitly deferred.

## Safety

P8-04 does not:

- restore over a production database;
- truncate/drop the source rehearsal database;
- delete JSON;
- re-enable JSON writes;
- remove legacy routes/adapters;
- execute P8-05 cleanup.

## CI

`.github/workflows/p8-cutover.yml` includes a `rollback-rehearsal` job for the P8-04 branch.

The job uses ephemeral PostgreSQL/pgvector, seeds a synthetic canonical story, takes a custom-format backup, restores it to a separate DB, and compares canonical/migration/vector state.

## Local acceptance evidence

Gemini/Antigravity must repeat the rehearsal on latest `main` after merge using isolated Docker/database resources and commit evidence under:

```text
docs/development/P8-04-ROLLBACK-CLEANUP-READINESS/
  environment.txt
  cleanup-readiness.txt
  backup.txt
  restore.txt
  canonical-parity.txt
  migration-vector-parity.txt
  source-unchanged.txt
  regressions.txt
  compose-smoke.txt
```

P8-04 is not accepted until Supervisor reviews local evidence.
