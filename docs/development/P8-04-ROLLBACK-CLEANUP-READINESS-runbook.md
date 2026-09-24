# P8-04 — Rollback Rehearsal Runbook

## Status

IMPLEMENTED FOR REHEARSAL — acceptance evidence pending.

This runbook is for **isolated rehearsal only**. It must not overwrite a production database or delete legacy JSON.

## Objective

Prove that the accepted P8 cutover can be recovered from a PostgreSQL backup without relying on legacy JSON writes.

The rehearsal contract is:

```text
source PostgreSQL
  -> capture migration/vector/canonical snapshot
  -> pg_dump custom backup
  -> restore into isolated database
  -> compare migration state
  -> compare pgvector capability
  -> compare canonical Story Brain snapshot
  -> prove original source DB unchanged
```

## Production recovery policy

For production recovery after canonical writes have occurred:

1. stop or drain application writes;
2. identify the target application commit/image and matching database backup/PITR point;
3. restore PostgreSQL into a separate verification target first;
4. verify Alembic revision, pgvector extension, Story Brain canonical snapshot(s), tenant scope and service-auth path;
5. only after operator approval, promote/switch to the verified restored target;
6. deploy the corresponding application version together with the restored database state;
7. keep legacy JSON read-only; do not convert it back into the canonical production writer;
8. preserve audit logs and rollback evidence.

Do not run destructive Alembic downgrade against a production database containing newer accepted canonical artifacts unless an explicit operator-approved migration runbook says it is safe. The accepted baseline in `STATE_PROJECTION.md` remains: application version and database backup must be restored coherently.

## Local/Docker rehearsal

Use an isolated database/project name. Never point this flow at a user/prod database.

Required evidence:

- tested git commit;
- PostgreSQL/pgvector version;
- Alembic revision before backup and after restore;
- backup SHA-256;
- canonical snapshot before backup;
- canonical snapshot after restore;
- exact parity result;
- source database unchanged proof;
- commands and exit codes;
- timestamp.

## Cleanup-readiness interpretation

P8-04 does not authorize deletion.

`scripts/check_p8_cleanup_readiness.py` must:

- prove production canonical repository is PostgreSQL-only;
- prove legacy JSON is read-only in production;
- prove legacy direct writer routes remain deprecated/fail-closed;
- inventory remaining legacy code/routes/adapters;
- always report `p8_05_cleanup_allowed=false` until the post-release stability gate is explicitly accepted by the Supervisor.

The inventory is input to P8-05 planning, not permission to remove anything.

## Acceptance

P8-04 can be accepted only after:

- isolated backup/restore rehearsal passes locally with Docker/PostgreSQL;
- canonical snapshot parity passes;
- source DB is unchanged;
- P8-01/P8-02/P8-03 regressions remain green;
- cleanup-readiness guard passes;
- no user/prod data is modified;
- Supervisor reviews the committed evidence.
