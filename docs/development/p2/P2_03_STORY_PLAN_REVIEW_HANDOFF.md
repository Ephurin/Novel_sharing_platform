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
