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
READER-SOCIAL-COMMENT-PREF Social/comment/preferences lifecycle    CI_PASS / MERGED

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
PR #49  READER-SOCIAL-COMMENT-PREF  merged
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

Reader Social / Comment / Preferences remote closure:

```text
tested code:
0b2c53f7fb4a1af6e601763ebe4bf654192a44ff

accepted PR head / evidence commit:
fcfe3f078929e6df0f0bdade02e90ab3e91aa7ba

P7 Semantic Memory Foundation:
run #129 / 38707250887 / PASS

P8 Cutover and Migration:
run #126 / 38707250954 / PASS

merge:
9e79b65c16a9c7776eefeadc3904660011e174a6

report:
docs/development/READER-SOCIAL-COMMENT-PREFERENCES-E2E-report.md
```

Do not reopen P1/P2/P3, Manuscript Import, Author Publish/Moderation, Reader Discovery/Reading State, or Reader Social/Comment/Preferences architecture without a concrete regression or explicitly approved new scope.

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

## 5. ACTIVE EXECUTION DIRECTIVE — Comment User Report -> Admin Moderation -> Notifications E2E

Reader Social / Comment / Preferences is now CI_PASS / MERGED.

The next bounded cross-role gate is:

```text
COMMENT-USER-REPORT-ADMIN-MODERATION-E2E
```

This gate proves the canonical user-report lifecycle for an already-approved reader comment:

```text
Reader A creates clean APPROVED comment
 -> Reader B reports that exact comment
 -> one USER_REPORT moderation review
 -> Admin opens exact report review
 -> Admin APPROVES the report
 -> report RESOLVED
 -> comment soft-deleted
 -> reporter notification
 -> comment-owner notification
 -> comment disappears from reader list
```

Important semantics:

```text
USER_REPORT + decision=APPROVED
= approve the REPORT
= remove the reported comment

USER_REPORT + decision=REJECTED
= reject the REPORT
= keep the comment
```

Do not describe these as “approve/reject the comment”.

Explicitly OUT OF SCOPE:

```text
Wallet / deposit / VIP unlock
novel/chapter/user report browser lifecycle
keyword-filter Admin lifecycle (already covered separately)
Author FE static/mock cleanup
AI / Story Brain
```

---

### Start from actual latest main

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b astra/comment-user-report-admin-moderation-e2e
```

Record:

```text
GATE_BASE_MAIN_SHA = git rev-parse origin/main
```

Working branch:

```text
astra/comment-user-report-admin-moderation-e2e
```

---

### Confirmed current-main contracts

Reader report API:

```text
POST /api/v1/reports

body:
targetType = COMMENT
targetId = commentId
reason
description? 
```

Backend:

```text
createUserReport()
 -> findOpenReview(COMMENT, commentId)
 -> reuse open review OR create moderation_review
 -> source = USER_REPORT
 -> create report row
 -> response:
      reportId
      moderationReviewId
      status=PENDING
```

Admin:

```text
GET  /api/v1/admin/moderation/reviews
GET  /api/v1/admin/moderation/reviews/:reviewId
POST /api/v1/admin/moderation/reviews/:reviewId/resolve
```

For:

```text
target_type=COMMENT
source=USER_REPORT
```

Admin decision:

```text
APPROVED
 -> moderation_review.status = APPROVED
 -> all OPEN reports on review -> RESOLVED
 -> comment softDelete
 -> owner notification: COMMENT_REMOVED_BY_REPORT
 -> reporter notification: COMMENT_REPORT_APPROVED

REJECTED
 -> moderation_review.status = REJECTED
 -> all OPEN reports on review -> REJECTED
 -> comment remains available
 -> owner notification: COMMENT_REPORT_REJECTED_OWNER
 -> reporter notification: COMMENT_REPORT_REJECTED
```

Notification UI:

```text
GET   /api/v1/notifications
PATCH /api/v1/notifications/:notificationId/read

route:
/notifications
```

---

### Confirmed gaps to inspect/fix

#### Gap 1 — User Reports route is not wired

`AdminModerationPage` already accepts:

```tsx
sourceFilter="USER_REPORT"
```

and renders the title `User Reports`, but current router/nav do not expose `/admin/reports`.

The prior web completion plan explicitly listed `/admin/reports`.

If current main still matches this inspection, wire the smallest reuse-only route:

```text
/admin/reports
 -> RoleGuard ADMIN
 -> <AdminModerationPage sourceFilter="USER_REPORT" />
```

and add one Admin nav item:

```text
User Reports
```

Do NOT create a second moderation component.

#### Gap 2 — Admin USER_REPORT decision copy is semantically wrong

Current generic detail copy says approximately:

```text
Approve -> related content remains available/approved
Reject -> comment targets propagated to rejected status
```

That is wrong for `source=USER_REPORT`.

For USER_REPORT comment review, rendered confirmation must explicitly communicate:

```text
Approve report
 -> reported comment will be removed

Reject report
 -> reported comment will be kept
```

Keyword-filter review semantics must remain unchanged.

Prefer source-aware labels/descriptions, e.g.:

```text
Approve report
Reject report
```

Do not change backend decision enum values.

#### Gap 3 — Report target validation

Current `createUserReport()` creates/reuses a review and creates a report without first proving a COMMENT target exists and is reportable.

For this gate, a COMMENT report must fail closed if the target:
- does not exist;
- is already deleted;
- belongs to non-reader-visible unpublished content if such state can be reached.

Use the canonical comment/readability repositories; do not add a test-only endpoint.

Keep this change bounded to COMMENT targets unless a tiny shared validator cleanly supports all report target types.

#### Gap 4 — Duplicate OPEN reports by same reporter

The current migration has no uniqueness constraint for:

```text
reporter_id + target_type + target_id + OPEN
```

and `createUserReport()` does not visibly prevent the same reporter from creating unlimited duplicate OPEN rows for the same target.

Required behavior:

```text
same reporter + same target + unresolved/open report
must NOT create unbounded duplicate OPEN rows
```

Accept either:
- fail closed with an explicit 409; or
- idempotently return/reuse the existing open report.

Pick the smallest behavior consistent with existing error conventions and document it.

Distinct reporters MAY share the same open moderation review and each have one report row; this is desirable because `reportCount` aggregates reports on one review.

If a migration/index is needed, make it partial to unresolved/open state so historical resolved reports do not block future legitimate reports.

---

### Deterministic fixtures

Use three distinct deterministic identities:

```text
comment owner: READER
reporter:      READER
moderator:     ADMIN
```

Prefer existing demo seed accounts. Verify:
- owner user ID != reporter user ID;
- reporter user ID != admin user ID;
- roles are correct.

Password must come from:

```text
EPHURIN_E2E_DEMO_PASSWORD
```

No password/token literals or auth-store injection.

Reuse the deterministic published/free Ashenhold fixture when still valid:

```text
novel:
81b923d7-5507-48ea-9a84-5303fd1de5f4

chapter:
c660bede-0493-4a46-97f2-6d01c8ddd3db
```

Before run verify:
- novel PUBLISHED;
- chapter PUBLISHED;
- chapter non-VIP/free;
- chapter readable through Reader UI.

Use a unique CLEAN comment string with no filter keywords.

---

### Phase A — inspect before editing

Inspect at minimum:

```text
web/src/app/router.tsx
web/src/app/layout/WebAppShell.tsx
web/src/features/reader/ReaderPage.tsx
web/src/features/reader/reader-api.ts
web/src/features/admin/AdminPage.tsx
web/src/features/admin/admin-api.ts
web/src/features/notifications/NotificationsPage.tsx
web/src/features/notifications/notification-api.ts

backend/src/modules/content-control/content-control.routes.ts
backend/src/modules/content-control/content-control.schemas.ts
backend/src/modules/content-control/content-control.service.ts
backend/src/modules/content-control/content-control.repository.ts
backend/src/modules/interactions/comments.repository.ts
backend/src/modules/interactions/notifications.repository.ts
backend/src/modules/interactions/notifications.service.ts
backend/src/core/database/migrations/004_content_control.sql
```

Do not manufacture unrelated refactors.

Stable `data-testid` additions are acceptable.

---

### Phase B — browser lifecycle

All decisive user actions must originate from rendered UI.

Required checkpoints:

```text
Report-A — Owner Reader UI login; create exact clean APPROVED comment
Report-B — Owner real UI logout; Reporter Reader UI login
Report-C — Reporter opens exact chapter and reports exact comment
Report-D — DB/API prove one OPEN report + one PENDING USER_REPORT review for exact comment
Report-E — Reporter real UI logout; Admin UI login; open /admin/reports and exact pending review
Report-F — Admin detail proves source USER_REPORT, target COMMENT, reportCount; source-aware confirmation copy
Report-G — Admin clicks "Approve report" through rendered UI
Report-H — reload/DB prove review APPROVED, report RESOLVED, exact comment soft-deleted
Report-I — Reporter logs in -> /notifications shows COMMENT_REPORT_APPROVED
Report-J — Owner logs in -> /notifications shows COMMENT_REMOVED_BY_REPORT; chapter reload proves comment absent
```

#### Report-A — create target comment

Owner logs in through rendered form and opens exact free chapter.

Create a unique clean comment through the rendered comment UI.

Capture:

```text
POST /api/v1/chapters/:chapterId/comments
status = APPROVED
moderationReviewId = null
```

Record exact `commentId`.

Mongo correlation:
- exact owner userId;
- exact chapterId;
- exact content;
- status APPROVED;
- not deleted.

Do not preinsert the accepted target comment directly in Mongo.

#### Report-B — role transition

Click canonical rendered Logout.

Reporter logs in via rendered login form.

No storage/token shortcut.

#### Report-C — report exact comment

Reporter opens the same chapter.

Prove the exact `commentId`/content is rendered.

Click that exact comment's `Report` action.

Capture:

```text
POST /api/v1/reports
targetType = COMMENT
targetId = exact commentId
HTTP success
reportId = real UUID
moderationReviewId = real UUID
status = PENDING
```

The browser-visible UI must show report submission success.

#### Report-D — persistence correlation

PostgreSQL must prove:

```text
reports.report_id = response.reportId
reports.reporter_id = reporter user
reports.target_type = COMMENT
reports.target_id = exact commentId
reports.status = OPEN

moderation_reviews.review_id = response.moderationReviewId
moderation_reviews.target_type = COMMENT
moderation_reviews.target_id = exact commentId
moderation_reviews.source = USER_REPORT
moderation_reviews.status = PENDING
```

Exact open report count for this reporter/target = 1.

#### Report-E — Admin User Reports surface

Reporter clicks rendered Logout.

Admin logs in via rendered login form.

Use rendered Admin navigation to open:

```text
/admin/reports
```

This route must be source-filtered to `USER_REPORT`.

Capture:

```text
GET /api/v1/admin/moderation/reviews?...source=USER_REPORT...
```

Exact `moderationReviewId` must be visible.

Do not satisfy this checkpoint with an unrelated pending review.

#### Report-F — exact detail + semantic copy

Open:

```text
/admin/moderation/:reviewId
```

Prove rendered detail:

```text
targetType = COMMENT
targetId = exact commentId
source = USER_REPORT
status = PENDING
Reports = 1
```

The decision UI must visibly communicate:

```text
Approve report -> remove reported comment
Reject report -> keep reported comment
```

If it still says content remains available on approve, classify:

```text
BROKEN_USER_REPORT_ADMIN_COPY
```

and fix before continuing.

#### Report-G — approve report

Click rendered `Approve report`.

Use the rendered confirmation modal.

Capture:

```text
POST /api/v1/admin/moderation/reviews/:reviewId/resolve

body.decision = APPROVED
```

This means “approve the report”, not “approve the comment”.

#### Report-H — resolution persistence

Reload Admin detail/queue.

PostgreSQL:

```text
moderation_reviews.status = APPROVED
reviewed_by = admin
reviewed_at != null

reports.status = RESOLVED
reports.resolved_by = admin
reports.resolved_at != null
```

Mongo comment:

```text
status = DELETED
deletedAt != null
```

Pending USER_REPORT queue must no longer include exact review.

#### Report-I — reporter notification

Admin real UI logout.

Reporter real UI login.

Open rendered:

```text
/notifications
```

Capture `GET /api/v1/notifications`.

Prove an exact notification tied by payload to the review/report/comment:

```text
type = COMMENT_REPORT_APPROVED
userId = reporter
payload.reviewId = exact reviewId
payload.commentId = exact commentId
```

Rendered UI must show it.

Mark-read behavior is optional for this gate; do not expand scope solely for it.

#### Report-J — owner notification + content consequence

Reporter real UI logout.

Owner real UI login.

Open `/notifications`.

Prove:

```text
type = COMMENT_REMOVED_BY_REPORT
userId = owner
payload.reviewId = exact reviewId
payload.commentId = exact commentId
```

Then open/reload exact chapter.

Prove the exact comment content/id is absent from approved rendered comments.

---

### Phase C — deterministic integrity checks

Add/execute focused production-path tests proving at least:

```text
1. anonymous POST /reports -> 401
2. non-Admin cannot access/resolve Admin moderation review -> 403
3. COMMENT report against nonexistent target fails closed
4. COMMENT report against deleted target fails closed
5. same reporter cannot create multiple unresolved OPEN reports for same comment
6. two distinct reporters on same comment reuse ONE open moderation review and produce reportCount=2
7. approving USER_REPORT:
     review -> APPROVED
     reports -> RESOLVED
     comment -> DELETED
8. rejecting USER_REPORT:
     review -> REJECTED
     reports -> REJECTED
     comment remains APPROVED/not deleted
9. approve notification types/payloads are correct for owner and reporter
10. reject notification types/payloads are correct for owner and reporter
11. duplicate resolve of resolved review -> 409
12. keyword-filter COMMENT moderation semantics remain unchanged
```

Do not browser-run the reject branch unless needed to expose/fix UI behavior; service/integration coverage is sufficient.

---

### Phase D — evidence

Create:

```text
docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md

docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E/
  comment-user-report-admin-moderation-e2e-evidence.json
  Report-A..J screenshots
```

Evidence must include at least:

```text
tested_main_sha
tested_code_sha
branch

owner_user_id
reporter_user_id
admin_user_id

novel_id
chapter_id
comment_id
comment_original_content

comment_create_request_id
report_create_request_id
report_id
moderation_review_id
admin_review_list_request_id
admin_review_detail_request_id
admin_resolve_request_id

report_db_before
review_db_before
report_db_after
review_db_after
comment_db_before
comment_db_after

reporter_notification_id
owner_notification_id
notification_db_proof

negative_suite
validation
verdict
```

No passwords, tokens, cookies, or unrelated private data.

---

### Phase E — validation

Run at minimum:

```text
web typecheck
web build
backend typecheck
focused content-control/comments/notifications PostgreSQL+Mongo tests
backend regression suite if production code changed
real browser Report-A..J
```

Final local verdict:

```text
COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
```

only when Report-A..J and Phase C pass.

---

### Stop boundary

When complete:

```text
branch behind main = 0
git status clean
final tested SHA pushed
evidence generated from final tested SHA
Report-A..J PASS
credentials/tokens absent
COMMENT_USER_REPORT_ADMIN_MODERATION_PASS
LOCAL_PASS_CI_PENDING
```

Push and STOP.

Gemini must not:
- create PR;
- merge;
- implement Wallet/VIP/deposit;
- broaden browser scope to novel/chapter/user reports;
- reopen accepted Reader/Author/AI gates;
- fix unrelated FE hardcoded metrics;
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
