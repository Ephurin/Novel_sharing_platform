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

Do not reopen P1/P2/P3, Manuscript Import, Author Publish/Moderation, or Reader Discovery/Reading State architecture without a concrete regression or explicitly approved new scope.

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

## 5. ACTIVE EXECUTION DIRECTIVE — Reader Social + Comment + Preferences E2E

Reader Discovery / Library / Reading History is now CI_PASS / MERGED.

The next bounded gate is:

```text
READER-SOCIAL-COMMENT-PREFERENCES-E2E
```

This gate proves the remaining non-wallet Reader interaction loop on already-published/free content:

```text
Reader
 -> like / unlike published novel
 -> follow / unfollow published author
 -> save reading preferences
 -> reload and prove persisted preferences are applied
 -> create clean comment
 -> edit own clean comment
 -> delete own comment
```

Explicitly OUT OF SCOPE:

```text
User Report -> Admin moderation
Wallet / deposits / VIP unlock
Author FE static/mock metric cleanup
AI / Story Brain architecture
```

User-report moderation will be a separate cross-role gate after this one.

---

### Start from actual latest main

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/reader-social-comment-preferences-e2e
```

Record:

```text
GATE_BASE_MAIN_SHA = git rev-parse origin/main
```

Working branch:

```text
astra/reader-social-comment-preferences-e2e
```

---

### Confirmed current-main production contracts

#### Social interactions

Frontend:

```text
POST   /api/v1/novels/:novelId/likes
DELETE /api/v1/novels/:novelId/likes/me

POST   /api/v1/authors/:authorId/follow
DELETE /api/v1/authors/:authorId/follow
```

Backend production path:

```text
backend/src/modules/interactions/social.routes.ts
backend/src/modules/interactions/social.service.ts
backend/src/modules/interactions/social.repository.ts
```

Existing semantics:

```text
Like published novel:
 first like -> success
 duplicate -> 409 INTERACTION_001

Unlike:
 existing -> success
 missing -> 404 INTERACTION_002

Follow active author:
 first follow -> success
 duplicate/self-follow -> 409 INTERACTION_001

Unfollow:
 existing -> success
 missing -> 404 INTERACTION_002
```

#### Reading preferences

```text
GET /api/v1/reading/preferences/me
PUT /api/v1/reading/preferences/me
```

Current UI exposes:
- font family;
- font size;
- background;
- line height;
- rendered `Save preferences` action;
- chapter body style derived from persisted preferences.

#### Comments

```text
GET    /api/v1/chapters/:chapterId/comments
POST   /api/v1/chapters/:chapterId/comments
PATCH  /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

Production path:

```text
backend/src/modules/interactions/comments.routes.ts
backend/src/modules/interactions/comments.service.ts
backend/src/modules/interactions/comments.repository.ts
```

Comment content is checked by content-control.

Clean text:

```text
no active filter match
 -> status APPROVED
 -> immediately visible in approved comment list
```

Filtered text:

```text
matching active filter
 -> PENDING_MODERATION
 -> requires Admin lifecycle
```

This gate MUST use clean deterministic comment text and MUST NOT pull Admin moderation into scope.

Use a unique clean comment string such as:

```text
E2E reader comment <unique suffix>
```

Do not include `harassment`, `badword`, or other seeded filter tokens.

---

### Deterministic fixture

Reuse the accepted Reader fixture from the prior gate where valid:

```text
reader:
reader04@example.com

novel:
Ashenhold - Sample Story
81b923d7-5507-48ea-9a84-5303fd1de5f4

free chapter:
c660bede-0493-4a46-97f2-6d01c8ddd3db
```

Before final browser execution, verify remotely-selected local seed state:

```text
novel.status = PUBLISHED
chapter.status = PUBLISHED
chapter.is_vip = false
author exists and is active
```

The runner may clean only this reader's prior like/follow/comment/preferences fixture state as deterministic test setup.

Do not mutate the Author/Admin publication lifecycle.

Password must come from:

```text
EPHURIN_E2E_DEMO_PASSWORD
```

No committed password/token literals and no token/storage auth injection.

---

### Phase A — inspect before editing

Inspect:

```text
web/src/features/reader/ReaderPage.tsx
web/src/features/reader/reader-api.ts

backend/src/modules/interactions/social.routes.ts
backend/src/modules/interactions/social.service.ts
backend/src/modules/interactions/social.repository.ts

backend/src/modules/interactions/comments.routes.ts
backend/src/modules/interactions/comments.service.ts
backend/src/modules/interactions/comments.repository.ts

backend/src/modules/reading/reading.routes.ts
backend/src/modules/reading/reading.service.ts
backend/src/modules/reading/reading.repository.ts

backend/src/modules/content-control/content-control.service.ts
```

If behavior already closes the loop, do not manufacture product changes.

Adding stable `data-testid` selectors is acceptable where necessary.

If a real browser run exposes stale/incorrect interaction state, fix the smallest production defect and rerun.

---

### Phase B — real browser checkpoints

All decisive mutations must originate from rendered UI.

Required checkpoints:

```text
Interact-A — login as READER via rendered login
Interact-B — open exact published novel detail, Like, DB/readback proves like
Interact-C — Unlike, DB/readback proves removal
Interact-D — Follow exact author, DB/follower readback proves follow; then Unfollow proves removal
Interact-E — open exact free chapter, change reading preferences and Save; reload proves persisted values/style
Interact-F — create unique clean comment; response status APPROVED; rendered list + DB prove ownership/content
Interact-G — Edit own comment through rendered UI; response remains APPROVED; reload/readback proves updated content
Interact-H — Delete own comment through rendered UI; reload/readback + DB prove soft-deleted/absent
```

#### Interact-A

Normal UI login only.

Prove:

```text
role = READER
authenticated shell visible
```

#### Interact-B — Like

Navigate via rendered Reader UI to the deterministic novel detail.

Clean test fixture state first so reader has no existing like.

Click rendered `Like`.

Capture:

```text
POST /api/v1/novels/:novelId/likes
HTTP success
response.liked = true
```

DB/readback:

```text
exact reader_id
exact novel_id
exactly one active like
```

If response contains `likesCount`, correlate it to repository count.

Do not require the existing stats badge to update unless production code actually refetches it. If the UI claims an updated count but displays a stale/incorrect count, classify and fix that concrete defect.

#### Interact-C — Unlike

Click rendered `Unlike`.

Capture:

```text
DELETE /api/v1/novels/:novelId/likes/me
HTTP success
response.liked = false
```

DB proves reader/novel like absent.

#### Interact-D — Follow/Unfollow

Use exact `novel.authorId`.

Click `Follow`.

Capture exact POST and DB row:

```text
follower_id = reader
author_id = target author
```

Use:

```text
GET /api/v1/authors/:authorId/followers/count
```

or direct DB correlation to prove count/state.

Then click `Unfollow`, capture DELETE, prove row absent.

Do not use the Reader's own user as target author.

#### Interact-E — Reading preferences

Open exact free chapter.

Record original preferences.

Through rendered controls, set a deterministic alternative combination that differs from the original, for example:

```text
fontFamily = Georgia
fontSize = 20
background = SEPIA
lineHeight = 1.9
```

If any value already equals the target, choose another valid value so a real mutation occurs.

Click rendered:

```text
Save preferences
```

Capture:

```text
PUT /api/v1/reading/preferences/me
```

Reload the chapter.

Prove:

```text
GET preferences returns saved values
controls read back saved values
chapter prose rendered style reflects saved preferences
DB row matches
```

At final cleanup, restore the original fixture preferences if practical. Restoration is test cleanup, not an acceptance checkpoint.

#### Interact-F — Create clean comment

Use a unique content string with no seeded moderation keyword.

Click rendered `Submit comment`.

Capture:

```text
POST /api/v1/chapters/:chapterId/comments
commentId = real UUID
status = APPROVED
moderationReviewId = null
```

If it returns `PENDING_MODERATION`, fail:

```text
COMMENT_FIXTURE_UNEXPECTEDLY_FILTERED
```

Do not continue by involving Admin.

After query invalidation/reload prove:
- exact comment appears in rendered approved list;
- exact content appears;
- exact user owns it;
- DB status = APPROVED;
- deleted_at is null if repository uses soft deletion.

#### Interact-G — Edit own comment

Use rendered `Edit` -> modify to a second unique clean string -> `Save`.

Capture PATCH:

```text
PATCH /api/v1/comments/:commentId
status = APPROVED
moderationReviewId = null
```

Reload/comments readback must show updated content, old content absent.

#### Interact-H — Delete own comment

Click rendered `Delete`.

Capture:

```text
DELETE /api/v1/comments/:commentId
```

Reload.

Prove:
- comment absent from approved list;
- DB row is deleted/soft-deleted according to canonical repository behavior;
- another unrelated comment is not used to satisfy the assertion.

---

### Phase C — negative/idempotency checks

Add/execute the smallest production-path deterministic assertions proving:

```text
1. anonymous like/follow/comment mutations are rejected by auth
2. duplicate like -> 409 INTERACTION_001
3. unlike without existing like -> 404 INTERACTION_002
4. duplicate follow -> 409 INTERACTION_001
5. unfollow without existing follow -> 404 INTERACTION_002
6. reader cannot edit/delete another user's comment -> 403 AUTH_008
7. clean comment -> APPROVED without moderation review
8. filtered comment -> PENDING_MODERATION with review ID
9. commenting on non-reader-visible/non-published chapter must fail closed;
   if current production service accepts it, classify BROKEN_CONTRACT and repair minimally
10. reading preferences are user-scoped
```

The filtered-comment negative check may use service-level deterministic test data. It must not invoke browser/Admin moderation.

Do not add user-report resolution tests here.

---

### Phase D — evidence

Create:

```text
docs/development/READER-SOCIAL-COMMENT-PREFERENCES-E2E-report.md

docs/development/READER-SOCIAL-COMMENT-PREFERENCES-E2E/
  reader-social-comment-preferences-e2e-evidence.json
  Interact-A..H screenshots
```

Evidence must include:

```text
tested_main_sha
tested_code_sha
branch

reader_user_id
reader_email
novel_id
author_id
chapter_id

login_browser_request_id
like_request_id
unlike_request_id
follow_request_id
unfollow_request_id
preferences_save_request_id
comment_create_request_id
comment_update_request_id
comment_delete_request_id

like_db_proof
follow_db_proof
preferences_db_proof
comment_create_db_proof
comment_update_db_proof
comment_delete_db_proof

negative_suite
validation
verdict
```

Do not store passwords, tokens, cookies, or unrelated private data.

---

### Phase E — validation

Run at minimum:

```text
web typecheck
web build
backend typecheck
focused social/comments/reading PostgreSQL tests
backend regression suite if production code changed
real browser Interact-A..H
```

Final local verdict:

```text
READER_SOCIAL_COMMENT_PREFERENCES_PASS
```

only when Interact-A..H and Phase C invariants pass.

---

### Stop boundary

When complete:

```text
branch behind main = 0
git status clean
final tested SHA pushed
evidence generated from final tested SHA
Interact-A..H PASS
credentials/tokens absent from evidence
READER_SOCIAL_COMMENT_PREFERENCES_PASS
LOCAL_PASS_CI_PENDING
```

Push and STOP.

Gemini must not:
- create PR;
- merge;
- execute user-report/Admin moderation lifecycle;
- implement Wallet/VIP/deposit;
- fix unrelated Author static/mock metrics;
- reopen AI/Story Brain architecture;
- claim GitHub Actions PASS.

ChatGPT owns remote review, PR, CI, and merge.

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
