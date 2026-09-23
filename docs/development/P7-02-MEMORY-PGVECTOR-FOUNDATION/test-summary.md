# P7-02 test summary

Authoritative CI run:

https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35825994127

## Unit

```text
pytest -q tests/test_semantic_memory_service.py
6 passed
```

Coverage includes invalid dimensions/zero norm, idempotent chunks, L2 persistence, retryable provider failure, parallel versions, stale hashes, version deletion, and inactive-source cleanup.

P7 benchmark invariants:

```text
pytest -q tests/test_p7_embedding_benchmark.py
6 passed
```

## Live PostgreSQL + pgvector

```text
pytest -o addopts= -q -m postgres_integration tests/test_semantic_memory_postgres_integration.py
5 passed in 1.20s
```

Coverage includes extension/schema, canonical source filtering, tenant/version isolation, wrong-dimension rejection, exact cosine ordering, and migration downgrade/re-upgrade.

## Root Compose

The production-path Compose job built and started PostgreSQL, MongoDB, AI service, backend and web. Health, pgvector type, and service-auth checks passed.
