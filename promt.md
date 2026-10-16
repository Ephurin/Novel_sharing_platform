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

## 5. ACTIVE EXECUTION DIRECTIVE — FINAL ISOLATION + SENTINEL/MIGRATION ACCEPTANCE

This is a STRICT TARGETED FOLLOW-UP to the prior hardening review; no new feature gate.

```text
Gate: COMMENT-USER-REPORT-ADMIN-MODERATION-E2E
Branch: astra/comment-user-report-admin-moderation-e2e
Last reviewed head: c8016484d387bcda3eaf4902335228b765c3d19b
Tested code at last evidence: a6fac5c38fde2015b046a59469895cc50de6368d
Main before this directive: 1b49d94577500c4456cfa4c7871b4c9fc713b2cc
Remote review verdict: LOCAL_PASS_WITH_REVIEW_BLOCKERS / NOT_READY_FOR_PR
```

Already accepted as local functional evidence: browser Report-A..J; source+target-aware Admin modal Checkpoint F2; 17 deterministic COMMENT USER_REPORT invariants; transactional report creation; report/review unique indexes; source-aware comment removals and notifications. **Do not reimplement these.**

The previous unsafe blanket delete bug was materially reduced by tracked-ID cleanup in code and 5 sentinel checks. However, two acceptance-critical defects remain. Fix these before any PR.

### 0. Sync and inspect

```bash
git fetch origin
git checkout astra/comment-user-report-admin-moderation-e2e
git pull --ff-only
git merge origin/main
```

Record `FINAL_SYNCED_MAIN_SHA` and ensure `behind main = 0`. Reuse this existing branch; do not make a second gate branch.

Review current:
```text
backend/src/modules/content-control/comment-user-report-admin-moderation.postgres.test.ts
scripts/run_comment_user_report_admin_moderation_e2e.py
backend/src/core/config/env.ts
backend/src/core/database/postgres.ts
backend/src/core/database/mongo.ts
backend/src/core/database/migrate.ts
backend/src/core/database/migrations/012_reports_unique_open.sql
docker-compose.yml
.github/workflows/p7-semantic-memory.yml
.github/workflows/p8-cutover.yml
```

### P0 — hard fail-closed database guard, not a self-authorizing env flag

Confirmed unsafe code in the test file:

```ts
process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' ||
process.env.NODE_ENV === 'test' ||
process.env.CI === 'true' ||
Boolean(process.env.npm_lifecycle_script)
```

The condition `CI=true`, `NODE_ENV=test` or `npm test` NEVER proves target database isolation.

Confirmed unsafe E2E runner behavior:

```python
DB_URL = "postgresql://...@localhost:5432/ephurin"
os.environ["EPHURIN_ALLOW_TEST_DB_MUTATIONS"] = "1"
```

This permits the runner to authorize itself to mutate a conventional persistent database.

Required changes:

1. Provision a **disposable, explicit isolated test environment** (distinct PostgreSQL database and MongoDB database; ideally separate Compose project/volumes and ports). Use existing repo migrations and deterministic seed against ONLY that environment. Prefer unique names like `ephurin_report_e2e_<run_id>` or a dedicated isolated Compose project.
2. Node backend tests, web/browser backend server and Python runner must target the **same** isolated PostgreSQL and MongoDB, verified from their actual resolved connection configuration. No silently falling back to default `ephurin` database/port or default Compose Mongo container.
3. Make a shared fail-closed preflight/helper for mutating tests/runner as practical. Require ALL of:
   - explicit external opt-in `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` (the runner must not set it itself);
   - actual PostgreSQL database identity checked via `SELECT current_database(), inet_server_addr(), inet_server_port()`, with an expected isolated test DB name/identity;
   - actual MongoDB database identity checked from `MONGODB_URI` / driver database name and accessible target;
   - a positive isolation assertion (dedicated disposable Compose project/database instance, or explicit approved test DB identity), not just strings naming production/demo instances.
4. Reject ordinary default `ephurin` DB / default seed Mongo database and any non-isolated target **before any insert, delete, migration, or fixture creation**. If isolated environment cannot be provisioned, STOP as `TEST_DB_ISOLATION_MISSING`.
5. Prove negative guard tests: `CI=true`, `NODE_ENV=test`, `npm test`, missing opt-in and a wrong/non-test database each fail before mutation. Never run these tests with destructive access to genuine user data.
6. Keep guard execution compatible with full backend regression in the isolated environment. It is acceptable to run full backend tests locally against the isolated Compose setup and leave existing unrelated P7/P8 CI scripts untouched.

Do not commit credentials or live DB connection strings to evidence. Only record safe identities, validation booleans, and run IDs.

### P0 — same sentinels must span entire mutating validation sequence

Current runner executes focused tests + `npm test` FIRST, then plants 5 browser sentinel records. The 5 browser sentinel hashes therefore do not prove preservation through the earlier tests.

Required:
1. Resolve isolated DB identities and pass guard.
2. Plant 5 exact-ID sentinel entities BEFORE any focused/backend mutating test execution:
   - unrelated COMMENT review;
   - unrelated COMMENT report;
   - same reporter, DIFFERENT target report;
   - same owner + chapter, DIFFERENT comment;
   - same user, unrelated notification.
3. Capture before fingerprints with stable deterministic serialization and full `hash_before`.
4. Execute focused suite and complete `npm test`, then real browser Report-A..J and Checkpoint F2.
5. Verify **the same sentinel IDs** after the test suite and again after browser E2E + cleanup. Store real `hash_after_tests`, `hash_after_browser`, and compare to pre-run hashes. Do not claim hashes match without actual reread.
6. Remove only the exact run-owned sentinel IDs after verification. Preserve unrelated data unconditionally.
7. In failure paths, ensure process/server teardown is deterministic and cleanup remains ID-scoped; if safety cannot be proven, stop and leave evidence with the failure rather than executing broad cleanup.
8. Ensure the TS test teardown also uses exact created IDs. Remove this remaining broad-looking operation if possible:
   ```sql
   DELETE FROM reports WHERE reporter_id = ANY(trackedUserIds)
   ```
   despite trackedUserIds being generated fixtures, prefer exact report IDs to establish consistent ownership boundary.
9. Keep browser POST comment/report/approve and rendered Logout/Login **real**; do not mutate the accepted target state directly in DB to fake success.

Only after these prove safety may the report say `SENTINEL_PRESERVATION_PASS`. A 5x `hash_match=true` claim alone is insufficient.

### P1 — migration 012 preflight/failure/reapply acceptance

The existing `012_reports_unique_open.sql` does a preflight for duplicate OPEN reports and duplicate PENDING reviews and creates partial unique indexes. This is reasonable but has not been validated in a recorded migration manifest.

Test in disposable isolated PostgreSQL DB ONLY:

- baseline earlier schema installed, migration 012 not yet marked applied;
- duplicate OPEN reports -> migration fails clearly and atomically; pre-existing rows are untouched; `schema_migrations` does not falsely mark 012 complete;
- duplicate PENDING review for same target+source -> failure equally non-destructive;
- clean data -> migration succeeds and both unique indexes exist;
- rerun `db:migrate` -> 012 skipped/reapply idempotently, with no data loss;
- verify historical RESOLVED/REJECTED reports do not collide with OPEN partial index;
- optional rollback test ONLY if repo has a supported downgrade mechanism; `backend/src/core/database/migrate.ts` currently supports forward migrations with transaction + `schema_migrations`, NOT an explicit downgrade mechanism. Do not invent a downgrade claim.

Record commands, database identity (non-secret), exit codes, tested index names and pass/fail behavior.

### P1 — honest documentation

The prior report says that five sentinel fingerprints “mathematically prove no broad or unscoped deletion occurred.” Replace with precise scoped language: matching sentinel hashes show *those* records stayed unchanged within the observed test window; they do not prove that arbitrary other records cannot be deleted.

Similarly remove absolute statements such as “all mutations only originated in rendered UI” when the same runner explicitly seeds sentinels/tests via DB; say "**decisive acceptance lifecycle mutations** originated in the rendered UI; fixture setup/cleanup and assertions used DB."

### Final validation / evidence lineage

Do not change unrelated FE hardcoded presentation, Wallet/VIP, Story Brain, or previously accepted gates.

After safe code changes:

```text
FINAL_TESTED_CODE_SHA = new pushed commit with isolated-db guard + sentinel/migration fixes
```

Run on that exact tree:
```text
- isolated database identity preflight PASS
- negative guard tests PASS (unsafe configurations refused)
- migration 012 failure + success + idempotency PASS
- web typecheck + build PASS
- backend typecheck PASS
- expanded COMMENT report PostgreSQL/Mongo tests PASS
- full backend npm test PASS
- browser Report-A..J + F2 PASS
- sentinel readbacks after tests and browser PASS
- no password/token/cookie/connection secret in evidence
```

Regenerate:
```text
docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md
docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E/comment-user-report-admin-moderation-e2e-evidence.json
10 browser screenshots if the flow is rerun
```

Evidence must distinguish executed test claims from narrative report claims, include actual machine-readable `db_isolation`, `guard_negative_tests`, `migration_012_validation`, `sentinel_preservation` (before/after hash values), `validation`, `tested_main_sha`, `tested_code_sha`, and a clear verdict.

After committing evidence and pushing:

```text
branch behind main = 0
git status clean
isolated-DB guard proven
migration/sentinel proof complete
COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

Gemini must STOP without creating PR, merging, implementing Wallet/VIP, or claiming GitHub CI pass. ChatGPT owns remote code review, PR, CI, and merge.

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
