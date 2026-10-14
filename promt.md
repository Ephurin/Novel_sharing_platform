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

## 5. ACTIVE EXECUTION DIRECTIVE — Manuscript Import UI Integration & Browser E2E

### Remote state reviewed by ChatGPT

```text
main:
2acb7f4bfc6e729b9802b799b799ae96ac7c3a29

source UI branch:
UI

source UI commit:
fe8429c77016fc58d7a8e3293cbc89030144aebc
feat(ui): add manuscripts import screen

branch relation:
UI ahead main by 1
UI behind main by 36
status = diverged
```

Do **not** merge current `main` into the old `UI` branch and continue there.

Create a fresh integration branch from current `main`:

```text
astra/manuscript-import-ui-e2e
```

Suggested local start:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/manuscript-import-ui-e2e
```

Then inspect `UI@fe8429c...` and port only the intended Manuscript Import UI work onto the new branch. A clean cherry-pick is allowed if it applies safely; otherwise port the four intended files manually while preserving current-main APIs/components.

Do not merge the old branch wholesale.
Do not overwrite newer Author IDE / Story Brain / P1 code from `main`.

### Confirmed blocker — invalid canonical provenance

ChatGPT directly verified the source UI still contains:

```ts
const revisions = createdChapters.map((ch) => ({
  chapter_id: ch.chapterId,
  revision_id: ch.chapterId,
  content_hash: 'auto-sha256'
}));
```

This is invalid and must not be worked around by weakening backend validation.

Required invariant:

```text
chapter_id      = real persisted chapter id
revision_id     = real immutable chapter revision id
content_hash    = real SHA-256 of the exact immutable revision content
```

The Story Brain manuscript bootstrap must consume canonical revision provenance, not chapter IDs or placeholder hashes.

### Phase A — inspect current contracts before editing

Trace the current-main implementation for:

```text
POST /novels/:novelId/chapters
POST /chapters/:chapterId/revisions/snapshot
POST /ai/story-brains/bootstrap/from-manuscript
GET  /ai/jobs/:jobId
GET  /ai/story-brains/:novelId/review-queue
POST /ai/proposal-groups/:groupId/accept
POST /ai/story-brains/:novelId/baseline/activate
Author IDE chapter loading / canonical revision lookup
P1 writing generation + acceptDraft
```

Determine whether chapter creation already returns a canonical revision. If it does, consume that exact response.

If chapter creation does **not** create/return a canonical immutable revision, the import flow must explicitly create the snapshot through the existing canonical snapshot endpoint after each chapter is persisted, then use the returned:

```text
revisionId
contentHash
```

If the snapshot response does not expose the content hash, obtain it from the canonical revision/read contract or compute SHA-256 over the exact persisted revision content only if this exactly matches the backend hash contract. Prefer server-returned canonical metadata.

Do not invent a parallel import-specific revision model.

### Phase B — repair import persistence flow

The browser-facing import flow must become:

```text
parse selected manuscript chapters
 -> user reviews/selects chapters
 -> create each chapter
 -> create/obtain canonical immutable revision for each chapter
 -> collect exact {chapter_id, revision_id, content_hash}
 -> only then call bootstrap/from-manuscript
```

Failure semantics:

```text
chapter persistence failure
 -> import visibly fails/partials with exact affected chapter

revision creation/provenance failure
 -> DO NOT send fake bootstrap manifest

bootstrap failure
 -> chapters/revisions remain canonical and recoverable
 -> UI reports Story Brain bootstrap failure separately
```

Do not claim atomicity across multiple chapter HTTP requests if no transaction exists.

Add the smallest product/API typing changes needed. Avoid unrelated redesign.

### Phase C — preserve and integrate intended UI

Port the intended Manuscript Import experience from `fe8429c...` while removing obsolete duplicate/mock artifacts if they are not part of the real React application.

Review specifically:

```text
web/src/features/manuscript-import/ManuscriptImportPage.tsx
web/src/features/manuscript-import/manuscript-import-api.ts
web/src/features/manuscript-import/ManuscriptImportPage.html
web/src/features/manuscript-import/ManuscriptImportPage_old.tsx
```

The standalone generated HTML and `_old.tsx` must not be treated as production implementation evidence. Keep them only if the repository has an explicit reason; otherwise exclude them from the port.

Supported UI behavior should include, where implemented:

```text
file/text load
chapter split preview
chapter selection
title/content preview/edit
import progress
Story Brain enable/disable choice
bootstrap progress
review queue
proposal accept/reject
baseline activation
navigation into Author IDE
```

### Phase D — deterministic contract tests

Add focused frontend/backend contract tests proving at minimum:

```text
1. import never maps chapterId to revision_id
2. bootstrap never sends placeholder content_hash
3. canonical revision metadata is preserved per chapter
4. malformed/failed revision provenance blocks bootstrap
5. partial chapter import is reported honestly
6. Story Brain bootstrap receives revisions in correct order
7. proposal accept uses current brain_version
8. rejected proposal is not materialized
```

If hashing is performed client-side, add a Unicode/Vietnamese content fixture and prove its SHA-256 matches the canonical backend contract.

### Phase E — real browser E2E

Use the real rendered application, not API-only mutation, for the decisive import flow.

Required Browser checkpoints:

```text
Import-A  authenticate and navigate to Manuscript Import
Import-B  load/paste a deterministic manuscript fixture with >= 2 chapters
Import-C  browser parses chapters and renders preview
Import-D  select/confirm import through UI
Import-E  imported chapters appear after reload
Import-F  DB/API correlation proves real immutable revision_id + content_hash for every imported chapter
Import-G  Story Brain bootstrap starts from those exact revisions
Import-H  review queue rendered in browser
Import-I  reject one proposal through UI and prove it remains non-canonical
Import-J  accept required proposal group(s) through UI
Import-K  activate baseline through UI
Import-L  open one imported chapter in Author IDE
Import-M  browser generation #1 uses imported canonical revision/context
Import-N  reject generation; canon/Brain unchanged
Import-O  browser generation #2 -> accept -> AI_DRAFT_ACCEPT -> outbox COMPLETED -> Brain N -> N+1
Import-P  subsequent browser-originated generation/context observes N+1
```

API/DB may be used only for correlation after browser-originated mutations.

Do not label API setup as Browser PASS.

Use deterministic/fake LLM for the acceptance path unless the UI cannot exercise the production route without provider access. Real-provider literary quality is not part of this gate.

### Phase F — evidence and lineage

Create:

```text
docs/development/MANUSCRIPT-IMPORT-UI-E2E-report.md
docs/development/MANUSCRIPT-IMPORT-UI-E2E/
  manuscript-import-ui-e2e-evidence.json
  relevant browser screenshots
```

Record at minimum:

```text
tested_main_sha
tested_code_sha
branch
novel_id
imported chapter ids
canonical revision ids
canonical content hashes
bootstrap job id
story brain id
brain version before baseline
brain version after proposal acceptance / activation
generation reject id
accepted generation id
AI_DRAFT_ACCEPT revision id
outbox event id
brain version before accepted generation
brain version after accepted generation
second browser request/generation id
observed final brain version
```

Never store manuscript bodies, credentials, tokens, API keys, or private user data in evidence.

Use backward-only SHA lineage:

```text
TESTED_CODE_SHA
 -> EVIDENCE_PAYLOAD_SHA
 -> optional LINEAGE_SEAL_SHA
```

No self-referential SHA fields.

### Phase G — final local acceptance

Run at minimum:

```text
frontend typecheck/build
relevant frontend tests
relevant backend deterministic tests
import contract tests
P1 regression tests touched by the import flow
strict API/system import runner if added
real browser E2E
```

Final verdict:

```text
MANUSCRIPT_IMPORT_UI_PASS
```

only if the browser flow reaches the existing P1 loop with real canonical provenance and completes the closed feedback loop.

Use:

```text
MANUSCRIPT_IMPORT_UI_PARTIAL
```

if the UI itself is genuinely missing a required implemented control.

Use:

```text
MANUSCRIPT_IMPORT_UI_FAIL
```

for contract or functional failure.

### Stop boundary

When locally complete:

```text
push astra/manuscript-import-ui-e2e
STOP at LOCAL_PASS_CI_PENDING
```

Gemini must not:
- merge the old `UI` branch into `main`;
- weaken canonical revision/hash validation;
- reopen accepted P1/P2/P3 architecture without a concrete regression;
- create a PR;
- merge to main;
- claim GitHub Actions PASS.

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
