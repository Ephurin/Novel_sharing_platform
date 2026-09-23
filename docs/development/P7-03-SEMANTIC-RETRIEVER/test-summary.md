# P7-03 test summary

Authoritative run: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35829177503

Executed:

```text
pytest -q tests/test_semantic_memory_service.py tests/test_semantic_retriever.py
18 passed

pytest -q tests/test_p7_embedding_benchmark.py
6 passed

pytest -q tests/test_p65_r1_temporal.py tests/test_p65_r2_final.py tests/test_writing_validation_golden.py
25 passed, 5 warnings

pytest -o addopts= -q -m postgres_integration \
  tests/test_semantic_memory_postgres_integration.py \
  tests/test_semantic_retriever_postgres_integration.py
9 passed
```

The PostgreSQL log includes `expected 768 dimensions, not 2` because wrong-dimension rejection is an intentional assertion, not a test failure.
