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

## 5. ACTIVE EXECUTION DIRECTIVE — FINAL P1 DATABASE OWNERSHIP PATCH

Gate: COMMENT-USER-REPORT-ADMIN-MODERATION-E2E.
Existing branch: astra/comment-user-report-admin-moderation-e2e.
Last reviewed head: 3e8bfe6a3fdf379cf36b7a6d9c8693418172a707.
Final locally tested code from prior evidence: 12607475117b0166401efc857e8d1bded1db19ed.
Main before this directive: 3d51838e758ed86b68795d6d3af0b0daa66b3c8f.

This is a tightly bounded final safety patch, NOT a new functional gate. The existing evidence reports Report-A..J+F2, 17/17 Phase C tests, 11/11 guard tests, 123 backend tests, 5 full-span sentinels, and 6-stage migration validation as local PASS. Those results are not remote CI PASS.
Remote verdict until this patch is confirmed: LOCAL_PASS_WITH_REVIEW_BLOCKERS / NOT_READY_FOR_PR.

### 0. Sync latest main into EXISTING branch

git fetch origin; git checkout astra/comment-user-report-admin-moderation-e2e; git pull --ff-only; git merge origin/main.
Record FINAL_SYNCED_MAIN_SHA, keep branch behind main=0. Do not create a new branch, PR or merge.

### P1-A — eliminate standalone self-authorization

In scripts/validate_migration_012.py, the __main__ entrypoint sets os.environ['EPHURIN_ALLOW_TEST_DB_MUTATIONS']='1'. DELETE this self-authorization. The function's external opt-in check remains mandatory. Prove standalone invocation without caller-provided opt-in REFUSES before any DB connection/mutation, and a caller opt-in allows running 6-stage migration acceptance only on a disposable DB.

### P1-B — never DROP an already-existing database during provision

Both scripts/validate_migration_012.py and scripts/run_comment_user_report_admin_moderation_e2e.py currently execute DROP DATABASE IF EXISTS <run-generated-name> BEFORE CREATE DATABASE. This is unsafe if the generated name collides. Replace with CREATE DATABASE only; treat already-exists SQLSTATE 42P04 as TEST_DB_ALREADY_EXISTS and stop, preserving existing rows. Do not retry by dropping and recreating. Ensure enough entropy in run identity.

Use same resolved PostgreSQL host/port for migration admin connection and test DB connection. Avoid hard-coded localhost when ADMIN_DATABASE_URL points elsewhere.

The E2E runner must also query the actual MongoDB server for existing database names BEFORE any Mongo seed/fixture/sentinel insertion. If an identically named DB already exists, REFUSE and preserve it. Do not infer absence from a URI or prefix. Check both PG and Mongo before any destructive setup.

Track pg_db_created_by_this_run and mongo_db_created_by_this_run (or exact equivalent) as affirmative ownership evidence. Cleanup may drop ONLY resources positively created by that run. An error between CREATE and the browser-stage try/finally must not leave unsafe cleanup behavior; wrap all provisioning and execution in deterministic failure handling. Report cleanup errors, never convert them into PASS. Keep external opt-in check at script startup; neither entrypoint may self-enable it.

Preserve the already-fixed ID-scoped report/review/comment/notification teardown, Test DB guard, database-identity preflight, migration SQL, UI flows and product contracts. NO broad DELETE by reporter, chapter, or target type.

### P1-C — negative validation of collision / opt-in

Using intentionally disposable local test targets ONLY, execute and record:
1. Standalone migration script without opt-in: refused before mutation.
2. Standalone migration script with opt-in: six migration stages PASS.
3. Pre-existing test-named PostgreSQL DB with sentinel row: collision refused, same row/hash preserved.
4. Pre-existing test-named MongoDB DB with sentinel doc: collision refused, same doc/hash preserved.
5. Fresh unique PG and Mongo DB names: provision PASS, correct identity verified, cleanup only owned resources PASS.
6. No credentials, tokens or DB URL secrets in log/evidence.

### Reseal evidence only after the actual code is tested

Commit/push final tested code SHA first. Then rerun the full local manifest on that tree (web typecheck/build, backend typecheck, guard 11, Phase C 17, backend npm test, isolated DB migration 012, browser Report-A..J + F2). Keep 5 same-ID sentinel fingerprints before tests, after tests and after browser. Regenerate the report, JSON and screenshots. The JSON must record: tested_main_sha, tested_code_sha, db_creation_ownership, collision_refusal_tests, db_isolation, migration_012_validation, sentinel_preservation, validation, verdict. Capture real exit codes and hashes. Evidence commit follows tested code SHA.

Stop boundary: branch behind main=0, clean worktree, external opt-in enforced everywhere, PG/Mongo collisions refused without deletion, owned-only cleanup verified, migration/guard/Phase C/browser/sentinel PASS, COMMENT_USER_REPORT_ADMIN_MODERATION_PASS / LOCAL_PASS_CI_PENDING.

If any claim cannot be verified, stop and report exact blocker. Gemini does not create PR or merge. ChatGPT owns remote review/PR/P7-P8 CI/merge. Do not implement Wallet/VIP or unrelated frontend/AI tasks.

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
