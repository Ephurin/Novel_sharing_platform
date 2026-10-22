# Functional matrix (offline, simulated author via API)

| Gate | Result | Evidence |
|---|---|---|
| Skip committed before accept | PASS, 0 accepted/outbox | skip_first/ |
| Stop committed before accept | PASS, 0 accepted/outbox | stop_first/ |
| Accept committed before author skip | PASS, 1 durable accept/outbox | accept_first/ |
| ABA same objective, changed epoch | PASS, epoch 1 → 4 rejects old job | ABA/ |
| Stopped run, replacement plan | PASS, late accept rejected | plan_replaced/ |
| Two competing step workers | PASS, exact RUN_STEP_BUSY in all seven | */competing-step.json |
| SIGKILL before commit | PASS, rollback then cancelled replay | kill_pre_commit/ |
| SIGKILL after commit | PASS, durable history, duplicate-free replay | kill_post_commit/ |
| Terminal stop, step/run/restart | PASS, 6 checks, no new generation | terminal-stop/ |
| Existing plan, 2 objectives, draft chapters, HITL | PASS, 12 checks | p3-existing/ |
| No plan, 2 objectives, draft chapters, HITL | PASS, 12 checks, bounded busy adapter | p3-no-plan-03/ |
| No-plan earlier attempts | FAIL retained, preflight/contention | p3-no-plan/, p3-no-plan-02/ |
| P1 ordered writers and crash seams | PASS bounded | p1-writer/ |
| P2 bootstrap through M-FIRST | PASS, 27 checks | p2/ |
| AI/backend focused tests | PASS, 162 + 44; 2 AI skip | regressions-01/ |
| Fresh PG migration and outbound hashes | PASS | *-readback/, stop_first-readback-02/ |
| Terminal iteration/replay gate | PASS bounded two-objective fixture | p3-existing/, p3-no-plan-03/ |
| Real ending and 100k–105k canonical words | NOT_RUN | Separate authorization required |
| UI/live provider/quality/semantic RAG | NOT_RUN / NOT_ASSESSED | No acceptance claim |
