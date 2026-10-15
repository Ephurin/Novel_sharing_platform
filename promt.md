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

Do not reopen P1/P2/P3 or Manuscript Import architecture without a concrete regression or explicitly approved new scope.

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

## 5. FINAL HARDENING DIRECTIVE — Author Publish / Moderation E2E

The functional product lifecycle is accepted in direction. Do not open a PR yet.

Current reviewed branch:

```text
astra/author-publish-admin-moderation-e2e
```

Reviewed remote head before this directive:

```text
401b8da300f31f44c742ffc9282856c71443eb5a
```

Reviewed product/test baseline:

```text
6b94d8a7d6b0298f0d58979c48038ce2d9ce32ed
```

Accepted functional behavior:

```text
Author creates DRAFT via rendered UI                 PASS
deterministic harassment rule triggers moderation    PASS
browser submit-publish -> PENDING_MODERATION          PASS
exact moderationReviewId correlation                  PASS
Admin queue/detail exact target                       PASS
Admin APPROVED -> novel PUBLISHED                     PASS
published_at persisted                                PASS
anonymous /public discovery                           PASS
publish CTA/status badge product fix                  ACCEPTED
Phase-C deterministic service invariants              IMPLEMENTED
```

The only remaining work is evidence/runner hardening plus final rerun.

### FE-owned debt is explicitly out of scope

Do not fix or redesign existing mock/static presentation values in Author UI in this branch.

Known FE-owned debt includes examples inherited from PR #44 / commit `0e7012c`:

```text
285.4k views fallback
86.4k Xu revenue fallback
static creation/update timestamps
other mock/static display values ported from design HTML
```

These are assigned to FE separately and must not block this lifecycle gate.

However, correct the inventory wording so it does not claim `MOCK / STATIC = 0` as a universal property of all display fields. The lifecycle route can be real while containing FE-owned static presentation debt.

Do not alter those FE values here.

---

### Step 1 — sync this final directive

After this commit lands on main:

```bash
git fetch origin
git checkout astra/author-publish-admin-moderation-e2e
git pull --ff-only
git merge origin/main
```

Record the actual synced main SHA:

```text
FINAL_SYNCED_MAIN_SHA = git rev-parse origin/main
```

Branch must be behind main by zero before the final run.

---

### Step 2 — fix Publish-D and Publish-H session transitions

Current runner incorrectly uses direct storage clearing for the decisive logout transition.

Production UI already provides canonical logout in:

```text
web/src/app/layout/WebAppShell.tsx
```

The rendered `Logout` button executes:

```text
logout() backend call
-> clearSession()
-> queryClient.clear()
-> navigate('/login')
```

Change the browser runner so:

```text
Publish-D:
Author clicks rendered "Logout"
-> browser observes /login
-> Admin fills rendered login form
-> Admin enters /admin

Publish-H:
Admin clicks rendered "Logout"
-> browser observes /login / unauthenticated state
-> navigate to /public as guest
```

Do not use:

```text
localStorage.clear()
sessionStorage.clear()
token injection
direct auth-store mutation
```

as the decisive transition for Publish-D or Publish-H.

Direct storage cleanup may only be used as test-process cleanup after acceptance is complete, not as a PASS-producing user action.

Capture evidence:

```text
author_logout_browser_request_id if logout endpoint is observable
author_logout_destination
admin_login_browser_request_id
admin_logout_browser_request_id if observable
anonymous_session_verified
```

At minimum the DOM/route must prove the authenticated shell disappeared after logout.

---

### Step 3 — evidence credential hygiene

The repository intentionally contains deterministic demo seed credentials in deployment/demo documentation. That does not justify copying password/token values into generated evidence.

Before final evidence commit:

```text
no password values in evidence JSON
no access/refresh token values in evidence JSON
no password values captured from rendered input snapshots
no auth token values captured in inventory JSON
```

For the new browser runner, do not commit a password literal.

Read the deterministic demo password from an environment variable, e.g.:

```text
EPHURIN_E2E_DEMO_PASSWORD
```

Fail with a clear setup error if missing.

The account identifiers/emails may remain because they are deterministic non-secret fixtures.

Sanitize the cherry-picked inventory artifact:

```text
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.json
```

For any password input:

```text
type=password
value must be omitted or "<redacted>"
```

Update `scripts/recon_product_ui_inventory.py` so future runs never persist password values.

Also remove any fallback that silently injects access tokens into browser storage and then presents the route as browser-authenticated. If a normal UI login fails, reconnaissance must record auth failure rather than bypassing it.

Do not rewrite the whole inventory.

---

### Step 4 — make negative evidence derived, not asserted by constant

Current browser runner must not end with five unconditional:

```text
negative_check_results = true
```

The production-path deterministic suite already exists:

```text
backend/src/modules/content-control/author-publish-moderation-lifecycle.postgres.test.ts
```

It exercises:

```text
non-admin resolve guard
duplicate resolve 409
published resubmit 409
single open pending review
unrelated-review isolation
```

The final evidence must link its negative claims to the actual executed suite.

Preferred shape:

```json
"negative_suite": {
  "test_file": "...author-publish-moderation-lifecycle.postgres.test.ts",
  "command": "<actual command>",
  "exit_code": 0,
  "result": "PASS",
  "covered_invariants": [
    "role_guard_reader_author_forbidden_403",
    "duplicate_resolve_fails_closed_409",
    "already_published_novel_resubmit_fails_409",
    "target_idempotent_no_duplicate_pending_reviews",
    "unrelated_review_cannot_satisfy_target"
  ]
}
```

Do not write PASS or boolean true if that suite was not executed successfully in the same final validation run.

If practical, capture machine-readable TAP/JSON output. Do not add complex infrastructure solely for this.

---

### Step 5 — add a real validation manifest

The final report/evidence currently under-specifies local validation.

Final evidence must record the exact executed commands and results for at least:

```text
web typecheck
web build
backend typecheck
author publish/moderation lifecycle PostgreSQL tests
relevant novels/content-control tests
relevant admin/reading tests
real browser Publish-A..H
```

Use the repository's actual package scripts discovered locally; do not invent command names.

Recommended machine-readable structure:

```json
"validation": [
  {
    "name": "web_typecheck",
    "command": "...",
    "exit_code": 0,
    "result": "PASS"
  }
]
```

Where a test runner reports counts, include:

```text
tests_passed
tests_failed
```

Do not claim a command was run unless it was executed from the final tested tree.

---

### Step 6 — final tested lineage and rerun

After all hardening code changes but before generated evidence:

```text
git status clean
FINAL_TESTED_CODE_SHA = git rev-parse HEAD
```

Push that SHA so it resolves remotely.

Then from exactly `FINAL_TESTED_CODE_SHA` execute the full final validation and browser flow.

Publish-A..H must all pass again.

The final browser evidence must still prove:

```text
A browser-created DRAFT owned by Author
B persisted moderation-triggering synopsis
C browser submit -> moderationRequired=true + exact reviewId
D real UI Logout -> Admin UI Login
E exact target review visible
F exact target approved through rendered Admin UI
G reload + DB: APPROVED / PUBLISHED / published_at
H real UI Logout -> anonymous public search/detail
```

Generate:

```text
FINAL_TESTED_CODE_SHA
  -> FINAL_EVIDENCE_PAYLOAD_SHA
  -> optional FINAL_LINEAGE_SEAL_SHA
```

Evidence must record:

```text
tested_main_sha = FINAL_SYNCED_MAIN_SHA
tested_code_sha = FINAL_TESTED_CODE_SHA
branch = astra/author-publish-admin-moderation-e2e
```

plus the existing novel/review/browser correlation fields, the logout/session fields, `negative_suite`, and `validation`.

---

### Step 7 — report wording corrections

The final report may say:

```text
AUTHOR_PUBLISH_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

only after the final run.

Correct prior overclaim:

Do not say “Author logs out via UI” unless the final runner actually clicks the rendered Logout button.

Correct inventory interpretation:

```text
route/API lifecycle reconnaissance found no P0 broken contract
BUT some production screens contain FE-owned mock/static presentation debt
```

Do not classify the static metrics cleanup as part of this gate.

---

### Stop boundary

When complete:

```text
branch behind main = 0
git status clean
all validation commands PASS
Publish-A..H PASS
evidence contains no password/token values
negative claims derived from executed suite
final SHAs resolve remotely
AUTHOR_PUBLISH_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

Push and STOP.

Gemini must not:
- create a PR;
- merge;
- touch the FE-owned static metric/date cleanup;
- implement Reader/Wallet/VIP work;
- reopen AI/Story Brain architecture;
- claim GitHub Actions PASS.

ChatGPT owns remote review -> PR -> CI -> merge.

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
