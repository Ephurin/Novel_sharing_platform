# Workflow repairs — 2026-10-18

**Verdict: implementation and local regression PASS; LIVE_UI / Gemini E2E NOT_RUN.**
This report supersedes the implementation gaps in WORKFLOW_GAP_AUDIT.md, not its
historical observations. No novel completion or 100k-word capability is claimed.

## Changes

| Problem | Implemented behavior |
|---|---|
| Saving prose did not trigger extraction | After an active baseline, changed chapter saves create immutable revisions and durable analysis outbox events. Identical body/source saves deduplicate under the chapter lock. Initial pre-baseline saves remain drafts until author-triggered extraction. |
| Ordinary worker silently approved proposals | Removed automatic materialization from the shared extraction worker. Ordinary mode persists pending proposals only. Approval belongs to the author; full auto performs scoped approval separately. |
| Review and memory were outside the writing journey | Editor “Bộ nhớ truyện” and the left-rail button open an official-memory panel with character/location/item/event tabs, review groups, editable fields, reject/accept, initial extraction and baseline activation. All these memory tabs read the narrative repository used by AI. |
| Sidebar could display a different database | Replaced the editor's legacy Story Bible modal with the official narrative-memory panel, including projected current status/location. Existing standalone manual story-context pages retain their separate legacy data; no bulk migration of historical manual notes was performed. |
| Old extraction could be approved after a chapter changed | Gateway checks selected proposal evidence against current revision heads. Explicit author-created historical corrections are distinguished from stale extraction and remain protected by brain-version checks. |
| Setup extraction invented a blueprint | Public idea endpoint defaults to `mode=extract`, extracting only grounded character/location names. Original setup/outline/constraints remain in the bootstrap job as source. Blueprint generation remains available only as explicit `mode=blueprint` for compatibility. |
| Planned events were not an editable author flow | Editor can suggest, edit, add/remove and approve future events into a versioned Story Plan. These operations do not append historical events or state transitions. |
| World update and consistency had no connected editor action | Authors can propose reviewed corrections to recorded events; summary edits preserve the event's existing transitions. Consistency checking returns findings grounded in the saved draft and revision. Suggestions/findings themselves do not mutate memory. |
| Full auto required a manually prepared plan | Node controller generates and activates a plan with an ending when no active plan exists, using approved memory. |
| Full auto progressed after memory failure | It waits for persisted extraction completion, approves only its generated revision's proposals, and stops/retries failures without marking the objective complete. Recovery checks generation ownership by run id and avoids duplicate prose. |
| Full auto treated one generated fragment as completed story | Objective completion requires a word floor plus explicit prose evaluation. The final objective also requires a resolved ending; insufficient prose continues the same objective. Bounds still stop runs that exhaust iteration limits. These checks are safeguards, not proof of literary quality. |
| Full auto depended on an open browser | Backend worker scans durable running tasks; PostgreSQL advisory locks prevent simultaneous steps. The server restarts processing from stored run/revision state. UI polls progress and can stop. Active runs pin their plan; a terminal run cannot be revived by a stale status update. |
| Autosave could overwrite local edits | Serial save mutations carry their target chapter id, successful saves no longer replace editor cache with an incomplete response, and background hydration preserves unsaved text. |

## Verification

- Python default suite: **279 passed, 2 skipped, 42 deselected**. PostgreSQL
  integration tests excluded by the repository configuration were not counted as pass.
- Selected backend suite: **26 passed**. Includes extraction without approval,
  memory/completion gates and worker scheduling without a browser request.
- Real PostgreSQL + MongoDB runner: **15 cases passed**, exercising the actual
  chapter services, revision/outbox persistence and autonomous controller.
  AI responses and plan/run HTTP responses are local stubs; this is not a live
  provider extraction or full remote-service E2E.
- Backend typecheck and web production build passed. Build warnings include the
  existing Mantine “use client” bundling messages and a large bundle warning.
- Fixture integrity remains unchanged; source novel chapters were not edited.

Evidence: `evidence/python-tests.txt`, `backend-unit-tests.txt`,
`backend-typecheck.txt`, `web-build.txt`, `database-controller-tests.txt`.

The DB runner tests: pre-baseline draft save; bootstrap snapshot isolation; active
save job; duplicate-save deduplication; stale proposal rejection; Mongo readback;
no shared-worker autoapproval; memory failure blocks progress; recovery without
duplicate prose; unachieved objective continues; resolved ending completion;
no publication; extraction-status readback; worker scan SQL; lock contention/release.

## Environment and limits

Earlier DB checks used isolated Docker database
`ephurin_report_e2e_workflow_20261018`. Docker became unavailable during this task.
Final DB checks used separate local PostgreSQL/Mongo database
`ephurin_report_e2e_workflow_local_20261018`; application/demo databases were not reset.
The native PostgreSQL installation lacks pgvector. Full Alembic migration there
failed at extension creation; the final runner used an explicitly isolated minimal
relational fixture created by `tools/prepare_workflow_db.py`. This is **not** evidence
that full migrations or semantic retrieval pass on that native server. Docker's
pgvector migrations had completed earlier in the separate test database.

A broad `npm test` invocation also included unrelated live-database suites and
failed without their required isolated DB environment; it was stopped. The selected
26-test result above is the successful backend verification, not a full-suite claim.

Browser automation still fails initialization (`failed to write kernel assets`,
OS error 3). Consequently UI rendering, clicking, polling and reload have not been
verified live. No Gemini payload was sent in this implementation task. The previous
real-provider retest approval gate was not bypassed. No 100k run was launched.

The latest product changes have not been rolled into the demo stack. Deploying
the new worker will resume any stored running autonomous jobs, so inspect those
runs before updating a shared environment. No new database migration is required
by this patch; the existing narrative migrations through 0009 must be installed.

## Next verification

Run `SHORT_LOOP_TEST.md` on an updated isolated stack: initial extraction and
review; save ordinary prose; wait for extraction; edit/review; check memory tabs
and context after reload. Then test setup-only and full auto with/without a plan.
Use real provider only once its payload/destination authorization is settled.
Long-run memory checkpoints after import and at 10/20/50 chapters remain required.

For local DB regression, set DATABASE_URL, MONGODB_URI to the named isolated
databases, EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 and EXPECTED_TEST_DB_NAME, then run
from backend: `node --import tsx ../Pipeline_test/tools/check_saved_chapter.mts`.
The runner fails closed on non-test databases and always stubs AI calls. It creates
identifiable synthetic test records and leaves them available for inspection.
