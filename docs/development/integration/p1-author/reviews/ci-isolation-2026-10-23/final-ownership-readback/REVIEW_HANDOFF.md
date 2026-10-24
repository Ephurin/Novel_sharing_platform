# Review Handoff: PR #58 Final Cleanup Correctness Gate (F-09, F-10)

**Date:** 2026-10-23
**Repository:** `Ephurin/Novel_sharing_platform`
**Branch:** `gemini/p1-ci-isolation`
**Target Branch:** `integration/p1-author`
**Pull Request:** #58
**Reviewer:** GPT-6
**Verdict:** `PR58_OWNERSHIP_READBACK_READY_FOR_GPT6_REVIEW`

---

## 1. Executive Summary

This handoff closes the final two correctness and safety findings identified by GPT-6 on PR #58:
1. **F-09 (Mongo cleanup target loss):** Step 4 PostgreSQL chapter deletion pruned `tracked.pgChapters` before Step 7 constructed MongoDB targets, leaving un-registered MongoDB draft chapters orphaned after teardown.
2. **F-10 (False successful durable readback):** Deleting IDs from tracking sets upon driver mutation acknowledgement bypassed Step 8 readback assertions, permitting a DELETE that affected zero rows or failed to persist deletion to falsely report `cleaned: true` and `CLEANED`.

Both issues are now comprehensively resolved using a **Three-Registry Separation of Concerns**:
- **Registry A (`owned`):** Permanent, immutable ownership registry retaining every entity registered during the session. Never mutated during cleanup.
- **Registry B (`pending`):** Pending deletion registry tracking uncompleted operations and supporting safe, fault-tolerant retries.
- **Registry C (`verification`):** Authoritative readback registry verifying true zero-residual database state across PostgreSQL and MongoDB regardless of driver acknowledgement.

All prior accepted findings (F-06 guard lifecycle, F-08 source provenance, P2-A double cleanup no-op, P2-B per-ID fault tolerance) remain fully preserved.

---

## 2. Commit Lineage & Provenance

- **PR #58 Base Integration HEAD:** `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`
- **Prior Verified Source SHA:** `0d4b524ec6f0dc7f22dcf3b0a55e31c9220930aa`
- **Clean Source Commit SHA:** `b653b6fe4d4887aa3d2687cdead985d5f985aa47`
- **GitHub Commit Resolution:** Verified HTTP 200 via GitHub API (`check_commit.py`)
- **P8 CI Run ID:** `39921623375` (https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39921623375)
- **CI Status:** 7/7 jobs SUCCESS

---

## 3. Findings Resolution Architecture

### F-09: Preserving Mongo Cleanup Targets
- `registerChapter(chapterId)` now automatically records the chapter into both PostgreSQL chapter tracking and MongoDB draft tracking (`this.owned.mongoDrafts` and `this.pending.mongoDrafts`).
- Step 7 derives deletion targets from `Array.from(new Set([...this.pending.mongoDrafts, ...this.owned.pgChapters]))`.
- Even after Step 4 purges PostgreSQL chapters, all owned chapters remain queued for MongoDB draft deletion.
- Independently registered Mongo drafts (`registerMongoDraft`) continue to be deleted with equal rigor.

### F-10: Authoritative Post-Cleanup Verification
- Step 8 iterates over `this.verification` across all entity types:
  - `pgChapters`: `SELECT count(*) FROM chapters WHERE chapter_id = $1`
  - `pgNovels`: `SELECT count(*) FROM novels WHERE novel_id = $1`
  - `pgUsers`: `SELECT count(*) FROM users WHERE user_id = $1`
  - `pgRevisions`: `SELECT count(*) FROM chapter_revisions WHERE revision_id = $1`
  - `mongoDrafts`: `mongoDb.collection('draft_chapters').countDocuments({ chapterId })`
  - Sentinel entities in PostgreSQL and MongoDB (Step 11).
- Driver DELETE acknowledgement alone is treated as insufficient evidence of absence.
- If any readback returns `count > 0`:
  - An error naming the specific persisting ID is aggregated.
  - The ID is re-queued into `this.pending` so subsequent retries will attempt deletion.
  - `this.stage` transitions to `CLEANUP_FAILED`.
  - An `AggregateError` is thrown.
- Stage `CLEANED` is strictly gated on all owned resources reading back count 0 with 0 errors.

---

## 4. Test Matrix Verification (17/17 PASS)

| Matrix | Focus | Injected Scenario | Result |
| :--- | :--- | :--- | :--- |
| **Matrix 1** | F-06 Guard Pre-condition | DB name mismatch rejected by guard | PASS (0 mutations) |
| **Matrix 2** | Setup Failure Isolation | Failure after first PG user insert | PASS (user cleaned) |
| **Matrix 3** | Partial PG Setup | Failure before chapter creation | PASS (partial records cleaned) |
| **Matrix 4** | Pre-Mongo Failure | Failure before Mongo draft creation | PASS (PG records cleaned) |
| **Matrix 5** | Immediate Mongo Failure | Failure immediately after Mongo insert | PASS (Mongo cleaned) |
| **Matrix 6** | Sentinel Setup Partial | Failure during sentinel registration | PASS (no false corruption) |
| **Matrix 7** | Runtime Test Failure | Failure during test execution | PASS (sentinels preserved until step 10) |
| **Matrix 8** | Step 1 Outbox Lock | Table lock on outbox events table | PASS (downstream cleanup continues) |
| **Matrix 9** | Golden Path | Full complete test execution | PASS (true zero residual state) |
| **Matrix 10** | P2-A Idempotent Double Cleanup | Second cleanup call on same instance | PASS (0 queries, 0 mutations) |
| **Matrix 11** | P2-B Per-ID Isolation | Deletion failure on 1 of 3 users | PASS (other users deleted, ID reported) |
| **Matrix 12** | P2-B Sentinel Per-ID Isolation | Deletion failure on 1 of 2 sentinels | PASS (surviving sentinel deleted) |
| **Matrix 13** | Retry Recovery | Transient failure on first cleanup | PASS (recovers to CLEANED on retry) |
| **Matrix 14** | **F-09: Mongo Target Preservation** | **Only registerChapter called; draft inserted** | **PASS (draft deleted, 0 residual)** |
| **Matrix 15** | **F-09: Independent Mongo Draft** | **registerMongoDraft called independently** | **PASS (draft cleanly deleted)** |
| **Matrix 16** | **F-10: PG Acknowledged Non-Delete** | **DELETE returns rowCount=1 but row remains** | **PASS (fails closed, reports ID, retries)** |
| **Matrix 17** | **F-10: Mongo Acknowledged Non-Delete** | **deleteMany returns acknowledged but doc remains** | **PASS (fails closed, reports ID, retries)** |

---

## 5. Local Full Regression Manifest

All tests executed with `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` on isolated local PostgreSQL and MongoDB databases, with zero live LLM provider calls (`LLM_PROVIDER=fake`).

1. `test-db-guard-lifecycle.test.ts`: 6/6 PASS (180ms)
2. `test-db-guard.test.ts`: 11/11 PASS (172ms)
3. `fixture-lifecycle-resilience.postgres.test.ts`: 17/17 PASS (1045ms)
4. `accept-draft-contract.test.ts`: 14/14 PASS (925ms)
5. `p1-production-persistence.postgres.test.ts`: 5/5 PASS (775ms)
6. `npm test`: 21 test suites, 173 tests PASS, 4 skipped, 0 failed (3478ms)
7. `npm run typecheck`: clean compilation, 0 errors.

---

## 6. Deliverable Artifacts

Located at: `docs/development/integration/p1-author/reviews/ci-isolation-2026-10-23/final-ownership-readback/`
- `F09_MONGO_TARGET_RED_GREEN.md`
- `F10_AUTHORITATIVE_READBACK_RED_GREEN.md`
- `CLEANUP_OWNERSHIP_MATRIX.json`
- `VALIDATION.json`
- `REVIEW_HANDOFF.md`

---

## 7. Stop Condition & Verdict

**Final Verdict:** `PR58_OWNERSHIP_READBACK_READY_FOR_GPT6_REVIEW`

PR #58 has been updated with the verified source and evidence commits. No further mutations or merges performed. Ready for GPT-6 review.
