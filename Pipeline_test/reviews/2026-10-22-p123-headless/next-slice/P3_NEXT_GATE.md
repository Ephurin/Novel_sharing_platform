# P3 next gate — checklist only, NOT_RUN

Handoff source `1dc7dfa38267c9eb176f56f070380930d1887d85`. P1/P2 bounded fake-only executor evidence is ready for GPT-6 review; full/UI/live acceptance is not granted here. Do not automatically start the controller or a 100k run from this report.

Use one fresh fake-only isolated project/DB/Mongo/identity/ledger per controller journey. Supported backend prefix `/api/v1/ai`:

| Gate to execute next | Exact route / observable acceptance |
| --- | --- |
| Existing plan entry | `POST /autonomous/runs` with owned novel_id, plan_id, bounded max_iterations/max_retries_per_objective and idempotency_key; durable run binds correct versioned plan and uncompleted objective |
| No-plan entry | Same route omitting plan_id; with no active plan, service calls author-operation suggest_events, validates future chapters plus resolved ending, creates/activates durable plan. Reject invalid/no-ending/backward-chapter plan without history mutation. Current core fake suggests no ending, so a new isolated scripted P3 scenario is required; do not edit old fixtures |
| Bounded execution | `POST /autonomous/runs/:id/step`, then `/run` with small max_steps; compare durable generation/revision/outbox/canon/objective IDs across each step; GET `/autonomous/runs/:id` and `/autonomous/by-novel/:novel/active` |
| Genuine HITL stop | Reach waiting_entity_review/review queue; assert controller does not call review/accept or advance objective without explicitly scripted author decisions. Use actual entity freeze/continue and proposal approval APIs; label SIMULATED_HUMAN_VIA_API |
| Objective completion | Generation+accept+incremental extraction+author approval precede objective advancement; prove criteria, final objective and resolved ending, not just iteration counter exhaustion |
| Failure/resume | Fake 5xx, stale brain/base, validation failure, real owned DB transaction fault and process restart; bounded retries, no premature objective/brain advance; resume from persisted run state through supported step/run, with exact provenance |
| Idempotency/concurrency | Repeated create key, concurrent step/run, accepted-generation replay, outbox lease recovery and stop/restart: no duplicate accepted revision/event/fact or objective advancement |
| Ownership and safety | Wrong author denied on create/read/step/run/stop, cross-novel plan denied. `POST /autonomous/runs/:id/stop` persists stop; no background step after stop |
| Draft-only output | Every created chapter remains DRAFT; no publish/moderation transition; no hidden auto approval; inspect SQL/draft/canon and actual HTTP fake requests |
| With/without plan readback | Save full M0/M-FIRST/final canon and objective matrix, transmitted/persisted context hashes, retention/pruning/overflow/retrieval-disabled metadata and source cutoff proofs |

Prepare a fresh source commit and exact-SHA tests, sanitized evidence commit, failure artifacts, run resource/ledger lifecycle and independent GPT-6 handoff. Keep FE integration held. External Gemini/OpenAI/embedding calls, literary quality, semantic RAG quality and 100k–105k terminal artifact are NOT_RUN/NOT_TESTED and require their own authorization/gates.
