# Mounted Author IDE compatibility audit

Audited source: **dd2f8003b0ad94e6097819cdca0249aa591f54fa**, read-only, 2026-10-24 Asia/Saigon. IMPLEMENTED means a real mounted source control/call path exists; it never means browser PASS. Every browser/runtime observation in this audit is NOT_TESTED. PARTIAL marks a present path with a contract gap; MISSING marks an absent required interaction. Do not use a mock to complete it.

Routes: `web/src/app/router.tsx` mounts `/author/ide` → `AuthorWritingIde`; chapter deep links redirect with novelId/chapterId. AuthorWritingIde.tsx:1948 mounts AuthorMemoryPanel, which mounts EntityExtractionReview (:116), AuthorMemoryRepair (:117) and event/proposal review controls. All references below are repository-relative at the pinned merge.

## S09 and S11

| Interaction | Status | Actual path and boundary |
| --- | --- | --- |
| Save draft with CAS | IMPLEMENTED | AuthorWritingIde.tsx:243,452 → useDraftPersistence.ts:43 → novel-api.updateChapter expectedVersion → Core writer. Serial queue, local recovery and explicit 409 reload exist. Browser concurrency/Undo NOT_TESTED. |
| Receive immutable revision/hash | PARTIAL | Save hook retains draftVersion; history/snapshot API in ai-copilot-api.ts:206–225 supplies immutable revisionId/contentHash. Panel bootstrap and reanalyse use revision APIs. Not a unified save-to-analysis status receipt in the editor. |
| Trigger manuscript analysis | IMPLEMENTED | AuthorMemoryPanel.tsx:57 bootstrap snapshots saved chapters; :120 reanalyse newest saved revision; author-memory-api.ts:21 sends a fresh action idempotency key. |
| Observe async state | PARTIAL | Panel :26–34 polls extraction status/job/review queue. Outbox delivery COMPLETED is not entity review completion; no complete entity-stage progress model. |
| Stale CAS/revision recovery | PARTIAL | Draft hook :50–55 and IDE :906 preserve local edits and offer reload. Gateway entityReviewController checks latest immutable revision. Entity UI only surfaces generic errors; it does not resolve stale review/source conflicts. |
| Approved memory vs proposals | IMPLEMENTED | Separate approved-memory and memory-review queries, cards keyed by entity_id; Canon acceptance button separate from extraction. New memory DTO incompatibility affects correction, below. |
| Close/reopen chapter/project | IMPLEMENTED | Router deep link, getChapter/listChapters, draft initialization/recovery, revision history, leave-page blocker in IDE :905–908. Actual reload/continuation NOT_TESTED. |
| Reload pending checkpoint | PARTIAL | EntityExtractionReview.tsx:24 polls /entity-reviews; response assumptions can fail on an initial checkpoint (B1). Completed audits are not listed there; /entity-candidate-audits exists but has no audit-history UI. |
| Preserve provisional mapping | MISSING | No provisional scope/key fields or group/ID display. Server persists mappings, but browser cannot create/distinguish/edit them. Saved object spreads are not an identity UX. |
| Resume correct workflow | PARTIAL | Bootstrap resume exists; entity /continue exists. Refresh/partial-save are wrong/missing (B3). Server stale fences/dedup remain authoritative. |
| Separate Canon/proposal states after reload | IMPLEMENTED | Queries remain separate and re-fetch. Identity, lock and version presentation is incomplete; mounted reload assertions pending. |
| Avoid duplicate extraction/commits | NOT_TESTED | Server CAS/dedup accepted; UI reanalyse creates a new action key intentionally. Browser double-click/reload/retry behavior needs distinct input/run and durable cardinality assertions. |

## Entity review interactions (D2)

| Interaction | Status | Evidence |
| --- | --- | --- |
| Candidate/context/offset display | PARTIAL | EntityExtractionReview.tsx:64–121 groups and details exist, but initial DTO assumptions can crash rendering (B1). |
| Occurrence decisions | PARTIAL | Per-occurrence entity/not_entity selector exists (:114); identity assignment is still group/name based. |
| Existing canonical ID selection | PARTIAL | :105 uses known_entities.find(e => e.name === name); no ID picker. A homonym can select the first matching identity. Registry is not in the current raw audit DTO. |
| Create/reuse provisional group | MISSING | Decision/Review interfaces and controls have no provisional_identity_key/scope or group membership controls. |
| Distinguish two new same-name people | MISSING | Group key :67 is surface/name/type/verdict/canonical ID; both new people collapse into one UI group. Backend refuses missing human provisional keys, rather than merging. |
| Add guidance | IMPLEMENTED | Hint textarea, CAS guidance save :31–41. Missing names do not create source evidence on the server. |
| Refresh entity stage | MISSING | Stale-labelled “Chạy lại riêng bước entity” still posts /continue (:129), not /refresh with expected_version. |
| Save partial choices/carry-forward | MISSING | Save is disabled until all candidates chosen; no finalize:false request. Compatible carry-forward exists server-side but is not correctly driven by this UI. |
| Review changed/new occurrences | PARTIAL | Occurrence controls exist, but no pending_candidate_ids presentation or valid refresh workflow. |
| Freeze | PARTIAL | /review request exists, but raw machine/new choices lack mandatory provisional key; positive new identities will reject 422. |
| Continue event/fact extraction | PARTIAL | /continue exists; valid frozen known-ID checkpoint can continue. It cannot repair missing author grouping or stale guidance. |
| Separate Canon approval | IMPLEMENTED | Panel :125–135 explicitly accepts a dependency group; rejection exists. Edited payload semantics are incompatible (B5). |

## S10 correction and locks

| Interaction | Status | Evidence |
| --- | --- | --- |
| Contradiction presentation | PARTIAL | Panel :71–83,152 calls /author-operation check_consistency and displays description/quote. Python narrative_routes.py:641 iterates names/status phrases; findings lack canonical identity IDs. Homonym attribution and dynamic-state semantics need a separate reproduced S10 gate. |
| Propose event correction | PARTIAL | Panel :85–92 and EventReview :246 exist; memory.data.transitions is absent from ApprovedMemory response (B4). |
| Explicit accept/reject | PARTIAL | Real controls exist; changed group payload may be ignored by current API (B5). Never count a visually edited proposal as accepted until SQL payload is checked. |
| Exact-ID relationship correction | MISSING | No call from mounted IDE to the trusted-service relation override API; no ID-pair/lock editor. Story-context SQL character relationship pages are a different model, not narrative Canon lock control. |
| Locked facts/relationships | PARTIAL | Backend locks exist, but mounted memory type omits lock metadata/current_state/relations and there is no lock/unlock UI. |
| Canon version updates | IMPLEMENTED | Summary is polled and approval uses expected_brain_version; refresh invalidates queries. Browser version increments/conflicts pending. |
| Wrong identity negative check | NOT_TESTED | Backend rejects ambiguous legacy/unknown ID references. UI canonical .find and identical labels prevent reliable intended-identity selection. |

## Blocking contract findings and owners

1. **B1 — Review DTO mismatch (FE/API owner):** initial analyze audit has no reviewed_decisions/known_entities. list_entity_reviews (postgres repository :2406) returns raw audit; Gateway forwards it unchanged. EntityCheckpoint :62 unconditionally calls reviewed_decisions.map; :105 assumes known_entities.find. This is a source-confirmed mismatch, not a browser-observed crash. Fix defaults/registry contract explicitly.
2. **B2 — Human identity authority absent (FE owner):** canonical name .find picks the first homonym, no explicit ID picker/provisional group controls, and new positive review requests have no scoped provisional key. Display ID/context and explicit group membership are required; do not invent keys from machine group labels to bypass review.
3. **B3 — Refresh/partial save (FE owner):** UI calls /continue when guidance is stale and never sends finalize:false or /refresh. Backend’s preserved_decisions/pending_candidate_ids cannot substitute for missing UX.
4. **B4 — Correction DTO (FE/API owner):** author-memory-api.ts:6–8 expects top-level transitions; entity_hitl_routes.py:47–60,100–106 returns current_state/relations/provenance, without transitions. Panel :89 reads memory.data?.transitions.filter, so an existing memory response cannot satisfy this correction code. Agree on a supported correction input; do not fabricate provenance.
5. **B5 — Edited proposal acceptance (Core/API + FE owners):** Panel :131 sends edited_payloads to group accept. Gateway :442 forwards it, but ProposalGroupAcceptRequest (api/schemas.py:57) declares only IDs/version/reason; narrative_routes.py:843 passes no edits. Pydantic default extra-ignore drops edits. A browser test must verify the exact edited value in Canon; do not treat HTTP 200 as proof. Use an agreed existing edit contract or separately reviewed correction; no repair was made here.
6. **B6 — Exact-ID author lock/remediation UI (FE/Core owners):** trusted-service override is identity-safe and rejects ambiguous names, but no mounted control/public Gateway correction route exists. Ambiguous legacy locked rows require explicit remediation and remain fail-closed. No bypass with legacy graph endpoints.

## Legacy consumers (D5)

| Call path | Reachable from audited mounted P1? | Risk / conclusion |
| --- | --- | --- |
| GET /v1/enhanced/kb/{story} → NarrativeApplicationService.get_snapshot → Postgres.export_snapshot (:986) | No call found in AuthorWritingIde/MemoryPanel/API clients | Export indexes entities by name.casefold and collapses homonyms. Retain as separate legacy debt; no speculative refactor. |
| POST /v1/ai/graph/related → related_entities(default_story) → get_related_entities (:901); get_story_context (:929) | No call found in mounted P1 clients | Name-based relation endpoints and default_story scope are unsuitable for identity-specific Canon reads. Do not use to fill missing memory UI. |
| IDE generation/context preview → ai-copilot-api.fetchContextPreview → Gateway → WritingService.preview_context → Postgres.get_structured_context (:1605) | Yes | Uses entity_id list/state map, confirmed filters and revision cutoff. character_name is a prioritization label, not first-ID assignment. ContextScopeBuilder :71–77 adds all matching IDs. Browser duplicate-name context readback NOT_TESTED; no observed collapse asserted. |
| MemoryPanel → /memory | Yes | Approved-only identity DTO, ID-keyed cards; does not use export_snapshot or legacy JSON KB. Rendering/DTO gaps above remain. |
| MemoryPanel consistency author-operation | Yes | Name/status text heuristic, no ID-bearing findings; treat homonym correction attribution as blocked until reproduced/clarified. Not an H-04/H-05 Canon materialization regression claim. |
| /author/context → story-context-api → /novels/:id/characters and /character-relationships | Separate mounted page | Platform SQL author notes are not approved narrative entities/locks. No demonstrated synchronization; do not count them as Canon approvals. |
| NARRATIVE_REPOSITORY=json | Not in prescribed stack | New HITL APIs require PostgreSQL. Legacy JSON KB remains name keyed and is unsuitable as duplicate-name canonical storage. Never switch adapters to pass a missing UI test. |

Existing `web/tests/author-ide.browser.test.mjs` mounts a component fixture and mocks Story Brain/consistency routes (:105 onwards). `draft-persistence.browser.test.mjs` mounts a hook fixture. Both write historical evidence paths. They are diagnostic regressions, not the required real Vite/router/Gateway/AI E2E, and must not be run unmodified to overwrite old evidence or claim S09–S11 acceptance.
