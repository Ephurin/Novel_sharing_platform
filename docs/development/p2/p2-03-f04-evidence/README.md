# F-04 worker provenance evidence

This evidence concerns [PR98 F-04](https://github.com/Ephurin/Novel_sharing_platform/pull/98#issuecomment-6721552556). Old F-01/F-02/F-03 evidence remains in its original directory.

## Baseline: confirmed exposure, not security PASS

- Source `53cd695eada15bff3491b197243db1e28051ca52`, before production fixes.
- CI checkout `eb0024c1353f85469a23cb91e1853ddd8dccc92b`, tree `34a7ad8988d99ae5e9a300f8648d7e419e72299c` (same source tree).
- [P2 feature run42481506145](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42481506145), job128734240395, artifact13617328940.
- `baseline-53cd695e.zip` SHA256 `88ee335be96e0c62433535ef8fe79708820a5374223826a25102f79391e86f1b`.
- Six real HTTP/background-worker cases, each using a real SQL immutable chapter revision and recording fake provider. Foreign legacy, creator-NULL legacy and foreign tagged manual active plans each reached the provider once with `LegacyTitlePrivate`, `LegacyDescriptionPrivate` and the metadata marker. Jobs completed, with no unrelated rejection. Same-owner legacy/manual and no-plan controls also completed.
- A16 uses real disposable PG16 and Mongo7 services. This baseline worker probe read SQL revisions; its Mongo/P1 save-outbox evidence is the separate Gateway acceptance in the same artifact. Post-fix probes additionally seed/read Mongo before/after each worker case.
- Raw marker-bearing payloads in `a16.log` are intentional synthetic security evidence. They are not production logs or real author data.

## Failures retained for diagnosis

- Source `000827dc`, [P8 run42481937627](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42481937627), job128735565577: 282 PASS, 8 SKIP, 447 deselected, 27 fixture errors. The newly added worker fixtures need real Platform tables; this formerly narrative-only PG job lacked `users`. P2 feature on this source had those migrations and its SQL step passed. Corrected by running the existing backend migration runner in P8 PG, not by creating mock tables or skipping the worker tests.
- Commit `ba88db54` had incorrect YAML indentation in the new P8 migration step. Fixed at `15eeacd8`; YAML parsing is now explicitly checked. No history was rewritten.
- [P8 run42482307568](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482307568), job128736692636: migration runner configuration rejected missing `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Added offline config in `63748362`; this SQL-only step does not connect to Mongo or any model.
- [P2 run42482307559](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482307559), job128736692323: the two new real manual-plan fixtures called a helper with duplicate `source_outline` keyword arguments. Corrected fixture construction in `b2f7f20e`, preserving assertions and production code. The later operational-log scan also failed because the earlier failed SQL step prevented starting AI-service; this was cascading missing evidence, not an observed private log leak.
- [P8 run42482519214](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482519214), job128737342104, source `b2f7f20e`: real P1 Accept Draft failed401 fetching generation details. The new internal lookup incorrectly reused an author-route principal, whereas pinned P1 sends service credentials plus user-tenant headers without X-Author-Id. Corrected at `0fee14df` by sharing only strict service-token verification for this privileged read. The existing Platform consumer still validates returned generation actor/tenant/chapter/revision; the provider-bound worker retains all current-owner/source-author guards. Added the exact P1 legacy header combination to the real PG protected lookup test. This was a product regression caught and fixed, not a base failure.
- Local sandbox TestClient run was interrupted with exit1 because Windows socket creation stalled. The same offline command on the host passed33, exit0; `local-writer-275a8cb7.log` records its source separately. Local Docker Desktop did not yield an available engine. No local PostgreSQL/Mongo PASS is claimed; real DB acceptance is CI evidence.

## Verification

Final implementation source: `f070af660ae1308a189bb56ff8945db33071bc94`. [P2 feature42482967326](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482967326)1/1, [P742482967348](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482967348)3/3, [P842482967410](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42482967410)7/7 jobs PASS. Exact job URLs are archived in `source-ci.json`. Feature checkout `6b39e03f11525e9ea84d7c4998c322c622706e31`, source/checkout tree `bb9f671cb1e1fdca427ff62b736744602259c9a6`.

- `fixed-f070af66.zip`, artifact13618625770, SHA256 `6c11e724c99b8470c060beecc1b3626be0b302fcb3814399f3d207195b132dd0`.
- `rollback-f070af66.zip`, artifact13617394167, SHA256 `6e65c8549a3efea833f9c21e0cb3ad9dc328d5474d7d663040af9e8647fb1cf2`.
- Real feature databases: PostgreSQL16.15, MongoDB7.0.45, database `p2a`. Matched rollback clients/server16.15; pgvector0.8.7. No shared QA resource.
- Source feature113 SQL PASS (including29 F04),46 focused PASS,19 Gateway forwarding PASS, one real P1 save/outbox test PASS, one real setup/plan Gateway test PASS, seven Chromium mounted tests PASS (HTTP mocked). Full PG311 PASS,8 SKIP,447 deselected. Full non-PG415 PASS,32 SKIP,319 deselected, plus6 subtests. No totals combine different source SHAs or repeat the same tests as extra coverage.
-20 verified worker readback pairs:17 denied/zero-provider and3 authorized/one-provider cases. Reconstructed SQL/Mongo digests agree. Creator-NULL example before/after digest `3b366cd948ea2ad9a4156a3828ae1335b49eb380858c03cb8eaf7d27f7b2413f`. Existing approved setup entity/rule/private notes remain in SQL; private setup notes are absent from actual recorded outbound payloads.
- Separate real P1 changed-save result:2 immutable revisions, one COMPLETED outbox item, Mongo version2 and original active Brain version5 unchanged. Root Compose P1 generate/Accept Draft, outline and autonomous-controller gates all PASS on this source.
- Rollback normalized source/restore digest `d01186f6858856a9421b1ea5bc6c7ffe8146c766f9d440e303578c4cf4b98110`; raw source unchanged `f14b2dfbb97870b194626950c9d5805d1eeb538c45946fc6035a22572f02978b`. Source/restore migration0017 and vector extension match. All raw readback file checksums are independently rechecked by the verifier.

Run from repository root:

```text
python docs/development/p2/p2-03-f04-evidence/verify.py
python docs/development/p2/p2-03-f04-evidence/verify.py fixed-f070af66.zip
```

The first command verifies the immutable baseline archive and three confirmed unauthorized provider payloads. The second additionally verifies29 fixed worker tests,20 durable worker readback pairs,17 explicit security blocks with zero provider calls/no context hash, three authorized provider calls, unchanged SQL Canon/revisions/outbox and real Mongo draft readbacks. The HTTP identity/internal-service/SSE checks are in the same JUnit/log artifact. CI checkout SHA and tree are printed for comparison with the source commit. Source and delivery CI must be reported separately.
