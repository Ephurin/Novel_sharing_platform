# Mongo reconciliation fixture: actual RED → GREEN

ASTRA executor, 2026-10-23 Asia/Saigon. Required evidence directory retains 2026-10-22. HOLD_FE_INTEGRATION_ONLY.

**RED:** unmodified clean `66bcef65b55ebdda58e2fe1d19ad850f209fd408`, new test-owned PG/Mongo, all 3 failures reproduced with PostgreSQL 22P02, exit 1. Old synthetic `live-test-chap-*` IDs reached UUID query in `findLatestRevisionByChapterId`. Historical baseline/security evidence unchanged; new red-mongo-tests.log preserves this run. The RED runner used external mutation opt-in and new databases even though the old test itself lacked isolation validation.

**Test-only repair:** `3cc70a0c1c79d9ca89e6b01867cc3c076570e950` changes only `backend/src/modules/novels/mongo-reconciliation.live.test.ts`. Real UUID author, novel, three independent chapters, two FK-valid revisions per chapter, deterministic ordered timestamps and latest_revision_id. No production repository, writer lease, UUID constraint, auth, AI or web changes. This uses real PG and Mongo, not mocks or a latest=null shortcut.

| Probe | Non-vacuous assertion and actual result |
|---|---|
| 1 older editor draft | PG latest revision exists, parent ID and content hash match; reconciliation returns synced; persisted Mongo content and accepted revision/timestamp match PG, version increments from 1 to 2; owner/novel retained. PASS. |
| 2 newer manual draft | Incoming revision equals real PG latest, so timestamp guard is exercised; returned draft and direct Mongo readback deep-equal the original (content/version/timestamps/lineage unchanged). Separately, superseded parent with a newer timestamp is denied by PG lineage guard. PASS. |
| 3 missing draft | Direct pre-read null; real latest PG revision with parent/creator/content; recovery persists identical result with exact trusted owner/novel/chapter IDs, accepted revision/time and version 1. PASS. |

`probe-readbacks.json` is mechanically extracted from successful TAP diagnostics; raw log retained. Setup snapshots show no owned records then real PG lineage. Cleanup snapshots show all owned user/novel/chapter/revision/draft rows absent; unrelated PG author sentinel and legacy-prefix Mongo sentinel survive that cleanup. Sentinels are removed separately by exact ID only after their preservation assertions. PG seed transaction rollback handles partial insert failure; ownership flag is set only after commit; DB connections close in after/finally; errors fail the test. No prefix deletes, collection drops or volume deletion.

**Clean committed verification:** 3/3 live probes exit 0; 54/54 focused tests exit 0; typecheck/build exit 0. `green-source.json` and `focused-source.json` capture git SHA and empty porcelain before execution. Focused set is the same six files/54 tests from accepted security handoff: draft-read boundary, job-resume auth, revision patching, outbox, controller intent, PG production persistence. Closed security tasks were not reimplemented or rerun as broad HTTP acceptance.

**Negative safety:** removing external mutation opt-in makes before-hook fail, command exits 1 as expected. Before/after PG and Mongo counts match; no fixture inserted. This intentional failure is separate from the 3/3 functional PASS. An initial precommit typecheck failed because SuiteContext lacks diagnostic(); corrected to suite console JSON before commit; commands-and-exits.json retains diagnostics. No hidden runtime retry or deleted RED evidence.

**Lifecycle/remaining limits:** RED and GREEN use separate fresh containers/DBs, readiness checked, real migrations applied only to those DBs. Four owned containers stopped by exact label/ID after verification; data retained, historical containers/volumes untouched. A later preexisting focused persistence test leaves one Mongo draft after deleting its PG parents; post-focused-residual.json proves it is outside repaired fixture IDs. It was retained and is not represented as successful whole-database cleanup. No scope expansion to that test.

Provider keys empty; AI upstream closed loopback; persistence suite uses its existing fake fetch. No workers or real-provider calls initiated by this task; no host-wide network certification claimed. Full backend suite, AI suite (unchanged source), combined FE/Core, full S09, populated/mixed-worker migration, publication and 100k NOT_RUN.

Reproduce on an empty approved ephurin_test_* PG/Mongo pair with EPHURIN_ALLOW_TEST_DB_MUTATIONS=1, EXPECTED_TEST_DB_NAME, local DATABASE_URL/MONGODB_URI and synthetic JWT secrets; clear provider keys. From backend: `npm run db:migrate`, then `node --import tsx --test src/modules/novels/mongo-reconciliation.live.test.ts`. Exact selected regression/build commands, exits, source pins and runtime resource IDs accompany this report. The broader preflight migration union was not repeated.
