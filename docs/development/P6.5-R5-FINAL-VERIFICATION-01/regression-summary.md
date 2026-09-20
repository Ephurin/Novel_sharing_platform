# P6.5-R5 Final Regression Summary

**Batch ID**: `P6.5-R5-FINAL-VERIFICATION-01`  
**Execution Timestamp**: 2026-09-20T22:44:50+07:00  
**Status**: All Gates Closed & Verified Green (Exit Code 0)  
**Evidence Directory**: `docs/development/P6.5-R5-FINAL-VERIFICATION-01/`

---

## 1. Verified Evidence Matrix

| Evidence Artifact | Target Verified | Result / Output | Key Invariant / Semantic Guarantee |
| :--- | :--- | :--- | :--- |
| `migration-semantic.txt` | Alembic 0006 Semantic Upgrade | **Passed** (1.94s) | Refuses random UUID fabrication on legacy 0005 rows (actionable fail-closed); controlled policy `MIGRATION_CLEAR_UNMAPPED_PROVENANCE=true` clears unmapped rows; controlled rebuild proves exact revision lookup preserves original `chapter_number`. |
| `compose-live-smoke.txt` | Live System Readiness & AI Direct Probes | **Passed** | Live processes verified against native PostgreSQL 18 (5432) and MongoDB 7 (27017). `/health` (200), unauthenticated protected route (401), invalid token (403), valid service token (200). Verified active `PostgresNarrativeRepository`. |
| `gateway-auth-smoke.txt` | Node Gateway -> AI Service Integration | **Passed** | Live author registration, novel creation, chapter creation. Node Gateway verifies novel ownership, injects `PLATFORM_SERVICE_TOKEN`, derives canonical chapter cutoff from DB, and AI Service accepts request. |
| `mongo-reconciliation.txt` | Live MongoDB Draft Reconciliation Probe | **Passed** (3/3) | Live MongoDB on port 27017: (1) older draft is cleanly updated; (2) newer manual draft is NOT overwritten by delayed sync; (3) no-draft recovery creates document with non-empty `novelId` and `authorId`. |

---

## 2. Regression Suites

- **ai-service**: 134 passed, 2 skipped, 12 deselected (6.43s) — 100% green.
- **backend**: 25 passed (5 suites, 0 failures, 696ms) — 100% green; `npm run typecheck` 0 errors.
- **web**: `npm run typecheck` passed (0 errors); `npm run build` completed in 13.92s.
- **Scope Compliance**: Strictly 0% Phase 7 features. All changes remain local and unstaged.
