# Active Project Handoff — Novel Sharing Platform AI

> This file is intentionally short. It contains only the current canonical state, architecture invariants, ownership rules, and the next executable gate.
>
> Historical implementation/review details belong in `docs/development/*report.md`, evidence JSON, PR history, and Git history. Do not append stale phase logs back into this file.

## 1. Canonical Status — 2026-10-11

The three backend authoring pipelines are CI-closed.

```text
AI-PIPE-01A  P1 Import -> Story Brain -> Assisted Writing     CI_PASS / MERGED
AI-PIPE-01B  P1 Current-UI Preflight Audit                    LOCAL_PASS_CI_PENDING (CURRENT_UI_PREFLIGHT_PASS)
AI-PIPE-01B  P1 Final Browser/UI System E2E (Refactored UI)   PENDING_FINAL_UI_REFACTOR

AI-PIPE-02A  Idea / World-Bible bootstrap                     CI_PASS / MERGED
AI-PIPE-02B  Durable outline / Story Plan                     CI_PASS / MERGED

AI-PIPE-03A  Full-auto bounded autonomous controller          CI_PASS / MERGED
```

Important merged milestones:

```text
PR #39  AI-PIPE-01A  merged
PR #40  AI-PIPE-02A  merged
PR #41  AI-PIPE-02B  merged
PR #42  AI-PIPE-03A  merged SHA a760600507ace97daeff2e951921235e8f74fa16
```

Accepted AI-PIPE-03A PR head:

```text
3228d85559a72a9650e0954b33ff47916fd6ccf9
```

Final PR checks:

```text
P8 Cutover and Migration       38150084372  PASS
P7 Semantic Memory Foundation  38150084376  PASS
Evaluation Pilot Harness       38150084364  PASS
Defense Demo Contract          38150084378  PASS
```

Canonical main handoff commit after P3 closure:

```text
610fad8cfef3bc4cac80e7cf5ad17cde24c01cdc
```

Post-handoff Evaluation:

```text
38150430186  PASS
```

Do not reopen P1/P2/P3 backend architecture unless a concrete regression or newly approved scope appears.

---

## 2. Canonical Architecture

All project entry paths converge on the same Story Brain + Writing Loop.

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
        +--> validate
        +--> author/auto decision
        +--> acceptDraft
        +--> immutable revision
        +--> transactional outbox
        +--> incremental analysis
        +--> Story Brain update
        +--> next context sees new state


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

Planning state may contain intended future beats. It must not be treated as already-happened historical fact.

Do not create:
- a second writer;
- a second Story Brain;
- a P3-only narrative memory;
- ad-hoc JSON persistence for production planning/controller state.

---

## 3. Fixed Technical Policies

Production/default context routing remains:

```text
CONTEXT_ROUTING_POLICY=legacy-v1
```

Do not globally enable `balanced-scope-v1` without a separate accepted architecture change.

Embedding remains:

```text
gemini-embedding-2
768 dimensions
normalized
```

Demo/default generation model:

```text
gemini-3.5-flash-lite
```

Manual alternative when explicitly needed:

```text
gemini-3.1-flash-lite
```

Do not automatically fall back to Gemini 3.8. Flash-Lite is used primarily for quota/demo feasibility, not because it is assumed to have the best literary quality.

Primary acceptance/system gates should prefer fake/deterministic LLM unless a real-provider seam is explicitly being tested.

P8-05 destructive cleanup remains blocked pending stability.

---

## 4. Collaboration Ownership

### Gemini / Antigravity — LOCAL OWNER

Gemini handles:
- inspect/modify code locally;
- Docker / Docker Compose;
- PostgreSQL / pgvector;
- local unit/integration/system tests;
- browser automation when available locally;
- deterministic/fake LLM;
- bounded real-provider calls only when explicitly required;
- implementation defects;
- local evidence/report updates;
- commit/push working branch.

Gemini completion boundary:

```text
LOCAL_PASS_CI_PENDING
```

Gemini must not claim GitHub Actions PASS, PR checks PASS, mergeability, merged state, or remote cleanup without direct GitHub evidence.

### ChatGPT — GITHUB / REMOTE ACCEPTANCE OWNER

ChatGPT handles:
- inspect remote branch/head/diff;
- review implementation and evidence lineage;
- create/update PR;
- inspect GitHub Actions jobs/logs;
- distinguish LOCAL_PASS from CI_PASS;
- fix GitHub-only workflow/wiring issues when appropriate;
- merge only after required remote checks are green;
- update canonical report / this handoff on main.

Status vocabulary:

```text
LOCAL_PASS
LOCAL_PASS_CI_PENDING
CI_PASS
MERGED
NOT_EXECUTED
BLOCKED
PENDING_UI_REFACTOR
PARTIAL
MOCK_ONLY
```

Never collapse local PASS into CI PASS.

---

# 5. ACTIVE TASK — AI-PIPE-01B CURRENT-UI PREFLIGHT

The UI is not final, but current mockup/implementation already exists.

Do not wait for the final refactor before testing.

The current task is a **preflight browser/system audit of the existing UI** so backend/UI contract drift is discovered before the final refactor.

This is NOT final AI-PIPE-01B acceptance.

Recommended working branch:

```text
astra/ai-pipe-01b-current-ui-preflight
```

If the branch does not exist, create it from current `main`.

## 5.1 Objective

Test the current UI against the backend pipelines already closed above.

Target correlation:

```text
browser action
 -> frontend route/component
 -> Node API
 -> AI service
 -> PostgreSQL
 -> Story Brain / Story Plan state
 -> generation
 -> reject/edit/accept
 -> persisted revision
 -> incremental memory update
 -> next browser/generation observes updated state
```

The purpose is to lock the real UI/backend contract before refactor.

Do not redesign or refactor the UI as part of this gate.

---

## 5.2 Trace First

Before running browser tests, inspect:

1. current frontend implementation;
2. current mockup-only surfaces;
3. routing/navigation;
4. auth/session implementation;
5. Author IDE route;
6. import flow;
7. Story Brain review/activation UI;
8. generation preview/reject/edit/accept UI;
9. existing Playwright/Cypress/browser E2E tooling;
10. any frontend state still mocked locally instead of loaded from backend.

Classify every relevant UI step as exactly one of:

```text
REAL_BACKEND_BOUND
MOCK_ONLY
PARTIAL
BROKEN_CONTRACT
NOT_IMPLEMENTED
```

Do not treat a Figma/Stitch/static mock screen as implemented browser functionality.

---

## 5.3 Required Current-UI Browser Flow

Use a disposable novel fixture.

Attempt this flow through the current UI:

```text
Login as AUTHOR
 -> import manuscript
 -> observe extraction/bootstrap
 -> resolve review state where exposed
 -> confirm Story Brain active
 -> open Author IDE / chapter
 -> request AI generation
 -> inspect returned draft
 -> reject one generation
 -> prove canonical revision did NOT change
 -> generate again
 -> edit if supported
 -> accept generation
 -> prove immutable revision persisted
 -> refresh/reopen chapter
 -> prove accepted content persists
 -> allow/process incremental analysis
 -> prove Story Brain version advances
 -> request next context/generation
 -> prove updated Story Brain/context is observed
```

If one UI step is absent but its backend path exists:

```text
UI_GAP / BACKEND_REUSABLE
```

Do not bypass that missing UI step through an API and then call the browser checkpoint PASS.

---

## 5.4 Browser ↔ Backend Correlation

For the same browser flow, record sanitized identifiers:

```text
tenant / user role
novel_id
chapter_id
generation_id
accepted_revision_id
Story Brain version before
Story Brain version after
Story Plan / objective ID when relevant
```

Browser evidence and database/backend evidence must refer to the same generation/revision lineage.

Do not record:
- API keys;
- JWTs;
- passwords;
- fixture secrets;
- full private manuscript text;
- full generated drafts.

Prefer IDs, hashes, counts, statuses and short safe snippets.

---

## 5.5 Mandatory Negative Cases

### A. Reject generation

Prove:

```text
reject
 -> no accepted canonical revision
 -> chapter latest revision unchanged
 -> Story Brain canon unchanged
```

### B. Refresh after accept

Prove:

```text
accept
 -> persisted revision
 -> refresh/reopen
 -> same accepted content/revision remains visible
```

### C. Browser/API error

The UI must not display success when the backend request fails.

### D. Authorization

A non-owner must not be able to mutate another author's novel.

### E. Mock-state detection

If the UI shows data not sourced from backend state, mark that surface:

```text
MOCK_ONLY
```

Do not silently count it as system evidence.

---

## 5.6 UI Contract Audit

Specifically check for drift introduced by the now-closed P1/P2/P3 backend work:

- API route prefixes;
- auth/session propagation;
- generation request/response shape;
- generation status enum values;
- Story Brain/context preview response shape;
- revision acceptance payload;
- revision persistence/readback;
- Story Plan/current objective schema if exposed;
- autonomous run schema if exposed;
- loading/error/success states;
- stale frontend assumptions about old endpoints;
- browser/mobile boundary through the Node gateway.

Classify every mismatch as one of:

```text
UI_DEFECT
API_CONTRACT_DRIFT
BACKEND_REGRESSION
TEST_ENVIRONMENT_ISSUE
MOCK_ONLY_LIMITATION
```

Do not change backend production contracts merely to fit stale mock UI without first proving the backend is wrong.

---

## 5.7 Implementation Rule

Default behavior for this gate:

```text
INSPECT + TEST + REPORT
```

Do not start a UI refactor.

Small test-harness changes are allowed when required to run browser automation.

If a real defect blocks the preflight:
1. classify it;
2. implement the smallest scoped repair;
3. add a regression test;
4. rerun affected browser/system checkpoints;
5. record exact code SHA and evidence lineage.

Do not make unrelated product changes.

---

## 5.8 Evidence

Create:

```text
docs/development/AI-PIPE-01B-CURRENT-UI-PREFLIGHT-report.md
docs/development/AI-PIPE-01B-CURRENT-UI-PREFLIGHT/
```

The report should contain a matrix:

```text
Browser checkpoint
UI implementation
Backend/API reached
DB/state evidence
Status
Notes
```

Allowed checkpoint statuses:

```text
PASS
FAIL
PARTIAL
MOCK_ONLY
NOT_IMPLEMENTED
BLOCKED
```

Record:
- exact branch;
- exact clean CODE_SHA if code changes are required;
- browser tooling/version;
- Compose profile;
- database backend;
- provider used;
- routing policy;
- exact commands;
- sanitized correlation IDs;
- screenshots only when useful and free of secrets;
- PASS/FAIL/PARTIAL per checkpoint.

If no production code changes are required, evidence may reference the tested main/branch SHA rather than inventing a code commit.

---

## 5.9 Preflight Verdict

The current-UI preflight may end only with one of:

```text
CURRENT_UI_PREFLIGHT_PASS
CURRENT_UI_PREFLIGHT_PARTIAL
CURRENT_UI_PREFLIGHT_FAIL
```

Even if every current-UI checkpoint passes, final status remains:

```text
AI-PIPE-01B FINAL BROWSER ACCEPTANCE = PENDING_UI_REFACTOR
```

because final acceptance must be rerun on the refactored UI.

A strong current-UI result means the refactor team has a proven browser/API contract to preserve.

---

## 5.10 Gemini / Codex Use

Preferred order:

```text
Gemini / Antigravity
 -> local Docker + browser preflight + implementation fixes if necessary
 -> produce evidence/report
 -> push LOCAL_PASS_CI_PENDING when code changes exist

Codex
 -> optional independent browser/UI audit against the same scenario
 -> focus on contract drift, missing UI surfaces and independent reproduction
```

Do not have both agents independently redesign the same UI.

If Codex/Gemini cannot operate a real browser in the current environment, they must say so and downgrade the affected checkpoints rather than simulating browser evidence.

---

## 5.11 Executed Preflight Record (2026-10-11)

- **Status:** `LOCAL_PASS_CI_PENDING`
- **Verdict:** `CURRENT_UI_PREFLIGHT_PASS`
- **Branch:** `astra/ai-pipe-01b-current-ui-preflight`
- **Report:** `docs/development/AI-PIPE-01B-CURRENT-UI-PREFLIGHT-report.md`
- **Evidence Directory:** `docs/development/AI-PIPE-01B-CURRENT-UI-PREFLIGHT/`
- **Base Code SHA:** `d5c1865c363914b433ce2a1012f277ca9f074a3f`
- **Audit Commit SHA:** `68552f13ef48bbf4d697fdced6c27bed69320a0f`
- **Browser Tooling:** Chrome Headless / Antigravity Browser Subagent (1600x1000 Desktop Viewport)
- **Sanitized Correlation Lineage:**
  - `tenant / role`: Author (`reader03`)
  - `novel_id`: `01c4c899-d0c3-472f-9acb-e4f85f90f2fa`
  - `chapter_id`: `a242fdb7-ffc8-4727-b50a-4da207c40685`
  - `generation_id`: `da9b30e4-bce1-5fdc-a408-cff90f70f529`
  - `accepted_revision_id`: `41cb873e-9814-4d86-929f-93fa0c37a38a`
  - `source_type`: `AI_DRAFT_ACCEPT`
  - `outbox_event_id`: `086aa719-21a2-4c09-b8a2-abab5654b8e2` (`INCREMENTAL_ANALYSIS`)
  - `story_brain_id`: `5cf599fa-bbfa-4929-9e8c-32f22b8ea3fa` (Status: `active`)
- **Negative Cases:**
  - Negative Case A (Discard Draft): `PASS` (Editor content untouched, 0 new revisions created)
  - Negative Case D (Multi-tenant Authorization Guard): `PASS` (HTTP 403 `AUTH_008` for non-owner `reader04`)
- **UI Contract Finding:** `@media (max-width: 1180px)` hides `.assistant-panel`. Desktop viewport (>1180px) displays full 4-column IDE. Refactor team should implement responsive drawer/toggle.
- **Milestone Late Gate:** `AI-PIPE-01B FINAL BROWSER ACCEPTANCE = PENDING_UI_REFACTOR`

---

# 6. FINAL LATE GATE — AI-PIPE-01B REFACTORED-UI ACCEPTANCE

When the team declares the refactored UI ready, rerun the proven browser scenario on the final UI.

Required final flow:

```text
AUTHOR login
 -> import manuscript
 -> extraction/review
 -> Story Brain active
 -> Author IDE
 -> generate
 -> reject/edit and prove canon unchanged
 -> generate again
 -> accept
 -> refresh/reopen and prove persistence
 -> Story Brain update
 -> next generation observes updated state
```

Final P1 rule:

```text
AI-PIPE-01 structural/backend loop PASS
+ AI-PIPE-01A production persistence PASS
+ AI-PIPE-01B final browser E2E PASS
= P1_OVERALL_SYSTEM_PASS
```

Until then:

```text
P1 backend/system      PASS
P2 backend/system      PASS
P3 backend/system      PASS
P1 final browser E2E   PENDING_UI_REFACTOR
```

---

## 7. Reporting Discipline

Always separate:

```text
structural/system correctness
real-provider availability
narrative/literary quality
UI completeness
```

Do not infer one from another.

Do not claim browser PASS from API-only evidence.

Do not claim CI PASS from local tests.

Do not claim final UI acceptance from the current pre-refactor UI.

Do not append old phase transcripts back into this file.
