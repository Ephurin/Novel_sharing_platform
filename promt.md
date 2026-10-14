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

## 5. ACTIVE REVIEW DIRECTIVE — Manuscript Import Double-Analysis Hardening & Evidence Repair

This directive supersedes the previous Manuscript Import execution directive.

### Remote state reviewed by ChatGPT

```text
main:
dce5172e916d0546fe8293807bce7354e695fd50

working branch:
astra/manuscript-import-ui-e2e

current remote branch head:
cb9c6b3267fce08b050b0dd8860ab31a68b16b21

branch relation:
ahead main 3
behind main 0

previous tested code:
95a8afda869642b88aa74f1e6421c8366487939f

previous evidence payload:
f1b1c8e3e28e88a527fa2c4a73d9aadcaa9fcb31

PR:
DO NOT OPEN YET
```

The following findings are already accepted and must NOT be redesigned:

```text
fresh branch from current main                         ACCEPTED
old UI branch not merged wholesale                    ACCEPTED
Manuscript Import production UI port                  ACCEPTED
chapterId -> revision_id bug removed                  ACCEPTED
'auto-sha256' placeholder removed                     ACCEPTED
real canonical revisionId from snapshot endpoint      ACCEPTED
real server contentHash used for bootstrap            ACCEPTED
browser import/preview/confirm path exists             ACCEPTED
review queue / reject / accept / baseline UI exists   ACCEPTED
imported chapter opens in Author IDE                  ACCEPTED
P1 accept -> AI_DRAFT_ACCEPT -> outbox -> Brain N+1   ACCEPTED
```

Do not redo those areas unless required by the blockers below.

---

### BLOCKER P0 — eliminate or prove-safe the double-analysis path before baseline

ChatGPT confirmed current-main `createSnapshot()` always does:

```text
canonical revision
 -> INCREMENTAL_ANALYSIS outbox
 -> triggerImmediateProcessing()
```

Current Manuscript Import then sends the same revision to:

```text
bootstrap/from-manuscript
 -> ManuscriptBootstrapService
 -> RevisionAnalysisService.analyze(...)
```

The two paths use different idempotency identities, so they are not automatically the same deduplicated analysis run.

This creates a potential race:

```text
import snapshot
 -> outbox incremental analysis
 -> proposal creation / retry
                                         +-> bootstrap analysis of same revision
                         -> human review queue
```

The import bootstrap invariant is:

```text
BEFORE baseline activation:
imported revision analysis is owned by bootstrap review flow
and must NOT be independently auto-materialized by the generic incremental outbox path.
```

The accepted P1 invariant must remain unchanged:

```text
AFTER baseline / normal authoring:
manual/accepted revisions continue to use the canonical fail-closed
INCREMENTAL_ANALYSIS outbox and auto-materialization path.
```

#### Required investigation

Trace and document:

```text
createSnapshot()
insertOutboxEvent()
triggerImmediateProcessing()
ManuscriptBootstrapService.start/process()
RevisionAnalysisService.analyze()
analysis-run idempotency keys
proposal expected_brain_version
baseline activation semantics
```

Then implement the **smallest safe ownership rule** so an imported pre-baseline revision is not analyzed/materialized twice.

A valid design may be, for example:

```text
bootstrap-owned canonical snapshot mode/purpose
 -> creates the same immutable canonical revision
 -> returns real revisionId/contentHash
 -> does NOT enqueue generic INCREMENTAL_ANALYSIS for that bootstrap-owned revision
 -> bootstrap remains the sole analysis owner until baseline activation
```

or another design that proves the same invariant without a second revision model.

Safety constraints:

- ordinary `createSnapshot` behavior must remain unchanged by default;
- `acceptDraft` outbox behavior must remain unchanged;
- do not let an arbitrary public client silently disable analysis without an explicit, validated import/bootstrap purpose;
- do not delete/mark-completed stale outbox rows after the fact as a workaround;
- do not merely rely on timing;
- do not keep two independently keyed analysis runs for the same imported revision and call that acceptable;
- do not weaken fail-closed outbox semantics.

If a service-layer API is introduced, reuse the existing canonical revision persistence primitive. Do not create a parallel import-only revision store.

#### Required deterministic tests

At minimum prove:

```text
A. ordinary author snapshot
   -> still creates INCREMENTAL_ANALYSIS outbox

B. manuscript bootstrap-owned snapshot/provenance creation
   -> creates real immutable revision
   -> no competing generic incremental-analysis owner before baseline

C. each imported revision is analyzed once by bootstrap ownership
   -> one intended bootstrap analysis lineage
   -> no duplicate proposal group from generic outbox retry

D. before baseline activation
   -> bootstrap proposals stay review-controlled
   -> no generic outbox auto-materializes them

E. rejected bootstrap proposal stays rejected/non-canonical

F. after baseline activation
   -> normal P1 AI_DRAFT_ACCEPT still creates outbox
   -> outbox COMPLETED
   -> Story Brain advances
```

If existing schema/service contracts make this impossible without a small backend change, make the smallest explicit change and test both old default behavior and the new bootstrap-owned behavior.

---

### BLOCKER P1 — Import-E must really prove browser reload/readback

Current runner labels Import-E as:

```text
imported chapters appear after reload
```

but only queries PostgreSQL.

Repair it so the browser performs an actual reload or navigates away/back to a rendered chapter-list/novel surface and proves the imported chapters are visibly present.

Required:

```text
browser-originated import
 -> browser reload/reopen
 -> both imported chapter titles visible in rendered UI
 -> then DB/API correlation
```

Record a browser screenshot for Import-E.

Do not relabel a DB-only query as Browser PASS.

---

### BLOCKER P1 — Import-I must prove the rejected proposal remains non-canonical

Current evidence proves only:

```text
proposal.status = rejected
```

Strengthen the proof.

Before clicking reject, capture the exact proposal ID/type/payload being rejected.

After the rest of bootstrap decisions and baseline activation:

```text
proposal remains rejected
AND
the canonical target represented by that rejected proposal was not materialized
```

Use the correct canonical table/read contract for its proposal type:
- entity -> entity materialization;
- fact/world_rule -> facts/rules;
- event -> events;
- relationship/state transition -> corresponding canonical projection.

Prefer choosing a proposal type whose non-materialization can be asserted deterministically.

Record:

```text
rejected_proposal_id
rejected_proposal_type
rejected_payload_identity
canonical_absence_proof
```

---

### BLOCKER P1 — Import-J must assert actual acceptance, not only print it

Current runner can record PASS even if:

```text
accepted_count = 0
```

Fix this.

Capture the exact browser-clicked proposal group(s), then assert:

```text
accepted_proposals_count > 0
all intended clicked proposal IDs/groups reach accepted state
brain_version locking used the current version
no rejected proposal is accidentally accepted
```

Evidence must include accepted proposal/group IDs and resulting Brain version.

---

### BLOCKER P0 — Import-M must prove generation #1 uses imported canonical provenance/context

Current code sets:

```python
gen1_job_id = None
...
if "/ai/writing/generations" in response.url:
    pass
```

and still records PASS.

That is insufficient.

For generation #1, capture the **browser-originated request** via CDP `Network.requestWillBeSent`.

Assert at minimum:

```text
chapter_id == imported chapter id
revision_id == imported canonical revision id
content_hash == imported canonical content hash
expected_brain_version == active imported Story Brain version
```

Also capture the generation/job ID from the response or subsequent browser-visible polling flow where available.

Import-M may PASS only if the browser request provenance matches the imported canonical revision exactly.

Record:

```text
generation1_browser_request_id
generation1_id/job_id
chapter_id
revision_id
content_hash
expected_brain_version
```

This is the decisive proof that Manuscript Import actually feeds the already-accepted P1 writing loop rather than merely opening the same editor.

---

### BLOCKER P1 — machine-readable evidence must contain the required lineage and IDs

The current JSON lacks some required top-level lineage/trace fields.

The final evidence JSON must include at minimum:

```text
tested_main_sha
tested_code_sha
branch

novel_id

imported_chapter_ids
imported_revision_ids
imported_content_hashes

bootstrap_job_id
story_brain_id if exposed
baseline_brain_version

rejected_proposal_id
rejected_proposal_type
accepted_proposal_ids
accepted_proposal_group_ids

generation1_browser_request_id
rejected_generation_id/job_id

accepted_generation_id
accepted_revision_id
outbox_event_id
brain_version_before_accept
brain_version_after_accept

final_browser_request_id
observed_final_brain_version
```

Do not store:
- access tokens;
- passwords;
- API keys;
- raw private manuscript bodies.

The deterministic fixture itself may remain in test code.

---

### Final rerun and SHA lineage

Because both product/test code and runner evidence will change, the old tested SHA is no longer the final acceptance SHA.

After all fixes:

```text
1. sync current main into the branch if main advanced
2. commit all product/test/runner changes
3. clean tree
4. call exact commit NEW_TESTED_CODE_SHA
5. run all mandatory deterministic + browser acceptance on NEW_TESTED_CODE_SHA
6. commit regenerated report/evidence/screenshots as NEW_EVIDENCE_PAYLOAD_SHA
7. optionally add one backward-only LINEAGE_SEAL_SHA
```

Required final tests include:

```text
manuscript import contract tests
snapshot/default outbox regression tests
bootstrap-owned analysis ownership tests
bootstrap/review/baseline tests
P1 acceptDraft/outbox regression tests
frontend typecheck/build
relevant backend tests
real browser Import-A through Import-P
```

Final Browser acceptance must explicitly show:

```text
Import-E browser reload/readback PASS
Import-I canonical absence after reject PASS
Import-J actual accepted IDs/groups PASS
Import-M exact imported generation provenance PASS
Import-O P1 closed loop PASS
Import-P N+1 browser observation PASS
no competing pre-baseline generic outbox analysis for imported revisions
```

Update the report honestly. Remove the current `PASS (100%)` claim if any required assertion is not actually exercised.

---

### Final stop boundary

Final verdict:

```text
MANUSCRIPT_IMPORT_UI_PASS
```

is allowed only after the double-analysis ownership invariant and all evidence gaps above are closed.

Then:

```text
push astra/manuscript-import-ui-e2e
STOP at LOCAL_PASS_CI_PENDING
```

Gemini must not:
- open a PR;
- merge;
- claim GitHub Actions PASS;
- merge the old `UI` branch;
- weaken P1 fail-closed semantics;
- hide or manually complete competing outbox events to make evidence green.

ChatGPT owns remote review, PR creation, CI inspection, merge decision, and canonical closure.

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
