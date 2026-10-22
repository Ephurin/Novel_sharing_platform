# P123 core matrix — headless only

Inspected baseline: `eca4a00` on `codex/ai-copilot-pipeline-test`, 2026-10-22 Asia/Saigon.
Initial matrix written before implementation. Runtime results belong in validation.json and EXECUTOR_REPORT.md.
All author decisions below are `SIMULATED_HUMAN_VIA_API`; fake responses prove no output quality.

| Gate | Supported endpoint (backend /api/v1 prefix) | Initial evidence / missing coverage | Status |
|---|---|---|---|
| P1 accounts / ownership | /auth/register, /auth/login; isolated AUTHOR role infrastructure fixture | Same novel under different authenticated author must reject | NOT_RUN |
| P1 five frozen chapters | POST /novels; POST /novels/:id/chapters; GET /chapters/:id/revisions | Original immutable fixture mapping; no direct narrative inserts | NOT_RUN |
| P1 initial extraction | POST /ai/story-brains/bootstrap/from-manuscript | Real backend revision provider, five revision/hash manifest | NOT_RUN |
| P1 entity gate | GET /ai/story-brains/:id/entity-reviews; POST .../:run/review and /continue; POST /ai/jobs/:id/resume | Capture raw machine output, API actor decision and frozen inventory separately | NOT_RUN |
| P1 official canon / M0 | GET .../review-queue; POST /ai/proposal-groups/:id/accept; POST .../baseline/activate; GET .../memory | PostgreSQL readback, immutable source linkage and restart persistence | NOT_RUN |
| P1 future intent | POST /ai/story-plans; POST /ai/story-plans/:id/activate; GET active plan | Actually attach future plan, keep historical events separate | NOT_RUN |
| P1 outbound | POST /ai/writing/generations; GET /ai/jobs/:id; GET .../context-preview | Actual fake HTTP capture vs stored job hash; chapter cutoff, seeded future entity and retrieval metadata | NOT_RUN |
| P1 ordinary save / outbox | PATCH /chapters/:id; GET .../extraction-status; entity/canon routes | Revision/outbox/HITL/M-FIRST and retry/replay | NOT_RUN |
| P1 version races | PATCH /chapters/:id; POST .../revisions/accept-draft | PATCH schema has no expectedVersion; draftVersion returned. Document, do not assume optimistic locking | GAP_IDENTIFIED |
| P1 regression | Targeted backend and AI tests; full fresh migrations | Record exits, skips and precise DB coverage | NOT_RUN |
| P2 setup entry | POST /ai/story-brains/bootstrap/from-idea mode=extract | Separate project; explicit entity proposals and approval; not blueprint creativity | NOT_RUN |
| P2 first chapter | Story Plan + shared writing/accept/analysis routes | M0/M-FIRST and durable linkage | NOT_RUN |
| P3 existing/no plan | POST /ai/autonomous/runs; /:id/step, /run, /stop | Separate project; with/without plan, bounded HITL, resume, failure safety, draft only | NOT_RUN |
| P3 terminal functional | GET /ai/autonomous/runs/:id | Terminal condition does not prove literary completion | NOT_RUN |
| UI P1/P2/P3 | FE-owned integration | Historical S09 RED unchanged; no FE modifications | BLOCKED_FE |
| Real provider / semantic quality | Requires separate authorization | External provider/embedding calls forbidden | NOT_TESTED / NOT_ASSESSED |
| P3 100k–105k | Separately authorized long run | Contract v1.4 unchanged | NOT_RUN |

Source inventory: backend/src/modules/ai/ai-gateway.routes.ts, ai-gateway.controller.ts;
backend/src/modules/novels/{novels,chapters,chapter-revisions}.{routes,schemas,service}.ts;
ai-service/api/{narrative_routes,schemas}.py. Wave 1H review blockers remain open until
durable supported-API evidence actually closes each one. Backend/AI differences from main
were inspected; no historical FE differences are authorization to edit web/.

## Bounded execution update — source b5c9c8d

This updates the initial inventory; it does not grant full P1 acceptance.

| Gate | Actual evidence | Final slice result |
|---|---|---|
| P1 source/bootstrap/entity/canon/M0 | final-run-05 source-manifest, machine/human records, raw queue, PostgreSQL tables | PASS, SIMULATED_HUMAN_VIA_API |
| P1 durable restart | M0 and M-FIRST identical memory after backend/AI restart | PASS |
| P1 same novel / wrong author | Authenticated second AUTHOR receives 403 | PASS for ownership; distinct-tenant HTTP scenario not separately provisioned |
| P1 approved source → outbound | Actual chapter-5 and chapter-1 fake HTTP captures; hashes match stored context_summary | PASS |
| P1 later entities / cutoff | Later entities genuinely approved; absent from early outbound; final-readback-audit joins 15 identities across five cutoffs | PASS; seven pre-fix leaks preserved in readback-audit-02 |
| P1 attached future plan | Active versioned plan in outbound planning_context; absent from historical events | PASS |
| P1 ordinary save / outbox / M-FIRST | Automatic revision + checkpoint; API review; 5 events/7 facts; outbox COMPLETED | PASS |
| P1 replay/stale boundaries | Identical-save revision/outbox reuse; old revision 409; stale brain 409; two unkeyed generations work | PASS at executed scope |
| P1 optimistic PATCH/two writers | expectedVersion absent; compare-and-swap unsupported/unproven | GAP; not fixed speculatively |
| P1 interrupted resume / DB materialization faults | Backend/component tests exist; no new real-DB fault-injection run | NOT_RUN |
| P1 locked pruning / max tier | Component tests PASS; not new durable HTTP stress fixture | PARTIAL |
| P1 retrieval metadata | Embeddings/retrieval disabled; missing metadata not relabeled PASS | OBSERVABILITY_GAP; SEMANTIC_RAG_NOT_ASSESSED |
| P1 generated-draft acceptance | Endpoint inventory only; ordinary author-save path executed | NOT_RUN for accept-draft |
| P1 whole core gate | First bounded slice ready for independent review | P1_CORE_OFFLINE_PASS NOT_GRANTED |
| P2 / P3 | No project/run started; review P1 first | NOT_RUN |
| UI / real provider / literary quality / 100k | No FE code or calls; v1.4 unchanged | BLOCKED_FE / NOT_TESTED / NOT_RUN |

Details, exact commands and failed-attempt lineage: [EXECUTOR_REPORT.md](EXECUTOR_REPORT.md).
