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

## 5. EXECUTE NOW — Manuscript Import Final Sync / Rerun / Stop

No new architecture work is requested. This is an execution-only reminder because the remote working branch has not advanced since the previous directive.

### Exact remote state

```text
current main before this reminder:
3bd6a43542a69d15ebee469ec68d5090c4966d77

working branch:
astra/manuscript-import-ui-e2e

current branch head:
47bb3cd7a6fdbf160979d522f2955ccbaf43adda

current relation before this reminder:
ahead main 10
behind main 2
merge base dce5172e916d0546fe8293807bce7354e695fd50
```

The product/evidence design is already accepted. Do not redesign it.

Accepted behavior that must remain intact:

```text
MANUSCRIPT_BOOTSTRAP snapshot -> source_type BOOTSTRAP
MANUSCRIPT_BOOTSTRAP snapshot -> no generic INCREMENTAL_ANALYSIS outbox
AUTHOR_SNAPSHOT default -> generic INCREMENTAL_ANALYSIS remains
AI_DRAFT_ACCEPT -> generic fail-closed INCREMENTAL_ANALYSIS remains
pre_baseline_outbox_count == 0
Import-E browser readback PASS
Import-I canonical absence PASS
Import-J real accepted proposal IDs/groups PASS
Import-M exact imported generation provenance PASS
Import-N reject leaves canon/Brain unchanged
Import-O AI_DRAFT_ACCEPT -> outbox COMPLETED -> Brain N+1
Import-P later browser request sees N+1
```

### Do this now

Read the **actual latest origin/main SHA after this reminder is committed**, then:

```bash
git fetch origin
git checkout astra/manuscript-import-ui-e2e
git pull --ff-only
git merge origin/main
```

Do not hard-code `3bd6a43...` as final tested main if origin/main is newer because of this reminder. Record:

```text
ACTUAL_SYNCED_MAIN_SHA = git rev-parse origin/main
```

After merge, verify:

```text
git merge-base --is-ancestor origin/main HEAD
branch behind origin/main = 0
```

If the merge only brings `promt.md` review instructions and there are no product conflicts, do not modify product behavior.

### Establish final code baseline

Commit the sync if Git creates a merge commit. Ensure clean tree.

Then:

```text
FINAL_TESTED_CODE_SHA = git rev-parse HEAD
```

Push that code baseline before generating evidence so the SHA is remotely resolvable.

### Mandatory rerun on FINAL_TESTED_CODE_SHA

Run:

```text
frontend typecheck/build
manuscript-import contract tests
snapshot/outbox regression tests
bootstrap/review/baseline tests
P1 acceptDraft/outbox regression tests
relevant AI gateway/backend tests
real browser Import-A through Import-P
```

The final browser run must preserve all previously accepted assertions, including:

```text
pre_baseline_outbox_count == 0
Import-E real browser reload/readback
Import-I rejected proposal canonical absence
Import-J accepted_proposals_count > 0
Import-M exact chapter_id/revision_id/content_hash/expected_brain_version
Import-N no canonical mutation
Import-O AI_DRAFT_ACCEPT + COMPLETED outbox + Brain N->N+1
Import-P browser observes N+1
```

### Regenerate evidence with current ancestry

The old lineage:

```text
40dc3fd -> 43f5d75 -> 47bb3cd
```

is historical only.

Create new final lineage:

```text
FINAL_TESTED_CODE_SHA
    -> FINAL_EVIDENCE_PAYLOAD_SHA
    -> optional FINAL_LINEAGE_SEAL_SHA
```

Evidence/report must record:

```text
tested_main_sha = ACTUAL_SYNCED_MAIN_SHA
tested_code_sha = FINAL_TESTED_CODE_SHA
branch = astra/manuscript-import-ui-e2e
```

plus all existing machine-readable import/proposal/generation/outbox IDs.

Do not embed a seal commit SHA into itself.

### Stop condition

Only after:

```text
behind origin/main = 0
working tree clean
all deterministic tests PASS
Import-A..P PASS
MANUSCRIPT_IMPORT_UI_PASS
all final SHAs resolve remotely
```

push the final evidence/seal and STOP at:

```text
LOCAL_PASS_CI_PENDING
```

Do not create a PR.
Do not merge.
Do not claim CI PASS.
Do not touch the obsolete `UI` branch.

ChatGPT will handle PR, GitHub Actions, CI-only repairs if needed, merge, and canonical closure.

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
