# Gateway → AI compatibility audit

Real HTTP requests: green-02-runtime/gateway-route-audit.json and http-trace.jsonl; AI access paths in green-02-ai-http-log.txt. Exact tested SHA in VALIDATION.json. Expected status means the declared supported product contract, not an implemented alias.

| Gateway method/path under /api/v1 | Actual next layer | Expected | Observed | Missing layer |
|---|---|---|---|---|
| GET /ai/story-brains/:novel/memory | GET /v1/story-brains/:novel/memory | 200 approved memory export | 404 AI_SERVICE_404 | No AI route; Node mapping exists |
| GET /ai/story-brains/:novel/entity-reviews | GET /v1/story-brains/:novel/entity-reviews | 200 review inventory | 404 | AI review routes absent |
| POST .../entity-reviews/:run/review | Node first GET /v1/story-brains/:novel/entity-candidate-audits/:run | valid audit then review result | 404 at prerequisite audit | AI candidate-audit route absent; POST never reached |
| POST .../entity-reviews/:run/continue | same prerequisite candidate audit, then .../continue | valid frozen checkpoint then continuation | 404 at prerequisite audit | AI audit and continuation implementation absent |
| GET /ai/story-brains/:novel/context-preview?chapter_id=:chapter | GET /v1/story-brains/:novel/context-preview?chapter_number=1 | 200 | 200 | Existing supported context route works |
| GET /ai/story-brains/by-novel/:novel | GET /v1/story-brains/by-novel/:novel | 200 | 200 | Summary works, not a detailed memory export |
| GET .../review-queue | GET /v1/story-brains/:novel/review-queue | 200 pending proposals | 200 | Legacy canon-review queue works |
| POST /ai/proposal-groups/:group/accept | internal trusted group lookup → owner/latest evidence check → AI accept | 200 owner;409 stale/replay;403 foreign owner | 200/409/403 | Existing canon-decision path exercised |

The fake UUID used in review/continue audit does not prove a valid checkpoint could resume: source inspection confirms the entire AI entity-review route family is absent. No route alias was added. /context-preview is not substituted for a product /memory implementation; canonical SQL is a read-only diagnostic oracle, not an API repair.

Separate scoped follow-up: define the exact memory export DTO and port existing entity guidance/audit/review/continue services, routes, schemas and HITL controller states with source/version/intent fences. A route spelling correction cannot supply the missing state machine. No broad AI implementation or FE change was made here.
