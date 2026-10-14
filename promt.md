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

## 5. FINAL EXECUTION DIRECTIVE — Manuscript Import Sync, Rerun & PR Handoff

This directive supersedes all previous Manuscript Import directives.

### Reviewed status

ChatGPT has accepted the current implementation direction and browser evidence for:

```text
canonical import revision provenance                 PASS
real server SHA-256 provenance                      PASS
MANUSCRIPT_BOOTSTRAP snapshot ownership             PASS
zero generic pre-baseline INCREMENTAL_ANALYSIS      PASS
bootstrap human-review ownership                    PASS
Import-E browser reload/readback                    PASS
Import-I rejected proposal canonical absence        PASS
Import-J actual accepted proposal/group IDs         PASS
Import-M exact browser generation provenance        PASS
Import-O P1 accepted-draft closed loop              PASS
Import-P next browser request observes N+1          PASS
```

Current branch:

```text
astra/manuscript-import-ui-e2e
```

Current reviewed branch head before final sync:

```text
47bb3cd7a6fdbf160979d522f2955ccbaf43adda
```

Current accepted-but-stale tested lineage:

```text
TESTED_CODE_SHA      40dc3fd03a991d90a787eed7ebb61d06886831c0
EVIDENCE_PAYLOAD_SHA 43f5d75060948efc02d634adb0ac244f507b0628
LINEAGE_SEAL_SHA     47bb3cd7a6fdbf160979d522f2955ccbaf43adda
```

Do not reopen these behaviors unless the final sync exposes a concrete regression.

### Only remaining task — sync current main and reproduce acceptance

The branch was reviewed as behind main only because the latest review directive was committed after the previous run.

First fetch and merge the **current** remote main after reading this directive:

```bash
git fetch origin
git checkout astra/manuscript-import-ui-e2e
git pull --ff-only
git merge origin/main
```

Resolve only genuine merge conflicts. Do not reset or drop existing work.

After the merge:

```text
branch behind main = 0
```

Commit any conflict resolution if needed.

Call the exact clean product/test/runner commit after sync:

```text
FINAL_TESTED_CODE_SHA
```

This SHA must include the current-main ancestry, including this final directive commit.

### Final rerun

From a clean tree at `FINAL_TESTED_CODE_SHA`, rerun at minimum:

```text
frontend typecheck/build
manuscript-import deterministic contract tests
snapshot default/outbox regression tests
bootstrap-owned ownership tests
bootstrap/review/baseline relevant tests
P1 acceptDraft/outbox regression tests
AI gateway relevant suite
real browser Import-A through Import-P
```

Do not weaken or skip assertions.

The final browser run must still explicitly prove:

```text
pre_baseline_outbox_count == 0
Import-E rendered browser readback after reload
Import-I rejected proposal absent from canonical projection
Import-J accepted_proposals_count > 0 with exact IDs/groups
Import-M browser request uses imported chapter_id/revision_id/content_hash/current brain version
Import-N reject leaves canon/Brain unchanged
Import-O AI_DRAFT_ACCEPT -> outbox COMPLETED -> Brain N+1
Import-P later browser request sends N+1
```

### Final evidence lineage

Regenerate evidence from `FINAL_TESTED_CODE_SHA`.

Create:

```text
FINAL_TESTED_CODE_SHA
        ↓
FINAL_EVIDENCE_PAYLOAD_SHA
        ↓
optional FINAL_LINEAGE_SEAL_SHA
```

Final evidence/report must record the **actual current main SHA used by this run**, not the stale `dce5172...`.

Required top-level evidence remains:

```text
tested_main_sha
tested_code_sha
branch
novel_id
imported_chapter_ids
imported_revision_ids
imported_content_hashes
pre_baseline_outbox_count
bootstrap_job_id
story_brain_id
baseline_brain_version
rejected_proposal_id
rejected_proposal_type
canonical_absence_proof
accepted_proposal_ids
accepted_proposal_group_ids
generation1_browser_request_id
rejected_generation_id
accepted_generation_id
accepted_revision_id
outbox_event_id
brain_version_before_accept
brain_version_after_accept
final_browser_request_id
observed_final_brain_version
```

No self-referential SHA.

### Final stop conditions

Before stopping, verify:

```text
git status --short = clean
branch behind main = 0
all required local tests PASS
browser Import-A..P PASS
FINAL_TESTED_CODE_SHA resolves remotely
FINAL_EVIDENCE_PAYLOAD_SHA resolves remotely
report/evidence tested_main_sha == actual synced main
verdict = MANUSCRIPT_IMPORT_UI_PASS
boundary = LOCAL_PASS_CI_PENDING
```

Then push:

```text
astra/manuscript-import-ui-e2e
```

and STOP.

Gemini must not:
- create a PR;
- merge to main;
- modify accepted architecture without a newly observed regression;
- claim GitHub Actions PASS;
- touch the obsolete `UI` branch.

ChatGPT owns the next step: remote review -> PR -> GitHub Actions -> merge decision -> canonical closure.

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
