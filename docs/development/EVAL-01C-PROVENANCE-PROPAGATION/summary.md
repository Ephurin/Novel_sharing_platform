# EVAL-01C-PROV Provenance Propagation — Verification Summary

- **Implementation Slice:** `EVAL-01C-PROV` (PR #13)
- **Merge Commit:** `ce51efef225d7a45ef89e6b54c66a74f07fe4eb2`
- **Tested Commit:** `96cbf962d3cb7cb740d7c2a41d063717fc8cf552`
- **Evaluation Mode:** Live PostgreSQL 16 + pgvector 0.8.6 verification on disposable database `novel_platform_test`
- **Evidence Files:**
  - Environment: [`environment.txt`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01C-PROVENANCE-PROPAGATION/environment.txt)
  - Test Log: [`tests.txt`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01C-PROVENANCE-PROPAGATION/tests.txt)
  - Smoke Verification: [`provenance-smoke.json`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01C-PROVENANCE-PROPAGATION/provenance-smoke.json)
  - Summary: [`summary.md`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01C-PROVENANCE-PROPAGATION/summary.md)

---

## 1. Preflight Guards

| Guard Script | Expected Status | Measured Status | Details |
|---|:---:|:---:|---|
| `scripts/check_p8_cleanup_readiness.py` | `PASS` | **PASS** | PostgreSQL-only write boundary confirmed; JSON repository mode is `read-only`. |
| `scripts/check_p8_final_cleanup_gate.py` | `BLOCKED` | **BLOCKED** | Gate remains correctly blocked pending release stability; cleanup disallowed. |
| `scripts/check_eval01_fixture_contract.py` | `PASS` | **PASS** | 40 frozen queries (21 core, 19 challenge, 10 VI); 216 canonical and 232 audit memories intact. |

---

## 2. PostgreSQL Integration Test Results

Executed `pytest -v -m postgres_integration ai-service/tests/test_semantic_memory_postgres_integration.py` against live PostgreSQL 16 + pgvector 0.8.6:

```text
ai-service/tests/test_semantic_memory_postgres_integration.py::test_pgvector_extension_schema_and_dimension_are_live PASSED [ 16%]
ai-service/tests/test_semantic_memory_postgres_integration.py::test_event_sources_filter_unconfirmed_and_superseded_rows PASSED [ 33%]
ai-service/tests/test_semantic_memory_postgres_integration.py::test_event_provenance_metadata_survives_to_writing_payload PASSED [ 50%]
ai-service/tests/test_semantic_memory_postgres_integration.py::test_materialization_keeps_parallel_versions_and_tenant_isolation PASSED [ 66%]
ai-service/tests/test_semantic_memory_postgres_integration.py::test_wrong_dimension_rejected_and_exact_cosine_ordering_works PASSED [ 83%]
ai-service/tests/test_semantic_memory_postgres_integration.py::test_migration_downgrade_reupgrade_preserves_canonical_data PASSED [100%]
============================== 6 passed in 1.48s ==============================
```

All 6 tests passed with zero regressions.

---

## 3. Provenance Smoke Verification Details

The local smoke test executed end-to-end event seeding, materialization, metadata updates, vector search, and context payload projection:

| Verification Item | Status | Evidence / Value |
|---|:---:|---|
| **tags propagation** | **PASS** | `["narrative_echo", "temporal_reset", "updated_provenance_marker"]` survives from `EventRecord.event_metadata` into `WritingService._semantic_match_payload()["metadata"]["tags"]`. |
| **review_status propagation** | **PASS** | `"needs_human_review"` / `"ambiguous"` survives through materializer and search to payload. |
| **status propagation** | **PASS** | `"canonical"` survives to payload. |
| **chapter_title propagation** | **PASS** | `"Echoed Sword Forging"` survives to payload. |
| **memory_id propagation** | **PASS** | `"mem-prov-smoke-001"` survives to payload. |
| **importance_score propagation** | **PASS** | `0.85` survives to payload. |
| **supersedes_id propagation** | **PASS** | `"mem-origin-000"` survives to payload. |
| **source_type propagation** | **PASS** | `EventRecord.source_type` (`"legacy"` / `"canonical"`) survives to payload. |
| **confirmation_status propagation** | **PASS** | `"confirmed"` survives to payload. |
| **unallowlisted metadata** | **ABSENT** | Arbitrary debug/internal keys (`"unallowlisted_debug_blob"`, `"internal_trace_id"`) are strictly stripped at `list_event_memory_sources()` and do not enter semantic memory. |
| **embedding reuse on metadata update** | **PASS** | When event metadata was updated with content unchanged, materialization logged `embedded_count = 0`, `reused_embedding_count = 1`. Embedding vector and ID were unchanged in `narrative.memory_embeddings`. |
| **temporal cutoff invariance** | **PASS** | SQL `WHERE EventRecord.chapter_number <= cutoff` is unchanged. A search at cutoff 30 correctly excludes chapter 32 events. |
| **hybrid ranking contract** | **UNCHANGED** | Provenance metadata is descriptive only. Hybrid scoring weights (0.75 semantic, 0.03 entity, 0.08 temporal, 0.10 importance, 0.04 relationship) and ranks are completely unaffected. |

---

## 4. Invariant Verification

- **Production ranking weights:** Unchanged.
- **Embedding model & dimension:** Unchanged (`gemini-embedding-2`, 768 dimensions, explicit L2).
- **Temporal cutoff mechanism:** Unchanged (pre-ranking SQL cutoff).
- **Database schema:** Unchanged (no Alembic migrations required; uses existing JSONB metadata column).
- **Frozen gold labels:** Unchanged.
- **P8-05 cleanup gate:** Unchanged (`BLOCKED`).
