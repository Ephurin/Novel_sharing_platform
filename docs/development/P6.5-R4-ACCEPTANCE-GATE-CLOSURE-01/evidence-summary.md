# P6.5-R4 Evidence Summary: Acceptance Gate Closure

**Batch ID**: `P6.5-R4-ACCEPTANCE-GATE-CLOSURE-01`  
**Execution Timestamp**: 2026-09-20T21:53:30+07:00  
**Status**: All 5 Blocker Criteria Verified & Green (Exit Code 0)  
**Evidence Directory**: `docs/development/P6.5-R4-ACCEPTANCE-GATE-CLOSURE-01/`

---

## 1. Summary of Execution Evidence

| Test Suite / Target | Log File | Plaintext File | Result | Key Invariant Verified |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL Integration** | `postgres-integration.log` | `postgres-integration.txt` | **12 / 12 Passed** (1.72s) | Static DDL decoupling in 0005, clean upgrade from legacy 0005 to head via 0006, `revision_id UUID NOT NULL`, `uq_rev_provenance_revision` enforced. |
| **Backend Integration & Concurrency** | `backend-integration.log` | `backend-integration.txt` | **22 / 22 Passed** + Typecheck OK | PostgreSQL outbox lease fencing: multi-worker concurrency with atomic `claim_token`, stale worker finalize affects 0 rows. |
| **Service-Auth Fail-Closed** | `service-auth.log` | `service-auth.txt` | **Passed** | Protected routes fail closed with HTTP 503 `SERVICE_AUTH_NOT_CONFIGURED` when token is unset/missing unless explicit `service_auth_disabled=True`. |
| **Docker Compose Config** | `compose-smoke.log` | `compose-smoke.txt` | **Validated OK** | Production compose topology syntax, environment parameters, and dependencies are clean. |
| **Frontend Build & Typecheck** | `frontend-build.log` | `frontend-build.txt` | **Built in 20.97s** + Typecheck OK | React/Vite/Mantine frontend builds clean bundle without TypeScript errors. |

---

## 2. Invariants Closed & Verified

1. **Migration Compatibility (Alembic 0005 / 0006)**:
   - `0005_revision_provenance.py` decoupled from mutable models, using static table definition.
   - `0006_fix_revision_provenance.py` upgrades legacy 0005 schema, backfills nulls, establishes `NOT NULL` and `uq_rev_provenance_revision`.
   - Verified on PostgreSQL via `test_migration_upgrade_from_legacy_0005_schema` and `test_alembic_head_schema_has_revision_id_not_null_and_unique_constraint`.

2. **Outbox Lease Fencing (PostgreSQL Migration 011)**:
   - Migration `011_outbox_claim_token.sql` applied to PostgreSQL.
   - `claimPendingOutboxEvents` sets atomic `claim_token = gen_random_uuid()`.
   - `markOutboxEventCompleted` and `markOutboxEventFailed` filter on `claim_token`.
   - Verified via `outbox.postgres.test.ts` where concurrent claims reject competing worker and stale worker updates affect 0 rows.

3. **Service-Auth Fail-Closed Boundary**:
   - `require_service_token` checks `platform_service_token`. If unset and `service_auth_disabled` is False, returns HTTP 503 `SERVICE_AUTH_NOT_CONFIGURED`.
   - Dev bypass strictly gated by explicit `service_auth_disabled=True`.
   - Verified via `test_p65_r4_service_auth_unset_fails_closed`.

4. **Temporal Missing-Provenance Fail-Closed**:
   - `RevisionAnalysisService.analyze` requires canonical `chapter_number` (either in revision or stored provenance). Raises `ValueError` if missing.
   - Narrative repositories reject event proposals lacking canonical chapter provenance during `accept_proposal_group`.
   - Event correction retains original event chapter.
   - Verified via `test_p65_r4_temporal_missing_provenance_fails_closed`.

5. **Tracked Evidence**:
   - `.gitignore` updated to track `!docs/development/**/*.log` and `!docs/development/**/*.txt`.
   - Real, concise `.log` and `.txt` execution artifacts persisted.
