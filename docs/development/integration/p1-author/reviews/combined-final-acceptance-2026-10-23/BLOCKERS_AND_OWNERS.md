# Remaining acceptance limits

| Severity | Item | Status | Owner / next proof |
|---|---|---|---|
| P1 full-P1 blocker | AI /memory export404 | BLOCKED | AI/Core integration owner: approve/implement exact approved-memory API and DTO; context-preview200 is separate, never substituted |
| P1 full-P1 blocker | Entity candidate audit/list/review/continue routes absent | BLOCKED | AI/Core integration with Gemini FE: reconcile immutable source/hash, owner/tenant/guidance/version checkpoint contract |
| P1 P3 HITL blocker | waiting_for_entity_review and authorized checkpoint continuation missing | BLOCKED (two explicit probe cases) | Controller/AI owner: implement separately approved mode/state fences; no disabling HITL or generic worker approval |
| P1 acceptance | Mounted Author IDE S09–S11 | NOT_RUN | Gemini/FE owner: finalized backend + actual editor/auth/router on fresh DB; S09 before S10/S11 |
| P2 quality | Real Gemini/embedding and literary quality | NOT_RUN | Model/evaluation owner under separate live-provider authorization; fake-only structure does not certify quality |
| P2 long-run | P3 100k | NOT_RUN | Separate accepted HITL mode and bounded budget/run authorization |
| P2 test safety found here | Recovery fixture leak in legacy live suite | CLOSED on final source | Test-only tracking/cleanup repair and foreign sentinel regression; final whole-native readbacks0 |
| Explicit migration boundary | Populated PG upgrade/reverse18 | NOT_RUN / unsupported reverse CLI | DB migration owner; do not infer from emptyDB or SQLite rehearsal |

P3 legacy controller authority remains separate and its18 checkpoint smoke passes. This is not HITL/unattended acceptance. No product policy, response DTO, version requirement or production Canon worker was changed in this task.

Recommendation: AGAINST merging PR62 now; keep Draft/DO NOT MERGE until GPT6 independently accepts the exact final source/evidence and explicitly decides bounded backend promotion. No tested production regression remains in the three assessed subsystems, but this is not P1 production readiness.
