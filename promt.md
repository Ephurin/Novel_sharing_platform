# Active Project Handoff — Novel Sharing Platform AI

## 1. Canonical Status — 2026-10-14

All three authoring pipelines are closed on backend/system acceptance, and P1 browser acceptance is now closed on the refactored Author UI.

```text
AI-PIPE-01A  P1 production persistence loop                 CI_PASS / MERGED
AI-PIPE-01B  P1 final browser/UI system E2E                 CI_PASS / MERGED

AI-PIPE-02A  Idea / World-Bible bootstrap                   CI_PASS / MERGED
AI-PIPE-02B  Durable outline / Story Plan                   CI_PASS / MERGED

AI-PIPE-03A  Bounded autonomous controller                  CI_PASS / MERGED

MANUSCRIPT-IMPORT-UI  Canonical import -> Story Brain -> P1   CI_PASS / MERGED
AUTHOR-PUBLISH-MODERATION  Author -> Admin -> Public lifecycle   CI_PASS / MERGED
READER-DISCOVERY-STATE     Discovery/library/history lifecycle    CI_PASS / MERGED
READER-SOCIAL-COMMENT-PREF Social/comment/preferences lifecycle    CI_PASS / MERGED

P1_OVERALL_SYSTEM_PASS
```

Accepted milestones:

```text
PR #39  AI-PIPE-01A  merged
PR #40  AI-PIPE-02A  merged
PR #41  AI-PIPE-02B  merged
PR #42  AI-PIPE-03A  merged
PR #45  AI-PIPE-01B  merged
PR #46  MANUSCRIPT-IMPORT-UI  merged
PR #47  AUTHOR-PUBLISH-MODERATION  merged
PR #48  READER-DISCOVERY-STATE  merged
PR #49  READER-SOCIAL-COMMENT-PREF  merged
```

AI-PIPE-01B remote closure:

```text
browser-tested product SHA:
474b04fbc6173cfc847e06bf4e522211adf6f4d5

evidence payload:
9d75b91be6fc8f76899416a3d1d6faa629c9075b

evidence lineage seal:
2e1fb9b5747e4dfc0c4a3bef2cab54d55d47f269

accepted PR head:
3356de5ded6061dd6447e191b70e59ec48498488

P7 Semantic Memory Foundation:
run #125 / 38527368867 / PASS

P8 Cutover and Migration:
run #122 / 38527368972 / PASS

merge:
ff1ddb2430f342ba4221e442c2976ec481ad99a0
```

Canonical report:

```text
docs/development/AI-PIPE-01B-MAIN-E2E-report.md
```

Manuscript Import remote closure:

```text
tested code:
66f94e22980b2c10cf3e2e93523e31f6582def60

evidence payload:
9771996f92b19076ebd081421c25e6aad033b9d7

lineage seal / accepted PR head:
d73e6d138e27892f3eec71d627dae2aeaa3f2c55

P7 Semantic Memory Foundation:
run #126 / 38670492688 / PASS

P8 Cutover and Migration:
run #123 / 38670492674 / PASS

merge:
ff1d47b59ca995af32b068163599cefdcc158db8

report:
docs/development/MANUSCRIPT-IMPORT-UI-E2E-report.md
```

Author Publish / Moderation remote closure:

```text
tested code:
6c9a196a7eeb86cb48a5de363b9274ca1eaa6128

accepted PR head / evidence commit:
2833a68f3d6b2e6b4026ac51cc5932388de64888

P7 Semantic Memory Foundation:
run #127 / 38694642827 / PASS

P8 Cutover and Migration:
run #124 / 38694642777 / PASS

merge:
b7c9d4ea284ea8bf1eb135b6e876d7679ea8b18a

report:
docs/development/AUTHOR-PUBLISH-ADMIN-MODERATION-E2E-report.md
```

Reader Discovery / Reading State remote closure:

```text
tested code:
97ef253b544cba9376ed9b491cd3064c05c56647

accepted PR head / evidence commit:
089c1f57cb7ed8632cbd00d8b2d3e2bfa4122cb1

P7 Semantic Memory Foundation:
run #128 / 38699170011 / PASS

P8 Cutover and Migration:
run #125 / 38699169981 / PASS

merge:
8badd3361c8368aa351fcff249cf9c4d919685ac

report:
docs/development/READER-DISCOVERY-READING-STATE-E2E-report.md
```

Reader Social / Comment / Preferences remote closure:

```text
tested code:
0b2c53f7fb4a1af6e601763ebe4bf654192a44ff

accepted PR head / evidence commit:
fcfe3f078929e6df0f0bdade02e90ab3e91aa7ba

P7 Semantic Memory Foundation:
run #129 / 38707250887 / PASS

P8 Cutover and Migration:
run #126 / 38707250954 / PASS

merge:
9e79b65c16a9c7776eefeadc3904660011e174a6

report:
docs/development/READER-SOCIAL-COMMENT-PREFERENCES-E2E-report.md
```

Do not reopen P1/P2/P3, Manuscript Import, Author Publish/Moderation, Reader Discovery/Reading State, or Reader Social/Comment/Preferences architecture without a concrete regression or explicitly approved new scope.

---

## 2. Canonical Architecture

All authoring entry paths converge on the same Story Brain and P1 writing loop.

```text
Imported manuscript
        |
        v
     Story Brain
        |
        v
  P1 Writing Loop
        |
        +--> generate
        +--> deterministic validation
        +--> author / controller decision
        +--> acceptDraft
        +--> immutable revision
        +--> transactional outbox
        +--> incremental analysis
        +--> revision-scoped proposal materialization
        +--> Story Brain update
        +--> next context/generation sees new state


Idea / premise
        |
        v
World-Bible bootstrap
        |
        v
     Story Brain
        |
        v
  same P1 Writing Loop


Outline / future intent
        |
        v
versioned Story Plan
        |
        +--> planning_context
        +--> current_objective
        |
        v
  same P1 Writing Loop


Autonomous mode
        |
        v
active Story Plan
 -> current objective
 -> same P1 WritingService
 -> deterministic fail-closed quality gate
 -> accept / retry / stop
 -> same acceptDraft + outbox + Story Brain update
 -> explicit plan progress
 -> intentional completion gate
```

Core invariant:

```text
FUTURE PLAN != HISTORICAL CANON
```

Do not create:
- a second writer;
- a second Story Brain;
- a P3-only memory store;
- ad-hoc JSON persistence for production Story Plan/controller state.

### Outbox invariant

For `INCREMENTAL_ANALYSIS`:

```text
accepted/snapshot revision
 -> incremental analysis
 -> proposals scoped by evidence[].revision_id
 -> required proposal groups materialize
 -> Story Brain advances OR legitimate explicit no-op
 -> only then outbox may become COMPLETED
```

Materialization failure must fail closed and preserve retry/idempotency semantics.

---

## 3. Fixed Technical Policies

Production/default context routing:

```text
CONTEXT_ROUTING_POLICY=legacy-v1
```

Embedding:

```text
gemini-embedding-2
768 dimensions
normalized
```

Demo/default generation model:

```text
gemini-3.5-flash-lite
```

Manual alternative when explicitly required:

```text
gemini-3.1-flash-lite
```

Do not automatically fall back to Gemini 3.8.

Flash-Lite is the demo/default primarily for quota feasibility, not because it is assumed to provide the highest literary quality.

Primary acceptance/system gates should prefer fake/deterministic LLM unless a real-provider seam is explicitly under test.

P8-05 destructive cleanup remains blocked pending the separately defined stability boundary.

---

## 4. Collaboration Ownership

### Gemini / Antigravity — LOCAL OWNER

Gemini handles:
- local code inspection and implementation;
- Docker / Compose;
- PostgreSQL / pgvector / MongoDB;
- local unit, integration and system tests;
- local browser automation;
- deterministic/fake LLM;
- bounded real-provider calls only when explicitly required;
- local evidence/report generation;
- commit/push on the assigned working branch.

Gemini stops at:

```text
LOCAL_PASS_CI_PENDING
```

unless a newer directive explicitly assigns a different boundary.

### ChatGPT — GITHUB / REMOTE ACCEPTANCE OWNER

ChatGPT handles:
- remote branch/head/diff review;
- PR creation/update;
- GitHub Actions inspection and logs;
- CI-only test/wiring repair where appropriate;
- merge decision;
- canonical report/handoff closure on `main`.

Never collapse local PASS into CI PASS without direct GitHub evidence.

---

## 5. ACTIVE EXECUTION DIRECTIVE — FINAL REVIEW HARDENING / COMMENT USER REPORT MODERATION

### Remote review status (authoritative; supersedes prior local PASS wording)

Current working branch:
```text
astra/comment-user-report-admin-moderation-e2e
```

Remote head reviewed:
```text
7259d523e24bd4ceffa1da98b0173a5a0ade1be8
```

Underlying product/test commits:
```text
64fb285ac447fd461bf3cf237157acc572e42dfd
6a30907fc5a9fb7977b8ecde52562a5517418d79
```

Current main handoff baseline:
```text
2b00a36c78be0d8e4a2b59bbe84d810cd13da37c
```

The local browser Report-A..J and 12/12 Phase C suite were reported PASS. Remote code review nevertheless found a **CRITICAL TEST DATA DESTRUCTION BUG**, so the accepted remote status is:

```text
LOCAL_PASS_WITH_REVIEW_BLOCKERS
NOT_READY_FOR_PR
```

Do not create a PR or claim acceptance until this hardening pass is independently evidenced.

This is a targeted hardening pass, not a reimplementation of the working browser lifecycle.

### First: sync latest main into existing branch

```bash
git fetch origin
git checkout astra/comment-user-report-admin-moderation-e2e
git pull --ff-only
git merge origin/main
```

DO NOT create a second branch.
Record actual current main SHA as `FINAL_SYNCED_MAIN_SHA`.
The branch must be behind main by zero before the final run.

---

### Blocker P0 — remove unscoped test teardown deletes

Remote review located this destructive teardown in:

```text
backend/src/modules/content-control/comment-user-report-admin-moderation.postgres.test.ts
```

Existing `after()` effectively executes:

```sql
delete from reports where target_type = 'COMMENT';
delete from moderation_reviews where target_type = 'COMMENT';
```

These operations remove ALL COMMENT reports/reviews in the connected database, not just this test's entities. They also run under `npm test`.

MANDATORY fix:

1. Track exactly the IDs generated by THIS test: `review_id`, `report_id`, `comment_id`, created novel/chapter IDs and test user IDs. Derive report/review ID sets from actual create returns; include keyword-filter reviews.
2. Delete only these explicit IDs (or a join proven to select only the created fixtures), in foreign-key-safe order. Never cleanup by `target_type='COMMENT'`, source, chapter alone, or broad role.
3. Clean only this test's created Mongo comments/notifications too, if the suite currently leaves them. Do not delete user-owned general records or other test artifacts.
4. Guard destructive tests/cleanup with an explicit isolated test-database context. Prefer a dedicated test DB name + explicit `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` switch and fail closed before **any** mutation. Do NOT trust a default DB URL pointing at a potentially shared database. Propagate the guard to `npm test` execution or adjust the isolated test setup so regression CI still passes.
5. Cleanup must be safe and idempotent if setup fails midway; track partial creation, use scoped `try/finally` as appropriate.
6. No blanket TRUNCATE/DROP/deleting pre-existing rows to make tests green.

A legitimate passing test must never destroy unrelated data.

### Blocker P0 — make browser runner cleanup fixture-scoped

In:
```text
scripts/run_comment_user_report_admin_moderation_e2e.py
```

Remote review identified:

```text
DELETE FROM reports WHERE reporter_id = REPORTER_USER_ID
db.comments.deleteMany({userId: OWNER_USER_ID, chapterId: TARGET_CHAPTER_ID})
db.notifications.deleteMany({userId: {$in: [OWNER_USER_ID, REPORTER_USER_ID]}})
```

These delete all existing reports for a seeded reader, all their comments on the canonical chapter, and all their notifications. THIS IS NOT ACCEPTABLE even on demo data.

Required:
- Do not bulk-clean seeded readers/chapter by user ID or chapter ID.
- Prefer unique E2E run UUID/marker, isolated throwaway fixture users, and exact IDs created by this run. Set up only what this test owns; clean it by its exact IDs.
- If the prior run left a target-specific artifact, identify it precisely by a run-owned marker/ID before deletion; if ownership cannot be proven, fail with `FIXTURE_CONTAMINATED` rather than deleting unrelated records.
- Enforce the same test-only DB/environment safety guard before fixture cleanup.
- Do NOT fake browser acceptance by directly creating/deleting the accepted target comment, report or moderation review as a substitute for UI operations.
- Retain real rendered Logout/Login transitions, browser POSTs, and exact PostgreSQL+Mongo correlations.

### Required proof — sentinel preservation

Add a destructive-cleanup regression that plants or selects unrelated sentinel records then verifies after both deterministic suite AND browser runner:

```text
unrelated COMMENT moderation review unchanged
unrelated COMMENT report unchanged
unrelated comment belonging to the SAME seed owner+chapter unchanged
unrelated notification belonging to the SAME seeded reader unchanged
```

If feasible, include a sentinel report for the same seeded reporter but a different target, to ensure reporter-only cleanup cannot recur.

Record each sentinel ID and before/after content/status/hash. Sentinel fixtures must themselves be created/deleted by a safe, explicit test-owned ID process; don't touch unrelated pre-existing records. If proof is impossible without a clean isolated environment, STOP and report the exact blocker.

A passing verdict must include machine-readable `sentinel_preservation` evidence. Do not merely state `true` without readback.

---

### P1 — reportability state

In `content-control.service.ts`, the current COMMENT gate checks missing/deleted and reader-visible chapter but does not require a reader-visible APPROVED comment.

For `targetType='COMMENT'`, require:
```text
comment exists
comment.status == APPROVED
comment.deletedAt == null
chapter and novel remain reader-visible/PUBLISHED
```

For `PENDING_MODERATION`, `REJECTED`, `DELETED`, missing or unpublished target:
```text
fail closed using established 404 CONTENT_001 convention
no report row
no moderation review created
```

Add focused real-service negative tests for these statuses; keep clean approved comment report flow unchanged.

---

### P1 — source-and-target-aware Admin UI decision copy

In `web/src/features/admin/AdminPage.tsx`, the current condition
```tsx
review?.source === 'USER_REPORT'
```
unconditionally says the reported comment will be removed/kept, even for report target types `NOVEL`, `CHAPTER`, or `USER`.

Required:
- Show `Approve report => remove reported comment` and `Reject report => keep comment` ONLY when `source=USER_REPORT && targetType=COMMENT`.
- For other USER_REPORT target types, avoid promises that backend does not implement; render truthful neutral resolution copy or a defensively disabled unsupported action, consistent with existing API policy. Do not implement new novel/chapter/user moderation side-effects in this gate.
- Preserve KEYWORD_FILTER semantics and existing successfully tested COMMENT UI flow.
- Include UI assertions for a USER_REPORT/NOVEL or USER_REPORT/USER review to ensure no false "comment removed" copy.

---

### P1 — duplicate/race and migration safety

Current migration:
```text
backend/src/core/database/migrations/012_reports_unique_open.sql
```
adds a partial unique index on `(reporter_id,target_type,target_id)` for `OPEN`; good direction, but not complete behavior on concurrent requests.

Current `createUserReport()` has check-then-create:
```text
findOpenReportByReporter
findOpenReview
createModerationReview
createReportRow
```

Required focused verification:
1. Concurrent same-reporter duplicate submits: exactly one OPEN report and a deterministic application-level `409 REPORT_001` for the loser (not raw PostgreSQL `23505` / 500).
2. Concurrent distinct reporters on the same COMMENT target: ideally one shared PENDING USER_REPORT review and separate OPEN reports. If current service creates duplicate pending reviews, fix narrowly with proper transaction/locking/uniqueness, preserving KEYWORD_FILTER behavior. No orphan PENDING review should remain after a failed duplicate insert.
3. Check how migration `012` behaves against existing OPEN duplicates. Do NOT delete historical reports silently. In a disposable DB, either demonstrate a safe explicit preflight/failure with remediation instructions or implement a deterministic non-destructive migration policy approved by existing project conventions. Test migration up/down if supported.
4. Maintain report/review semantics: `APPROVED` approves report/removes comment; `REJECTED` rejects report/keeps comment. Notifications and keyword-filter moderation must not regress.

Keep scope to the reported COMMENT lifecycle and existing moderation ownership. Avoid broad refactoring of moderation tables.

---

### Final validation and resealed lineage

The previous evidence at:

```text
docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md
docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E/comment-user-report-admin-moderation-e2e-evidence.json
```

refers to tested code SHA `6a30907...` and becomes superseded after code fixes.

Once fixes are committed:
1. Ensure clean working tree; push **FINAL_TESTED_CODE_SHA** so it resolves remotely.
2. Run validation on that exact tree:
   - web typecheck/build
   - backend typecheck
   - focused PostgreSQL+Mongo test suite including added sentinels/concurrency cases
   - backend full `npm test` in guarded isolated test environment
   - migration acceptance
   - real browser Report-A..J with real UI auth transitions
   - sentinel readback AFTER all tests and E2E cleanup
3. Capture actual exit codes, test counts, test database guard configuration (NO passwords/URLs containing credentials), and the ID-specific before/after sentinel readbacks.
4. Reseal evidence JSON, report and screenshots with:
```text
tested_main_sha = FINAL_SYNCED_MAIN_SHA
tested_code_sha = FINAL_TESTED_CODE_SHA
verdict = COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
boundary = LOCAL_PASS_CI_PENDING
```
5. Explicitly record remediations for P0 teardown, P0 runner cleanup, comment status guard, Admin copy, concurrency/23505, and migration.
6. Include all new evidence in an evidence commit/lineage seal after tested code SHA.

Only claim PASS if every check actually ran and passed. No hardcoded success flags. Evidence must not contain passwords, tokens, cookies, or secrets.

### Stop boundary

```text
branch behind main = 0
working tree clean
NO unscoped destructive cleanup in test or runner
sentinel preservation verified after full execution
validated COMMENT reportability states
Admin source+target copy truthful
concurrent duplicate/review integrity verified
migration safety checked
Report-A..J PASS
Phase C expanded suite PASS
final evidence points to remotely resolvable tested SHA

COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

Push branch and STOP. Gemini must not create a PR, merge, start Wallet/VIP, clean FE-owned Author static metrics, or reopen accepted AI/Story Brain gates.

ChatGPT owns remote review, PR, CI and merge.

---

## 6. Reporting Discipline

Always distinguish:

```text
structural/system correctness
real-provider availability
narrative/literary quality
UI completeness
```

Do not infer one from another.

Historical implementation/review transcripts belong in:
- `docs/development/*report.md`;
- evidence JSON;
- PR history;
- Git history.

Keep this file limited to current canonical state, architecture invariants, ownership, and the next executable gate.
