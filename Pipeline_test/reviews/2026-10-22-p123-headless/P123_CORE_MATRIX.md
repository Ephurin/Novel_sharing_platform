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
