# Source delta and provenance

Initial fetched integration: `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`.
Pipeline read-only ref: `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3` (verified source `dace9f9b`).
PR59 read-only head: `a41d8baadc8ed1710d81e2cbe6d8411edb4325e8`, tested source `990107caa9a915f7ba590d37dce912e7cccf1b09`.
Own test-only baseline: `82579b54b12902589a9690bb686ce55a6eccf72c`; production identical to initial integration.
Repair commit: `a2e3511d03b348b79041639a41b4a01d67e5f44e`.
Final clean tested source/tests: `d55e9a0332df3511b088b3518b40330f7f3ce441`. Evidence committed separately afterward.

Only production file changed: `backend/src/jobs/outbox-processor.ts`. Removed the brain/proposal GETs and group accept loop after successful extraction. Extraction request, idempotency key, actor/source/hash headers, failure propagation, claim/retry scheduling and MONGO_DRAFT_SYNC are unchanged. P3 controller approval remains in its existing controller service, not in the worker.

Tests: replaced obsolete `outbox-processor.test.ts` expectations; copied existing pipeline `internal-revision-authorization.test.ts` because integration did not include it. No internal auth production edits. Typecheck/build and 34 HTTP auth unit tests now explicitly run. SQL is stubbed only in this auth unit test, clearly labeled; separate full runtime real source/hash HTTP 200/401/404 proof also ran.

Harness: selectively reused PR59's fresh-resource preparation, internal-network compose, fake OpenAI-compatible transport, budget gateway, ingress and HTTP/DB probe helpers. New canon_hitl_probe.py exercises real Gateway/AI/repository/worker code. This is test-source reuse, not a branch merge or cherry-pick. Copied run-persistence-tests.py adjusted to existing integration suites; no source port from PR59's production fixes. Fake provider emits source-grounded extraction and deterministic synthetic prose; literary/model/semantic quality is not assessed.

Unchanged: FE, AI production, migrations, Gemini CI, accept-draft-contract.test.ts, chapter services/repositories, controller intent/auth/version fences, snapshot semantics. No PR58/59 edits. No main/integration writes or merge. No distributed atomicity claim.

D1/D2 dependency: PR59's additional metadata/reconciliation repairs are not present in this base and were not ported. Existing integration native persistence/accept/outbox suites pass, but the expanded combined PR59 + this source matrix remains NOT_RUN. Review/assemble these independent changes before claiming final P1 readiness.

Safety: fresh random project/DB/volume names and explicit mutation opt-in; all runtime worker networks internal, embeddings/retrieval disabled and fake-only synthetic credentials. Existing resources untouched. All newly created containers stopped, volumes/readbacks retained (resource-audit.json).
