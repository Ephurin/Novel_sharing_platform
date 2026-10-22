# Active Project Handoff — Novel Sharing Platform AI

## 0. ACTIVE PRIORITY — P1/P2/P3 HEADLESS CORE; HOLD FE INTEGRATION (2026-10-22)

**New owner decision:** Replace `HOLD_ALL` with **`HOLD_FE_INTEGRATION_ONLY`**. Codex should resume **P1 → P2 → P3 core workflows** now, not wait for FE developer reviews. However FE production/source work, Author IDE autosave, PR #52/#54/#55 and browser UI acceptance remain strictly on hold. The earlier instruction granting Codex full-stack FE ownership is **revoked**.

**SINGLE ACTIVE CODEX TASK:** [Pipeline_test/P123_HEADLESS_NEXT_SLICE_2026-10-22.md](Pipeline_test/P123_HEADLESS_NEXT_SLICE_2026-10-22.md). The previous [P123_HEADLESS_CORE_DELIVERY_TASK_2026-10-22.md](Pipeline_test/P123_HEADLESS_CORE_DELIVERY_TASK_2026-10-22.md) has a bounded P1 slice delivered and reviewed at source/evidence level. `Pipeline_test/ACTIVE_GEMINI_TASK.md` must point to the same active task. The parked [THREE_USECASE_COMPLETION_TASK_2026-10-22.md](Pipeline_test/THREE_USECASE_COMPLETION_TASK_2026-10-22.md) is **not authorized** until FE review and a new explicit decision.

**Product priority (current next slice):**
1. **P1 remaining CORE guards** — independent evidence review has accepted the bounded 33-check source→canon→HTTP/M-FIRST slice for further development, but **not full P1 PASS**. Address PATCH version conflict, accepted-generated-draft E2E, DB fault recovery, locked rule/overflow and legacy cutoff provenance. See [GPT-6 review](Pipeline_test/reviews/2026-10-22-p123-headless/GPT6_P1_CORE_INDEPENDENT_REVIEW.md).
2. **P2 headless CORE** — begin from idea/setup (not manuscript), explicit entity review and baseline → future Story Plan → first accepted/saved chapter → shared writing loop; independent isolated project.
3. **P3 headless CORE** — next after P2 functional evidence; bounded multi-objective controller with/without plan, HITL gate, resume/failure safety, draft-only persistence. 100k–105k final separate and not authorized live.

**Ownership:** Codex may implement/repair backend, AI Service, migrations in isolated test DBs, and a headless API E2E harness **on `codex/ai-copilot-pipeline-test` only**. FE developer exclusively owns FE PR code; do not edit `web/`, cherry-pick, merge or self-patch production frontend. GPT-6 independently reviews evidence and gate decisions. Existing separately owned Wallet/VIP work is unaffected.

**Evidence boundary:** `CORE_OFFLINE_PASS` through real HTTP + durable DB is distinct from `UI_E2E_PASS`, `LIVE_PROVIDER_PASS`, semantic RAG quality, literary quality and P3 100k completion. Scripted API-mediated human decisions are `SIMULATED_HUMAN_VIA_API`, not human UI acceptance. Do not mark S09 browser GREEN; historical Wave 1G S09 RED remains. Keep `WORKFLOW_CONTRACT.md` v1.4 intact.

**Hard safety boundary:** ZERO actual external Gemini/OpenAI/embedding calls until renewed explicit authorization. Isolated fake provider and test-owned stack only; no historical evidence/gold/ledger mutation, no production data writes, no auto publication, no main or FE branch writes, no PR merge.

This section supersedes conflicting instructions below in §4/§5/§7, which are historical or independently assigned tasks. Proceed with the next P1 core closure and P2 headless slice in the active task, and commit/push sanitized evidence for remote review.

---

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

## 5. ACTIVE EXECUTION DIRECTIVE — WALLET/VIP E2E ACCEPTANCE HARNESS HARDENING

Gate: `READER-WALLET-VIP-UNLOCK-E2E`
Work on EXISTING branch: `astra/reader-wallet-vip-unlock-e2e`
Last reviewed branch head / evidence commit: `bf7bccc2720e8975dcc6c43f142e30bcc0db876d`
Prior tested product/test/runner code SHA: `5a0a77a0f196f7e0bbfa11739451b93b8de8ed2e`
Main before this directive: `864dfabdf05be30e1e745b09312058425aff09d7`
Remote reviewer verdict: `LOCAL_PASS_WITH_REVIEW_BLOCKERS / NOT_READY_FOR_PR`.

**Scope:** narrow safety/evidence hardening ONLY. The virtual coin product flow has browser Wallet-A..J local PASS, 12 wallet PostgreSQL invariants, 11 DB guard tests, web/backend typecheck/build PASS. No PR. Preserve the backend security hardening already implemented (authenticated mock completion + deposit owner check + production refusal), existing UI logic, transaction semantics and screenshots unless rerunning changes those.

### 0 — Sync + bound the work

```bash
git fetch origin
git checkout astra/reader-wallet-vip-unlock-e2e
git pull --ff-only
git merge origin/main
git rev-parse HEAD
git status --porcelain
```

Record `FINAL_SYNCED_MAIN_SHA`. Do not create a new branch, PR, or merge. Focus on:
- `scripts/run_reader_wallet_vip_unlock_e2e.py`
- `backend/src/modules/wallet/wallet.postgres.test.ts`
- report/evidence/screenshot files for this gate.
Only modify production code if an independently reproducible contract problem is exposed. No real payments, external banking, withdrawals, donations, Wallet UI redesign, Story Brain, or Wallet business-model changes.

### P0-A — Validation FAIL must never yield final PASS

Confirmed runner source (`run_reader_wallet_vip_unlock_e2e.py`, approx. lines 718–733 and 1330) appends `run_command(...)` results but never verifies every command PASS before later writing `evidence['verdict'] = 'READER_WALLET_VIP_UNLOCK_PASS'`.

Implement a single fail-closed validation gate which checks ALL command exit codes + status, then rejects before browser with machine-readable `FAILED_VALIDATION` (or a specific failed command). The final overall PASS must be computed from observed validation, checkpoints, sentinel verification, and confirmed teardown: never assigned unconditionally inside the browser block.

Prove **negative fault injection** without touching real databases: intentionally make one validation command return nonzero and show runner emits nonzero exit, correctly names failed command, persists failure evidence, and DOES NOT claim PASS. Then rerun normal passing sequence to restore actual acceptance.

### P0-B — test fixture teardown must not erase unrelated sentinels

Confirmed `backend/src/modules/wallet/wallet.postgres.test.ts`: sentinel_chapter_unlock is inserted using `[sUserId, vipChapterId, sTxId]` (approx. 238–251), BUT `after()` performs `DELETE FROM chapter_unlocks WHERE chapter_id = $1` on `trackedChapterIds` (approx. line 261). That erases the sentinel entitlement before its own exact-ID teardown. The test verifies sentinel in invariant 12 BEFORE teardown; it does not prove preservation throughout teardown.

Fix by tracking EACH run-owned chapter_unlock (user_id, chapter_id), deleting only those exact pairs. Avoid broad deletes by chapter_id and broad account/wallet-based deletion where precise entity IDs are feasible. Preserve cross-user sentinel on same chapter until an explicit post-cleanup assertion rereads its stable hash; only then may the sentinel harness itself delete exactly that sentinel. Set teardown errors to test FAIL rather than `catch { /* ignore cleanup errors */ }`. Use try/finally around suite-owned entities and close DB connections even on failure.

Where deleting a parent chapter requires deleting a sentinel entitlement first due to FK, use a dedicated **persistent fixture chapter NOT marked owned for the tested-chapter teardown**, or record and compare sentinel before/after product-cleanup, then explicitly remove the sentinel with harness ownership before dropping its parent. Document the order. Never claim that a destroyed sentinel survived cleanup.

### P1-A — provisioning and teardown must cover early failure

Runner currently creates PostgreSQL at lines ~495–508 and Mongo marker at ~510–512 OUTSIDE the execution `try/finally` beginning around line 532. If Mongo creation fails after PostgreSQL creation, owned PG DB can be orphaned.

Move the lifetime boundary to include all initial provisioning and execution, with external opt-in required before ANY mutation and affirmative ownership flags set only after success. Handle partial-creation failures safely; no pre-create DROP; never touch a pre-existing DB. Confirm PostgreSQL and MongoDB preflight/CRUD/cleanup refer to the same resolved server (do not rely solely on string prefix).

After cleanup: requery actual `pg_database` and Mongo listDatabases to prove exact run-owned DB names are absent. Capture `postgres_deleted_verified`, `mongo_deleted_verified`, cleanup errors, and safe server identity in evidence. Check `subprocess.run(...).returncode` and actual DB readback (don't print 'Dropped cleanly' just because shell launched). Any failure means overall verdict FAIL. Do not hide cleanup exceptions or execute broad cleanup.

### P1-B — complete Wallet-J browser isolation

Wallet-J currently only logs out, proves anonymous VIP access 402, and verifies guest free chapter 200. The distinct-reader scenario is currently tested only in backend invariant 11, not in real browser.

Using rendered login/logout, log in as a **second fixture READER who has never unlocked VIP**, navigate to the same VIP chapter and verify 402/no content leak; then explicitly log out and verify anonymous 402 + free 200. Correlate second reader's absence of entitlement and absence of debits. Screenshots/JSON must reflect the actually executed steps.

### P1-C — complete local regression manifest

Add isolated full backend `npm test` to recorded validation, with external opt-in and test DB URLs pointed to the verified same disposable DB. Ensure 12 wallet invariants and any other DB-mutating suite stay isolated. Fail closed if npm test cannot safely run. Separately keep web typecheck/build, backend typecheck/build, 11 guard tests, 12 wallet PostgreSQL tests, Wallet-A..J browser and sentinel stages.

Do not write 'full backend suite PASS' when only the focused 12 tests ran. Keep production `NODE_ENV=production` mock completion blocked; do not bypass this to make a demo pass. Do not claim auth/ledger controls are sufficient for real money.

### P1-D — keep truthful source and evidence lineage

After fixing code/runner, commit + push actual tested code first; record `FINAL_TESTED_CODE_SHA`. Rerun entire isolated validation/browser manifest on exactly that tree, including fault-injection FAIL check, teardown fault check and actual DB disappearance readbacks.

Reseal only real results in:
- `docs/development/READER-WALLET-VIP-UNLOCK-E2E-report.md`
- `docs/development/READER-WALLET-VIP-UNLOCK-E2E/reader-wallet-vip-unlock-e2e-evidence.json`
- 10 Wallet-A..J screenshots when the browser flow was genuinely rerun.

Evidence must include: `tested_main_sha`, `tested_code_sha`, `validation_records` with nonzero test injection captured separately, `negative_harness_tests`, `db_creation_ownership`, `db_cleanup_verification`, `sentinel_preservation` before/after *test teardown* and after browser, `checkpoints` including second-reader steps, and precise verdict. No passwords, JWT, cookies, raw credential-bearing URLs or unrelated user data. Do not convert hashes into hardcoded expected PASS fields.

### Stop & handoff

Require:
- Behind main = 0, clean local worktree and pushed code/evidence commit lineage.
- Both P0 issues fixed and negative failure tests truly executed.
- Early-provision failure cleans up owned resources safely.
- Teardown proves both DBs absent and no unrelated sentinels deleted.
- Wallet-J second-reader browser boundary + guest/free chapter PASS.
- Full local regression + 12 wallet invariants + 11 guard + Wallet-A..J PASS.
- `READER_WALLET_VIP_UNLOCK_PASS / LOCAL_PASS_CI_PENDING` ONLY if every requirement really passes.

Otherwise explicitly report `LOCAL_BLOCKED` with failing commands and preserve diagnostic evidence. Gemini STOPS after push; ChatGPT owns review, PR, P7/P8 CI, merge and the next Development History closure record. No new feature gate.

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

---

## 7. PARALLEL CODEX TASK — Wave 1H independent evidence audit (2026-10-22)

**Scope:** This is a task for Codex working **only** on `codex/ai-copilot-pipeline-test`. It does **not** supersede §5's Wallet/VIP task for Gemini on `astra/reader-wallet-vip-unlock-e2e`, and it does not replace `Pipeline_test/ACTIVE_GEMINI_TASK.md`'s Wave 1G FE-blocked S09 gate.

**Objective:** Independently audit the reported Wave 1H `OFFLINE_OUTBOUND_CONTEXT_VERIFIED=PASS` rather than treating executor-authored PASS as acceptance. Start by fetching current branch HEAD and checking clean status. Read:
- `Pipeline_test/P1_WAVE_1H_OUTBOUND_CONTEXT_DIAGNOSTIC_TASK.md`
- `Pipeline_test/reviews/2026-10-22-p1-wave-1h/CONTEXT_DELIVERY_AUDIT.md`
- `Pipeline_test/reviews/2026-10-22-p1-wave-1h/validation.json`, `outbound_prompt_evidence.json`, `context_comparison.json`, `ledger_summary.json`, `test_logs.txt`
- `Pipeline_test/tests/test_wave1h_story_brain_context_delivery.py`, `Pipeline_test/tools/verify_story_brain_context_delivery.py`, `Pipeline_test/tools/fake_provider_upstream.py`
- Wave 1G independent path review and `WORKFLOW_CONTRACT.md`.

### Required checks

1. Establish provenance: identify the exact 3 commits since Wave 1H task handoff `62f127d771f967e0f6f179025f36ed7a4b0c75aa`; inspect source/evidence diffs and distinguish real runtime captures from fixtures and synthetic assertions. Don't merely restate report prose.
2. Re-run focused 9-test suite on a clean checkout, recording exact tested SHA, command, exit code, skipped tests and dependencies. Audit whether HTTP capture uses actual `WritingService → LLMService → gateway → fake upstream` invocation, not a fabricated payload or a parallel reimplementation. Compare persisted `context_hash` with extracted outbound Story Brain JSON from capture and explain full-prompt hash distinction.
3. Check fixture independence, tenant isolation, temporal cutoff, locked-rule retention, superseded states, unapproved proposals, deterministic pruning, and semantic retrieval status. Examine negative/fault tests for **post-hash mutation, wrong/stale request, gateway transmission failure and mismatched hash**. Where coverage is missing, add narrow deterministic tests that genuinely FAIL for injected faults and PASS after restoring correct behavior; do not edit production code without a reproducible defect.
4. Validate gateway/ledger is fake-only: preserve no real egress, classify two simulated calls and synthetic USD accounting correctly; never treat simulated `charged_usd` as actual spend. Do not call Gemini/OpenAI/embedding APIs.
5. Make an independent verdict: `WAVE_1H_INDEPENDENT_ACCEPTED_OFFLINE`, `WAVE_1H_REVIEW_BLOCKED:<reason>`, or `WAVE_1H_REJECTED:<reason>`. Limit acceptance to outbound context provenance; semantic RAG and model quality remain NOT_ASSESSED/NOT_TESTED. S09 is still BLOCKED pending reviewed FE patch (issue #56 / PR #55); do not run S10/S11, cherry-pick or merge frontend changes, or claim P1 overall PASS.

### Handoff

Write sanitized, reproducible findings under `Pipeline_test/reviews/2026-10-22-p1-wave-1h/`, preferably `GPT6_INDEPENDENT_REVIEW_HANDOFF.md` plus focused audit/test evidence. Clearly separate executor evidence, independently re-run evidence and untested boundaries. Preserve historical ledgers, fixtures and all prior review reports. Commit/push only necessary review tests/docs to `codex/ai-copilot-pipeline-test` and report tested SHA, evidence SHA and any blockers. Stop there for GPT-6 final remote review; do not modify §5 Wallet/VIP task or the active Wave 1G pointer.
