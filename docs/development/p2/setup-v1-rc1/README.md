# setup-v1 RC1 — implementation-ready proposal, not active API

2026-11-07. Technical contract revision **setup-v1-rc1** is frozen for review in `schemas.json` plus `fixtures.json` and hash vectors. This is a preparation package only. No application imports these files, no endpoint accepts them yet, and no production behavior has changed. Owner approval of P2-01 is still absent. Existing draft/preparation/evidence files are retained unchanged; RC1 supersedes their tentative wire names only. Any reviewed contract change requires an explicit revision/new vectors, not a silent change to legacy P1 behavior.

## Fixed technical decisions

1. Reuse the existing idea bootstrap route, services, repository/jobs, Brain and Canon transactions. New callers send explicit `contract_version=setup-v1`, mode and operation key. Requests without this version retain the existing P2-01 legacy blueprint DTO/hash behavior. New envelope uses `setup.declarations` for characters/locations rather than the earlier draft's tentative `setup.characters`; `idea` is not a second source alias inside setup-v1 and is rejected there.
2. New request DTO is strict at top level and every declared nested shape. Required: owned novel UUID, mode, operation key, expected setup version, exact setup text and the three arrays declarations/world_rules/initial_conditions. Arrays/text may be empty while drafting; this does not authorize empty activation. The existing 1 MB Gateway request-body guard remains; no narrative minimum word count or minimum plan length is introduced. Operational limits cannot be raised silently in P2-02.
3. `extract` accepts only exact explicit setup spans or structured declarations; outline, hints and private-note-only names cannot ground a proposal. Hints aid lookup, never supply evidence. It cannot call creative blueprint as a fallback. No-provider free-text extraction fails visibly if unavailable; validated structured declarations can be handled deterministically without inventing an empty extraction success.
4. `blueprint` is a separate creative proposal path. New suggestions remain pending/model_proposed. Review origin labels are `author_declared`, `extracted_explicit`, `model_proposed`, separate from status and source_kind. The third label distinguishes parsed explicit author text from creative invention. This is versioned metadata, not a reinterpretation of P2-01's legacy origin strings or approval.
5. WORLD SETUP consists of reviewed declarations/rules/initial conditions; FUTURE STORY PLAN remains existing story_plans/objectives; CANON HISTORY requires actual immutable prose plus P1 author review. A planned betrayal is never an observed betrayal. No fake revision, entity mention, event, or state-transition row is permitted to make setup authoritative.
6. Immutable setup snapshot is held in existing bootstrap_jobs.result, with snapshot_id equal to the owning job ID, setup version, server-computed hashes, author/tenant, raw source, source_kind/origin and stable proposal IDs. Outline, hints and private settings are separate fields. New text produces a new job/snapshot/version; never edit an accepted source in place. No second persistence system.
7. Setup hash: SHA-256 of compact UTF-8 JSON of the complete structured setup object, sorted object keys, arrays in source order, ensure_ascii=false. Text hash: exact text UTF-8. No silent NFC/case/whitespace normalization. The complete request hash additionally binds normalized optional defaults, mode, locale/settings/private-field changes and CAS input. Preserve separate old hash semantics for unversioned requests. Defaults: locale vi-VN; hints/outline/constraints/private notes empty; preferences retain legacy genre/tone/target_length defaults and absent pacing omitted.
8. Spans use Unicode codepoint offsets, half-open [start,end), exact quote and `/setup/text`. Structured references identify immutable field path plus declaration_id. Parent snapshot/version/hash binds every card. Schema shape validation is insufficient: application must check start<end, exact quote/hash, unique declaration keys, valid subject references, same-snapshot paths and supported field/type mappings.
9. Reuse P1 exact approved UUID/provisional-group selection and opaque reservations; display names never identify a person. New setup provisional scope is SHA-256 of compact JSON `["setup-v1",tenant_id,novel_id,snapshot_id,setup_hash,setup_version]`; author supplies a local label under that server scope. Each entity acceptance chooses exactly one known canonical ID or scoped provisional key. Full entity decision coverage must match persisted group membership. Two Minh characters can have distinct labels/opaque IDs; same-key replay keeps the winning IDs. No automatic cross-source identity carryover by name.
10. Complete dependency groups stay atomic. Readback `card_type` is a UI semantic label, not a new DB proposal type/status: world rules map to existing fact proposals with fact_type=world_rule; entities use existing entity proposals; initial-condition mapping is the explicit owner decision below. Accepted means the existing final canonical/setup materialization decision, never a staging shortcut. No provider/outbox auto-approval.
11. New review wrapper validates setup/review/Brain CAS inside the same authoritative Brain/group transaction before delegating to existing P1 materialization. No preflight-only CAS followed by an unfenced second write. Stale version => 409/reload, changed keyed input/mode => idempotency conflict, foreign/missing scope => established 403/404 semantics. Exact original-key retries return persisted results before stale-version rejection.
12. Owner-scoped `GET /v1/story-brains/{novel_id}/setup` is proposed for server readback. Wrapper review route is proposed as `POST /v1/story-brains/{novel_id}/setup/{snapshot_id}/review`. Public Gateway prefixes/active AUTHOR-ADMIN ownership and trusted Python tenant/service checks are reused. Server assigns scope/status/hashes/IDs; client authority fields are forbidden. Private notes/author_constraints stay owner-only and are excluded from provider/context/log payloads by default. Extract dispatch allowlist: setup + safe lookup hints; creative dispatch may add labelled future outline + public preferences. No private sharing switch is supported in RC1.
13. Initial conditions remain WORLD SETUP. Existing P1 EntityProfilePatch requires an actual chapter cutoff and approved_profile filters against chapters. Never fabricate chapter 1, effective_from_chapter or history to pass that gate. Proposed mapping is reviewed setup_initial_conditions under existing entity JSON + a labelled setup-context adapter, retaining exact source/decision. It needs owner/schema review before materialization; current projection/profile functions must not be bypassed. Until mapping is approved, cards remain pending/unmaterialized, not falsely advertised as ready Canon.
14. New setup snapshots/edits are pre-activation only in this bounded slice. Preserve ALREADY_ACTIVE on new bootstrap; an active-world correction contract is not smuggled into extraction. No-plan entry is valid; real first-chapter bridging is later P2-04. P2-02 cannot claim M-FIRST by creating a synthetic revision.

## Owner decisions, separate from fixed wire contract

| ID | Pending decision | Safe proposed default / consequence |
|---|---|---|
| D1 | P2-01 accepted baseline and permission to begin production P2-02 | BLOCKED / ARGON_PENDING until Argon #91 evidence or explicit owner acceptance of equivalent CI evidence, then owner P2-01 approval |
| D2 | Empty/all-rejected setup activation consent | Fail closed in new setup-v1 until explicit consent API/UX is reviewed; legacy manuscript behavior unchanged. Saving an empty draft is allowed, activation is not inferred |
| D3 | Initial-condition materialization/context mapping | Approve a bounded field allowlist in existing entity JSON with setup provenance; no events/transitions or fake profile cutoff. Must resolve before claiming authoritative initial-condition support |
| D4 | Any future intentional sharing of private author constraints/notes | Excluded from provider/context by default; no RC1 sharing override. A later policy/DTO revision needs explicit approval |
| D5 | Size/retention and sensitive-source lifecycle beyond existing guards | Keep existing 1 MB Gateway limit and owner-only persisted source; define retention and deletion policy before widening limits or exposing readback |

D1 blocks production start. D2/D3 are reviewed policy gates for activation/materialization, not permission to weaken P1. Technical schema examples are not owner sign-off. The next PR must disclose a backend-only intermediate limitation if any mapping/UI remains unresolved.

## Bounded file ownership and implementation sequence after D1

Codex is the sole owner of every row; no delegated/Gemini file work.

| Area / expected file | Planned bounded change | Tests to accompany it |
|---|---|---|
| ai-service/api/schemas.py, narrative_routes.py | Versioned setup DTO dispatch + readback/review wrapper; preserve legacy routes | RC1 positive/negative payloads, unknown fields, hash/scope errors, legacy compatibility |
| application/bootstrap_service.py | Distinct extract/blueprint; immutable admission/source; fail-closed retry | T01-T03/T06-T08, provider tripwires and malformed output |
| application/entity_review_service.py + existing domain identity helpers | Adapt source envelope to setup without fake revision; same UUID/reservation/full-group semantics | T04/T05/T08, homonyms/foreign IDs and exact decision coverage |
| infrastructure/postgres_narrative_repository.py + domain ports | Snapshot version admission and review CAS under existing locks; atomic proposals/job; owner readback | Real PostgreSQL concurrent keys/version races, rollback/no mutation, stale source |
| Existing Canon projection/profile/context adapters | Only reviewed setup rule/entity/initial-condition mapping, source labels/private exclusions | T09, pending/rejected exclusion; legacy projection/profile/HITL regression; no P2-04 bridge |
| backend AI Gateway routes/controller/client | Active-owner forwarding of typed setup/readback/review, trusted scope | T10, anonymous/foreign tenant/novel, service boundary |
| web/src/features/ai-copilot/author-memory-api.ts | Shared typed client/readback contract preparation; no alternate editor/Canon store | Reload and 409 behavior when mounted in bounded existing UI; full studio is later P2-05 |
| ai-service/tests + backend existing test layout | Import synthetic scenario intent from this docs package into executable tests only when production exists | T01-T12, fake providers and disposable DBs; do not label fixture validation extraction PASS |

Do not modify Writer/revision/outbox production behavior or implement P2-03/04/05. Relevant P1 tests are regression gates, not a rewrite backlog. Next branch: `codex/p2-02-setup-provenance`, from the owner-approved fresh integration SHA only; it has not been created in this preparation task.

## Migration analysis (source-based, not SQL runtime proof)

Existing schema has scoped StoryBrain uniqueness `(tenant_id,novel_id)`, durable bootstrap job UUID/tenant/novel fields, JSON result/options, existing AnalysisRun/proposal IDs and complete-group Canon authority. Initial plan: **no migration**.

- Reuse the scoped advisory admission -> Brain -> job lock order for setup head/version allocation and provider reservation. Under that lock, determine the latest valid setup-v1 snapshot version for this novel from existing jobs and require expected_setup_version; reserve the next version atomically. A second request with expected 0 must see the winner/version 1 and fail 409 before provider work.
- Snapshot text/hash/version never mutate after reservation. A changed source creates another job/version. Review/activation must bind the current source/version and cannot use old accepted decisions against a new snapshot. Failure leaves an auditable immutable snapshot; no new crash-recovery guarantee is inferred from current fail-closed running reservations.
- Existing Canon transactions must revalidate the setup fence under their Brain lock; scope/review checks must not be committed independently of materialization. Existing legacy calls stay on their old compatible path.
- Readback can query scoped setup-v1 jobs/JSON until a real query-plan/durability test demonstrates need for a small additive index/constraint. No performance claim, schema redesign or new store is justified by this source inspection. If monotone/version/query invariants cannot be guaranteed, stop and propose the minimum migration with upgrade/downgrade/data-compatibility tests; do not silently omit CAS.

No Alembic/Node migrations are included now. D3 mapping and concurrency still need real PG proof during the approved implementation.

## Fixture validation versus future acceptance

`schemas.json`: Draft 2020-12 request/readback/review and identity/source definitions. `fixtures.json`: **22 DTO shape examples**, **1 canonical setup/text hash vector**, **2 span vectors**, **12 proposed runtime scenarios** T01-T12. `validation-result.json` records exact content hashes and tool version. No real API, database, extraction, identity allocation, materialization or Writing flow is exercised by this package.

Reproduce in a temporary tool directory (no application dependency edits):

```powershell
python -m pip install --target "$env:TEMP/p2-setup-v1-schema-tools" -r docs/development/p2/setup-v1-rc1/requirements-validation.txt
python docs/development/p2/setup-v1-rc1/validate_fixtures.py --tools "$env:TEMP/p2-setup-v1-schema-tools"
```

Observed: validator 4.23.0, 22 schema expectations PASS (9 valid, 13 intentionally invalid), 1 hash/2 span vectors verified; all 12 runtime scenarios remain **NOT_RUN_NOT_IMPLEMENTED**. A first sandbox invocation could not import the host-temp installation because sandbox TEMP differs; the host-temp invocation above succeeded. This is an environment/tool-path correction, not a P2 runtime test failure or runtime PASS.

Scenario coverage: explicit setup; outline/hint/private names excluded; creative proposals pending; author edits/rejects; homonym IDs; idempotency/concurrency; stale source version; pending/missing review; approved rules without history; tenant/owner readback/privacy; unchanged P1 manuscript path; no-plan entry. T12's actual first-save M0/M-FIRST test is explicitly a later P2-04 composition dependency, not P2-02 scope or an implementation here.
