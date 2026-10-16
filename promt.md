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

## 5. ACTIVE EXECUTION DIRECTIVE — CLOSE COMMENT REPORT E2E REVIEW GAP

### Situation and scope

Gate: `COMMENT-USER-REPORT-ADMIN-MODERATION-E2E`  
Existing branch: `astra/comment-user-report-admin-moderation-e2e`  
Current reviewed evidence HEAD: `7bf26fd5b3415038b172dcaa25f609287f4ce907`  
Current final tested code: `89252479f047bd372bc0e19b39463905d866f383`  
Canonical main before handoff: `1f7a7035f8b0fb6017d4a0249d9c3bf5c35762ec`  
Current remote verdict: `LOCAL_PASS_CI_PENDING` **as recorded by Gemini**, not yet independently CI accepted.

The full rendered Reader → report → Admin approval → notification lifecycle (Report-A..J + F2), 17/17 Phase C, 11 guard tests, 123 backend tests, six-stage migration 012 and five full-span sentinels are already evidenced locally. **Do not reimplement or redesign them.**

**Single remaining code review gap:** The MongoDB collision test in `scripts/run_comment_user_report_admin_moderation_e2e.py` currently does:

```python
existing_mongo = get_existing_mongo_databases()
mongo_collision_caught = coll_mongo_name in existing_mongo
assert mongo_collision_caught
```

This proves a database is listed, but it does NOT prove the **actual runner provisioning path rejects** a colliding database without modifying it. The test currently has a self-fulfilling PASS. Fix the test seam, not the product lifecycle.

Latest `main` also adds `docs/development/DEVELOPMENT_HISTORY.md`, which records engineering decision history including this ongoing gate. It must stay accurate: DO NOT label this gate CI_PASS or MERGED until ChatGPT closes the PR.

### A. Sync existing branch first

```bash
git fetch origin
git checkout astra/comment-user-report-admin-moderation-e2e
git pull --ff-only
git merge origin/main
git rev-parse origin/main
git rev-parse HEAD
git status --porcelain
```

Record `FINAL_SYNCED_MAIN_SHA` and preserve the new development-history document. Behind `main` must be 0.

### B. Fix MongoDB collision test by testing the real guard

1. Extract the **actual MongoDB pre-provision check** from runner `main()` into one small reusable function, e.g. `assert_mongo_database_absent(db_name)`:
   - read names from the actual intended Mongo server;
   - if the target name already exists, raise `TEST_DB_ALREADY_EXISTS` before any creation/insertion/drop;
   - fail closed on list-databases errors rather than treating errors as an empty list;
   - use exactly the same function from normal runner provisioning and the collision-negative test. Do not make a second imitation of the condition.
2. In the negative test, create a **test-owned** named Mongo database and insert a unique sentinel document. Record its ID, fields and SHA-256.
3. Call the shared, real guard on this deliberately pre-existing database. Capture the expected `TEST_DB_ALREADY_EXISTS` error. Assert that provisioning did not continue, `mongo_db_created_by_this_run` was not assigned to that existing DB, and no cleanup of it was attempted by the rejected provision.
4. Read the same sentinel from Mongo again. Assert fields and SHA-256 identical. Only the outer test harness that explicitly created this disposable collision fixture may remove it afterward.
5. Repeat the guard on a fresh nonexistent name and verify it allows continuation (without claiming an actual create/delete happened until observed). Negative/positive paths must both be exercised.
6. **Connection identity:** The current `get_existing_mongo_databases()` / `query_mongo_db()` use Docker container `novel_sharing_platform-mongodb-1`, while backend derives `ISOLATED_MONGO_URI` from `BASE_MONGODB_URI`. Ensure that preflight queries and backend truly target the same Mongo server; either route checks through the exact configured endpoint or fail closed if environment points to a different server. Do not expose credentials or redesign all database infrastructure.
7. Preserve the caller-supplied `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` gate before any mutation. No self-authorization, default `ephurin` target, hardcoded PASS, or broad cleanup.

Keep this patch minimal. Primary file: `scripts/run_comment_user_report_admin_moderation_e2e.py`; touch a small supporting test/helper only when unavoidable. No product service/UI changes without a directly exposed regression.

### C. Remove unsupported PASS language

The existing `collision_refusal_tests.tests[fresh_unique_db_names_provision_and_ownership]` is appended as PASS before teardown; that statement should instead be **derived from observed final ownership and cleanup flags**, or explicitly marked as pending until teardown has succeeded.

For `credential_and_secret_hygiene`, do not claim a runtime secret scan if the test only appends `secrets_redacted=True`; either add a bounded actual check of generated artifacts or describe it honestly as a static policy/manifest assertion.

Preserve actual traces and hashes; never regenerate “PASS” records without rerunning.

### D. Execute final validation and reseal lineage

1. Commit and push fixed code. Record `FINAL_TESTED_CODE_SHA`.
2. Execute negative collision tests (same Mongo guard invoked by provisioning; untouched sentinel), external opt-in rejection, real owned-only teardown, migration 012 acceptance, full-span sentinel checks, web typecheck/build, backend typecheck, Phase C tests, backend `npm test`, browser Report-A..J+F2. If no production code changed, the latest established functional checks can still be run as the integrated runner manifest; do not claim execution if unavailable.
3. Keep all E2E targets isolated and disposal-owned; preserve P7/P8 production default settings.
4. Regenerate and commit:
   - `docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md`
   - `docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E/comment-user-report-admin-moderation-e2e-evidence.json`
   - Browser screenshots only if browser flow was actually rerun.
5. Evidence JSON: exact `tested_main_sha`, `tested_code_sha`, `collision_refusal_tests` with *observed* guard exception and actual sentinel readbacks, `db_creation_ownership` with after-cleanup state, `db_isolation`, `migration_012_validation`, `sentinel_preservation`, `validation`, verdict and `LOCAL_PASS_CI_PENDING` boundary. No passwords, JWTs, cookies or raw credential-bearing DB URLs.
6. Review the existing `docs/development/DEVELOPMENT_HISTORY.md`. Preserve EDR-12 as “in review”, with no premature CI/MERGED claim; do not expand the document needlessly. ChatGPT will update remote closure in that history after actual PR merge.

### Stop boundary — hand back for PR/CI

```text
branch behind main = 0
working tree clean
new final tested code SHA pushed
evidence commit references that exact SHA
Mongo collision test invokes SAME guard as provisioning
test-owned collision sentinel unchanged on refusal
positive path and actual owned-only teardown checked
no unsupported hardcoded PASS claims
local Report-A..J + F2 / Phase C / guard / migration / sentinel PASS
COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

If a check fails, label it FAILED/BLOCKED honestly and push diagnostic evidence only; do not claim PASS.

Push branch and **STOP**. Gemini must not create PR, merge, widen scope to Wallet/VIP/Story Brain, or write CI_PASS into either report or development history. ChatGPT owns code review, opening PR, P7/P8 CI, merge, and remote-closure history entry.

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
