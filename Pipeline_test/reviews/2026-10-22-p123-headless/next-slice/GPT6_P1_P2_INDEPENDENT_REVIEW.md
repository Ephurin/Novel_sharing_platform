# GPT-6 independent P1/P2 headless review — 2026-10-22

**Repository / branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`
**Reviewed implementation SHA:** `1dc7dfa38267c9eb176f56f070380930d1887d85` (production code change `5c20d493e6a4951a4c1cf81fd2beb8dae5449306`)
**Evidence HEAD before reviewer commit:** `4158e8600a4e3b76df6eaab4073235aa5fc4537a`
**Method:** independent static source-to-evidence/contract review through GitHub. **NO Docker, PostgreSQL, MongoDB, runtime tests or CI rerun by reviewer**. Executor-provided results are not independent execution results.

## Verdict (scoped)

- **`P1_BOUNDED_HEADLESS_EVIDENCE_ACCEPTED_WITH_BLOCKER`**: The reported 46/46 supported API/fake-provider checks, actual accept-draft, PostgreSQL outbox rollback, context edges and 9+7 CAS tests are credibly represented by source and frozen evidence. **But full P1 Core is BLOCKED on an untested ordered-writer / cross-store stale-overwrite risk described below**. Accept functional coverage as executor evidence, not as a concurrency safety proof.
- **`P2_BOUNDED_HEADLESS_EVIDENCE_ACCEPTED_WITH_LIMITATIONS`**: The reported 27/27 isolated P2 checks support the exact idea/setup→explicit entity proposals→author API approval→M0→future plan→failed-job rejection→fresh generation→accept-draft→M-FIRST→second request pathway. This is **not** real model quality, independent runtime rerun, human UI usability, all P2 flows or complete P2 product acceptance.
- **`P3_NOT_RUN`; `UI_BLOCKED_FE`; `REAL_PROVIDER_NOT_TESTED`; `SEMANTIC_RAG_NOT_ASSESSED`; `P3_100K_NOT_RUN`.**
- **Next development authorized:** reproducible P1 ordered-write race + narrow backend-only repair first; begin isolated, bounded P3 functional controller tests without touching frontend, provided no safety claim is made based on unresolved P1 concurrency. Do not merge or upgrade aggregate P1/P2 acceptance.

## Independent source checks

1. `backend/src/modules/novels/chapters.schemas.ts` accepts optional `expectedVersion`; `chapters.service.ts` calls `upsertDraftChapter()` prior to `updateChapterMetadata()` and `snapshotSavedChapter()`.
2. `backend/src/modules/novels/draft-chapters.repository.ts` uses Mongo `findOneAndUpdate` filtered by `chapterId/version`; a mismatch leads to 409 `DRAFT_CONFLICT`, or an identical-content stale retry may reuse an advanced version. This supports single-step optimistic CAS. Legacy requests without `expectedVersion` still bypass the guarantee.
3. `backend/src/modules/novels/chapter-revisions.service.ts` `createSnapshot()` acquires a PostgreSQL chapter row lock, inserts revision/outbox transactionally, **then computes `snapshotTime = new Date()` and calls `syncDraftFromRevisionConditional()`**. That Mongo sync accepts writes based on `updatedAt <= acceptTimestamp`, **not** on the successful Mongo CAS version that initiated the operation. The PostgreSQL lock serializes PG writes but does not serialize them in the order Mongo CAS succeeded.
4. Evidence `final-concurrency/concurrent-orderings.json` checks **two callers with the same expectedVersion**, one 200 and one 409. `final-concurrent-barrier/validation.json` checks simultaneous same-version attempts and HTTP timing overlap. These do **not** cover **two sequentially valid CAS writes whose later SQL side effects complete in reverse order**.
5. Actual `acceptDraft()` transaction creates immutable revision + outbox atomically and tests inject a chapter-scoped failing `BEFORE INSERT` PostgreSQL trigger. Successful rollback is supported; no post-commit kill, crash between Mongo-CAS and PG-commit, or full cross-store reconciliation is proven.
6. AI source changes validate protected context overflow before LLM dispatch; fact `is_locked` requires boolean. Reported durable fake-provider HTTP artifacts support bounded locked rule and explicit retrieval-disabled claims only.
7. P2 harness `run_p123_next.py:p2()` calls actual `POST /ai/story-brains/bootstrap/from-idea` in `mode=extract` with source text containing only Mai Linh, Duy and Cồn Vân, verifies entity-only proposals, then scripted approval through authenticated API. Initial M0 has no past event. First chapter is accepted via actual generation ID; job failure is refused; second generation references M-FIRST. The empty writer-base `MANUSCRIPT_BOOTSTRAP` snapshot is a technical immutable base, **not** manuscript import; explicitly disclosed by executor.
8. Temporal audit after accepted chapter-1 edit re-evaluates accepted revisions; `final-p1-readback/current-provenance-cutoff.json` claims 60 valid proofs / zero leaks. Previously frozen M0-relative audit FAILURE remains in evidence. A current-source audit does not itself prove historical immutable snapshot-as-of-M0 reproducibility or correct handling if an earlier source mention is removed later; that policy needs an additional regression.

## P1 blocker: accepted CAS ordering does NOT fence downstream side effects (HIGH; source-derived interleaving, NOT runtime reproduced)

A feasible interleaving is:

- A, given draft version 1, completes Mongo CAS and persists draft version 2 (body A), but stalls before the PostgreSQL `updateChapterMetadata/snapshotSavedChapter`.
- B reads version 2, completes valid Mongo CAS to version 3 (body B), then commits PostgreSQL revision/outbox for B.
- A resumes and creates a newer **PostgreSQL revision/outbox for older body A**. Its later `createSnapshot()` obtains `snapshotTime` only after its PG transaction; `syncDraftFromRevisionConditional` uses timestamp comparison and can now overwrite the newer B Mongo body with A.

Result **may** be stale body/metadata, reverse revision chain and misleading memory analysis even though each Mongo CAS succeeded. This follows from observed call order and checks, but is **not yet established as a runtime occurrence**. Simple two-request same-version racing cannot rule it out.

### Required next negative test / repair criterion

Force exactly this interleaving (two successively valid versions) at the seam **after Mongo CAS before PostgreSQL side effects**, with isolated test-owned DB and a scoped deterministic barrier/fault injection. Verify latest Mongo body/version, PostgreSQL latest revision/content hash, outbox/event order and process-restart readback all reflect B; an older A cannot commit later or overwrite B after its accepted CAS has been superseded. Also test failure/process death after Mongo CAS before PG commit, and bounded recovery that doesn't invent a canonical version. Preserve failing evidence and retest after the smallest compatible fix. Avoid global locks/DB resets, permanent unsafe test hooks, or changes to `web/`.

Repair options **to evaluate**, not prescribe blindly: per-chapter writer serialization spanning the boundary, version-fenced PG revision/outbox application with monotone draft sequence, or a durable saga/reconciliation queue with explicit recovery. Merely moving timestamp reads or adding a same-version 409 test is insufficient. Compare to PR #55's required-version/428 policy before changing compatibility. Legacy unversioned requests and mixed-client behavior must retain explicitly limited status.

## Other limitations (do not silently upgrade)

- Full backend suite exits 1 in executor environment because unrelated local PostgreSQL tests encounter `EACCES`; focused suite 29 PASS, AI suite 152 PASS / 2 SKIP and isolated HTTP tests are the real claimed coverage. Do not claim comprehensive CI.
- Different authenticated author on same novel returns 403; distinct production tenants not provisioned.
- Artificial deterministic fake extraction/acceptance (`SIMULATED_HUMAN_VIA_API`) verifies wiring and persistence, not model judgment, literary quality or actual human review UX.
- P2 retry after fake 500 is a **new generation**, not in-place resumption of the original writing job.
- P2 ordinary PATCH after idea baseline not run; P3 controller not run; browser S09 remains RED.
- Unknown-origin author/legacy entity is globally visible by current explicit policy; source chronology for unknown origin is not independently established.
- The protected-overflow/locked-rule test is bounded; semantic retrieval remains disabled.
- No provider/embedding live call authorized; generated synthetic accounting is not an invoice.

## Files personally inspected (source + executor artifacts)

- `backend/src/modules/novels/{chapters.service.ts,chapters.schemas.ts,draft-chapters.repository.ts,chapter-revisions.service.ts,chapters.repository.ts}`
- `ai-service/{application/writing_service.py,domain/projection.py,infrastructure/postgres_narrative_repository.py}`
- `Pipeline_test/tools/run_p123_next.py`
- `Pipeline_test/reviews/2026-10-22-p123-headless/next-slice/{HANDOFF_GPT6.md,P1_REMAINING_GATES.md,P2_CORE_REPORT.md,FE_BACKEND_CONTRACT_HANDOFF_NEXT.md,validation.json,commands-and-exits.json}`
- `.../final-{p1,p2,concurrency,concurrent-barrier,edges}/validation.json`
- `.../final-concurrency/concurrent-orderings.json`; `.../concurrency-before/concurrency-receipts.json`
- `.../final-p1/DB-fault.json`; `.../final-p1-readback/current-provenance-cutoff.json`; `.../final-p2/idea-source.json`
- `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4.

**Bottom line:** Proceed with headless product work, not FE integration. P1 independent code review uncovered a credible race not exercised by executor's success-path tests. P2's bounded functional pathway is acceptable as reported evidence with the exclusions above. **No reviewer-run Docker/pytest claims.**
