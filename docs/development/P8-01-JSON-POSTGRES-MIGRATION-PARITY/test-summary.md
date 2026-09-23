# P8-01 Test Summary

Validated HEAD: `f6b97813b4d67820d4b7aecbc7b5367c0e61cbc3`

CI: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35844244069

## Results

- Full AI-service non-PostgreSQL regression: **PASS**
  - 176 passed
  - 2 skipped
  - 32 deselected
- Live PostgreSQL integration: **PASS**
  - 32 passed
  - 178 deselected
- Root Compose cutover smoke: **PASS**

## Cutover-specific checks

PASS:
- dry-run makes no source/target writes;
- strict JSON parsing fails closed;
- unknown canonical references fail before apply;
- event list/narrative-order disagreement fails before apply;
- global PK collisions fail before INSERT;
- conflicting non-empty target fails;
- apply is transaction-scoped;
- source SHA-256 unchanged;
- canonical snapshot parity after apply;
- projection rebuild parity;
- second apply is idempotent;
- tenant isolation;
- committed six-file legacy inventory is safe for dry-run.

CI applies only a synthetic fixture. Committed legacy files are dry-run only.
