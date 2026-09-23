# P8-01 Test Summary

**Status:** ACCEPTED — 2026-09-23  
**Merged PR:** #5  
**Merge commit:** `d639979f59b7867ee4863e886afb6065214b4f7d`  
**Validated PR head:** `792ac0676471b3b17fa7e75967b3c54aa93019d9`

Final CI:
- P8 push: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845116695
- P8 PR: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845120791
- P7 regression: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35845120781

## Results

- Full AI-service non-PostgreSQL regression: **PASS**
  - 176 passed
  - 2 skipped
  - 32 deselected
- Live PostgreSQL integration: **PASS**
  - 34 passed
  - 178 deselected
  - 5 warnings
- Root Compose cutover smoke: **PASS**
- P7 semantic-memory regression workflow: **PASS**

## Cutover-specific checks

PASS:
- dry-run makes no source/target writes;
- strict JSON parsing fails closed;
- unknown canonical references fail before apply;
- event list/narrative-order disagreement fails before apply;
- global PK collisions fail before INSERT;
- proposal analysis-run identity is preserved;
- analysis-run PK collisions fail before INSERT;
- existing same-scope analysis-run rows make the target non-empty/conflicting;
- conflicting non-empty target fails;
- apply is transaction-scoped;
- source SHA-256 unchanged;
- canonical snapshot parity after apply;
- projection rebuild parity;
- second apply is idempotent;
- tenant isolation;
- committed six-file legacy inventory is safe for dry-run.

CI applies only a synthetic fixture. Committed/user legacy files are dry-run only.
