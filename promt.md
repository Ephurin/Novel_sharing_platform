# Active Project Handoff — Novel Sharing Platform AI

## ACTIVE EXECUTION DIRECTIVE — AI-PIPE-01B FINAL LOCAL CLOSURE (2026-10-14)

This directive supersedes all earlier AI-PIPE-01B execution/review directives for Gemini.

### Remote state reviewed by ChatGPT

```text
main:
94c12df380f132580b2d2ea22667aad5154e9aa6

working branch:
astra/ai-pipe-01b-main-e2e-repair

last reviewed repair commit:
b0ceea3b9c17fb90f762f9b96c7877dddb7f4a02

PR:
DO NOT OPEN YET
```

The following work is already accepted and must NOT be redesigned:

```text
AuthorWritingIde -> canonical P1 generation path     ACCEPTED
AI reject leaves canon unchanged                     ACCEPTED
AI accept -> AI_DRAFT_ACCEPT revision                ACCEPTED
INCREMENTAL_ANALYSIS outbox creation                 ACCEPTED
real CDP browser harness                             ACCEPTED
Story Brain advancement demonstrated 12 -> 13        ACCEPTED
```

Your task is to close only the remaining acceptance blockers.

---

### 1. Sync current main into the existing repair branch

Continue on:

```text
astra/ai-pipe-01b-main-e2e-repair
```

First:

```bash
git fetch origin
git checkout astra/ai-pipe-01b-main-e2e-repair
git rev-parse HEAD
git merge origin/main
```

Record:

```text
STARTING_REPAIR_SHA=<actual pre-merge branch head>
CURRENT_MAIN_SHA=94c12df380f132580b2d2ea22667aad5154e9aa6
```

If the branch has advanced beyond the last reviewed commit, preserve that work and inspect it before editing.

Do not reset the branch.
Do not open a PR.
Do not merge to main.

---

### 2. BLOCKER P0 — outbox proposal materialization must fail closed

Current reviewed implementation in:

```text
backend/src/jobs/outbox-processor.ts
```

swallows proposal-group materialization failures with warnings. That can allow an `INCREMENTAL_ANALYSIS` event to become `COMPLETED` although Story Brain canonical mutation did not finish.

Required production invariant:

```text
accepted revision
 -> outbox event
 -> incremental analysis
 -> proposals scoped to this exact revision
 -> all required proposal groups materialize successfully
 -> Story Brain advances or explicit legitimate no-op is classified
 -> ONLY THEN event may become COMPLETED
```

If a required materialization step fails:

```text
handleOutboxEvent throws/fails
 -> event is NOT COMPLETED
 -> existing mark-failed / retry semantics apply
```

Do not swallow the failure.

Keep selection strictly scoped to:

```text
proposal.evidence contains revision_id == event.revisionId
```

Never auto-accept unrelated pending proposals.

Required focused tests:

```text
A. analysis success + relevant materialization success
   -> event COMPLETED
   -> expected Story Brain mutation occurs

B. proposal-group accept transient failure
   -> event NOT COMPLETED
   -> retryable failure state

C. retry after partial attempt
   -> no duplicate canonical Story Brain mutation
   -> eventually COMPLETED exactly once

D. unrelated pending proposal groups
   -> untouched

E. legitimate no relevant proposals
   -> explicit no-op classification
   -> no false claim that Story Brain advanced
```

Preserve claim-token, concurrency, and idempotency behavior already present in the outbox worker.

---

### 3. BLOCKER P0 — Browser-F must mutate Story Bible through rendered UI

The previous runner used `httpx.post(...)` to create Story Bible data and then only verified browser readback. That is not browser mutation evidence.

For every currently implemented create/edit surface among:

```text
Character
Relationship
Timeline Event
Plot Summary
```

perform the mutation using real DOM controls:

```text
browser navigate
 -> click add/create
 -> fill rendered form
 -> submit rendered control
 -> observe visible success/readback
 -> refresh/reopen
 -> verify persistence in browser
 -> open IDE Story Bible panel
 -> verify same data there
```

After browser-originated mutation, prove at least one changed Story Bible fact is visible to the AI/context consumer.

API/DB calls are allowed only for correlation after the browser action.

If a surface has no actual create/edit UI:

```text
NOT_IMPLEMENTED
```

Do not create it by API and report browser PASS.

---

### 4. BLOCKER P0 — Browser-G must save Novel Data through rendered UI

Execute the actual Novel Data form:

```text
open Novel Data
 -> edit one supported metadata field
 -> trigger actual Save
 -> wait for UI success
 -> refresh/reopen
 -> visible readback matches
 -> IDE/header/breadcrumb reflects the new value where applicable
```

The non-owner 403 check is useful but must remain labeled:

```text
API_SECURITY
```

It does not replace browser mutation evidence.

---

### 5. BLOCKER P0 — Browser-H chapter lifecycle must originate from UI

Do not create/publish the acceptance chapter with `httpx`.

Use rendered IDE controls:

```text
click New Chapter
 -> enter title/content
 -> wait autosave
 -> switch to another chapter/view
 -> return
 -> content persists
```

If current UI exposes VIP/price/publish controls, execute those through the browser too:

```text
toggle VIP
 -> set price
 -> click Publish/Submit
 -> verify rendered status/readback
```

Only after these actions may API/DB be used to correlate the resulting chapter state.

If a control is genuinely absent, mark it `NOT_IMPLEMENTED`; do not fake browser coverage with API setup.

---

### 6. BLOCKER P0 — second feedback observation must originate from browser

The accepted first loop is:

```text
browser generation #1
 -> browser accept
 -> AI_DRAFT_ACCEPT
 -> outbox
 -> Story Brain N -> N+1
```

The second observation must NOT be a direct `httpx` call pretending to be browser evidence.

Preferred decisive proof:

```text
Browser generation #2
 -> actual browser-originated POST /ai/writing/generations
 -> request/context carries expected_brain_version == N+1
 -> resulting context/generation observes Story Brain N+1
```

Alternative only if generation #2 is not suitable:

```text
browser UI action triggers context preview/refetch
 -> capture browser-originated network request
 -> response observes brain_version == N+1
```

Record:

```text
second_browser_request_id
second_generation_id if present
expected_brain_version
observed_brain_version
```

Capture distinct browser/network evidence for this second observation.

---

### 7. Evidence lineage must match the exact tested code

Regenerate final evidence only after all repairs are committed and the working tree is clean.

Required lineage:

```text
tested_main_sha
repair_code_sha
evidence_commit_sha
branch
novel_id
chapter_id
base_revision_id
rejected_generation_id
accepted_generation_id
accepted_revision_id
outbox_event_id
brain_version_before
brain_version_after
second_browser_generation_or_context_id
expected_brain_version
observed_brain_version
```

Rules:

```text
repair_code_sha = exact clean code/test commit that was executed
evidence_commit_sha = evidence/report child commit where practical
```

Do not reuse old SHA claims from 581f1a0/e4fba44/b0ceea3 after the final implementation changes unless that exact SHA was actually rerun.

Classify evidence explicitly as:

```text
BROWSER
BROWSER_NETWORK
API_SYSTEM
DATABASE
CONTRACT_TEST
```

Do not store secrets, passwords, JWTs, API keys, or private manuscript text.

---

### 8. Mandatory rerun on one final clean CODE_SHA

Run at minimum:

```text
focused outbox-processor tests
AI-PIPE-01B contract/regression tests
strict API/system runner
real CDP/browser E2E
relevant backend unit tests
relevant frontend tests/typecheck/build
```

All decisive tests must refer to the same final product/test CODE_SHA.

Do not:
- use direct incremental-analysis fallback to upgrade a failing closed loop;
- weaken `brain_version_after > brain_version_before`;
- bypass F/G/H browser mutations with API calls;
- mark a screenshot as proof of a network/state transition by itself.

---

### 9. Final local verdict and stop boundary

`MAIN_UI_E2E_PASS` is allowed only if all are true:

```text
canonical IDE P1 path PASS
browser manual autosave PASS
browser AI reject PASS
browser AI accept PASS
AI_DRAFT_ACCEPT lineage PASS
outbox fail-closed behavior PASS
outbox retry/idempotency PASS
Story Brain N -> N+1 PASS
second browser-originated request observes N+1 PASS
Story Bible UI mutation/readback PASS for implemented surfaces
Novel Data UI save/readback PASS
chapter lifecycle through UI PASS for exposed controls
evidence SHA lineage exact and internally consistent
```

If an important UI surface is genuinely not implemented, use:

```text
MAIN_UI_E2E_PARTIAL
```

If a required implemented surface fails:

```text
MAIN_UI_E2E_FAIL
```

When local work is complete:

```text
commit implementation/tests
run final clean evidence
commit report/evidence
push astra/ai-pipe-01b-main-e2e-repair
STOP at LOCAL_PASS_CI_PENDING
```

Gemini must not create the PR, merge, or claim GitHub Actions PASS.

ChatGPT owns:
- remote diff review;
- PR creation;
- GitHub Actions review;
- merge decision;
- main closure.

Do not touch the separate Manuscript Import work (`fe8429c77016fc58d7a8e3293cbc89030144aebc`) in this task.

---

## ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B FINAL REPAIR BEFORE PR (2026-10-14)

This directive supersedes the previous AI-PIPE-01B review directive.

### Remote state observed by ChatGPT

```text
main:
60ab526716f9a730785703c15aa63dac948b7866

repair branch:
astra/ai-pipe-01b-main-e2e-repair

repair branch head:
b0ceea3b9c17fb90f762f9b96c7877dddb7f4a02

PR:
NOT OPENED
```

Accepted progress:

```text
AuthorWritingIde canonical P1 reconnect      PASS
real browser login/editor/AI reject/accept  PASS
AI_DRAFT_ACCEPT persistence                 PASS
outbox creation                             PASS
Story Brain advancement                     PASS (12 -> 13)
context API observes advanced version        PASS
```

Do not redesign these working parts.

Current status remains:

```text
LOCAL_PASS_WITH_REVIEW_BLOCKERS
```

because the latest commit introduced a production semantic change in the outbox processor and some checkpoints are still API-assisted rather than true browser actions.

---

## 1. Keep the repair branch and sync current main

Continue on:

```text
astra/ai-pipe-01b-main-e2e-repair
```

First fetch current main and incorporate the latest handoff/review commit without discarding existing repair work.

Record:

```text
STARTING_REPAIR_SHA=b0ceea3b9c17fb90f762f9b96c7877dddb7f4a02
CURRENT_MAIN_SHA=<actual origin/main>
```

Do not open a PR yet.

---

## 2. BLOCKER — outbox auto-materialization must fail closed

The latest repair added proposal auto-materialization to:

```text
backend/src/jobs/outbox-processor.ts
```

The intended production sequence is valid:

```text
accepted revision
 -> INCREMENTAL_ANALYSIS outbox
 -> revision analysis
 -> proposals scoped to that accepted revision
 -> proposal groups materialized
 -> Story Brain advances
 -> event COMPLETED
```

But the current implementation catches materialization failures, logs warnings, and may still allow the outbox event to be marked COMPLETED.

That is not acceptable for the closed-loop contract.

### Required behavior

If any required proposal group for the accepted revision fails to materialize:

```text
handleOutboxEvent must fail
 -> event must NOT be marked COMPLETED
 -> markOutboxEventFailed / retry semantics apply
```

Do not swallow failures that prevent Story Brain advancement.

Keep proposal selection scoped to the exact accepted revision:

```text
proposal.evidence contains revision_id == event.revisionId
```

Unrelated pending proposals must remain untouched.

### Required outbox tests

Add focused tests proving:

```text
1. analysis success + scoped materialization success
   -> event COMPLETED
   -> Brain advances

2. proposal-group accept transient failure
   -> event NOT COMPLETED
   -> retryable failure state

3. retry after partial/failed attempt
   -> no duplicate canonical Story Brain mutation
   -> eventually COMPLETED exactly once

4. unrelated pending proposal groups
   -> not auto-accepted

5. no relevant proposals / legitimate no-op analysis
   -> classify explicitly
   -> do not falsely claim Brain advancement
```

Preserve existing claim-token/idempotency behavior.

Do not convert the outbox into a broad 'accept every pending proposal' worker.

---

## 3. Browser evidence — finish the checkpoints that are still API-assisted

The current CDP runner is accepted as a real browser harness for login/editor/AI reject/AI accept.

However, current Browser-F/G/H claims are stronger than the executed actions.

### Browser-F — Story Bible mutation must happen through rendered UI

Current evidence creates Character/Timeline/Plot Summary with httpx, then only verifies browser readback.

Replace the mutation portion with real DOM interactions:

```text
Story Bible UI
 -> click add/create
 -> fill form fields
 -> submit through rendered controls
 -> visible success/readback
 -> refresh
 -> data still visible
 -> open IDE Story Bible panel
 -> same data visible
```

Execute at least every implemented surface among:

```text
Character
Relationship
Timeline Event
Plot Summary
```

If a surface has no create/edit UI, mark it NOT_IMPLEMENTED instead of creating it through API and calling browser PASS.

After the UI mutation, prove at least one changed fact reaches the context consumer.

### Browser-G — Novel metadata save must happen through UI

Through the rendered Novel Data form:

```text
change a supported field
 -> click Save / trigger actual UI save
 -> wait success
 -> refresh
 -> visible readback matches
 -> IDE header/breadcrumb reflects the change where applicable
```

The non-owner 403 API check may remain supporting security evidence, but label it API_SECURITY, not browser mutation evidence.

### Browser-H — chapter lifecycle must happen through UI

Current evidence creates/publishes via httpx and only opens the result in browser.

Execute through IDE controls:

```text
click New Chapter
 -> edit content/title
 -> wait autosave
 -> switch away
 -> return
 -> content preserved
```

If the UI exposes VIP/price/publish controls, also execute:

```text
toggle VIP
 -> set price
 -> click Publish/Submit
 -> verify rendered status/readback
```

Only backend correlation may use API/DB after the browser action.

---

## 4. Browser feedback loop — second observation must also originate from browser

The current run proves:

```text
browser accept
 -> real outbox
 -> Story Brain 12 -> 13
 -> direct API context preview observes 13
```

This is strong backend evidence, but final browser acceptance requires the second observation to be initiated by the rendered application.

After Brain advances:

```text
browser opens/refetches context preview or triggers another generation
 -> capture browser-originated network request
 -> response observes brain_version == advanced version
```

Preferred decisive continuation:

```text
Browser generation #2
 -> POST /ai/writing/generations
 -> expected_brain_version == brain_version_after
 -> generation/context uses advanced Story Brain state
```

Record:

```text
second_browser_request_id
second_generation_id if generated
expected_brain_version
observed_brain_version
```

Do not reuse the AI-accept screenshot as feedback-context evidence. Capture a distinct browser state/trace for the second observation.

---

## 5. Evidence lineage must pin the actual tested code

The current evidence still records older SHAs:

```text
repaired_code_sha = 581f1a0...
evidence_commit_sha = e4fba44...
```

but the browser/outbox behavior being claimed depends on:

```text
b0ceea3b9c17fb90f762f9b96c7877dddb7f4a02
```

After this final repair, regenerate evidence from a clean working tree and pin:

```text
tested_main_sha
repair_code_sha = exact clean product/test CODE_SHA used for execution
evidence_commit_sha = child commit containing only report/evidence artifacts where practical
branch
```

Do not claim evidence for a SHA that did not contain the tested implementation.

Keep a single correlated browser lineage:

```text
novel_id
chapter_id
base_revision_id
rejected_generation_id
accepted_generation_id
accepted_revision_id
outbox_event_id
brain_version_before
brain_version_after
second_browser_generation_or_context_id
observed_brain_version
```

Evidence types must be explicit:

```text
BROWSER
BROWSER_NETWORK
API_SYSTEM
DATABASE
CONTRACT_TEST
```

---

## 6. Rerun requirements

After repairs, rerun at minimum:

```text
focused outbox processor tests
AI-PIPE-01B contract/regression tests
strict API/system runner
real CDP/browser E2E
frontend/backend relevant unit tests
```

All must run against the same final clean CODE_SHA.

Do not use direct analysis fallback.

Do not weaken Brain N -> N+1 assertions.

Do not bypass browser mutations for F/G/H.

---

## 7. Final verdict rules

`MAIN_UI_E2E_PASS` is allowed only when all are true:

```text
canonical IDE P1 path PASS
browser AI reject PASS
browser AI accept PASS
AI_DRAFT_ACCEPT lineage PASS
outbox materialization fail-closed PASS
outbox retry/idempotency PASS
Story Brain N -> N+1 PASS
second browser-originated context/generation sees N+1 PASS
Story Bible UI mutation + browser readback PASS for implemented surfaces
Novel Data UI save/readback PASS
chapter lifecycle through UI PASS for exposed controls
evidence SHA lineage exact and internally consistent
```

If a UI surface is genuinely not implemented, mark NOT_IMPLEMENTED and use `MAIN_UI_E2E_PARTIAL` unless that surface is non-mandatory for P1 final acceptance.

Completion boundary after clean local rerun:

```text
LOCAL_PASS_CI_PENDING
```

Gemini stops after committing/pushing the repaired branch and updated evidence.

ChatGPT owns PR creation, remote CI review, merge, and main closure.

Do not work on unmerged Manuscript Import commit fe8429c77016fc58d7a8e3293cbc89030144aebc in this task.

---

## ACTIVE REVIEW DIRECTIVE — AI-PIPE-01B EVIDENCE REPAIR + REAL BROWSER E2E (2026-10-14)

This directive supersedes the previous AI-PIPE-01B main-E2E execution directive.

### Current remote state

```text
main:
356d3d48fa7f64453c72f5b8866763e186a698e8

repair branch:
astra/ai-pipe-01b-main-e2e-repair

repair branch head:
e4fba4404e9e19da7d88f535f74da1b1da6ee163

product repair commit:
581f1a0aecebe2a0fca3044ca087bcb037981615

PR:
NOT OPENED
```

The repair direction is accepted:

```text
new Author Writing IDE
 -> canonical startWritingGeneration
 -> poll getJobStatus
 -> acceptDraftRevision
 -> immutable AI_DRAFT_ACCEPT revision
 -> transactional outbox
 -> Story Brain feedback
```

Do not redesign this architecture.

### Review blockers that must be repaired before PR

The current report/evidence claims:

```text
MAIN_UI_E2E_PASS
```

but the evidence does not yet support that verdict.

#### BLOCKER 1 — Story Brain advancement is overclaimed

Current evidence contains:

```text
brain_version_before = 1
brain_version_after  = 1
observed_in_preview  = 1
status               = PASS
```

This is not advancement.

```text
1 -> 1 != advanced
```

The current runner also contains a fallback that directly invokes the incremental analysis endpoint when background processing does not advance the brain.

That fallback cannot be used to claim the full production closed loop:

```text
accept-draft
 -> transactional outbox
 -> outbox processor
 -> incremental analysis
 -> Story Brain advances
```

The outbox path itself must produce the accepted state transition.

#### BLOCKER 2 — current "E2E" runner is API/system testing, not browser E2E

`scripts/run_ai_pipe_01b_main_e2e.py` uses HTTP calls and direct PostgreSQL inspection.

That is useful system evidence, but it does not prove:

```text
browser click
 -> React handler
 -> network request
 -> backend
 -> DB/state
 -> browser readback
```

The final AI-PIPE-01B gate requires real browser execution.

---

# Gemini task

Continue on the existing repair branch.

```text
git checkout astra/ai-pipe-01b-main-e2e-repair
git pull
git rev-parse HEAD
```

Record the exact starting branch head.

Do not open a PR.

Do not merge.

Do not claim GitHub CI PASS.

---

## 1. Repair B4 to fail closed

Update the E2E runner/evidence logic so B4 can PASS only when all of the following are true:

```text
outbox final status = COMPLETED
brain_version_after > brain_version_before
context_preview.brain_version == brain_version_after
```

Preferred strict assertion:

```text
brain_version_after > brain_version_before
```

and:

```text
observed_in_preview == brain_version_after
```

Remove the direct-analysis fallback from the acceptance path, or explicitly classify it as diagnostic-only evidence that cannot upgrade B4 to PASS.

If the production outbox completes but Story Brain remains unchanged:

```text
E2E-B4 = FAIL
overall verdict != MAIN_UI_E2E_PASS
```

Use a deterministic disposable fixture that is guaranteed to produce an incremental Story Brain change.

Prefer the fake/deterministic LLM seam for this acceptance gate unless a real-provider call is specifically needed.

Do not depend on literary randomness to make brain_version advance.

---

## 2. Prove the actual outbox path

For one accepted browser generation, correlate:

```text
generation_id
accepted_revision_id
outbox_event_id
outbox status transition
brain_version_before
brain_version_after
context preview brain_version
```

Required production sequence:

```text
browser Accept
 -> POST /chapters/:id/revisions/accept-draft
 -> revision_outbox_events row created
 -> outbox processor dispatches
 -> /revisions/:revision_id/analyses
 -> incremental proposals/state materialized
 -> Story Brain version advances
 -> later context preview observes new version
```

No manual call to the analysis endpoint may stand in for the outbox processor in the PASS lineage.

---

## 3. Run REAL browser E2E

Use an actual browser automation path available in the local environment:
- Antigravity Browser Subagent;
- Playwright;
- Chrome automation;
- equivalent real browser driver.

If no real browser is available, explicitly return:

```text
BROWSER_E2E_BLOCKED
```

Do not replace it with direct API calls and call it browser PASS.

Fixture creation/setup may use API/DB helpers if necessary, but fixture setup is not browser evidence.

The checkpoints below themselves must be executed through visible UI actions.

### Browser A — Authentication and navigation

```text
/login
 -> login as AUTHOR
 -> /author
 -> open novel
 -> Novel Data
 -> Story Bible
 -> Writing IDE
```

Verify:
- real rendered screens;
- no route crash;
- auth/session survives navigation;
- refresh/reopen works;
- correct novel/chapter selected.

Capture browser screenshots or equivalent trace artifacts.

### Browser B — Manual editor/autosave

Through the actual textarea/editor:

```text
edit content
 -> observe saving state
 -> wait for saved state
 -> refresh/reopen
 -> same content visible
```

Correlate with backend state.

Ensure no AI_DRAFT_ACCEPT revision or incremental outbox is created from manual autosave.

### Browser C — AI reject

Through the new AI drawer:

```text
enter instruction
 -> click generate
 -> wait for candidate
 -> click reject/dismiss
```

Verify:

```text
no accept-draft call
latest_revision_id unchanged
no revision with source_generation_id for rejected generation
Story Brain version unchanged
```

### Browser D — AI accept [DECISIVE]

Through the actual UI:

```text
enter instruction
 -> generate
 -> wait until completed
 -> click Accept / Insert accepted draft action
```

Capture network correlation proving:

```text
POST /ai/writing/generations
GET /ai/jobs/:jobId
POST /chapters/:chapterId/revisions/accept-draft
```

Then DB correlation:

```text
AI_DRAFT_ACCEPT revision exists
source_generation_id == browser generation_id
latest_revision_id == accepted_revision_id
INCREMENTAL_ANALYSIS outbox exists
```

### Browser E — feedback loop

After browser acceptance:

```text
wait for outbox processor
 -> prove brain N -> N+1
 -> open/refetch context through the browser
 -> prove browser-visible/context response observes N+1
```

Then trigger a second browser generation/context request and prove it uses the updated Story Brain version/state.

This is required for final PASS.

### Browser F — Story Bible ↔ IDE

Through Story Bible UI, create or update at least:
- one character;
- one timeline event;
- one plot summary.

Refresh/reopen.

Then open the IDE Story Bible panel and verify the same data is displayed.

Finally prove the AI/context consumer receives at least one newly changed Story Bible fact.

Do not substitute API creation for this browser checkpoint.

### Browser G — Novel metadata / ownership

Through Novel Data UI:

```text
edit supported metadata
 -> save
 -> refresh
 -> verify readback
```

Ownership negative may be tested at API boundary as supporting security evidence if no non-owner edit UI exists, but label it accurately as API/security evidence.

### Browser H — chapter lifecycle

Through the IDE:

```text
create chapter
 -> edit
 -> autosave
 -> switch away
 -> return
 -> content preserved
```

If VIP/publish controls are present:

```text
toggle VIP
 -> set price
 -> submit publish
 -> verify UI/backend readback
```

---

## 4. Evidence integrity rules

Update:

```text
docs/development/AI-PIPE-01B-MAIN-E2E-report.md
docs/development/AI-PIPE-01B-MAIN-E2E/ai-pipe-01b-main-e2e-evidence.json
```

Add browser artifacts under the evidence directory, for example:

```text
browser-login-dashboard.png
browser-writing-ide.png
browser-ai-candidate.png
browser-ai-reject.png
browser-ai-accept.png
browser-story-bible.png
browser-feedback-context.png
```

Names may differ, but artifacts must map clearly to checkpoints.

Every PASS checkpoint must distinguish:

```text
BROWSER evidence
API/network evidence
DB/state evidence
```

Do not label an API-only checkpoint as browser PASS.

Exact evidence lineage must include:

```text
tested_main_sha
repair_code_sha
evidence_commit_sha
branch
novel_id
chapter_id
base_revision_id
rejected_generation_id
accepted_generation_id
accepted_revision_id
outbox_event_id
brain_version_before
brain_version_after
second_context_or_generation_id
```

Do not record secrets, JWTs, passwords, API keys, or full private manuscript content.

---

## 5. Verdict rules

Until both review blockers are resolved, current authoritative status is:

```text
LOCAL_SYSTEM_PASS_WITH_REVIEW_BLOCKERS
```

Do not retain `MAIN_UI_E2E_PASS` merely because the API/system runner passes.

Allowed final verdict:

```text
MAIN_UI_E2E_PASS
MAIN_UI_E2E_PARTIAL
MAIN_UI_E2E_FAIL
BROWSER_E2E_BLOCKED
```

`MAIN_UI_E2E_PASS` requires:

```text
real browser navigation PASS
real browser manual autosave PASS
real browser AI reject PASS
real browser AI accept PASS
canonical accept-draft lineage PASS
outbox-driven Story Brain N -> N+1 PASS
second browser context/generation observes N+1 PASS
Story Bible browser mutation/readback PASS
IDE sees Story Bible update PASS
ownership regression absent
evidence lineage internally consistent
```

If `brain_version_before == brain_version_after`:

```text
MAIN_UI_E2E_PASS is forbidden
```

If browser automation was not actually executed:

```text
MAIN_UI_E2E_PASS is forbidden
```

---

## 6. Completion boundary

If the current repair is sufficient:

```text
repair code
 -> strict system runner
 -> real browser E2E
 -> clean report/evidence
 -> commit
 -> push repair branch
 -> LOCAL_PASS_CI_PENDING
```

If browser testing reveals another product defect:
- classify it;
- make the smallest repair on the same branch;
- add regression coverage;
- rerun affected system + browser checkpoints.

Stop after pushing clean evidence.

ChatGPT owns:
- remote review;
- PR creation;
- GitHub Actions;
- merge decision;
- main closure.

Do not work on the unmerged Manuscript Import commit `fe8429c77016fc58d7a8e3293cbc89030144aebc` in this task.

---

## ACTIVE DIRECTIVE — AI-PIPE-01B MAIN E2E AFTER UI MERGES (2026-10-14)

This directive supersedes the earlier current-UI preflight task.

Test target:

```text
branch: main
product/UI baseline under test:
e15ef105afbffdb1ee9d8a1ee8bc4e69f32ff5b2
```

Pull and test the actual current `main` HEAD. Handoff/documentation commits may exist after the product/UI baseline; record the exact tested HEAD in the report.

Recent UI merges under test:

```text
PR #43
1d1525ba327b75ca0a321346afe8470e59821715
feat(ui): add author writting ide

PR #44
0e7012c08ef9e3518b91abdc55c208ec2b1fe280
feat(ui): add novel data and story bible screen
```

The previous browser preflight on `astra/ai-pipe-01b-current-ui-preflight` is historical evidence only. It does **not** qualify the current UI because `main` has materially changed since that run.

### Gemini ownership

Gemini / Antigravity owns this local E2E execution.

Start from current `main`.

```text
git checkout main
git pull
git rev-parse HEAD
```

After pulling, record:

```text
TESTED_MAIN_SHA=<actual git rev-parse HEAD>
PRODUCT_UI_BASELINE=e15ef105afbffdb1ee9d8a1ee8bc4e69f32ff5b2
```

Do not reset behind current `main` merely to recover an older handoff SHA. If product code changes beyond the baseline before execution, include those changes in the trace and test the actual current product state.

Default mode:

```text
INSPECT
 -> RUN STACK
 -> BROWSER E2E
 -> CORRELATE API/DB
 -> REPORT
```

Do not refactor the UI merely because the design is imperfect.

If a concrete defect is found:
1. classify it;
2. reproduce it;
3. make the smallest scoped repair;
4. add regression coverage;
5. create a repair branch from the tested `main`;
6. rerun the affected E2E checkpoints;
7. push at `LOCAL_PASS_CI_PENDING`.

Do not claim GitHub CI PASS or merge.

---

### Why this rerun is mandatory

The backend P1/P2/P3 pipelines are already CI-closed, but the new UI may no longer use the same canonical contracts.

The highest-risk change is the new Author Writing IDE.

Historical accepted P1 browser/backend contract:

```text
POST /api/v1/ai/writing/generations
 -> poll /api/v1/ai/jobs/:jobId
 -> preview draft
 -> POST /api/v1/chapters/:chapterId/revisions/accept-draft
 -> chapter_revisions.source_type = AI_DRAFT_ACCEPT
 -> chapters.latest_revision_id advances
 -> revision_outbox_events.INCREMENTAL_ANALYSIS
 -> Story Brain version advances
 -> next context/generation sees the new brain state
```

Current `AuthorWritingIde.tsx` appears to use:

```text
POST /api/v1/ai/copilot/suggestions
 -> insert / replace suggestion in editor
 -> PATCH /api/v1/chapters/:chapterId via autosave
```

The canonical `startWritingGeneration`, `getJobStatus`, and `acceptDraftRevision` functions still exist in `ai-copilot-api.ts`, but the new IDE may bypass them.

This must be verified by executable E2E evidence, not inferred from source alone.

---

## E2E-A — Main UI smoke

Run the real local stack:

```text
web
Node backend
AI service
PostgreSQL + pgvector
MongoDB where required by the application
```

Use a disposable AUTHOR fixture.

Browser flow:

```text
login
 -> /author
 -> select novel
 -> Novel Data
 -> Story Bible
 -> Writing IDE
```

Verify:
- no route crash;
- auth/session survives navigation and refresh;
- `novelId` / `chapterId` query state remains correct;
- frontend API failures are surfaced honestly;
- no fatal browser console errors;
- current data comes from backend rather than hard-coded mock state.

---

## E2E-B — Writing IDE canonical contract [HIGHEST PRIORITY]

### B1. Manual edit / autosave

```text
open existing chapter
 -> edit title/content
 -> wait for autosave
 -> refresh/reopen
 -> same draft content visible
```

Verify:
- chapter draft persisted;
- manual autosave does not create a fake `AI_DRAFT_ACCEPT` revision;
- no incremental Story Brain update is generated merely from unaccepted editor state.

### B2. AI generation / reject

Through the visible AI UI:

```text
request suggestion/generation
 -> receive candidate
 -> reject/dismiss without insertion/acceptance
```

Verify:

```text
chapter canonical/latest revision unchanged
Story Brain version unchanged
no AI_DRAFT_ACCEPT revision
no INCREMENTAL_ANALYSIS outbox event
```

### B3. AI generation / accept — DECISIVE CHECKPOINT

Use the current visible UI action that represents accepting/inserting AI output.

Trace the exact network calls.

Expected canonical P1 result:

```text
writing generation job exists
generation_id recorded
accept-draft called
new immutable chapter_revision exists
source_type = AI_DRAFT_ACCEPT
source_generation_id = generation_id
chapters.latest_revision_id = accepted_revision_id
INCREMENTAL_ANALYSIS outbox event created
```

If the UI instead performs only:

```text
copilot suggestion
 -> insert text locally
 -> PATCH chapter autosave
```

with no generation/accept-draft lineage, classify:

```text
UI_CONTRACT_REGRESSION
```

Do not modify the backend contract merely to accommodate this UI behavior.

The expected repair direction is to reconnect the new IDE to the existing canonical P1 writing/acceptance flow.

### B4. Story Brain feedback loop

Record:

```text
brain_version_before = N
accepted_revision_id
outbox_event_id
brain_version_after = N+1 or otherwise concretely advanced
```

Do not claim this PASS merely because the outbox reached `COMPLETED` or the brain status is `active`.

Then run a second context preview or generation from the browser and prove it observes the updated state/version.

Required correlation:

```text
novel_id
chapter_id
base_revision_id
generation_id
accepted_revision_id
outbox_event_id
brain_version_before
brain_version_after
second_generation_or_context_id
```

This is the decisive AI-PIPE-01B closed-loop browser condition.

---

## E2E-C — Story Bible ↔ IDE consistency

PR #44 materially rewrote the Story Bible surface.

Using the browser:

```text
Novel Data / Story Bible
 -> create or update Character
 -> create/update Relationship
 -> create Timeline Event
 -> create Plot Summary
 -> refresh
 -> reopen
```

Verify durable PostgreSQL-backed readback.

Then open the Writing IDE Story Bible panel and verify the same data is visible.

Finally prove the AI context path can observe at least one newly changed Story Bible fact/constraint.

The purpose is not to judge literary prose quality. The purpose is to prove:

```text
Story Bible edit
 -> persisted state
 -> IDE readback
 -> AI/context consumer sees the same state
```

---

## E2E-D — Novel metadata

Browser flow:

```text
Author Dashboard
 -> Novel Data
 -> change title/synopsis/other supported metadata
 -> save
 -> refresh
```

Verify consistency across:
- Author Dashboard;
- Novel Data page;
- Writing IDE breadcrumb/header;
- backend/API readback.

Negative ownership check:
- non-owner cannot mutate another author's novel.

---

## E2E-E — Chapter lifecycle in new IDE

Test at minimum:

```text
create chapter
 -> edit
 -> autosave
 -> switch chapter
 -> return
 -> content preserved
```

Also test supported publication state:

```text
free/VIP toggle
 -> coin price if VIP
 -> publish/submit
 -> backend state/readback matches browser state
```

UI-only typography preferences are smoke-level and must not block AI-PIPE-01B unless they break editing.

---

## Manuscript Import — DO NOT MIX WITH CURRENT MAIN ACCEPTANCE

The remote `UI` branch currently has an additional unmerged commit:

```text
fe8429c77016fc58d7a8e3293cbc89030144aebc
feat(ui): add manuscripts import screen
```

Do not include that code in the current `main` E2E verdict.

However, record it as the next pre-merge UI gate.

Known contract risk to verify before that commit is merged:

current candidate code appears to construct bootstrap revisions using:

```text
revision_id = chapterId
content_hash = "auto-sha256"
```

while the production bootstrap contract requires the actual immutable revision ID and actual content SHA-256.

The AI service can reject mismatched content with:

```text
CONTENT_HASH_MISMATCH
```

Therefore Manuscript Import must be tested separately on the `UI` branch before merge:

```text
parse/import chapters
 -> real immutable revision provenance
 -> actual revision_id
 -> actual content_hash
 -> Story Brain bootstrap
 -> review queue
 -> proposal accept/reject
 -> baseline activation
 -> IDE continuation uses imported canon
```

Do not weaken backend validation to make the candidate UI pass.

---

## Evidence and report

Create/update:

```text
docs/development/AI-PIPE-01B-MAIN-E2E-report.md
docs/development/AI-PIPE-01B-MAIN-E2E/
```

For every executed checkpoint record:

```text
browser action
frontend route/component
Node API call
AI-service call where applicable
PostgreSQL state
Story Brain state
status
notes
```

Allowed checkpoint statuses:

```text
PASS
FAIL
PARTIAL
MOCK_ONLY
NOT_IMPLEMENTED
BLOCKED
UI_CONTRACT_REGRESSION
```

Screenshots are supporting evidence only. They do not replace API/DB correlation.

Do not store secrets, JWTs, passwords, API keys or full private manuscript text.

---

## Required final verdict for this run

Use exactly one:

```text
MAIN_UI_E2E_PASS
MAIN_UI_E2E_PARTIAL
MAIN_UI_E2E_FAIL
```

`MAIN_UI_E2E_PASS` requires all of the following:

```text
current main UI loads and navigates
manual autosave works
AI reject leaves canon unchanged
AI accept uses canonical generation/accept-draft lineage
immutable AI revision persists
outbox completes
Story Brain demonstrably advances
second browser context/generation observes updated state
Story Bible changes persist and reach IDE/context
no ownership regression
```

If the AI accept path only autosaves inserted suggestion text, verdict cannot be PASS.

Even after a successful run, keep architectural reporting precise:

```text
P1 final browser E2E = PASS only for the tested main SHA
P2/P3 backend = already CI_PASS
P2/P3 dedicated UI surfaces = assess separately when implemented
```

Gemini stops after local evidence + any necessary scoped repair is pushed. ChatGPT owns GitHub review/CI/merge.

---

> This file is intentionally short. It contains only the current canonical state, architecture invariants, ownership rules, and the next executable gate.
>
> Historical implementation/review details belong in `docs/development/*report.md`, evidence JSON, PR history, and Git history. Do not append stale phase logs back into this file.

## 1. Canonical Status — 2026-10-11

The three backend authoring pipelines are CI-closed.

```text
AI-PIPE-01A  P1 Import -> Story Brain -> Assisted Writing     CI_PASS / MERGED
AI-PIPE-01B  P1 Browser/UI System E2E                         PENDING_FINAL_UI_REFACTOR

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
