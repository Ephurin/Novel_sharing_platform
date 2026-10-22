# P3 bounded functional controller report

**P3_CORE_PARTIAL — BLOCKED_INFLIGHT_OBJECTIVE_FENCE.** Tested source `c34a0251dbc6d15fd2af7a8b1ead787adf892100`, clean. Happy-path executor PASS is not aggregate P3 safety/acceptance. P3_HITL_CONTROLLER_100K remains NOT_RUN and not authorized in this task. No UI/provider/literary/semantic-RAG quality claims.

| Gate | Actual result / evidence |
| --- | --- |
| Existing active plan | PASS, 12 checks, `final-p3-existing/`; fresh project `p123-core-64907aab11`, run `65db6311-f975-4cfe-85dd-9b6c9fd86efa` |
| No active plan | PASS, 12 checks, `final-p3-no-plan/`; own project `p123-core-1260b6b979`, run `4d0caffd-d72e-43d5-b6f7-611a0eb93ea5`; controller calls actual author-operation, creates/activates a future plan with two objectives and explicit ending. No DB plan insertion or preexisting-plan substitution |
| Multi-objective/terminal | Both reach 2 iterations, all objectives completed, stop_reason `terminal_objective_completed`; bounded fake evaluation/min_words=1 only, not prose quality or 100k completion |
| Supported execution | Actual POST create, bounded `/run` max_steps=2, `/step`, GET state/plan; immutable AI_DRAFT_ACCEPT revisions, outbox, analysis and canon, then objective advance |
| HITL | Actual `waiting_for_entity_review` for both chapters. Before author decision memory is unchanged. SIMULATED_HUMAN_VIA_API freeze/continue and proposal approvals precede resume. No unattended claim; human review flag remains ON |
| Durable readback | Each happy journey ends with 3 entities / 2 events / 4 facts; 2 real writing jobs matched to fake HTTP context hashes. Parent revisions, outbox, proposals/plans/current run and migration versions in `*-readback/` |
| Idempotency/ownership | Repeated create returns same run; terminal step does not advance; different authenticated author gets 403; same-owner cross-novel plan gets 404 |
| Missing ending plan | Actual no-plan create with isolated fake missing-ending fixture gets 422 and creates zero runs. `P3-negative/invalid-plan/` |
| Provider 500 | Real gateway→fake 500, first step schedules retry 1, second fails at retry 2/max_retries_exceeded; zero accepted AI revisions and canon unchanged. `provider-500/` |
| Stale brain | Brain advanced by an explicit author-declaration approval after controller creation; next generation/step gets 409, zero accepted AI revisions; explicit stop. `stale-brain/` |
| Concurrent step | In-flight pair returns 200 / 409 RUN_STEP_BUSY; no duplicate accepted revision from the loser. `inflight-objective/inflight-receipts.json` |
| Restart/stop | Actual backend restart at persisted human checkpoint; state readback saved; explicit stop and step replay stay stopped. In-flight generation/process-kill controller recovery beyond this checkpoint is not separately proven; P1 has actual SIGKILL tests |
| Objective mutation during generation | **RED/BLOCKER**: see below. Broader active-plan replacement/version-rescheduling semantics are not accepted from the pinned-plan happy path |
| Publication | All happy-path created chapters are DRAFT, no publish/moderation call. Failed/cancelled negative branch is not canonized |

## Runtime defects fixed in this slice

`p3-existing-01/` at 049e40d reached HITL but resume failed optimistic brain version: internal generation response omitted the idempotency key needed to recognize already accepted controller work. `e496f4d` restores that internal recovery identity and validates matching novel/chapter before reuse.

`p3-existing-02/` at e496f4d progressed an objective but returned old waiting reason because explicit PATCH stop_reason=null was treated as omission. `6b5890c` distinguishes `model_fields_set` from absent fields. Regression tests cover recovery identity and omit-versus-null semantics. Both failing attempts are preserved; final c34a025 journeys pass.

## Concrete remaining blocker: author cancels objective in flight

`P3-negative/inflight-objective/` sends a controller step against an in-progress objective with a delayed fake writing request. After observing the actual fake HTTP generation receipt, the authenticated author changes the objective to `skipped`; the update completes before generation returns. The controller still accepts **one immutable AI revision for that skipped objective** and stops at entity review. Canon remains unchanged; the concurrent step loses 409. This is runtime RED, not a static concern.

The current controller checks run status before accept but does not atomically fence current objective status/intent against the author mutation. An additional GET immediately before accept would only narrow the race; it would not prove atomic cancellation semantics across plan service and accepted revision transaction. Aggregate P3 therefore stays PARTIAL/BLOCKED. No silent reclassification of cancelled work as completed, no auto author approval, no full P3 PASS.

Next repair options for GPT-6/owner review: (1) durable objective execution lease/version shared by author mutation and accept transaction, with explicit cancellation/renewal policy; (2) transactional objective-generation acceptance fencing in the shared DB and a versioned internal API; (3) explicitly retain late output only as a rejected/unaccepted candidate when intent changes. Define behavior for skipped/completed/replaced objectives and stop during generation, then test both interleavings plus death/restart. Existing plan-version pinning and chapter writer lock alone are insufficient. No scope expansion into FE or a 100k run is implied.

All provider output is a separate deterministic P3 fake scenario. Author decisions are SIMULATED_HUMAN_VIA_API. Source/HTTP hashes, counts and resource lifecycle are in validation/readback files; synthetic ledger charge is not real spend. No main/FE writes, PR merge, real provider/embedding call, publication or historical cleanup occurred.
