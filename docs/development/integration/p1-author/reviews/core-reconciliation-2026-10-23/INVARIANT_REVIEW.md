# Invariant review

Final source `990107caa9a915f7ba590d37dce912e7cccf1b09`. This is a bounded partial repair, not production/integration acceptance.

Preserved and exercised: advisory writer/reentrant lease, Mongo CAS, immutable revisions, transactional outbox, accepted-generation replay, owner/tenant/actor checks, P3 intent fences, fail-closed token auth, selected428/409 and unified FE draft DTO. Snapshot code is intentionally unchanged: unlike pipeline it never rewrites active Mongo during checkpoint, so no replay timestamp refresh can overwrite the editor. Repo freshness guard now protects accepted provenance even for equal prose. Different fresh immutable revision must advance identity/version; same applied revision is a no-op.

Required verification coverage:

1. **PASS** — Stale semantic pricing mutation: 06b; PG/Mongo unchanged.
2. **PASS** — Exact semantic retry: 05 and 06c; no duplicate mutation.
3. **PASS** — Changed-body authoritative version: 10a; unified draft DTO version equals Mongo.
4. **PASS** — Next returned-version save: 10c.
5. **PASS** — Same revision replay: 10b and native probe4.
6. **PASS** — Same prose different revision provenance: Native probe5: proper fresh revision increments CAS/provenance.
7. **PASS** — Older reconciliation/newer manual draft: Native probes2/7 and snapshot probe6.
8. **PASS** — Snapshot transaction failure and retry: 11; HTTP500, no committed partial revision/outbox; supported retry recovers.
9. **PASS** — Concurrent writers: 07; one200 one409.
10. **PASS** — Accepted-generation replay: accepted-replay-durable plus native5 tests; real PG/Mongo identities unchanged.
11. **PASS** — Author/account/tenant isolation: 09, auth34, unchanged accept-contract14.
12. **FAIL** — Active baseline/M-FIRST complete contract: Hash/source/outbox/context readback consistent, but unchanged worker bypasses explicit canon review.

The complete Story Brain contract remains FAIL: unchanged backend/src/jobs/outbox-processor.ts fetches and accepts pending proposals, reason incremental_outbox_auto_materialize, without author canon approval. Durable before/after projections and accepted decision evidence prove this. The worker/policy is outside this bounded services/repositories repair; no silent policy change was made. The /memory gateway returns404 because AI lacks its target route. Entity-review AI routes are also absent; actual initial proposal review/baseline activation was used and clearly labeled. These findings are not S10 repairs and must be resolved separately before full P1 acceptance.

Failure boundary: Mongo draft and chapter metadata may persist before a failing snapshot transaction. The real injected outbox INSERT fault returns500, rolls back revision/latest/outbox transaction, and retry completes canonical work. No distributed cross-database atomicity is implemented or claimed. Accepted replay preserves revision/outbox/draft identities; newer manual drafts and PG latest checks remain.

A separate observed optional-empty generation idempotency-key collision is retained from CLOSEOUT; HANDOFF uses distinct supported request keys. No production AI or request policy was changed. Missing optional retrieval status metadata is recorded; actual runtime embedding/retrieval disablement is verified by container preflight.
