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

## 5. ACTIVE EXECUTION DIRECTIVE — Author Publish -> Admin Moderation -> Public Discovery E2E

The Product UI Integration Inventory is accepted as the planning basis for the next bounded gate.

### Accepted inventory

```text
inventory branch:
astra/product-ui-integration-inventory

inventory commit:
a5c975e1e281863c78dbc08922993ae3dece5fc1

inventory base main:
1b5fcbc7b69e9ce3b928aa130370b73115b49cbd

surfaces inventoried:
27

REAL + E2E-COVERED:
5

REAL + NOT-YET-E2E-COVERED:
19

P0:
0

inventory verdict:
PRODUCT_UI_INVENTORY_COMPLETE
REVIEW_PENDING -> ACCEPTED
```

The inventory priority labels are advisory. Some already-covered/no-blocker surfaces were still counted as P1; do not treat the raw P1 count as a product defect count.

The next gate is accepted:

```text
AUTHOR-PUBLISH-ADMIN-MODERATION-E2E
```

This gate closes the first cross-role/cross-surface lifecycle:

```text
Author DRAFT
 -> submit publish
 -> moderation review
 -> Admin APPROVE
 -> novel PUBLISHED
 -> anonymous public discovery
```

Do not reopen AI/Story Brain/Manuscript Import architecture.

---

### Start branch from actual latest main

After this directive is committed:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/author-publish-admin-moderation-e2e
```

Record:

```text
GATE_BASE_MAIN_SHA = git rev-parse origin/main
```

Preserve the accepted inventory in the eventual implementation PR by cherry-picking the inventory-only commit:

```bash
git cherry-pick a5c975e1e281863c78dbc08922993ae3dece5fc1
```

If that commit conflicts only because main changed documentation/handoff text, preserve current-main handoff and keep the inventory report/evidence files. Do not resurrect an old `promt.md`.

Working branch:

```text
astra/author-publish-admin-moderation-e2e
```

---

### Confirmed production contracts

ChatGPT directly verified current-main behavior.

Author UI:

```text
AuthorNovelMetadataPage
 -> submitNovelPublish(novelId)
 -> POST /api/v1/novels/:novelId/submit-publish
```

Backend submit behavior:

```text
submitPublish()
 -> checkContent(NOVEL)
 -> if moderationRequired=false:
      publishNovel() immediately
 -> if moderationRequired=true:
      novel -> PENDING_MODERATION
      return moderationReviewId
```

Admin UI/backend:

```text
GET  /api/v1/admin/moderation/reviews
GET  /api/v1/admin/moderation/reviews/:reviewId
POST /api/v1/admin/moderation/reviews/:reviewId/resolve
```

For a NOVEL review:

```text
decision=APPROVED
 -> moderation_reviews.status = APPROVED
 -> publishNovel(target_id)
 -> novels.status = PUBLISHED
 -> published_at set
```

Public discovery:

```text
GET /api/v1/reading/search
 -> novels where status = PUBLISHED
```

Public search does not require a published chapter merely to list the novel.

---

### Critical deterministic-fixture rule

Do **not** use clean content and then accept immediate auto-publication as gate success.

The migration contains active demo filter rules including:

```text
pattern: badword
severity: HIGH

pattern: harassment
severity: MEDIUM
```

Use a unique browser-created test novel whose title/synopsis contains the exact deterministic trigger:

```text
harassment
```

Prefer placing the trigger in the synopsis, while keeping a unique title such as:

```text
E2E Moderation Lifecycle <unique suffix>
```

Before the browser run, verify the active rule exists in the local test database.

Publish-C MUST fail the test unless the browser-originated submit response proves:

```text
moderationRequired == true
status == PENDING_MODERATION
moderationReviewId != null
```

If the response says `moderationRequired=false`, classify:

```text
TEST_FIXTURE_NOT_TRIGGERING_MODERATION
```

Do not silently continue to Admin checkpoints.

Do not add a fake test-only production endpoint to force moderation.

---

### Phase A — inspect before editing

Reinspect current branch after cherry-pick:

```text
web/src/features/author-projects/AuthorNovelMetadataPage.tsx
web/src/features/novels/novel-api.ts
web/src/features/admin/AdminPage.tsx
web/src/features/admin/admin-api.ts
backend/src/modules/novels/novels.service.ts
backend/src/modules/content-control/content-control.service.ts
backend/src/modules/reading/reading.repository.ts
```

Determine whether any product code change is actually required.

If current UI already completes the lifecycle correctly, **do not manufacture product changes**. It is acceptable for this gate to consist primarily of a hardened browser runner, deterministic tests, evidence and report.

Only fix a UI/backend defect if the real browser run exposes one.

---

### Phase B — real browser lifecycle

Use the rendered web application and production-like local stack.

All lifecycle mutations must originate in the browser UI.

API/DB calls may be used only for correlation/verification after the browser mutation.

Required checkpoints:

```text
Publish-A — Author creates deterministic DRAFT novel
Publish-B — Author verifies DRAFT state and moderation-triggering synopsis
Publish-C — Author clicks "Gửi duyệt"; exact browser request/response proves PENDING_MODERATION + moderationReviewId
Publish-D — Author logs out; Admin logs in and opens moderation queue
Publish-E — Admin sees exact pending NOVEL review for the target novel/reviewId
Publish-F — Admin opens exact review detail and submits APPROVED through rendered UI
Publish-G — Admin readback + DB prove review APPROVED and novel PUBLISHED/published_at set
Publish-H — clear auth; anonymous /public search visibly renders the unique published novel and public detail opens
```

#### Publish-A

Author must create the target novel via rendered Author UI if a create control exists.

Use a unique title per run.

Do not preinsert the target novel directly in PostgreSQL and call that a browser checkpoint.

DB correlation after creation must prove:

```text
novel.author_id == logged-in author
novel.status == DRAFT
deleted_at == null
```

#### Publish-B

Through rendered author metadata UI, ensure the final persisted synopsis contains the exact trigger token:

```text
harassment
```

Reload/reopen the author metadata page and prove the target title/synopsis/status persist.

#### Publish-C

Capture via CDP:

```text
POST /api/v1/novels/:novelId/submit-publish
```

Record:

```text
browser request id
novel_id
HTTP status
response.status
response.moderationRequired
response.moderationReviewId
```

Required:

```text
response.status == PENDING_MODERATION
response.moderationRequired == true
response.moderationReviewId == real UUID
```

Then DB-correlate:

```text
novels.status = PENDING_MODERATION
moderation_reviews.review_id = response.moderationReviewId
moderation_reviews.target_type = NOVEL
moderation_reviews.target_id = novel_id
moderation_reviews.status = PENDING
source = KEYWORD_FILTER
```

The Author UI must visibly reflect the pending state after mutation/refetch/reload.

#### Publish-D

Use normal UI logout/session transition.

Login as Admin through rendered login UI.

Do not inject an Admin token into storage as the decisive auth step.

#### Publish-E

Navigate to:

```text
/admin/moderation
```

Filter/use the rendered queue as needed.

Prove the exact `moderationReviewId` for the exact target novel is present.

Do not pass by observing an unrelated pending review.

#### Publish-F

Open:

```text
/admin/moderation/:reviewId
```

Verify the detail corresponds to:

```text
targetType = NOVEL
targetId = target novel id
status = PENDING
```

Submit:

```text
decision = APPROVED
```

through the rendered Admin UI.

Capture the browser-originated resolve request:

```text
POST /api/v1/admin/moderation/reviews/:reviewId/resolve
```

and response.

#### Publish-G

After approval:

```text
review status = APPROVED
reviewed_by = admin user
reviewed_at != null

novel status = PUBLISHED
published_at != null
```

Browser/Admin UI must also show the review no longer belongs to the pending queue, or clearly show resolved/approved state if the product retains it in another filter.

Reload the relevant Admin view before PASS.

#### Publish-H

Logout/clear the authenticated session through normal UI, then visit as anonymous:

```text
/public
```

Use public search/filter UI with the exact unique title.

Prove:

```text
target novel appears in rendered DOM
target novel card links to /public/novels/:novelId
opening that detail succeeds
displayed title matches target
```

Capture the public search network request and correlate that it returns the target novel.

---

### Phase C — negative and idempotency checks

Add the smallest deterministic/browser assertions proving:

```text
1. Reader/Author cannot resolve Admin moderation review (403 / guarded route)
2. duplicate resolve of the already-approved review fails closed with 409
3. already-PUBLISHED novel cannot be resubmitted through normal author publish flow as a second pending review
4. the same target does not produce multiple open PENDING moderation reviews
5. an unrelated pending review cannot satisfy Publish-E/F
```

These may be API-level deterministic tests except where a rendered role guard is the behavior under test.

Do not expand into a full moderation-system rewrite.

---

### Phase D — evidence and report

Create:

```text
docs/development/AUTHOR-PUBLISH-ADMIN-MODERATION-E2E-report.md

docs/development/AUTHOR-PUBLISH-ADMIN-MODERATION-E2E/
  author-publish-admin-moderation-e2e-evidence.json
  Publish-A..H screenshots
```

Evidence JSON must include at minimum:

```text
tested_main_sha
tested_code_sha
branch

author_user_id
admin_user_id

novel_id
unique_novel_title
novel_initial_status
novel_pending_status
novel_final_status
published_at

content_filter_rule_id or rule identity
moderation_trigger

submit_publish_browser_request_id
submit_publish_http_status
moderation_required
moderation_review_id

moderation_review_source
moderation_review_initial_status
moderation_resolve_browser_request_id
moderation_resolve_http_status
moderation_review_final_status
reviewed_by
reviewed_at

public_search_browser_request_id
public_detail_url
public_rendered_title

negative_check_results
```

Do not store:
- passwords;
- access/refresh tokens;
- secrets;
- unrelated private content.

Use backward-only SHA lineage if a separate evidence commit is used.

---

### Phase E — validation

Run at minimum:

```text
web typecheck/build
relevant novels/content-control deterministic tests
relevant admin/reading deterministic tests
backend typecheck
real browser Publish-A through Publish-H
```

Do not rerun AI provider quality tests unless this gate exposes an unrelated concrete regression.

Accepted AI/Story Brain/Manuscript gates remain closed.

Final verdict:

```text
AUTHOR_PUBLISH_ADMIN_MODERATION_PASS
```

only when all eight browser checkpoints and DB correlations pass.

If UI product behavior is actually broken:

```text
AUTHOR_PUBLISH_ADMIN_MODERATION_FAIL
```

until repaired and rerun.

---

### Stop boundary

When local acceptance is complete:

```text
git status clean
push astra/author-publish-admin-moderation-e2e
STOP at LOCAL_PASS_CI_PENDING
```

Gemini must not:
- create a PR;
- merge to main;
- claim GitHub Actions PASS;
- implement Reader/Wallet/VIP gates in the same branch;
- reopen AI/Story Brain architecture;
- accept the auto-publish no-moderation path as a substitute for this gate.

ChatGPT owns remote review, PR, CI inspection, merge decision and canonical closure.

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
