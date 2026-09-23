# P7-05 test summary

Authoritative code-head CI:

https://github.com/Ephurin/Novel_sharing_platform/actions/runs/35834820452

```text
35 passed  semantic-memory/retriever/hybrid/context-budget selective suite
 1 passed  hybrid frozen proxy regression
 6 passed  embedding benchmark regression
25 passed  Phase 6 temporal/writing regression
176 passed full AI-service non-PostgreSQL regression
 2 skipped
22 deselected by pytest PostgreSQL marker/config
10 passed  live PostgreSQL + pgvector integration
PASS       root Compose production path
```

Context-budget tests cover protected overflow, entity/state atomicity, hybrid-order preservation, semantic/recent dedup, newest-event priority, oversized optional skip, deterministic trace, repository single-budget-owner boundary, exact packed LLM input, and canonical serialization parity with the real LLMService.
