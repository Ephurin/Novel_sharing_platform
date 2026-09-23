# P7-04 test summary

Authoritative final-head CI:

https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35832077913

```text
23 passed  semantic-memory + retriever + hybrid unit tests
 1 passed  frozen hybrid proxy regression
 6 passed  P7 embedding benchmark regressions
25 passed  Phase 6 temporal/writing regressions
10 passed  live PostgreSQL + pgvector integration
PASS       root Compose smoke
```

The live PostgreSQL suite verifies the existing P7-03 candidate safety plus temporally and tenant-scoped hybrid signal resolution. The root Compose path verifies `hybrid-v1` is actually composed in the running AI service.
