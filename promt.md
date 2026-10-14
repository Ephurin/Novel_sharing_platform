# Active Project Handoff — Novel Sharing Platform AI

## 1. Canonical Status — 2026-10-14

All three authoring pipelines are closed on backend/system acceptance, and P1 browser acceptance is now closed on the refactored Author UI.

```text
AI-PIPE-01A  P1 production persistence loop                 CI_PASS / MERGED
AI-PIPE-01B  P1 final browser/UI system E2E                 CI_PASS / MERGED

AI-PIPE-02A  Idea / World-Bible bootstrap                   CI_PASS / MERGED
AI-PIPE-02B  Durable outline / Story Plan                   CI_PASS / MERGED

AI-PIPE-03A  Bounded autonomous controller                  CI_PASS / MERGED

P1_OVERALL_SYSTEM_PASS
```

Accepted milestones:

```text
PR #39  AI-PIPE-01A  merged
PR #40  AI-PIPE-02A  merged
PR #41  AI-PIPE-02B  merged
PR #42  AI-PIPE-03A  merged
PR #45  AI-PIPE-01B  merged
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

Do not reopen P1/P2/P3 architecture without a concrete regression or explicitly approved new scope.

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

## 5. NEXT ACTIVE GATE — Manuscript Import UI Pre-Merge Validation

The remote `UI` branch currently points to:

```text
fe8429c77016fc58d7a8e3293cbc89030144aebc
feat(ui): add manuscripts import screen
```

This work was intentionally excluded from AI-PIPE-01B. Test it as a separate pre-merge gate.

### Objective

Prove that manuscript import creates real canonical revision provenance and then enters the already-closed Story Brain/P1 architecture without bypasses.

Required flow:

```text
browser import manuscript
 -> parse chapters
 -> persist chapters
 -> create real immutable canonical revisions
 -> use actual revision_id
 -> use actual SHA-256 content_hash
 -> Story Brain bootstrap/extraction
 -> review queue
 -> author proposal accept/reject
 -> baseline activation
 -> open imported chapter in Author IDE
 -> generation uses imported canon/context
 -> reject leaves canon unchanged
 -> accept uses same P1 acceptDraft + outbox loop
```

### Known contract risk to verify first

Earlier inspection of the candidate import UI showed a risk equivalent to:

```text
revision_id = chapterId
content_hash = "auto-sha256"
```

This is invalid if still present.

Production bootstrap/writing contracts require:
- the actual immutable revision ID;
- the actual SHA-256 of the exact revision content.

Do not weaken backend validation to make stale UI assumptions pass.

If the current `UI` code has already changed, inspect the actual branch before relying on this historical risk note.

### Required classifications

For every import step use one of:

```text
PASS
FAIL
PARTIAL
NOT_IMPLEMENTED
UI_CONTRACT_REGRESSION
API_CONTRACT_DRIFT
TEST_ENVIRONMENT_ISSUE
```

Do not call an API-only setup a browser PASS.

### Scope rule

Do not reopen or redesign AI-PIPE-01A/01B/02A/02B/03A while testing Manuscript Import unless the new flow exposes a concrete regression in an accepted invariant.

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
