# P1 Author IDE / AI-service contract proposal

Published before API changes. Base: dd2f8003b0ad94e6097819cdca0249aa591f54fa.
Authority: WORKFLOW_CONTRACT v1.4; accepted H-01 through H-05.
Status: proposed, awaiting implementation and independent review. Browser E2E NOT_RUN.

| Finding | Current FE request / assumption | Current backend behavior | Required contract | Owner |
|---|---|---|---|---|
| B1 | Always reads reviewed_decisions / known_entities | Initial audit omits these | Versioned DTO with arrays and scoped approved UUID registry | Codex + FE |
| B2 | Selects canonical entity by name | Explicit reviewed identity required | Select canonical UUID or scoped human provisional group | Codex specification + FE |
| B3 | No partial save; stale action calls continue | Separate review / refresh protocol | Save finalize=false; guidance; refresh expected_version; freeze; continue | Codex specification + FE |
| B4 | Reads memory.transitions | Field absent | Authoritative approved active event/fact transitions with provenance | Codex + FE |
| B5 | Sends edited_payloads | Schema ignores it; repository supports atomic mapping | Strict full replacement payloads per proposal ID; validate then commit atomically | Codex |
| B6 | Needs author relationship correction / locks | Trusted override has no public CAS boundary | Author-owned exact UUID pair API with Brain CAS | Codex + FE |

## Proposed wire contract

Public prefix `/api/v1/ai`. Gateway requires active author and novel ownership; Python
requires trusted service credentials and tenant scope. No cross-tenant registry exposure.

B5: POST `/proposal-groups/{groupId}/accept` retains proposal_ids,
expected_brain_version and reason; declares edited_payloads (default empty mapping).
Each value replaces the complete payload, matching single edit-and-accept semantics.
Unedited items retain originals. Reject unknown fields, unknown edited IDs, invalid
references, protected identity/provenance changes and invalid dependency selections.
Reserved IDs and immutable source evidence cannot be fabricated or replaced.
Any failure rolls back proposals, decisions, Canon and brain version. Success increments
Brain once. Retry of decided proposals conflicts without duplicate materialization.

B1: response-only review_schema_version=1; reviewed_decisions and pending_candidate_ids
always arrays; known_entities is an approved scoped registry of
{entity_id,name,entity_type}, with registry_brain_version. Reading does not rewrite the
stored audit/CAS payload. Machine decisions and human decisions remain separate.
Pending IDs mean occurrences missing durable human decisions; frozen/completed has none.

B2/B3: construct provisional_identity_key as checkpoint.provisional_identity_scope +
`/` + a human-controlled ASCII label matching [A-Za-z0-9_-]{1,64}.
Two new people named Minh can use `/minh-doctor` and `/minh-driver`; repeated occurrences
explicitly use the same key. Positive decisions choose exactly one canonical_entity_id
or provisional_identity_key. Never infer identity from a matching name or machine grouping.
Scope binds tenant, novel, immutable revision, hash and checkpoint. Freeze reserves UUIDs;
retry/reload reuses them. Refresh preserves only compatible reviewed occurrences.

Sequence: GET audits/reviews; POST review {expected_version,decisions,finalize:false};
POST guidance {expected_version,entries}; POST refresh {expected_version}; reload;
review pending occurrences; POST review {expected_version,decisions,finalize:true};
POST continue {}; separate Canon acceptance; GET memory.
Refresh is never continue. Decisions carry immutable candidate_id, verdict, canonical_name,
entity_type and explicit identity selector for positive decisions.

B4: add memory.transitions using persisted approved active event/fact sources, never
synthetic history from current_state. Corrections create proposals, followed by separate
Canon approval. Superseded events cannot be corrected again.

B6: proposed POST `/story-brains/{novelId}/relationship-locks` with
{subject_entity_id,object_entity_id,relation_type,expected_brain_version}.
Both UUIDs must be approved in scope. Atomic exact-pair lock preserves provenance,
enforces Brain CAS and rejects ambiguous historical name-only locks. The trusted legacy
override is not exposed directly. No migration or parallel relationship model proposed.

401 unauthenticated; 403 foreign owner/scope; 404 missing resource; 409 stale checkpoint,
Brain or already-decided proposal; 422 invalid payload/identity/provenance. Existing group
membership errors may retain documented 400. On 409 reload and explicitly reconcile edits;
never silently resubmit with a newer version.

## Gates and ownership

Backend readiness requires real isolated PostgreSQL readbacks, Gateway HTTP and exact-source
P7/P8. B2/B3 and relationship UI remain FE_ACTION_REQUIRED until FE implementation and
Gemini mounted browser verification. No FE production source changes in this branch.
Default flag OFF, extraction-only outbox, author-only Canon and immutable revisions remain.
No mounted S09–S11 PASS or production readiness is implied.
