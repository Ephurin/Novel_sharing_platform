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

## 5. NEXT ACTIVE GATE — Product UI Integration Inventory & Browser E2E Plan

The AI authoring core and Manuscript Import entry flow are now closed on local browser acceptance and required PR CI.

The next task is not another architecture redesign. It is a product-level inventory of the remaining web UI surfaces and their real backend wiring.

### Objective

Build a concrete matrix of all significant web routes/screens and classify each one as:

```text
REAL + E2E-COVERED
REAL + NOT-YET-E2E-COVERED
PARTIALLY-WIRED
MOCK / STATIC
BROKEN CONTRACT
NOT_IMPLEMENTED
OBSOLETE / DUPLICATE
```

Focus on what a real user can do through the rendered product, not only whether a component file exists.

### Required inventory

At minimum inspect:

```text
reader/public flows
- discovery / novel list
- novel detail
- chapter reader
- comments/reactions if implemented
- library/bookmarks/history if implemented

author flows
- author dashboard
- novel create/edit
- novel data/settings
- chapter lifecycle
- Author Writing IDE
- Story Bible
- Manuscript Import
- analytics/earnings if implemented

admin/moderation flows
- dashboard
- user/novel moderation
- reports/review queues
- monetization/admin controls if implemented

auth/account flows
- sign in / sign up
- profile/settings
- role/permission boundaries
```

For each surface record:

```text
route
intended user
rendered UI status
API calls actually used
backend route/service
persistence owner
auth/ownership rule
browser E2E coverage
known mock/static data
known blocker
recommended next action
```

### Deliverable

Create:

```text
docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.md
```

and optionally a machine-readable companion JSON if useful.

The report must produce a prioritized next-gate list, ordered by product value and integration risk.

Recommended priority rule:

```text
P0 = user-visible core flow is fake/broken
P1 = core flow real but lacks browser acceptance
P2 = secondary feature incomplete
P3 = cosmetic / non-blocking
```

### Browser reconnaissance

Use the current rendered web app against the real local backend.

Do not mutate production-like data destructively unless needed.

For each major route:
- navigate through UI where possible;
- capture whether the screen is real, placeholder, broken, or partially wired;
- correlate API/network calls;
- identify dead buttons/forms and client-only mocks.

API/DB inspection may support the diagnosis, but do not call an API-only flow a browser PASS.

### Architecture boundary

Do not reopen:

```text
AI-PIPE-01A
AI-PIPE-01B
AI-PIPE-02A
AI-PIPE-02B
AI-PIPE-03A
MANUSCRIPT-IMPORT-UI
```

unless the product inventory exposes a concrete regression in an accepted invariant.

### Stop boundary

This gate is inventory/planning only.

Gemini should:
- inspect locally;
- produce the inventory report;
- identify the smallest next executable UI integration gate;
- commit/push the report on a fresh branch from current main.

Gemini should not:
- launch a large UI rewrite;
- create a PR;
- merge;
- claim product readiness from file existence alone.

ChatGPT will review the inventory and choose the next implementation/E2E gate.

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
