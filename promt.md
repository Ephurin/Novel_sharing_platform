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

Do not reopen P1/P2/P3, Manuscript Import, or Author Publish/Moderation architecture without a concrete regression or explicitly approved new scope.

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

## 5. ACTIVE EXECUTION DIRECTIVE — Reader Discovery + Reading State E2E

The Author -> Admin -> Public publication bridge is now CI_PASS / MERGED.

The next bounded product gate is:

```text
READER-DISCOVERY-READING-STATE-E2E
```

This gate proves that an authenticated reader can discover a real published novel, persist it in the personal library, read a free published chapter, create/read back reading history, survive page reloads, and remove the library item.

FE-owned static/mock presentation debt remains a separate task and does not block this gate unless it makes a decisive reader action impossible.

Do not include Wallet/VIP unlock in this gate.

---

### Start from actual latest main

After this directive is committed:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/reader-discovery-reading-state-e2e
```

Record:

```text
GATE_BASE_MAIN_SHA = git rev-parse origin/main
```

Working branch:

```text
astra/reader-discovery-reading-state-e2e
```

---

### Confirmed production contracts

ChatGPT directly verified current-main reader contracts.

Discovery/detail/chapter:

```text
GET /api/v1/reading/search
GET /api/v1/reading/novels/:novelId
GET /api/v1/reading/chapters/:chapterId
```

Library:

```text
GET    /api/v1/reading/library/me
POST   /api/v1/reading/library/me
DELETE /api/v1/reading/library/me/:novelId
```

History:

```text
PUT /api/v1/reading/history/me
GET /api/v1/reading/history/me
GET /api/v1/reading/history/me/:novelId
```

Current Reader UI behavior:

```text
/reader
 -> searchPublishedNovels()

/reader/novels/:novelId
 -> Add library
 -> Continue / Read chapter

/reader/chapters/:chapterId
 -> getReaderChapter()
 -> useEffect automatically calls syncHistory({novelId, chapterId})
 -> explicit "Sync history" button can repeat the same mutation

/reader/library
 -> listLibrary()
 -> Remove

/reader/history
 -> listHistory()
 -> Continue link back to exact chapter
```

Current UI does **not** provide a user-driven paragraph/page-offset progress control. The auto-sync mutation currently supplies only `novelId + chapterId`; backend defaults `paragraphIndex=0` and allows nullable pageOffset.

Therefore this gate must prove **chapter-level reading state**, not invent paragraph-level acceptance.

---

### Deterministic fixture rule

Use an existing deterministic published novel that has at least one **PUBLISHED, non-VIP/free chapter**.

Preferred fixture selection:
1. inspect current deterministic demo seed;
2. choose a published novel owned by a seed author;
3. select an exact published free chapter;
4. record all IDs before browser execution.

Do not:
- use a VIP chapter;
- deposit coins;
- unlock content;
- mutate author/admin publication state;
- create a new novel solely for this reader gate if the accepted seed is sufficient.

If no deterministic published free chapter exists in the current canonical seed, classify:

```text
READER_FIXTURE_MISSING
```

and add the smallest deterministic test fixture through the existing seed mechanism. Do not add a production endpoint for test setup.

Reader login must use the rendered UI. Use deterministic fixture identity, preferably the existing READER demo account.

Runner password must come from:

```text
EPHURIN_E2E_DEMO_PASSWORD
```

No committed password/token literals.

---

### Phase A — inspect before editing

Inspect current production path before changing product code:

```text
web/src/features/reader/ReaderPage.tsx
web/src/features/reader/reader-api.ts
web/src/app/router.tsx
backend/src/modules/reading/reading.routes.ts
backend/src/modules/reading/reading.controller.ts
backend/src/modules/reading/reading.service.ts
backend/src/modules/reading/reading.repository.ts
backend/src/modules/reading/reading.schemas.ts
```

If the current UI already closes the loop, do not manufacture product changes.

Only fix a concrete browser-observed defect.

Do not fix unrelated Author hardcoded metrics/dates in this branch.

---

### Phase B — browser checkpoints

All decisive reader mutations must originate in the rendered browser UI.

Required checkpoints:

```text
Reader-A — login as READER through rendered login form
Reader-B — search exact deterministic published novel on /reader and open detail
Reader-C — Add library through rendered button; exact POST succeeds and DB bookmark exists
Reader-D — reload/open /reader/library; exact novel remains visibly persisted
Reader-E — open exact free published chapter through rendered reader navigation
Reader-F — chapter render auto-syncs history; exact PUT /reading/history/me captured and DB history points to exact chapter
Reader-G — reload/open /reader/history; exact novel/chapter appears; Continue returns to exact chapter
Reader-H — remove novel through rendered /reader/library UI; reload proves absence and DB bookmark removed
```

#### Reader-A

Use normal rendered login form.

Prove:
```text
role = READER
authenticated WebAppShell visible
/reader reachable
```

Do not inject tokens/storage.

#### Reader-B

On `/reader`, use the rendered search input with the fixture's exact title.

Capture:
```text
GET /api/v1/reading/search
HTTP 200
exact novel_id returned
exact title rendered
```

Open:
```text
/reader/novels/:novelId
```

Prove the rendered detail contains the exact target and exact free chapter.

#### Reader-C

Click rendered:
```text
Add library
```

Capture:
```text
POST /api/v1/reading/library/me
body.novelId == target novel
successful status
```

DB-correlate bookmark:
```text
user_id == reader
novel_id == target
one active bookmark row
```

If the fixture reader already has this novel saved, clean that **test fixture state before the browser run** through test setup/DB cleanup, not via a fake production endpoint.

The browser mutation itself must create the accepted bookmark.

#### Reader-D

Navigate through rendered shell/navigation to:
```text
/reader/library
```

Reload the page.

Prove:
```text
GET /reading/library/me
exact novel_id returned
title rendered after reload
Open detail link targets exact novel
```

#### Reader-E

From reader detail/library navigation, open the exact free chapter.

Capture:
```text
GET /api/v1/reading/chapters/:chapterId
HTTP 200
chapter_id == target
novel_id == target
isVip == false
rendered title/content non-empty
```

Do not use a VIP chapter as substitute.

#### Reader-F

The current UI automatically invokes history sync after chapter load.

Capture the browser-originated:
```text
PUT /api/v1/reading/history/me
```

Required body correlation:
```text
novelId == target novel
chapterId == target chapter
```

Backend defaults are acceptable:
```text
paragraphIndex = 0
pageOffset = null/omitted
```

DB/readback must prove one history state for:
```text
reader user
target novel
target chapter
```

Do not claim paragraph-position persistence.

#### Reader-G

Navigate to:
```text
/reader/history
```

Reload.

Prove:
```text
GET /reading/history/me
exact target novel/chapter returned
exact novel title rendered
exact chapter title/number rendered
```

Click rendered `Continue`.

Required destination:
```text
/reader/chapters/:targetChapterId
```

and the exact chapter must render again.

#### Reader-H

Return to:
```text
/reader/library
```

Click rendered `Remove` for the exact target.

Capture:
```text
DELETE /api/v1/reading/library/me/:novelId
```

Reload library.

Prove:
```text
target novel absent from DOM
target novel absent from GET /reading/library/me
bookmark row absent in DB
```

History should remain unless the existing product contract explicitly removes it; do not assume library removal deletes reading history.

---

### Phase C — bounded negative/idempotency checks

Add/execute the smallest deterministic assertions proving:

```text
1. anonymous POST /reading/library/me is rejected by auth
2. duplicate Add library fails closed with existing conflict contract
3. removing a non-existent bookmark fails with existing not-found contract
4. history sync rejects mismatched novelId/chapterId
5. history is user-scoped: another reader cannot satisfy/read back the target reader's state as their own
6. non-published novel/chapter cannot be used to create accepted reader state
```

Use existing service/route tests where available. Add focused production-path tests only where missing.

Do not expand this into comments/likes/follows/reporting.

---

### Phase D — evidence

Create:

```text
docs/development/READER-DISCOVERY-READING-STATE-E2E-report.md

docs/development/READER-DISCOVERY-READING-STATE-E2E/
  reader-discovery-reading-state-e2e-evidence.json
  Reader-A..H screenshots
```

Evidence must include at minimum:

```text
tested_main_sha
tested_code_sha
branch

reader_user_id
reader_email

novel_id
novel_title
chapter_id
chapter_number
chapter_title
chapter_is_vip

login_browser_request_id
search_browser_request_id
add_library_browser_request_id
library_reload_request_id
chapter_browser_request_id
history_sync_browser_request_id
history_list_browser_request_id
remove_library_browser_request_id

bookmark_created_db_proof
history_db_proof
bookmark_removed_db_proof

negative_suite
validation
verdict
```

Do not store:
- password values;
- auth tokens;
- cookies;
- private unrelated data.

---

### Phase E — validation

Run at minimum:

```text
web typecheck/build
backend typecheck
relevant reading service/route/PostgreSQL tests
real browser Reader-A..H
```

If current product code changes, run the relevant broader regression too.

Do not rerun AI provider-quality tests unless a concrete unrelated regression appears.

Final local verdict:

```text
READER_DISCOVERY_READING_STATE_PASS
```

only when Reader-A..H and negative invariants pass.

---

### Stop boundary

When complete:

```text
branch behind main = 0
git status clean
final tested SHA pushed
evidence generated from final tested SHA
Reader-A..H PASS
credentials/tokens absent from evidence
READER_DISCOVERY_READING_STATE_PASS
LOCAL_PASS_CI_PENDING
```

Push and STOP.

Gemini must not:
- create PR;
- merge;
- implement Wallet/VIP unlock;
- expand into comments/likes/follows/reporting;
- fix FE-owned Author static metrics;
- reopen AI/Story Brain/Manuscript architecture;
- claim GitHub Actions PASS.

ChatGPT owns remote review, PR, CI and merge.

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
