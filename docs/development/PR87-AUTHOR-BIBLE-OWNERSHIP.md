# Story Bible ownership after Canon withdrawal

PR #87 review fix, 2026-11-06.

## Ownership contract

- An untouched row created by the approved-memory projection remains owned by that projection. Canon corrections update it; retirement hides it; reappearance reuses its original Bible ID.
- An author PATCH to a character or timeline event transfers ownership to the author (`owns_bible_row=false`), preserving the stable Canon link and source provenance. Subsequent Canon corrections or retirement cannot replace or hide that row. This also applies to chapter-only and order-only event edits.
- The edit and ownership transfer commit together under the same per-novel advisory lock as synchronization. Failed edits cannot transfer ownership; concurrent retirement cannot hide a completed author edit.
- Explicit deletion still leaves a tombstone. Reappearing Canon does not resurrect deleted rows.
- Explicit identity merging still produces one profile and transfers biographies, notes and relationship endpoints. Author ownership transfers from an enriched source to its target, so retiring the target later cannot hide the transferred content.
- Migration `021_story_bible_author_ownership.sql` repairs earlier author enrichment, including inactive links. Character fields are compared with projection defaults and the last Canon name. Event fields are compared with the snapshot; an advanced `updated_at` also identifies legacy author PATCHes, including order-only edits (the earlier Canon event updater did not change that timestamp). The repair does not clear deletion tombstones.

The character and timeline GETs continue to return author-owned rows. The existing Bible export uses those returned rows, including their author content, even when the approved-memory snapshot no longer contains the source IDs.

## Integration and validation

The three original AI commits were rebased from `8f88e24c` onto `main` at `4cb5b564` after PR #86 merged. PR #85 remained separate at `14ccd617` during the migration rehearsal.

Local validation on the resulting source, before this documentation-only addition:

- Backend and web typechecks passed.
- 66 backend tests passed in a disposable PostgreSQL/MongoDB database: Bible lifecycle/ownership (20), draft acceptance, production persistence and teardown resilience. The Bible suite includes actual authenticated PATCH/GET requests, rollback, concurrent edits, legacy repair, merge and tombstone regressions.
- AI non-PostgreSQL suite: 393 passed, 10 skipped, 203 deselected; 37 subtests passed.
- AI PostgreSQL rejection, bootstrap, identity merge and cursor persistence: 41 passed, 5 deselected; 24 subtests passed.
- Browser proposal review, rich manuscript serialization and Bible/export: 15 passed. The export regression downloads and parses the real JSON file after a simulated Canon withdrawal.
- Migration rehearsal on three disposable databases passed: both PR migrations applied together in filename order; PR #85 before PR #87; PR #87 before PR #85. A repeated migration pass skipped existing records. Both `020_admin_novel_draft_sync.sql` and `020_story_brain_bible.sql` were recorded independently, followed by `021_story_bible_author_ownership.sql`. The runner keys migrations by full filename, not numeric prefix. The admin-job constraint and Bible tables were verified after each ordering.
- Every disposable database was removed after its run. No application data or live provider calls were used for these checks.

The P8 backend integration workflow now runs the Bible PostgreSQL suite. The Studio browser acceptance runner now includes the Bible export regression. GitHub checks must pass on the final PR head targeting `main`; this document does not substitute for that CI result.
