# AX-00 / AX-01 — Editable Entity Profile contract (review candidate)

2026-10-27 remediation revision, Asia/Saigon. Scope: P1 backend/domain/Gateway only. No AX-02 UI, P2/P3 implementation, provider call, merge or deployment.

## Authority and reuse audit

GitHub main verified at requested `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`. Machine's unrelated old checkout was `a37e3b7`; it is not the source. Dedicated clone/worktree and `codex/p1-ax01-storybrain-core` start from the requested SHA. Maintained `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4 read at branch head `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`, blob `bde8936607bc45474b9895600782c41eeda02685`. Historical implementation-status paragraphs are not current acceptance evidence.

Inspected baseline boundaries:

| Source | Existing authority / reuse |
| --- | --- |
| ai-service/domain/models.py | NarrativeEntity has UUID/name/type/status/location/mentions/lock; StoryBrain and WritingContextPackage own memory/context. No editable profile DTO. |
| ai-service/infrastructure/orm_models.py | entities.description and static_attributes already exist; tenant/novel/Brain identity, confirmation and UUID remain authoritative. Existing proposal decisions describe proposal acceptance, not direct-edit audit. |
| ai-service/infrastructure/postgres_narrative_repository.py | Existing scoped Brain lock/CAS and accepted proposal materialization; get_story_brain(read_only), structured context, projection, plan persistence. Extend this repository; no second writer/pipeline/store. |
| ai-service/api/narrative_routes.py | Existing correction/proposal-group/writing/context endpoints remain in place. Profile endpoint joins existing author-only router used by approved memory. |
| backend/src/modules/ai/ai-gateway.controller.ts and .routes.ts | Reuse requireAuth/active AUTHOR or ADMIN and assertNovelOwnership; existing ADMIN exception is preserved explicitly. Trusted actor/tenant forwarding belongs to Gateway, never client body/headers. |
| web/src/features/ai-copilot/author-memory-api.ts | MemoryEntity currently only lists UUID/name/type/status/location/mentions/lock. AX-02 will add typed profile read/edit calls, not synchronize legacy Story Context by name. |
| web/src/features/ai-copilot/AuthorMemoryPanel.tsx | Existing approved memory, review queue and proposal/group decisions stay the integration surface. No editable profile controls implemented in this slice. |

## API before / after

Before: no direct confirmed-entity profile read/update. `GET /ai/story-brains/:novelId/memory` exposes approved identity/state/history; author-proposals and correction endpoints still require the existing evidence/review contracts. Editing identity, aliases, locks or historical facts through a profile payload was not supported and remains unsupported.

After: public `/api/v1/ai/story-brains/:novelId/entities/:entityId/profile`, service `/v1/story-brains/{novel_id}/entities/{entity_id}/profile`:

- GET: owner-authorized private read, `Cache-Control: no-store`.
- PATCH: partial field update, both `expected_version` (integer >=0) and `expected_brain_version` (integer >=1) required. `Idempotency-Key: [A-Za-z0-9_-]{1,128}` required; stable across transport retry. No auto-retry on stale versions.
- Writable fields: description, appearance, personality, background (strings <=4000 code points each), author_notes (string <=8000). Null, wrong types, control characters except newline/tab/CR, unknown properties and empty mutation are rejected. Empty string explicitly clears a field.
- Any canonical profile field requires `effective_from_chapter` in [1,1000000]. The resulting WHOLE profile snapshot has this applicability cutoff, including previously retained fields. Note-only edits cannot change cutoff.
- UUID/name/type/alias/status/location/relationship locks/source revision/provenance/future_plan cannot be patched. Future plans use existing StoryPlan, notes remain non-Canon. No inference of historical occurrence from profile text.

Example PATCH:

```json
{"expected_version":0,"expected_brain_version":7,"description":"Author-confirmed baseline","appearance":"Blue eyes","effective_from_chapter":3}
```

Success GET/PATCH envelope:

```json
{"data":{"entity_id":"<uuid>","novel_id":"<uuid>","version":1,"brain_version":8,"profile":{"description":"Author-confirmed baseline","appearance":"Blue eyes","personality":"","background":""},"effective_from_chapter":3,"author_notes":""}}
```

Private notes are present ONLY in this owner-scoped private DTO and internal private audit snapshots. Existing approved-memory entity DTO gains `approved_profile` with only the four canonical strings and applicability cutoff, never notes/version/audit. Identity continues to be UUID, including two entities named Minh.

## Ownership, storage, versions, audit and retries

Gateway validates current account/role and novel ownership before forwarding. ADMIN keeps inherited access. Python requires service credential plus UUID X-Author-Id/X-Tenant-Id and rejects a tenant differing from configured repository tenant. This is the existing configured-tenant architecture, not newly invented request-routed multi-tenancy. Internal service is a trusted boundary; direct arbitrary client access to it is unsupported. Repository predicates enforce tenant+novel+entity+confirmed status and do not create missing resources. Actor comes from authenticated Gateway, never repository default actor or caller JSON.

Additive migration 0014: entities.author_profile JSONB, private_author_notes TEXT, profile_version integer=0; entity_profile_audits contains actor/timestamp, scoped unique request key/hash, complete before/after private DTO snapshots. Existing description column mirrors confirmed description; static_attributes/status/identity and history remain intact. Separate columns avoid relying on arbitrary static_attributes filtering for secrecy. All approved/domain/context serialization uses an explicit canonical allowlist. The audit ledger is not an approved-memory source and has no public route. Database failure responses suppress bound SQL parameters that can contain notes.

Under existing scoped Brain lock then entity lock: scope check -> durable key replay/conflict -> both CAS checks -> patch -> audit insert -> one commit. Audit insertion failure rolls back the profile and both versions. Every successful new mutation increments profile_version, including note-only. Canonical profile edits increment Brain version once, invalidating existing version-pinned writing/checkpoint/proposal operations. Note-only edits leave Brain version, all facts/events/state/proposals unchanged. No fake historical event/evidence, no semantic embedding of notes, no immutable source change. Existing extraction/upsert/approval never write the dedicated profile columns; stale AI proposals still fail Canon CAS.

Idempotency key is unique per tenant/novel/actor. Hash covers entity UUID and exact validated PATCH including preconditions and field presence. Exact replay returns original committed private response even if later edits exist; it does not change versions or add audit. Reusing key for another entity/payload returns409. GET is how callers obtain the current state. No-op but intentional valid field save counts as a mutation; this is deliberate, not content-based deduplication.

## Context inclusion and temporal limit

Author Edit -> same durable EntityRecord -> approved_memory entity.approved_profile -> get_structured_context -> existing WritingService scope/routing + ContextBudgetPacker -> preview/generation prompt. No new retrieval engine or embedding writer.

Canonical profile only enters context when a chapter cutoff exists, cutoff >= profile.effective_from_chapter, entity itself passes existing chapter eligibility, and its UUID is selected. WritingService consumes existing resolved semantic query UUID signals before repository context assembly; these take priority over name/recent-event fallback. Without a usable embedding runtime, the PostgreSQL profile capability calls the same existing scoped identity resolver directly; no second matcher/store is introduced. The existing semantic identity resolver also admits a confirmed applicable baseline profile without requiring a prior event; it creates no occurrence, embedding, or memory chunk. Explicit UUIDs and unique confirmed canonical names/aliases resolve identity; homonymous names or shared aliases alone do not select profiles. Without resolved semantic signals, an explicit unique character name may select one profile; otherwise existing canonical recent-participant UUIDs are the fallback. Other identities receive no profile text. Private notes/audit never enter the package. The production packer measures actual serialized text. It packs Canon identity/state under existing protection first and then attempts whole optional profile additions. It can drop profile text while keeping a locked UUID/name/state; dropped profile IDs are explicit in context_summary and count as dropped artifacts. Balanced full-fit routing still escalates tiers and fails closed above its maximum. Legacy generation also fails before provider invocation if protected Canon itself exceeds budget. Profiles do not bypass routing tiers or become locked world rules. Direct budget-enforced repository callers also pass profile-bearing output through the existing packer.

Baseline profile is author-confirmed background knowledge, not an assertion that an in-story change occurred. Changes that happen in the story must use existing provenance-backed event/state correction and Canon review, not a profile edit.

Conservative temporal contract: only one current snapshot is published, not a per-chapter biography history. Replacing a profile with a later applicability cutoff causes older-chapter context to omit it; it does not reconstruct an older profile from the private audit ledger. This sacrifices completeness to avoid future leakage. Author can deliberately choose an earlier cutoff when correcting a baseline. Semantic validation cannot prove arbitrary prose contains no future information: field intent/cutoff remain explicit author responsibility; typed future_plan is rejected and private plans stay out of Canon.

## Error semantics

- Public auth:401 missing/invalid session,403 inactive/wrong role/non-owner;404 missing novel.
- Internal:403 invalid service credential or tenant mismatch;422 missing/invalid actor/tenant header, IDs, version, key or payload;404 unconfirmed/missing/foreign entity or novel.
-409 CHECKPOINT_CONFLICT: profile/Brain CAS stale or conflicting idempotency payload (existing author-router error shape; no hidden auto-approval).
-503 PROFILE_REQUIRES_POSTGRES when unsupported repository;503 PROFILE_STORAGE_UNAVAILABLE on DB failure with sanitized detail.
- No mutation/audit on rejected requests. Private GET/PATCH success never cache publicly.

## ADR / review decisions before integration

This is a concrete implementation for review, not evidence that review already happened. Review must approve additive migration0014 and private-audit retention/access, the two-version DTO/precondition semantics, inherited ADMIN policy, key replay response semantics, whole-snapshot effective chapter cutoff and conservative omission of older snapshots, and additive approved_memory DTO. Changes to identity/alias/relationship locks, direct historical correction, P2/P3 or auto-approval are outside this contract and require separate ADR/approval. Existing proposal/HITL/source contracts are unchanged.

Rollback: stop new profile traffic; securely export profile/note/audit additions if retention is required; downgrade0014 to0013, discarding new columns/ledger while preserving entity UUIDs, description, locks and existing Canon. Roll forward restores empty profile/version0; it does not recover dropped notes/audits. Do not run this destructive data rollback without backup/operational approval. The dedicated migration test verifies old-schema upgrade defaults, identity/description/lock preservation through downgrade and re-upgrade. No production migration was run.

AX-02 integration files after contract review: author-memory-api.ts typed GET/PATCH client and MemoryEntity approved_profile; AuthorMemoryPanel.tsx owner edit form by UUID, private-note labeling, stable retry key, explicit cutoff,409 reload/reconcile, final author save. Context preview/generation clients remain on existing endpoints. No FE files are changed here.
