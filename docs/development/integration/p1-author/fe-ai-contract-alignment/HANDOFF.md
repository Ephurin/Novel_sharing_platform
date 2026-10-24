# P1 FE / AI contract handoff

Base: dd2f8003b0ad94e6097819cdca0249aa591f54fa. Draft PR #64 targets integration/p1-author.
Source SHA, evidence SHA and exact-source results are recorded separately in evidence/REPORT.md.
The proposed contract was published in 4654c8cf before API edits. No web production source changed.

| Finding | Backend disposition | Remaining owner gate |
|---|---|---|
| B1 | BACKEND_READY: additive review_schema_version=1 DTO, explicit defaults, approved scoped registry | FE_ACTION_REQUIRED: consume typed DTO and registry UUIDs |
| B2 | BACKEND_READY: accepted H-04 identity mechanism preserved | FE_ACTION_REQUIRED: explicit ID picker / human group controls; remove name .find() |
| B3 | BACKEND_READY: partial/review/refresh/freeze/continue unchanged, protocol tested | FE_ACTION_REQUIRED: partial save and actual refresh action |
| B4 | BACKEND_READY: approved active transitions; correction identity/source validation | FE_ACTION_REQUIRED: render authoritative history, separate proposal approval |
| B5 | BACKEND_READY: validated edited group atomically persists edits | FE_ACTION_REQUIRED: send full payloads, show validation errors, preserve unsaved edits |
| B6 | BACKEND_READY: public owner-checked exact-ID relationship lock / correction with Brain CAS | FE_ACTION_REQUIRED: exact subject/target selectors and lock controls |

These labels describe backend/API readiness subject to independent review, not mounted UI acceptance.
No finding is marked ACCEPTED on behalf of GPT-6. Gemini owns the subsequent mounted S09–S11 gate.

## Endpoints and envelope

Browser base `/api/v1/ai`; Python internal base `/v1`. Gateway returns `{data: ...}` and
forwards service credentials plus configured tenant and authenticated author headers. Browser
tenant headers are ignored; never send service tokens from the UI. All public routes enforce
active AUTHOR/ADMIN role and novel ownership under the existing administrative policy.

| Method | Public suffix | Request | Data result |
|---|---|---|---|
| GET | /story-brains/{novel}/entity-reviews | — | EntityReview[] (waiting/frozen) |
| GET | /story-brains/{novel}/entity-candidate-audits/{run} | — | EntityReview, including completed |
| GET | /story-brains/{novel}/entity-guidance | — | version, entries, chapter_review_enabled |
| POST | /story-brains/{novel}/entity-guidance | expected_version, entries | persisted version and entries |
| POST | /story-brains/{novel}/entity-reviews/{run}/review | ReviewRequest | EntityReview |
| POST | /story-brains/{novel}/entity-reviews/{run}/refresh | expected_version | refreshed EntityReview |
| POST | /story-brains/{novel}/entity-reviews/{run}/continue | {} | analysis_run_id, status, proposal_count, deduplicated |
| GET | /story-brains/{novel}/review-queue | — | pending proposals |
| POST | /proposal-groups/{group}/accept | GroupApproval | canonical_artifact_ids, brain_version, status |
| POST | /proposals/{id}/edit-and-accept | expected_brain_version, edited_payload, reason? | canonical_artifact_id, brain_version, status, proposal_id |
| GET | /story-brains/{novel}/memory | — | ApprovedMemory |
| POST | /story-brains/{novel}/events/{event}/corrections | EventCorrection | pending event/transition proposals (201) |
| POST | /story-brains/{novel}/relationship-locks | RelationshipLock | status, relation, locked, exact endpoint IDs, brain_version |

Exact TypeScript interfaces and executable decision builders: [contracts.ts](contracts.ts).
Use top-level memory.brain_version (number); legacy metadata version may be a string.

## Entity review protocol and examples

Never generate occurrence IDs. Load candidates and machine decisions from the checkpoint.
Always keep machine decisions separate from reviewed_decisions. Pending IDs identify occurrences
without a durable human decision. known_entities is current approved registry data;
registry_brain_version identifies it and may differ from the checkpoint's brain_version.
That difference requires reload/reanalysis, not automatic substitution of identities.

1. Save only resolved human choices using finalize=false. Omit undecided occurrences; an
   unresolved decision itself cannot freeze or continue. Unsubmitted local edits are not durable.
2. Save guidance using its own GET version. New hints are discovery instructions, never Canon.
3. POST refresh with the checkpoint review_version. Compatible choices are carried forward;
   new/changed occurrences return pending. Reload response versions and pending IDs.
4. Review remaining occurrences, finalize=true. All occurrences must resolve or be rejected.
5. Frozen entities contain stable entity_id and occurrence mappings. These are reserved IDs,
   still not approved Canon. Continue consumes this inventory and creates pending proposals.
6. Approve complete proposal dependency groups separately, then reload memory.

Example partial review (replace symbolic values from actual GET responses):

```json
{"expected_version":1,"finalize":false,"decisions":[{"candidate_id":"<immutable occurrence ID>","verdict":"entity","entity_type":"PER","canonical_name":"Minh","canonical_entity_id":"","provisional_identity_key":"<checkpoint scope>/doctor","initial_status":"Unknown","reason":"Author confirms doctor identity"}]}
```

For the other Minh use `<same checkpoint scope>/driver`. For repeated occurrences of the
doctor reuse `/doctor`. These are explicit human choices; the label is not an identity UUID.
The server binds the scope to tenant/novel/revision/hash/checkpoint, validates group name/type,
reserves an opaque UUID at freeze and reuses it across compatible refresh/retry/reload.
Never reconstruct the scope from a different checkpoint or assign machine grouping as authority.

Existing canonical selection instead sets canonical_entity_id to the explicitly selected registry
UUID, canonical_name/type to that registry record and provisional_identity_key to empty string.
Aliases need identity_quote grounded in the immutable source. Do not select by name or first match.
Use the Decision interface/builders to retain source-grounded fields, including status quotes.

Refresh: `{"expected_version":2}`. Freeze: `{"expected_version":3,"finalize":true,"decisions":[...]}`.
Previously saved compatible decisions are merged, so submitting only remaining occurrences is valid.
Continue: `{}`. On timeout reload checkpoint before retry. Identical persisted review requests replay;
continue deduplicates persisted downstream completion. Completed checkpoints are read through audit GET.

## Edited Canon groups

```json
{"proposal_ids":["<event proposal UUID>","<fact proposal UUID>","<other dependency IDs>"],"expected_brain_version":1,"edited_payloads":{"<event proposal UUID>":{"<all original payload fields>":"preserved","summary":"Author edited summary"},"<fact proposal UUID>":{"<all original payload fields>":"preserved","fact_value":"Author edited fact"}}}
```

Construct each replacement as `{...proposal.payload, summary: newSummary}` or
`{...proposal.payload, fact_value: newValue}`. This is a full replacement, not JSON Merge Patch.
Omit unedited proposal IDs from edited_payloads, but include every dependency ID in proposal_ids.
Unknown top-level fields and unknown edited IDs fail; empty replacement objects are invalid.

Editable fields: event summary/event_type/participants; fact fact_key/fact_value/subject_entity_id;
state transition attribute_key/new_value/entity_id; entity canonical_name/normalized_name.
Entity label normalization must equal canonical_name.casefold(); entity type and frozen UUID
remain immutable. For compatibility an omitted reserved entity_id is restored, never reallocated.
Alias edits and other field changes are unsupported and explicitly rejected.
Changed entity references require exact approved scoped or submitted reserved identity UUIDs.
Legacy name-bound fact subject changes require an identity-safe correction proposal; they cannot
be overridden by an ignored subject_entity_id. UUIDs, event/fact linkage, evidence, source type,
chapter, revision/hash, analysis/checkpoint and supersedes provenance cannot be edited.

All selected proposals and edits validate in the transaction, followed by projection. Any failure
rolls back artifact rows, decisions and Brain. Success persists exact payloads (except documented
reserved-ID restoration) and increments Brain once. Retry/parallel loser returns 409 without
duplicate Canon. On conflict reload Brain and queue; do not silently resubmit a visible edit.

## Corrections and relationship locks

memory.transitions contains only persisted transitions tied to approved active events/facts.
transition_id and source IDs link to memory.events/facts and accepted provenance; no synthetic
historical transition is generated from current_state. Pending/rejected/superseded sources are
excluded. Preserve immutable provenance when presenting correction history.

```json
{"expected_brain_version":2,"replacement":{"event_type":"meeting","summary":"Author correction","participants":["<exact entity UUID>"]},"transitions":[{"entity_id":"<same UUID>","attribute_key":"health","new_value":95}]}
```

Omit chapter to retain original source chapter. Explicit mismatching chapter/provenance is invalid.
Participants must resolve unambiguously; new UI must use UUIDs. Superseded/retired events cannot be
corrected again. Correction produces pending proposals only, followed by separate edited/group
Canon approval. The initial request never makes a correction approved memory.

```json
{"subject_entity_id":"<approved A UUID>","object_entity_id":"<approved X UUID>","relation_type":"ally","expected_brain_version":2}
```

Relationship lock is an explicit author Canon correction. It atomically creates/replaces and locks
the exact pair, preserves existing relationship provenance and increments Brain once. A→X and B→X
are independent even with equal labels; likewise X→A/X→B. relation_type length is 1–80 and nonblank.
Repeated old-version requests conflict without mutation. Correct an existing lock using this same
route with a fresh expected version and explicit new relation_type. New extraction cannot overwrite
a conflicting exact-pair author lock. A legacy name-only lock resolves only when both endpoints are
unique; ambiguity fails closed and preserves the original lock. Existing relation_metadata carries
the complete authoritative pair; no migration or parallel storage is needed.

## Errors, fixtures and remaining gates

401: login/session; 403: owner/tenant scope; 404: missing novel/audit/event/proposal; 409: stale
Brain/revision/checkpoint or decided proposal; 422: invalid identity, payload, source/projection.
Some legacy group membership validation retains 400. Display server detail; do not convert a
successful HTTP envelope into Canon before reloading approved memory. Gateway maps Python
errors; service token endpoints are not public browser endpoints.

Executable fixtures: ai-service/tests/test_p1_contract_alignment.py (initial/partial/refreshed/frozen/
completed DTO, exact edited summary/fact, invalid provenance/reference, complete group, concurrent
acceptance, late transaction rollback, foreign registry, correction history, exact-pair lock/CAS and
ambiguous legacy lock). Existing H-01–H-05 suites remain regression gates. Actual Node→Python→PG
and Mongo checks extend backend/src/modules/ai/p1-memory-entity.live.test.ts.

FE must implement the missing controls without name-keyed identity inference. Gemini then runs
mounted browser tests with screenshots/network/DB readbacks on the accepted integration SHA.
This task does not claim mounted Author IDE E2E, live providers, deployment or production readiness.
