# Reader acceptance

`Reader acceptance / reader-acceptance` runs for every PR at `pull_request.head.sha`, with read-only GitHub permissions, PostgreSQL/MongoDB service containers, and no live-provider secrets. It fails if the checkout differs from `EXPECTED_REVIEW_SHA`, the source is dirty, the Reader database opt-ins are absent, a required browser suite is missing, or any step fails. It does not change the existing P7/P8 or Studio workflows.

The job runs both typechecks, a production web build, all `reader-*.browser.test.mjs` suites, contrast checks, and the discovery, chapter-read and reading-lifecycle PostgreSQL suites. The database runner creates a uniquely named `ephurin_test_admin_backend_*` database, applies all migrations and tears it down in `finally`. Acceptance independently checks PostgreSQL and MongoDB for absence of that exact database afterward, including when a database test fails.

Artifacts contain the tested SHA/tree, commands and exits, database teardown proof, logs and screenshots. Provider keys are blanked in the runner; browser APIs are fixture routes. No demo seeding, real user accounts, or live-provider calls are used.

To run locally, install backend/web dependencies and Chromium, start PostgreSQL and MongoDB control services, commit the source, then run (POSIX shell):

```sh
EXPECTED_REVIEW_SHA="$(git rev-parse HEAD)" \
RUN_READER_DISCOVERY_TESTS=1 EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 \
PLAYWRIGHT_CHANNEL=chromium node scripts/run_reader_acceptance.mjs
```

`ADMIN_TEST_POSTGRES_URL` (default local `/postgres`) and `ADMIN_TEST_MONGO_URL` select the control services. `READER_EVIDENCE_DIR` selects an artifact directory outside the repository. Branch protection can require the stable `reader-acceptance` job check; the workflow deliberately has no path-based skip condition.

History regression covers locked VIP sync returning 402 without changing history or read flags, inactive-account rejection, entitled VIP sync without read inference, authorized VIP content reads, non-consecutive reads, account isolation and legacy unverified rows. Browser regression verifies that fabricated/stale resume pointers and local account storage cannot create authenticated read markers or direct resume links. Guests retain local visit markers.
