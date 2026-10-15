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

## 5. EXECUTE NOW — Product UI Integration Inventory

### Remote execution reminder

ChatGPT re-checked the remote repository before this assignment:

```text
latest main before this reminder:
a21e9ac2e4165adaa0f38e38f857a5fd27e6301b

expected working branch:
astra/product-ui-integration-inventory

remote branch:
NOT CREATED YET

required report:
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.md

remote report:
NOT PRESENT YET
```

Start this gate now. After this reminder is committed, fetch the actual latest `origin/main`; do not hard-code the SHA above as the inventory base if main has advanced.

Create and work only on:

```text
astra/product-ui-integration-inventory
```

This remains an **inventory/reconnaissance-only gate**. Do not implement the selected next product gate yet.


This is an inventory/reconnaissance gate, not an implementation phase.

### Start from the actual latest main

After this directive is committed:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/product-ui-integration-inventory
```

Record:

```text
INVENTORY_BASE_MAIN_SHA = git rev-parse origin/main
branch = astra/product-ui-integration-inventory
```

Do not reuse old UI or AI acceptance branches.

### Goal

Determine the real product state of every significant web surface by combining:

```text
route/source inspection
+
rendered browser inspection
+
actual network/API observation
+
backend/service correlation
+
existing E2E evidence
```

File existence alone is not evidence that a feature works.

### Required classification

Every significant surface must receive exactly one primary classification:

```text
REAL + E2E-COVERED
REAL + NOT-YET-E2E-COVERED
PARTIALLY-WIRED
MOCK / STATIC
BROKEN CONTRACT
NOT_IMPLEMENTED
OBSOLETE / DUPLICATE
```

Also assign priority:

```text
P0 = core user-visible flow is fake/broken or blocks basic product use
P1 = core flow appears real but lacks browser acceptance / has meaningful gaps
P2 = secondary feature incomplete or weakly integrated
P3 = cosmetic, polish, duplicate cleanup, or non-blocking
```

### Phase A — static route and component inventory

Inspect the current web routing tree and identify every real route.

At minimum cover these product areas if routes/components exist:

```text
PUBLIC / READER
- landing / discovery
- search / category / ranking
- novel detail
- chapter reader
- comments / reactions
- bookmarks / library / reading history
- payments / chapter unlock if implemented

AUTH / ACCOUNT
- sign in
- sign up
- refresh/logout behavior
- profile
- account/settings
- role guards / unauthorized redirects

AUTHOR
- dashboard
- novel create
- novel edit / Novel Data
- chapter list/create/edit/delete
- draft/autosave
- publish / VIP / price
- Author Writing IDE
- Story Bible
- Manuscript Import
- Story Plan / autonomous controls if exposed
- analytics / earnings if exposed

ADMIN / MODERATION
- dashboard
- users
- novels
- reports / moderation queue
- categories/tags
- monetization/admin controls
```

Do not invent missing features. If something does not exist, record `NOT_IMPLEMENTED`.

Identify obsolete generated/static/duplicate pages separately rather than treating them as production routes.

### Phase B — browser reconnaissance

Run the current local production-like stack and the real web app.

Use at least these identities if available in current fixtures:

```text
anonymous visitor
reader
author
admin
```

For each major route:

1. navigate through rendered UI where possible;
2. verify it actually renders;
3. interact with the primary CTA/form/button without destructive production-like mutations;
4. observe CDP/browser network requests;
5. correlate the request with the actual backend route/service;
6. identify static hard-coded data, fake counters, no-op buttons, 404/500s, auth leaks, ownership failures, and stale API contracts;
7. record whether any existing browser E2E already proves the flow.

Do not mark a surface `REAL` merely because it makes one API request. The primary user action must be meaningfully wired.

Do not mark a surface `E2E-COVERED` from unit/API tests alone.

### Phase C — integration matrix

Create:

```text
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.md
```

The main table must contain at least:

```text
Area
Route
Primary user
Primary user action
Rendered status
Observed browser/API requests
Backend route/service
Persistence owner
Auth/ownership behavior
Existing browser E2E evidence
Primary classification
Priority
Concrete blocker/gap
Recommended next action
```

For routes with no API call because they are intentionally static/navigation-only, state that explicitly.

For mock/static pages, identify the mock data source or hard-coded behavior.

For broken contracts, include the exact UI expectation vs backend contract mismatch.

### Phase D — product flow map

Do not only list isolated screens. Group them into end-to-end user journeys and classify whether each journey is usable:

```text
Reader:
discover -> novel detail -> read chapter -> continue/history/library

Author:
create novel -> configure metadata -> create/import chapter
-> edit/write -> Story Brain/AI -> publish

Admin:
sign in -> moderation queue -> inspect target -> take moderation action

Account:
sign up/sign in -> session persistence -> profile/settings -> logout
```

For each journey, explicitly identify the **first broken or unverified transition**.

This transition is usually a better next gate than the weakest-looking isolated component.

### Phase E — reconcile with already-accepted gates

These are already accepted and must not be downgraded without a concrete observed regression:

```text
AI-PIPE-01A
AI-PIPE-01B
AI-PIPE-02A
AI-PIPE-02B
AI-PIPE-03A
MANUSCRIPT-IMPORT-UI
```

If browser reconnaissance finds a regression in one of them:
- record the exact route/action/request;
- attach reproducible evidence;
- classify it as a regression;
- do not redesign the architecture during this inventory gate.

### Phase F — choose exactly one next executable gate

At the end of the report, produce a ranked list of P0/P1 gaps.

Then select **exactly one** recommended next gate using:

```text
highest user value
x blocks the largest real user journey
x smallest bounded implementation scope
x highest confidence that browser E2E can close it
```

For the selected next gate provide:

```text
gate name
user journey
current failure/gap
exact routes/components involved
backend APIs/services involved
minimum implementation scope
browser E2E checkpoints
acceptance criteria
explicit non-goals
estimated architectural risk: LOW / MEDIUM / HIGH
```

Do not implement that gate yet.

### Evidence discipline

The report must distinguish:

```text
STATIC_INSPECTION
BROWSER_OBSERVED
NETWORK_OBSERVED
API_CORRELATED
DB_CORRELATED
EXISTING_E2E_PROVEN
NOT_VERIFIED
```

Never present static inspection as browser evidence.

Screenshots are optional for this inventory, but recommended for broken/mock/high-risk surfaces.

Do not store credentials, tokens, private manuscript bodies, or secrets.

### Minimum validation before push

At minimum run:

```text
web typecheck/build
route/component static inventory
browser reconnaissance over every major product area
network correlation for all P0/P1 surfaces
```

This gate does not require rerunning the closed AI browser suites unless a regression is observed.

### Deliverables

Required:

```text
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.md
```

Optional but encouraged:

```text
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.json
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY/
  screenshots of P0/P1 findings
```

The report header must record:

```text
inventory_base_main_sha
branch
browser/runtime used
date
web build result
number of production routes inventoried
classification counts
P0/P1/P2/P3 counts
selected next gate
```

### Stop boundary

When inventory is complete:

```text
git status clean
commit report/evidence
push astra/product-ui-integration-inventory
STOP
```

Final status:

```text
PRODUCT_UI_INVENTORY_COMPLETE
REVIEW_PENDING
```

Gemini must not:
- implement the selected next gate;
- perform a broad UI refactor;
- create a PR;
- merge to main;
- reopen accepted AI/Manuscript architecture without a reproduced regression.

ChatGPT will review the inventory, validate the prioritization, and issue the next bounded implementation/E2E directive.

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
