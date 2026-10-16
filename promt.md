# Active Project Handoff — Novel Sharing Platform AI

## 1. Canonical Status — 2026-10-16

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
COMMENT-USER-REPORT-MODERATION  Reader report/Admin decision/notifications CI_PASS / MERGED

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
PR #50  COMMENT-USER-REPORT-MODERATION  merged
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

## 5. ACTIVE EXECUTION DIRECTIVE — READER WALLET + VIP UNLOCK BROWSER E2E

### Gate transition (2026-10-16)

Previous gate COMMENT-USER-REPORT-ADMIN-MODERATION-E2E is CLOSED. PR #50 merged.
Tested product SHA: ab235d43516238516012a2a2528cbf07d769497a
Final accepted PR head SHA: c27b4d524a9257dbe2d443584d3b003a41c7d5f6
Merge SHA: 7f0ed1dde93dac72b4fab2e05deb5d60d59d40d4
P7 #130: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/38851810884 SUCCESS (3/3 jobs).
P8 #127: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/38851810760 SUCCESS (6/6 jobs).
Defense Demo Contract #6: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/38851810645 SUCCESS.
Closure report: docs/development/COMMENT-USER-REPORT-ADMIN-MODERATION-E2E-report.md
Engineering record: docs/development/DEVELOPMENT_HISTORY.md (EDR-12).
Do not reopen, downgrade, retest as a new acceptance, rewrite historical evidence JSON, or redo previous gate.

### NEXT GATE (strictly bounded)

Gate ID: READER-WALLET-VIP-UNLOCK-E2E
Proposed working branch: astra/reader-wallet-vip-unlock-e2e
Status: ASSIGNED / NOT_YET_IMPLEMENTED
Ownership: Gemini executes local implementation + Docker/database + browser tests and commits evidence to branch. ChatGPT reviews, opens PR, verifies P7/P8 CI, merges, and updates the engineering history after remote acceptance.

Rationale: PRODUCT-UI-INTEGRATION-INVENTORY.md ranked wallet/VIP monetization among remaining high-priority browser-acceptance gaps. Reader discovery, social/comment, author publishing, Admin moderation and notifications have now received separate E2E acceptance; the next narrow, useful user-facing loop is virtual-coin wallet -> VIP unlock -> reading entitlement.

### A. Start with current main, isolate the task

1. git fetch origin; git checkout main; git pull --ff-only; create/use branch astra/reader-wallet-vip-unlock-e2e from latest origin/main.
2. Record synced origin/main SHA. Do NOT reuse previous gate branch or mix unrelated unmerged changes.
3. Inspect real current implementations before editing:
   - web/src/features/wallet/WalletPage.tsx and wallet-api.ts
   - web/src/features/reader/ReaderPage.tsx and reader-api.ts
   - backend/src/modules/wallet/{wallet.routes.ts,wallet.controller.ts,wallet.service.ts,wallet.repository.ts,wallet.schemas.ts}
   - backend/src/modules/reading/{reading.service.ts,reading.repository.ts}
   - backend/src/core/database/test-db-guard.ts
   - backend/src/scripts/seed-sample-stories.ts and production migrations
   - docs/development/PRODUCT-UI-INTEGRATION-INVENTORY.md
4. Confirm exact VIP chapter fixture and price from a disposable seeded DB; do not assume the canonical free chapter is VIP or modify canonical demo data to force PASS.

### B. Acceptance journey: virtual coins ONLY (no real payments)

Use isolated PostgreSQL+Mongo test DBs with explicit external EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 opt-in, actual resolved DB identities, throwaway run ID, run-owned fixtures, exact-ID cleanup and no pre-creation DROP. Reuse the prior gate's proven safety discipline. The real browser must use rendered UI login/logout and buttons; database/API queries are correlation/assertion only, not substitutes for decisive UI actions.

Desired browser checkpoints:
Wallet-A: isolated fixture has published VIP chapter with nonempty real content and positive price; reader wallet starts with zero or verified insufficient virtual coins.
Wallet-B: anonymous attempt to access VIP chapter cannot read content; record actual HTTP status and UI lock state, not invented screenshots.
Wallet-C: READER signs in via rendered /login, opens VIP chapter, receives expected PAYMENT_002/402 lock contract and no content leak.
Wallet-D: Reader opens /wallet, sees initial virtual balance and transactions; chooses mock-only COIN_* package via UI.
Wallet-E: Reader clicks Deposit mock coins via UI. Capture actual create-session and mock completion requests and unique depositSessionId / transactionId; PostgreSQL verifies exactly one successful deposit and expected balance delta.
Wallet-F: Reader fills VIP Chapter ID and clicks Unlock chapter via UI, or uses canonical ReaderChapterPage unlock button. Capture POST /api/v1/chapters/:chapterId/unlock and new transactionId.
Wallet-G: Correlate exactly one chapter_unlocks entitlement and one UNLOCK transaction; reader balance decreases by exact price, author wallet increases by exact price; total virtual balance conserved across this transfer.
Wallet-H: Reader reloads the VIP chapter through rendered UI, GET /api/v1/reading/chapters/:id succeeds and actual content is visible; no auth/token injection.
Wallet-I: Reader retries unlock; prove alreadyUnlocked=true, no second debit, no duplicate entitlement, no second UNLOCK transaction; refresh wallet and transactions list to verify persistence.
Wallet-J: Distinct reader / anonymous visitor still cannot access locked VIP text; published FREE chapter still readable without payment.

Do not hardcode expected IDs, balances, chapter price or success flags into product code or acceptance evidence. Use real output fields and DB readbacks.

### C. Deterministic integrity/security checks (mandatory review)

At minimum cover: unauthenticated wallet/deposit/unlock API access, missing/unpublished chapter, insufficient funds 402, same-user repeat unlock idempotency, concurrent same-user unlock double-debit prevention, unauthorized cross-user entitlement, deposit-session completion replay, foreign session abuse, failed mock deposit behavior where implemented, nonnegative wallet balances and ledger consistency. For scenarios the current API does not support, mark NOT_SUPPORTED with explanation instead of inventing passing tests.

SECURITY REVIEW: backend/src/modules/wallet/wallet.routes.ts currently maps POST /mock-webhook/deposit-success without requireAuth. This endpoint is a TEST/DEMO mock path, not a real payment gateway. Inspect whether it is reachable in non-demo/production environments and whether an attacker could credit virtual coins by using a session ID. If a real trust-boundary issue exists, implement the smallest fail-closed environment/authorization guard and deterministic negative tests; do not wire any real payment processor, secret or banking API in this gate. Changes in mock-only payment gating must not break the explicitly guarded local E2E. Flag unresolved risks instead of silently claiming secure.

### D. Data safety and evidence requirements

- No calls to real payment processors, banks, real funds, payouts, financial account credentials, live payment keys, or external checkout URLs. The entire test uses only disposable in-app mock currency.
- All mutating tests run only in confirmed isolated disposable test databases; reject default ephurin DB and any collision. Verify resource ownership before cleanup. Never delete by user role, chapter type or broad wallet ID if not owned by run.
- Set up five or more unrelated sentinel records (at least wallet, deposit/session, transaction, entitlement and unrelated reader data if schema permits) before tests; compare actual state before/after full local validation and browser E2E.
- Check no credentials/session tokens are printed in reports, screenshots or JSON; do not take shortcuts by injecting localStorage auth.
- Record actual executable test status, not placeholder PASS: backend tests, frontend typecheck/build, migration checks if touched, negative/consistency tests, browser checkpoints, DB correlation, sentinel preservation, resource teardown.
- Tested code SHA must identify a clean pushed commit BEFORE evidence generation; evidence commit must point backwards to that SHA. Never claim local browser PASS from structural/mock only.

Expected deliverables:
docs/development/READER-WALLET-VIP-UNLOCK-E2E-report.md
docs/development/READER-WALLET-VIP-UNLOCK-E2E/reader-wallet-vip-unlock-e2e-evidence.json
docs/development/READER-WALLET-VIP-UNLOCK-E2E/wallet-a...wallet-j screenshots if real browser checkpoints succeeded.
scripts/run_reader_wallet_vip_unlock_e2e.py (or an equivalent well-documented non-destructive runner).
Focused backend tests for ledger and authorization invariants; avoid unrelated edits.

### E. Scope fence and stop boundary

DO NOT add real payments, author withdrawal settlement, donation payout logic, external bank accounts, Wallet UI redesign, new business model, mobile wallet, global AI-context-policy activation, Story Brain rewrites or P8 destructive cleanup. Donations/withdrawal are separate future gates.

Stop at:
  - branch ahead of main with behind=0 and git status clean
  - all 10 browser checkpoints either evidenced PASS or honestly BLOCKED with reason
  - transaction and entitlement integrity proven without ledger drift
  - production mock-webhook exposure reviewed and contained or honestly BLOCKED
  - guard/sentinels prove local fixture isolation
  - accurate tested_main_sha, tested_code_sha, evidence and screenshots
  - verdict READER_WALLET_VIP_UNLOCK_PASS / LOCAL_PASS_CI_PENDING only if fully verified
  - pushed branch and NO PR / NO MERGE / NO premature CI_PASS

Gemini must STOP after branch/evidence handoff. ChatGPT owns remote review/CI/merge and closes EDR next. If a safety blocker is found, fail closed and report it, rather than trying to make the test green by bypassing protection.

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
