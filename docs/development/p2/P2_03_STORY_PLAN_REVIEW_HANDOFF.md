# PR #98 — F-01 / F-02 / F-03 review closure

Current review request: [comment6718792330](https://github.com/Ephurin/Novel_sharing_platform/pull/98#issuecomment-6718792330). This section supersedes the initial policy/results below; historical handoff and evidence remain unchanged.

- Base reverified: `f20d0df38a90f5a61d1ac6472c0152d828697117`.
- Previous delivery: `9ecb2be961d339bac692575a906a7f5f4b839f3e`.
- Branch: `codex/p2-03-story-plan-core`; same Draft PR #98.
- Tested implementation: `caacaf67dfc06e4709d42e0c87219f33d86ba6f4`. CI checkout `3b5a7da356d68c80f80f005de621e8074986eef6`; source/checkout tree both `071b2c1e0dee9ed18bcfed62ca0a8764f0675682`. Final delivery adds documentation/evidence only; its SHA and rerun links are in PR metadata.
- No new migration:0017 remains unchanged. No live provider, deployment, merge or P2-04 work.

## F-01 — stable future-event cards

Replaced line-splitting reconstruction with keyed event cards. A new UUID is allocated only by Add Event. Text edits, removal of another card and accessible move buttons address objective_id/event_id, preserving each event's participant object and all other IDs. Chapter reordering retains objective/event IDs and dependencies. Empty text stays on its card until explicit removal. Confirmed UUID references display as IDs; optional-null name hints display as unresolved, never as a guessed Canon identity.

Ordinary save/new-root requests cannot reuse a known removed event ID absent from their explicit source snapshot (409 FUTURE_EVENT_ID_REUSED). A deliberate historical fork can restore that snapshot's original event identities; this is an explicit restoration, not reassignment of a removed ID to a new card. Legacy objective metadata is excluded from this identity registry, avoiding accidental adoption or parsing of legacy-private fields.

Mounted Chromium tests retain the original coverage and add three-event first/middle deletion, text editing, up/down moves, chapter reordering, new/unsaved cards,409/reload and exact submitted/read-back IDs/participants. The backend SQL test persists the same transformations, verifies history is immutable and rejects reuse of both removed IDs. Real Gateway restore also preserves an explicitly confirmed World Setup participant UUID. Browser HTTP is mocked; real Gateway/database checks are separate.

## F-02 — truthful archival projection

Owner readback now includes effective_status, snapshot_status, is_historical and can_save/can_activate/can_fork/can_archive. The original receipt's snapshot_status is immutable; status remains the stored lifecycle field; effective_status projects append-only delete receipts onto their exact source snapshot. A source targeted by delete is archived, the delete receipt is a tombstone, and a skip receipt is skipped. Archival is snapshot-specific, not a cascade across other snapshots/branches. Historical deletion does not retire an independently active descendant. Deleting the selected active snapshot clears its pointer atomically.

Archived source save/activate/re-delete is rejected under the same parent lock and head CAS (409 PLAN_SOURCE_ARCHIVED). Tombstone/skip content cannot be edited/activated/forked (409 PLAN_SOURCE_NOT_EDITABLE); skip can still record explicit no-plan behavior. Restoring an archive requires an explicit action=fork, current expected_plan_version, source membership/intent CAS and a fresh operation key. It creates a new draft ID/version; the original remains archived. UI labels archived/history/receipt states and explains retention. Archived sources/receipts cannot be edited or activated directly; unarchived history stays read-only for editing and offers explicit stored-version activation/fork per server capabilities. The archived restoration action is named **Khôi phục thành bản nháp mới**.

Exact-key retry returns the original immutable command receipt, including an old activation result, without changing current effective state or active pointer. Same key plus changed body conflicts; a fresh delete key against the archived source is rejected. Callers must read owner state after a command/replay, as the mounted UI does. Concurrent activate/delete has one winner; the stale loser cannot resurrect or partially supersede anything. Tests cover active, inactive draft and historical sources, late replay, explicit restoration and reload. No physical plan/objective deletion or source-content rewrite is introduced.

## F-03 — legacy coexistence and ownership matrix

The global tenant+novel head clock still includes legacy rows, but the new owner API returns only the actor's P2 snapshots. Legacy IDs, outline, goals, private settings and objective metadata are not serialized or adopted. Creator-NULL/foreign legacy rows no longer prevent a current Gateway-authorized owner from creating a new P2 chain at the correct global head. A foreign historical P2 creator still blocks the chain, including historical/archived P2 rows; source-based commands never borrow foreign authority.

| Source / actor | New P2 draft | New P2 readback | Switch / source action |
|---|---|---|---|
| Inactive legacy, creator NULL | Allowed at global head | Legacy content hidden | New owned P2 may activate; legacy unchanged |
| Inactive legacy, foreign creator | Allowed at global head | Legacy content hidden | Legacy source edits/forks denied; no adoption |
| Legacy owned by same actor | Allowed | Legacy still uses existing read API, not new P2 DTO | Owned legacy active pointer may be superseded; content/creator preserved |
| Active legacy, NULL/foreign creator | Allowed | active_plan_unavailable=true, no private content/ID | Activate/skip fails409 LEGACY_ACTIVE_PLAN_HANDOFF_REQUIRED; no foreign lifecycle mutation |
| Existing P2, same creator + current Gateway owner | Allowed under CAS | Owned historical/current state available | Archive/restore rules above |
| Existing P2, different creator (e.g. transfer) | Denied404 | Denied404 | No implicit reassignment, even if source archived |
| Nonowner / forged ADMIN | Gateway denies; direct service source-author checks remain | No P2 bypass | Service/tenant/actor guards unchanged |
| Real ADMIN reading legacy by ID | No new P2 write authority | Pinned read-only legacy exception retained | Cannot use that exception for P2 or writes |

Hidden legacy active state requires a deliberate handoff before replacing its pointer. A different P2 creator requires a deliberate lineage handoff. There is no public reassignment endpoint in this PR: owner must authorize old/new actors and scope, preserve/export source/audit and backup, then approve a separately reviewed audited retirement/handoff operation with CAS/readback evidence. Do not rewrite created_by or disable scope guards. Until that operation is approved, APIs remain fail-closed while the allowed new legacy-coexistence draft remains usable for planning.

Legacy active-plan HTTP reads scope only the actual active row, so unrelated NULL legacy rows cannot deny a new owned active P2 read. Public context preview authorizes the selected active source before exposing goals, including legacy active sources; NULL/foreign legacy goals cannot leak through context. Privileged internal Writer repository calls remain unchanged. Legacy read-by-ID ADMIN delegation remains server-generated, service-authenticated, read-only and legacy-only. Browser-forged headers never set it.

## Regression scope and evidence

Changed files: StoryPlanEditor.tsx; mounted browser tests; plan_edit.py; legacy_scope active-only support in plan_routes.py; active/context HTTP scope in narrative_routes.py; new test_plan_review_fixes_postgres.py; existing real Gateway acceptance and feature workflow. The strict request DTO and migration0017 are unchanged. No second store, Canon materializer or Writer engine was added.

[New source-pinned evidence](p2-03-review-fixes-evidence/README.md), raw archives, verifier, SQL digest files and CI job conclusions are separate from original p2-03-evidence. All source/model/raw SQL data is synthetic. Operational privacy logs are checked separately from fixture readback logs. Do not sum overlapping suites or pool intermediate SHAs.

Observed failures are retained: initial3bd9cb04 had82 PASS/1 FAIL because a test expected missing optional participant fields instead of canonical null fields;7aa7d290 had82 PASS/1 FAIL because a shallow test request aliased a prior receipt's event list. Canonical fixture expectations and deep request copies fixed those tests without weakening any assertion/guard. The optional-null finding also corrected the actual unresolved-hint label. Pre-runtime missing-log scan failures are NOT privacy PASS. Local full mounted browser7 PASS, affected legacy/autonomous/SQLite12 PASS, web/backend typechecks PASS; real PG/Mongo acceptance comes from disposable CI, not mocks.

## Exact-source review acceptance

**Verdict: READY_FOR_OWNER_REVIEW.** Request independent GPT-6 re-review; keep Draft and do not merge. Every result below belongs to implementation caacaf67; overlapping suites are separate.

| Gate | Actual result | Evidence |
|---|---|---|
| P7 | PASS 3/3 jobs | [42462486729](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42462486729) |
| P8 | PASS 7/7 jobs | [42462486679](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42462486679) |
| P2 Feature | PASS 1/1 job | [42462486620](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42462486620) |
| Selected real PostgreSQL | PASS 84, SKIP 0; includes 12 new review cases | a16.xml/log |
| Full PostgreSQL | PASS 282 / SKIP 8 / deselected 447 | P8 postgres log |
| Full non-PostgreSQL | PASS 415 / SKIP 32 / deselected 290; 6 subtests separately | P8 unit log |
| Focused setup/P1 services | PASS 46 | focused.xml/log |
| P1 backend guard/accept/persistence/lifecycle | PASS 11 /15 /5 /25 respectively | P8 backend log |
| Gateway forwarding / real P1 save / real setup-plan | PASS 19 /1 /1 respectively; setup-plan has74 HTTP outcomes | runtime logs/readbacks |
| Mounted Chromium | PASS 7, HTTP mocked | setup-browser.log; event/archive screenshots |
| Offline artifact verifier | PASS, exit0 | verified-summary.json |

Disposable PostgreSQL16.15 / pgvector0.8.7, MongoDB7.0.45, database p2a, fake/fake providers. Migration remains0017_plan_edit. The existing real SQL proof still rejects duplicate-active upgrade and preserves two legacy rows through upgrade/down/re-upgrade. P8 matched-PG16 backup/restore and full23-table schema/data parity pass; the deliberate incompatible PG17 restore retains expected exit1. Backup SHA256 `9aaa71ce87ba65b85745e50161ca0ea92976e6d920e1b5a2ad0461ecac7719a7` matches retained dump bytes.

New independent verification reconstructs34 review-fix SQL readbacks and12 exact negative/replay before/after pairs; verifies archived source/receipt immutability, explicit fork lineage, stable event IDs/participants after first/middle removal, legacy NULL/foreign/own coexistence without data adoption, protected legacy active state, and owned legacy lifecycle switching without source mutation. It retains all prior source-pinned setup/review/plan proofs, not only new cases. Flag/context behavior and Chromium interactions are also asserted by source-pinned runtime tests; do not mistake reconstructed SQL projection for independently captured raw HTTP bodies when only assertions are retained.

Real Gateway canonical hash before/after archival/restore is identical: `c9d547d47ede10add9d4d42ead3953216b51c4c4970822fca54ac63f6532e43c`. Actual legacy row before/after JSON is identical, creator remains NULL, private content is absent from visible P2 snapshots, and global head advances1→2→3 with two owned P2 versions and one active maximum. P1's original immutable revision/approved Canon are unchanged; the separate actual AUTHOR_MANUAL save hash remains `2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1`, correctly linked to completed outbox and Mongo version2.

Both operational logs were present and independently scanned for plan/setup/legacy private fixture markers. None appeared. Raw SQL artifacts intentionally contain synthetic note fields; no real author data was used. [Event-card screenshot](p2-03-review-fixes-evidence/fix-events-ui.png) and [archived read-only screenshot](p2-03-review-fixes-evidence/fix-archive-ui.png) are actual Chromium fixture captures. Browser HTTP remains mocked, distinct from real Gateway→Python→PG/Mongo runtime.

Local Docker daemon is unavailable (Linux Engine named pipe missing): local DB NOT_RUN_ENVIRONMENT, not mock PASS. Disposable CI supplied real SQL/runtime evidence; no unresolved CI/environment blocker remains for this review scope. Manual handoff for hidden legacy active/foreign P2 ownership and broader P2-04 work remain explicitly outside this PR.


---

# Historical initial P2-03 delivery (unchanged below)

# P2-03 — Story Plan Editing Engine & Chapter Objectives

Draft PR #98 targets integration/p2-planning-studio for Issue #97. Manual future planning only: no live LLM, deployment, merge or P2-04 work. **Verdict: READY_FOR_REVIEW at the independent review gate.**

## Provenance and API contract

Base: f20d0df38a90f5a61d1ac6472c0152d828697117 (merged #96). Branch: codex/p2-03-story-plan-core, created from fetched current integration. Tested implementation: 62a872aa23ee2d2d60816e716fd7e1650fa4e16d. CI checkout5f0e8e9e29ec3619e722fc811e0c1e00f58a6408 and implementation have identical tree3b02d4865782eb841655c6bb4389e3e7968dc356. Delivery adds handoff/schema/evidence only; delivery SHA and delivery-head CI are recorded in PR metadata to avoid self-reference.

The roadmap's three authority lanes, pinned WORKFLOW_CONTRACT v1.4, merged P2-02A/B source and actual legacy plan/identity/context/autonomous paths were inspected. WORLD SETUP stays reviewed setup entities/rules, FUTURE PLAN stays these plan/objective tables, CANON HISTORY stays P1 evidence/HITL. Editing or activating a plan cannot activate Story Brain, create a revision/outbox, approve Canon or start a provider/autonomous run.

[Strict additive DTO schema](plan-edit-v1/schema.json) and [validated Unicode example](plan-edit-v1/request.json). New routes:

- GET /v1/story-plans/edit-v1/{novel_id}: owner-scoped list/history, head_version and optional active_plan_id; no plans returns an empty list and head0.
- GET /v1/story-plans/edit-v1/{novel_id}/{plan_id}: historical owner snapshot, with current head_version.
- POST /v1/story-plans/edit-v1/{novel_id}: action save/fork/activate/skip/delete, stable idempotency_key and expected_plan_version. Public Gateway has matching /api/v1/ai paths.

Save/fork use full ordered objective membership; each objective has a logical UUID, expected_intent_version, target chapter, title, description, future event cards (stable local UUID/text), optional confirmed entity-ID or unresolved-name participants, and dependency logical UUIDs. Dependencies must be unique, complete and acyclic; chapters/objectives/event IDs are unique. Client cannot assign Canon status, source authority, actor or tenant. A hint never resolves a homonym or creates an entity. Only confirmed same-novel/tenant participant IDs are accepted.

Explicit zero-objective drafts are valid; empty plans cannot be activated. Saving/importing outline text does not invent chapter objectives: paste outline, then add goals manually. There is no fixed10 cap; acceptance covers5/10/20/25. Operational limit is500 objectives,100 events/objective,100 participants/event; outline200000 chars, note/description/event text10000, title255, and aggregate direct Python payload <= existing1MiB Gateway body limit. Thin UI supports text, goals, events, add/move/delete, private notes, historical selection/fork, activation, skip and archival. Participant/dependency editing remains API-only; full Chapter Board is P2-05.

## Revision, CAS, replay and lifecycle policy

Every P2 command creates an immutable successive plan row in existing story_plans, with objectives in existing story_plan_objectives. plan_version is the tenant+novel command/snapshot clock, including save/fork/activation/skip/archival; expected_plan_version must match the current clock under the parent advisory lock. Physical objective row IDs are snapshot-local because the existing PK cannot occur in two snapshots. Stable logical objective UUIDs are stored in objective_metadata.logical_id and returned by the edit API and writing context.

The source_plan_id anchors exact membership/intent CAS. New logical IDs require expected_intent_version0 and cannot reuse a known same-novel identity absent from the chosen source. Semantically unchanged objectives retain their source intent_version; changed title/goal/target/events/dependencies increment it, new objectives start1. Pure list ordering changes only the plan clock; the UI renumbers target chapters after a move, which changes those intents. Forks deliberately branch from a selected historical snapshot; intent versions are relative to that source, not a global monotonic counter. Snapshot ID plus parent plan clock prevents ABA. Ordinary save requires the selected source to be the current head; historical reversion is explicit fork.

A shared tenant+novel advisory lock serializes new commands and legacy create/activation. All scope/membership/versions/participant checks happen inside the same transaction before writes. Matching operation key plus normalized identical request replays its immutable stored receipt before stale-head checks; altered keyed input gives409. Lifecycle receipt status records the original command result even if the row later becomes superseded. Different concurrent edits or activations have one winner; no provider/Mongo operation occurs under DB locks.

Activation copies the selected snapshot into a new active version and supersedes the prior active row atomically. Original source/objective content stays immutable; lifecycle status may change. Skip creates an empty skipped receipt and clears the active pointer, without implying author consent to M0 or writing. Delete means logical archival/tombstone: it clears the pointer only if deleting the selected active source, retains historical rows/source/private data for audited readback/fork, and does not physically erase history. Remove-chapter is full membership replacement in a new snapshot. Source content/hashes and accepted World Setup/Canon remain untouched.

## Persistence and migration decision

0017_plan_edit adds edit_metadata JSONB to existing story_plans for contract marker, source lineage, private settings, actor/timestamp and exact replay receipt, including zero-objective plans. This root metadata cannot be safely stored solely on objective rows. It also adds a partial unique index uq_story_plan_active on tenant_id+novel_id WHERE status='active', enforcing uniqueness even against raw SQL. No new persistence system/table or schema redesign.

Historical0008 creates current ORM tables on fresh installs, so0017 validates/adopts an already-created correctly typed column and exact unique-index shape. It does not rewrite old migrations, silently drop duplicates or clean existing data. True pre0017 upgrades add the column/index; duplicate active data causes transactional failure. Downgrade refuses to discard nonempty edit metadata, preserving audit/private snapshot history; empty/legacy metadata can downgrade. Isolated PostgreSQL migration acceptance reconstructs the genuine old schema, proves duplicate-active upgrade refusal, preserves two seeded legacy rows, and proves upgrade/downgrade/re-upgrade. P8 backup/restore is the data-preserving rollback for populated new snapshots.

New test fixtures delete only their own random tenant+novel plan rows after durable readback capture, avoiding contamination of older whole-database downgrade regression tests. No QA/shared/production data is touched. The dedicated migration proof database is randomly named p203_migration_* and removed after proof.

## Auth/privacy and legacy compatibility

Gateway verifies active JWT/current novel ownership for all new calls. Plan-by-ID now resolves only local scope metadata via PostgreSQL joined to current novel owner before any Python outline fetch. P2 additionally binds immutable source creator; no ADMIN bypass and ownership transfers fail closed (old creator lacks current ownership; new owner lacks source authority). Python independently verifies trusted service credential, UUID tenant/actor consistency, configured repository tenant and source author. Service credentials remain a trusted internal boundary; there is no duplicate user/novel authority database.

The pinned P1 AI-PIPE-02B contract permits ADMIN read-by-ID of legacy plans. That read-only exception is retained only for non-plan-edit-v1 records, authorized from JWT role in Gateway and conveyed via a Gateway-generated legacy-read flag under authenticated service credentials. Browser-provided headers are never forwarded. Forged delegation does not grant P2 access. New write paths do not permit ADMIN ownership bypass. Legacy source rows with missing/different creator cannot silently become P2 authority; legacy content can be read by its established authorized path, then manually imported into a new owned snapshot. Existing foreign-created source chains require explicit delegation policy outside this PR.

Once manual snapshots exist, legacy HTTP create/activate/status writes cannot bypass CAS; manual snapshot status mutation and autonomous execution fail closed before provider/work. Legacy plan/autonomous behavior remains available for legacy sources. A trusted, service-authenticated wrong-novel legacy PATCH still returns404 without source read/mutation, preserving P1 negative-contract behavior; existing-source requests still require author scope. Non-PostgreSQL legacy internal/test adapters retain their historical interfaces and are not P2-capable; new editing fails503 without PostgreSQL.

Private notes live only in root edit_metadata; owner edit readback can reopen them. Notes never enter command receipts, legacy/domain/provider DTOs, context, global memory or jobs. P2 legacy DTO input_hash/key are hidden as well. Typed allowlists exclude arbitrary nested authority/private fields; malformed new and legacy plan bodies return sanitized422 without rejected data. Setup/job fences from #94/#96 remain. Operational logs are scanned for synthetic private values; raw SQL/JUnit evidence deliberately uses synthetic fixture notes, not real author data.

Writing context labels planning_context and current_objective with authority_lane=FUTURE_PLAN and exposes only matching-chapter objectives/future event cards, separately from recent historical events. An unmatched requested chapter cannot fall back to another chapter's betrayal. No private note is in context. Context switches with active plan, and skip removes planning_context. Existing active manual-plan context HTTP reads require author scope; privileged internal repository callers remain internal.

## UX and scope limits

StoryPlanEditor replaces legacy editing controls in the existing AuthorMemoryPanel Plan tab, uses shared apiClient and account+novel keyed state. Each request has stable operation key; 409 requires explicit reload/reconcile rather than auto-overwrite. Inputs are disabled during saves, late account/novel responses are ignored, and login/reload reads server state. Names are display hints; no hidden identity resolution. There are no AI suggestion buttons in this new editor. No-plan/skip is a real API action and valid absence is shown clearly.

Advanced participant/dependency editing is API-only. Editing pending unsaved text then choosing activation activates the explicitly labelled stored version, not an implicit save. Historical delete is archival; source retention is disclosed above. Legacy snapshot import is manual rather than in-place conversion. Manual-plan autonomous execution and Story Brain/M0/first-chapter activation are explicitly unsupported. P2-04/P2-05 remain separate review gates.

## Files changed

| Area | Files |
|---|---|
| Python API/security | api/plan_schemas.py, plan_routes.py, narrative_routes.py, setup_auth.py |
| Existing persistence/transaction/context | infrastructure/plan_edit.py, postgres_narrative_repository.py, orm_models.py |
| Migration | migrations/versions/0017_plan_edit.py |
| Real SQL acceptance | tests/test_plan_edit_postgres.py |
| Node Gateway/forwarding | backend/src/modules/ai/ai-gateway.controller.ts, ai-gateway.routes.ts, ai-gateway.service.ts, setup-provenance.live.test.ts |
| Mounted editor/browser | web/src/features/ai-copilot/StoryPlanEditor.tsx, AuthorMemoryPanel.tsx; web/tests/setup-foundation.browser.test.mjs and its existing fixture |
| CI/docs | .github/workflows/p2-setup-provenance.yml; this handoff, plan-edit-v1 and p2-03-evidence |

## Acceptance evidence

Exact source/tree, commands, final CI URLs/conclusions, durable readback hashes, migration proof, private log scan and screenshot: see [evidence index](p2-03-evidence/README.md), ci-jobs.json, verified-summary.json and verifier in that directory. Overlapping suites are separate, not pooled across tests or SHAs. Browser uses real Chromium with mocked HTTP; Gateway→Python→PostgreSQL/Mongo acceptance is a separate real runtime path.

Historical CI failures are retained rather than relabelled: initial e4308852 failed fresh-install duplicate-column migration before runtime;91356db2 failed SQLite predicate truthiness and global downgrade regression while P2 fixtures remained, and later runs exposed two-stage legacy ADMIN denial. Fixes preserve migration history and the pinned P1 contract. Missing-log scans on pre-runtime failures are NOT privacy PASS. Local Docker daemon named pipe is absent: local DB runtime NOT_RUN_ENVIRONMENT; disposable CI supplies actual PG/Mongo evidence. Host browser5 PASS, local legacy/autonomous/SQLite lifecycle12 PASS; local counts are not substituted for SQL runtime.

## Final exact-source acceptance matrix

All following runtime results belong to implementation62a872aa. Suites overlap and are not summed.

| Gate / scenario | Actual | Evidence |
|---|---|---|
| P7 required jobs | PASS3/3 | [42456422383](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42456422383) |
| P8 required jobs, including AI-PIPE legacy planning/autonomy | PASS7/7 | [42456422374](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42456422374) |
| Feature workflow | PASS1/1 | [42456422393](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42456422393) |
| Focused setup/P1 service regression | PASS46 | focused.xml/log |
| Selected real PostgreSQL | PASS72, SKIP0; includes13 plan cases and28 setup-review cases | a16.xml/log |
| Full PostgreSQL | PASS270 / SKIP8 / deselected447 | P8 postgres log |
| Full non-PostgreSQL | PASS415 / SKIP32 / deselected278; 6 subtests separately | P8 unit log |
| P1 backend guard/accept/persistence/lifecycle | PASS11 /15 /5 /25 respectively | P8 backend log |
| Gateway forwarding | PASS19 | gateway-forwarding.log |
| Real P1 changed chapter → immutable revision → outbox/Mongo | PASS1 | gateway-a16.log + raw readbacks |
| Real Gateway setup+manual plan | PASS1, 58 HTTP outcomes | setup-gateway.log/readbacks |
| Chromium mounted setup/review/manual editor | PASS5, HTTP mocked | setup-browser.log + plan-ui.png |
| Offline artifact verifier | PASS, exit0 | verified-summary.json |

Disposable PostgreSQL16.15 / pgvector0.8.7, MongoDB7.0.45, databasep2a. Alembic head0017_plan_edit. Exact image identities and provider fake/fake settings are retained. PostgreSQL service clients/server are matched PG16; the deliberate incompatiblePG17 restore retains expected exit1, matched backup/restore/parity exit0. Source/restore full-schema parity covers23 tables; source remains byte/hash equivalent. Backup SHA256892e96390ac29b21c94c6ebfea72d86d3e500afc78080f431d5c3181a8545b60 matches retained dump bytes.

Independent verification covers26 plan durable readbacks,11 exact negative/replay before/after pairs, per-novel unique versions and <=1 active row, logical/physical objective linkage, immutable receipts/source hashes, 0/5/10/20/25-objective snapshots, 12 rolling intent edits, historical fork, archival/skip and zero Canon changes. A real SQL second-active insert is rejected, not only a mocked lock test. Dedicated DB migration proof verifies duplicate-active upgrade refusal, up/down/re-upgrade and2 preserved legacy rows. Earlier setup acceptance is independently retained too:53 setup-review readbacks/21 negative pairs,30 setup readbacks/12 negative pairs and45 author-scope negatives.

Real Gateway plan Canon digest before/after is identical:92d7a8cc881ff5926dcca80d39c14c72b37245f183ee503d870226e278cac219. Its accepted setup remains1 entity/1 rule; plans grow0→2 and objective rows0→50, while events/transitions/revisions/outbox/Mongo chapter rows remain0. Chapter3 and8 context assertions preserve stable logical IDs, show FUTURE_PLAN, exclude private notes and keep recent history empty; skip removes planning context.

P1's separate unchanged original revision and approved Canon are verified; the actual changed AUTHOR_MANUAL revision has hash2820f3c28370c94c08a19fc3793b806da75fd53a6f5d33e656b9091e61e78dc1, links a completed incremental outbox and Mongo version2. Private marker scans inspect both actual operational logs; plan notes and private_notes field names are absent. Raw SQL artifacts intentionally contain synthetic note fixtures, never real author data.

[Plan UI screenshot](p2-03-evidence/plan-ui.png) is a full-page25-card fixture capture. Browser HTTP is mocked; this is not browser→DB E2E. Local Docker invocation exits1 because Docker Desktop's named pipe is absent; local PG/Mongo NOT_RUN_ENVIRONMENT remains distinct from real CI PASS. No CI-backed runtime blocker remains for this review scope.

## Stop gate

Draft PR #98 remains for GPT-6 independent review. No merge, deployment, real provider or P2-04 work. Verdict READY_FOR_REVIEW applies to this bounded manual-plan vertical slice; remaining UI/activation/autonomy capabilities are explicitly excluded above.
