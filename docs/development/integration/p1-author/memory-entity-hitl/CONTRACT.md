# P1 approved memory and entity HITL contract

Base: `7fd6f71b388320e00408b7ea47c0998708c70a2c` (`integration/p1-author`, PR #62).
Reference: `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3` (`codex/ai-copilot-pipeline-test`).
This contract covers P1 only. P3 controller integration and FE mounting remain separate work.

## Endpoints and identifiers

All Python paths below start with `/v1/story-brains/{novel_id}`. The public path key is the platform novel UUID, including paths previously named `brain_id`; it is never `narrative.story_brains.id`. The memory DTO returns both IDs explicitly. Passing an internal brain UUID as the public novel key does not resolve another brain.

| Method/suffix | Contract |
| --- | --- |
| GET `/memory` | `data` is ApprovedMemory schema 1: story_id, brain_id, integer brain_version, materialized entities/aliases/mentions/events/facts/relations, active current_state, metadata, accepted-proposal source provenance. Missing brain: 404, existing empty brain: 200. Does not create a brain or update projections. |
| GET `/entity-candidate-audits/{run_id}` | Revision/hash/version-bound audit. Missing or wrong-novel run: 404. |
| GET/POST `/entity-guidance` | Separate hint/declaration instructions. POST CAS on expected_version, initially 0; valid save increments guidance version only. GET missing brain returns version 0 without creating it. |
| POST `/author-entities` | Pending author_declaration entity proposal; no prose occurrence/evidence. Canon approval separately creates identity with Unknown status and zero mentions. |
| GET `/entity-reviews` | Waiting/frozen review checkpoints for this novel. Completed checkpoints remain retrievable through the audit endpoint. |
| POST `/entity-reviews/{run_id}/review` | Exact candidate coverage, no unresolved decisions. expected_version must match. Freezes reviewed inventory, increments review version. Identical replay with original expected_version is idempotent. Different replay: 409. |
| POST `/entity-reviews/{run_id}/continue` | Requires entities_reviewed checkpoint. Valid retry never reruns discovery/verifier. Persists pending proposals and completed checkpoint atomically; duplicate requests return the saved set, including an empty set. |
| POST `/author-proposals` | Exact unique source quote, immutable revision/chapter/hash, expected Canon version. Produces a pending proposal; invalid evidence 422. |

The existing revision analyses POST returns `waiting_entity_review` when the flag is ON. Its request/idempotency key pins tenant, novel, chapter, revision, hash, operation, options. After Canon changes use a new analysis request key. For changed guidance, save author choices and refresh the existing checkpoint with CAS as described below; obsolete checkpoints still fail with 409. Gateway reanalyse enables world-rule/fact extraction alongside events and state transitions. In the verified path, `extract_world_rules` invokes grounded atomic prose facts; only confirmed facts become pending Canon proposals. Reported/hypothesis/proposed statements are omitted.

## Authority and persistence

`ENTITY_CANDIDATE_VERIFICATION_ENABLED` defaults OFF. Existing legacy analysis remains the default. Explicit ON requires the PostgreSQL repository at Alembic head (0013_objective_intent at this base; HITL columns come from 0011/0012); JSON mode returns 503 for these new APIs. In-memory implementation exists for unit tests only. No additional repository or Story Brain is introduced.

The Gateway requires an active AUTHOR/ADMIN JWT and checks novel ownership before forwarding. It sends its configured tenant plus authenticated author identity, ignoring browser tenant headers. Python requires the configured service token and author/tenant UUID headers on the new routes, and rejects a tenant different from its repository scope. This deployment has one configured repository tenant; dynamic per-request tenant repository selection is not introduced. Service-token possession is a trusted internal boundary, not an author credential. Keep AI service internal.

Missing/invalid public JWT: 401. Foreign owner: 403. Python's existing invalid-service-token response remains 403 (missing token 401), preserving P7's accepted auth contract. UUID/schema/evidence/decision errors: 422; stale Canon/guidance/review: 409; missing audit/revision/brain: 404. Gateway additionally refuses review/continue if the source revision is no longer the chapter head. Python validates the immutable source hash and identity again on review and continuation; the Gateway enforces latest-head author semantics.

Review decisions bind to Canon version and guidance version as well as immutable source and tenant. Inventory contains only reviewed source occurrences; hints never create occurrences. Known Canon entities without source occurrences do not silently enter the downstream inventory. Event participants/locations, fact subjects and relationship transition targets must resolve to reviewed identities. Save/outbox/extraction continue have no Canon approval authority. Canon acceptance remains the existing explicit transactional group approval.

PostgreSQL uses brain-before-analysis row locks for checkpoint CAS, and a shared brain lock for a consistent memory read. Continuation computes proposals without holding a long LLM transaction, revalidates source, then atomically saves proposals + completed checkpoint under version checks. A downstream interruption leaves entities_reviewed and no partial proposals; retries use the frozen inventory. Concurrent continuation may repeat downstream computation, but commits one proposal set and does not rerun entity discovery. No claim of provider exactly-once delivery is made.

Memory excludes pending/rejected proposals, audit/guidance, plans and objectives. Superseded/retired facts/events are filtered and current state is replayed against active provenance without writing the projection. Accepted-proposal provenance preserves immutable source IDs even when an artifact becomes historical. Context-preview remains its existing separate API.

## Selective port provenance

| Reference path | Integrated treatment |
| --- | --- |
| services/entity_pipeline/candidates.py, verification.py | Reused occurrence collection and bounded validation; human review remains mandatory before materialization. |
| application/entity_review_service.py | Reused guidance validation, exact review coverage and materialization; adds replay input version. |
| application/revision_analysis_service.py | Reuses author declaration/evidence helpers; legacy analyze retained, explicit ON dispatches to application/entity_hitl.py. No wholesale replacement. |
| infrastructure/{postgres,in_memory}_narrative_repository.py | Selected guidance/registry/audit methods only; added CAS, tenant/novel scoping, atomic completion and read-only memory support. Existing Canon approval retained, with narrow name resolution for reviewed alias/fact dependencies. |
| infrastructure/orm_models.py + existing 0010/0011/0012 | Maps existing columns, no new migrations. New guidance/audit fields deferred so legacy Canon reads during rollback do not eagerly require HITL columns. |
| services/source_grounding.py, prose_facts.py, core/structured_call.py | Reused exact-source grounding and structured dispatch. Real-provider quality/cost behavior remains untested. |
| api/narrative_routes.py memory/HITL reference | Reimplemented in separate api/entity_hitl_routes.py with stable memory DTO, service/tenant boundary and error contract. Existing revision route reports actual checkpoint status. |
| backend Gateway | Adds owner-guarded audit GET and enables facts in author reanalysis; current latest-revision and Canon evidence checks retained. |
| Pipeline_test/WORKFLOW_CONTRACT.md v1.4 | Absent at integration base; read from the pinned reference. Not copied over integration source. |

## Validation and follow-up ownership

Source/tests are committed before acceptance; the evidence commit records exact clean source SHA, commands/exits, runtime HTTP bodies, authoritative PostgreSQL checkpoints/Canon versions, fake-only configuration and Actions P7/P8 URLs. Historical pipeline evidence and fixtures are preserved. Tests use fresh test-owned PostgreSQL/pgvector and MongoDB and scoped fixture cleanup; pytest temporary output is directed outside tracked historical fixtures.

No provider quality claim, FE mounted IDE acceptance, P3 waiting_for_entity_review support, merge permission or production release is granted here. GPT-6 reviews this delta; FE owner handles mounted Author IDE integration, Core owner retains revision/writer/outbox authority, schema owner owns migration rollout, and product owner retains Canon semantics decisions.

## Semantic hardening after GPT-6 review H-01/H-02/H-03

Reviewed starting HEAD: `07007f2aeae496f70516345614d309675a2daa57`. Historical acceptance evidence remains immutable. This delta does not change the default OFF path or P3 controller behavior.

### H-01: versioned entity-only refresh

POST `/entity-reviews/{run_id}/refresh` takes `{expected_version}`. Gateway applies the same active-owner and latest-revision checks as review/continue. Python retains tenant/novel/chapter/revision/hash and Canon fences; this operation alone permits changed guidance. It reruns discovery/verification, never event/fact/state extraction. Existing JSON audit storage holds the state; no migration is added.

Authors may save resolved partial choices with review `{expected_version, decisions, finalize:false}`. This remains `waiting_entity_review` and creates no proposals. Default `finalize:true` still requires full coverage, preserving the prior missing-decision 422 contract. Save choices before changing guidance. Refresh stores `preserved_decisions` separately from machine decisions and exposes `pending_candidate_ids`; review may submit just pending choices. Explicitly resubmitted author choices may replace earlier choices.

Carry-forward requires the same verified immutable source, Canon version and collector policy; identical candidate ID/surface/absolute offsets/context bounds/verbatim context; compatible machine verdict/type/canonical ID/name/identity quote/status evidence. Confidence and free-text reason are diagnostics rather than identity authority. Retained human choices are revalidated against registry and source. Origins may gain `author_guidance` without changing an occurrence. Changed context or machine identity returns to pending. Missing hints never create occurrences.

Refresh increments review_version once and always returns to `waiting_entity_review`, even when all choices survive. Prior opaque identity IDs survive only when compatible human occurrences still anchor that identity. Newly changed/missing occurrences require review and an explicit final freeze. Identical refresh retries reuse the saved checkpoint; concurrent CAS losers reuse the winner only for the same input version/current guidance. Canon/guidance/source changes during the operation fail closed. Completed downstream batches cannot refresh; start a new analysis to avoid reusing a pending proposal group.

### H-02: frozen identity schema 2 and Canon compatibility

Each frozen entity has `entity_id`, `canonical_entity_id`, type, display phrase, candidate IDs and immutable occurrence evidence (quote, offsets, source hash, revision ID). Known identities retain exact Canon IDs, including homonyms. New identities receive opaque random UUIDs at human freeze, never positional/name-derived IDs. Compatible refreshed identities retain IDs as inventory grows; CAS/replay retains the winning IDs.

The downstream inventory is keyed by identity ID. Names/aliases index sets of IDs. Structured outputs should use exact IDs; unique legacy labels remain compatible and normalize to IDs. Ambiguous labels return 409; unknown references return 422. Shared aliases retain occurrence-specific targets and never globally merge identities.

| Consumer | Compatibility contract |
| --- | --- |
| Event extraction | known_entities is an array of ID/name/type/occurrence records. Participants/locations normalize to IDs; existing list-of-string proposal fields remain. |
| Fact extraction | Subject uses a reviewed ID; proposals use existing subject_entity_id, not an ambiguous subject_entity_name. General facts may have no subject. |
| State generation | Optional inventory/resolver is HITL-only; legacy calls remain valid. Subjects must participate in their event; relationship targets resolve to reviewed IDs. |
| Canon validation | Existing event/fact/state fields support IDs. Optional UUID entity_id on a new entity proposal reserves the frozen identity; malformed UUIDs and existing-ID collisions fail closed. |
| Canon materialization | Explicit-ID roots insert that ID without name upsert. Legacy entity proposals retain behavior. Aliases/events/facts/state use the same frozen IDs. Approval remains explicit. |
| Projection | Exact IDs take precedence; ambiguous name fallback still raises. State/provenance and relationship metadata retain IDs despite shared display labels. |
| Memory | Distinct entity rows, event participants, fact subjects and state/provenance retain IDs. Approved-only filtering remains intact. |

Completed checkpoint retries keep their saved proposals. A pre-schema-2 frozen checkpoint must reconfirm the same human review once before continuation (409 prompts this); no LLM or Canon approval replaces that confirmation. No SQL migration is required. Real-provider quality and mounted FE refresh UX remain separate acceptance.

### H-03: truthful completion outcome

Completion returns `EntityReviewCompletion(proposals, deduplicated)`: first commit false, a transaction observing saved completion true, serial retry true. Provenance/proposals/checkpoint remain atomic. A barrier-forced overlap test asserts DB cardinality and exactly one false/one true response.
