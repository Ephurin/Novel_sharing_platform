# P1-POSTMERGE-DEMO-GATE-01

**Verdict: P1_DEMO_GATE_PARTIAL**

Tested source: `fae6d497fb5a43dd6cb5a47fdb143e5ee3badb8c`, branch `gemini/p1-live-free-tier-01`, fetched on 2026-11-01 (Asia/Ho_Chi_Minh). AA-01 passes on the actual QA runtime and isolated database fixtures. No new functional blocker was reproduced. Fresh candidate approval/rejection was not repeated in this round because the historical QA queue is empty and its data was preserved. That rehearsal step requires a disposable offline fixture. This is not a full live-AI acceptance claim.

This report is on a separate documentation branch; no application source change, PR merge, credential/ quota change or new test framework was made.

## Repository and integration state

- [PR #84](https://github.com/Ephurin/Novel_sharing_platform/pull/84) is merged; GitHub reports merge SHA `fae6d497fb5a43dd6cb5a47fdb143e5ee3badb8c`.
- The tested backend/web/Pipeline_test/AI-service tree is identical to the verified hotfix tip `1bca2c36a5112b0d4cd630abe81b0e4fa1482e33`. Its commits are ancestors of Gemini HEAD.
- [PR #83](https://github.com/Ephurin/Novel_sharing_platform/pull/83): head `gemini/p1-live-free-tier-01` at the tested SHA; base `codex/p1-live-safety-01` at `9ced899e054c3d5694d3b19086703426be8dd54c`. Open, Draft, unmerged, GitHub mergeable.
- [PR #81](https://github.com/Ephurin/Novel_sharing_platform/pull/81): head `codex/p1-live-safety-01` at `9ced899e054c3d5694d3b19086703426be8dd54c`; base `integration/p1-demo-20261109` at `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`. Open, Draft, unmerged, GitHub mergeable.
- Both base branches are ancestors of Gemini HEAD. The correct order is **#83 into safety branch, then refreshed #81 into integration**. #81 does not yet contain #83/#84 at its current head. Do not describe #81's existing green checks as testing that future combined head.

## Current CI: 10/10 successful jobs

At exact Gemini merge HEAD, [P7 run 41321497765](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41321497765) and [P8 run 41321497814](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41321497814) are completed/success. The legacy combined-status API returned no statuses; the following results come from actual Actions run/job records.

| Workflow | Job | Result |
|---|---|---|
| P7 | unit | SUCCESS |
| P7 | pgvector-integration | SUCCESS |
| P7 | root-compose-smoke | SUCCESS |
| P8 | unit | SUCCESS |
| P8 | frontend-api-cutover | SUCCESS |
| P8 | postgres-integration | SUCCESS |
| P8 | backend-integration | SUCCESS |
| P8 | root-compose-cutover-smoke | SUCCESS |
| P8 | rollback-rehearsal | SUCCESS |
| P8 | final-cleanup-gate | SUCCESS |

Coverage distinction: P8 deterministic backend discovery includes `writing-drafts.test.ts`; P8 backend integration explicitly runs `accept-draft-contract.test.ts`. CI does **not** explicitly invoke the new `writing-drafts.postgres.test.ts` or either Writing recovery browser suite. Those are independently covered by the local results below. P7/P8 success also does not mean the 136 historical safety tests were rerun as this gate.

At current #81 head, [P7 run 41159282192](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41159282192) and [P8 run 41159282448](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/41159282448) likewise have 10/10 successful jobs. Its PR description retains historical NOT_RUN/checklist text; use exact current runs and scoped evidence, not the stale prose, for the review decision. Independent review and release authorization remain required.

## Runtime and provider boundary

Docker Engine and Compose were available. Only backend/web images were rebuilt from the tested HEAD. Existing PostgreSQL, MongoDB and AI-service containers were started without seeding/resetting QA data; backend/web were recreated with the existing local configuration. Frontend `http://127.0.0.1:18080/`, backend `/api/v1/health` and AI-service `/health` returned **200**.

The existing gateway stayed **stopped throughout**. Its effective configuration and both running worker configurations had `LIVE_FREE_TIER_ENABLED=false`, `LIVE_UPSTREAM_FORWARDING=false`, proxy routing and fallback disabled. No inference endpoint was used; browser automation additionally blocked generation/extraction and non-loopback requests. No blocked generation attempt was observed. No Slot 4 credential was used, and no expired attestation was renewed or used to enable forwarding.

| Ledger | Before | After | Integrity |
|---|---:|---:|---|
| Real-smoke history | 6 dispatches, 0 in-flight | 6 dispatches, 0 in-flight | File bytes unchanged |
| Dormant Free Tier | 0 RPD, 0 in-flight | 0 RPD, 0 in-flight | File bytes unchanged |
| Earlier fake-provider ledger | 2 fake calls | 2 fake calls | File bytes unchanged |

**New real Gemini/provider calls: 0.** Separate selected fail-closed tests used fake/mocked upstream only. Background analysis cannot reach a provider with the gateway stopped. This gate does not claim an active gateway health check or a renewed live attestation.

## Actual QA Author IDE smoke

Logged into `sol61` via the real login UI using the ignored local runtime password; no credential was printed or uploaded. Opened Huyết Ngọc Bội and its existing chapter in the rebuilt Author IDE.

| Check | Result | Actual observation |
|---|---|---|
| Draft recovery | PASS | Persisted 428-character completed/passed draft visible with pending-review label and both controls |
| Reload recovery | PASS | Draft reappears after reload without new generation |
| Stale safety | PASS | UI warns that content/Canon changed; Accept is disabled for the historical Brain-v1 draft against current v7 |
| Manuscript integrity | PASS | Main manuscript remains 346 words and does not contain the AI continuation |
| Canon entities/events | PASS readback | Story Brain v7 shows Lâm Phong, Huyết Ngọc Bội and one current corrected event; two event rows remain in storage as history |
| Saved character profile | PASS | Appearance and personality are nonempty, editable, and identical after reload |
| Edit controls after approval | PASS controls only | An unsaved appearance edit enables Save; Undo restores it. No Save was sent and no historical Canon change was made |
| Approved event workflow | PASS visibility | Current corrected event and the Event Correction proposal form are accessible |
| Review states | PASS readback | UI pending count 0; read-only SQL confirms 4 accepted and 1 rejected proposals |
| New candidate approve/reject | NOT_RUN_NO_PENDING_FIXTURE | No pending candidate exists; no historical data was changed to fabricate a PASS |
| New extraction/generation | NOT_RUN_REQUIRES_LIVE_APPROVAL | Explicit zero-call budget |

Read-only QA storage checks: Brain v7, 2 Canon entities, 2 event versions (one current in UI), profile version 3, 1 Writing job and 0 AI-accepted revisions. These agree with the prior curated Canon/HITL evidence. Pending/approved/rejected state transitions and saved profile/event edits were exercised in the earlier [Author acceptance](P1_AUTHOR_ACCEPTANCE_SOL61.md) and [Canon/HITL summary](evidence-sanitized/canon-hitl-summary.md); this round checks persistence/UI availability rather than claiming new decisions.

The separate **Cẩm nang / Story Bible** drawer displays zero legacy character/event entries, while **Story Brain** displays the approved Canon. No data loss was observed. Use Story Brain in the rehearsal; do not confuse the two panels.

## Accept/Reject on isolated real databases at merge HEAD

The existing AA-01 fixture databases were restarted separately from the QA runtime. Current migrations/schema were retained. The existing tests create their own generated author/novel/chapter/job records; they do not mutate Sol's historical database.

- `writing-recovery.real-db.browser.test.mjs`: **1/1 PASS** (approximately 15 seconds). Real mounted Author IDE, authenticated Express backend, PostgreSQL and MongoDB; fresh completed/passed fixtures. Recovery/reload, Reject/reload, second fixture Accept/reload, correct manuscript/revision/outbox, cross-user HTTP 401/403 and disabled stale Accept all verified.
- `writing-drafts.postgres.test.ts`, `accept-draft-contract.test.ts`, `writing-drafts.test.ts`: **31/31 PASS**, including DB01–DB12. Valid Accept creates one immutable revision/outbox; duplicate Accept adds neither. Reject leaves manuscript/Brain/outbox unchanged; Accept-after-Reject and Reject-after-Accept are denied. Four concurrent Accept/Reject pairs cannot both commit. Hash/Brain/revision-pointer checks stay fail-closed.
- The trusted AI read boundary in these fixtures is a SQL-backed adapter; no Gemini worker runs. Analysis outbox processing is deliberately refused locally. This is real-database browser acceptance of the review lifecycle, not a new live-model or deployed AI-service authentication test.
- The two task-owned fixture DB containers were stopped again, with volumes retained.

## Integration audit and security

Selected gateway checks at merge HEAD: **10 PASS, 45 deselected** from `test_p1_free_tier_01.py`: tests 22, 23, 26, 30, 31, 36, 38, 39, 49 and 53. They cover mandatory proxy/direct-bypass prevention, attestation expiry, authenticated emergency disable, forwarding disabled, origin validation, private-note rejection and fallback prohibition. No provider endpoint is called. Existing broader safety evidence remains historical; the full 136-test run was not repeated.

The integration-to-Gemini diff contains 49 changed files. Local exact-credential/pattern and runtime/raw-request filename checks found no active runtime credential, provider key/JWT/private key, runtime environment file or raw request dump in that diff. Two exact-value hits were declared non-secret example tokens in `.env.free-tier.example`, also present in an unused local sample configuration; neither matches any effective gateway/backend/AI-service credential. They were triaged without printing the values. No new image/log/DB dump is published; original evidence remains local and ignored.

**#83 readiness:** technically suitable to present to GPT-6 for merge decision: contains #84, conflict-free ancestry/current GitHub mergeability, 10 green CI jobs, fresh runtime recovery and isolated DB/browser review evidence. Not automatically approved or merged.

**#81 readiness:** current head is green and mergeable, but final stack readiness is conditional on #83 landing into its source branch first. Reassess the updated #81 HEAD, its CI and final diff after that integration; do not merge the current #81 alone expecting the Free Tier/AA-01 work to be present. No merge was executed in this task.

## Minimal rehearsal route

| Step | Classification | Route / evidence |
|---|---|---|
| 1. Author login | DEMO_READY | Real `sol61` login verified |
| 2. Open Huyết Ngọc Bội | DEMO_READY | Dashboard retains the novel |
| 3. Open saved chapter | DEMO_READY | 346-word manuscript intact |
| 4. Show characters/events | DEMO_READY | Use **Story Brain**, then Hồ sơ Codex / Sự kiện / Vật phẩm |
| 5. Edit and approve candidate | DEMO_WITH_FIXTURE | Prepare a disposable offline/manual proposal; current historical queue is empty. Not re-executed this round |
| 6. Show persisted Canon after reload | DEMO_READY | Saved appearance/personality and corrected event survive reload |
| 7. Open persisted Writing draft | DEMO_READY | Historical draft recovers; explain stale warning and disabled Accept |
| 8. Accept/Reject valid draft | DEMO_WITH_FIXTURE | Fresh base/Brain-matched isolated fixtures passed real-backend browser tests; historical draft must not be accepted |
| 9. Explain previous Gemini/embedding results | DEMO_READY (historical evidence only) | Prior smoke: 6/6 dispatches successful, text/extraction/768-dimension embedding and isolated pgvector retrieval. Author Writing used an empty Brain at generation time; populated Canon semantic recall was NOT_RUN |
| Generate/extract/embed live during demo | LIVE_APPROVAL_REQUIRED | Separate authorization and fresh valid project/quota/attestation checks; not enabled here |

At most three rehearsal concerns remain:

1. No pending QA candidate: prepare a disposable manual/offline fixture before demonstrating a fresh HITL decision. This round did not perform that transition.
2. Historical Writing draft is correctly stale: use the valid isolated fixture for Accept/Reject, preserving the historical evidence.
3. Legacy Cẩm nang drawer is empty despite populated Story Brain: use the Story Brain entry point to avoid misleading the audience. AA-02's source label remains a non-blocking backlog issue; it was not changed.

No new blocker or source hotfix is proposed. Runtime QA frontend/backend/AI-service/databases remain available for operator inspection, with gateway stopped and live flags false. The isolated mutation-test containers are stopped. Report-only handoff; merge decisions remain with GPT-6/operator.
