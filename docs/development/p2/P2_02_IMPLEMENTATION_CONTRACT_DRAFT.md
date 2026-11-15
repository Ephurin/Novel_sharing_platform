# P2-02 implementation contract — proposed, not implemented

2026-11-07 Asia/Saigon. Codex owns all backend/Gateway/React implementation. This document refines P2_02_IMPLEMENTATION_PREPARATION.md against the roadmap and WORKFLOW_CONTRACT v1.4 at `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`. It is a proposed API/design for the next separately reviewed PR, not a change to current endpoints or permission to start P2-02. Owner approval of P2-01 and closure/review of its runtime blockers remain prerequisites.

## 1. Authority contract

| Channel | Meaning | Storage and context |
|---|---|---|
| WORLD SETUP | Explicit author declarations, reviewed rules/characters/initial conditions | Versioned setup snapshot plus existing approved identity/rule/profile storage; labelled setup provenance, no chapter occurrence |
| FUTURE STORY PLAN | Unwritten outline/objectives/scenes and suggestions | Existing story_plans/story_plan_objectives; context labelled FUTURE PLAN, never observed history |
| CANON HISTORY | What actual saved immutable prose establishes and the author approves | Existing P1 revision evidence, entity gate and atomic Canon materialization only |

A chapter-8 betrayal in a future outline is not an event while writing chapter 3. A draft that contradicts the plan establishes Canon only after normal chapter evidence/HITL; it can propose a plan revision but cannot silently rewrite either lane. No second Brain, Writer, Canon store or plan store; no fabricated chapter revision/mention or historical event for setup.

## 2. Mode behavior

- `extract`: provider/grounded parser sees only immutable explicit setup and allowlisted lookup hints. Every extracted character/location must have exact setup spans or an explicit structured declaration reference. Hints are lookup guidance, never evidence; outline-only names and names found only in private notes cannot be extracted. No creative blueprint fallback. Unsupported/unresolved output is rejected or returned as unresolved, never bound by a guessed name.
- `blueprint`: an explicitly chosen creative route; output is always pending `model_proposed`. Suggestions may invent characters/rules, but no authoritative world data, initial condition or history is changed until author review. Original model output and author edits are retained separately.
- Structured author rules/character declarations remain `author_declared` and also require explicit review before accepted memory/context. Genre, pacing and private constraints are settings, not fabricated historical facts.
- Default offline/fake mode persists. No-provider extract can process validated structured declarations deterministically; it must not report successful free-text extraction by returning an invented empty result. Unsupported free-text analysis returns a clear unavailable/error state. Existing quota/retry/fail-closed gateway/provider policy applies to any later explicitly authorized provider calls.

## 3. Proposed additive request envelope

Reuse `POST /v1/story-brains/bootstrap/from-idea` behind existing owner-checked Gateway. Introduce an explicit new `contract_version='setup-v1'` for the new envelope; preserve the P2-01 legacy blueprint path and its old hash semantics. New UI always sends explicit version/mode. Unknown security-relevant top-level/nested fields fail 422.

```json
{
  "contract_version": "setup-v1",
  "novel_id": "<owned novel UUID>",
  "mode": "extract",
  "idempotency_key": "<stable operation key>",
  "expected_setup_version": 0,
  "setup": {
    "text": "Minh là người giữ thư viện ở An Thành.",
    "characters": [],
    "world_rules": [],
    "initial_conditions": []
  },
  "hints": [],
  "outline": "<optional future outline, separate from setup>",
  "preferences": {"genre": [], "tone": "neutral", "target_length": "long_form"},
  "private_author_notes": []
}
```

This example is not a supported request yet. Before coding, freeze declaration item schemas, text limits and supported types with fixtures. Minimum extracted types: character/location. Legacy `idea` can remain an alias for setup text in the new version only under an explicit compatibility rule; reject ambiguous requests containing both `idea` and `setup`. Empty outline/zero plan is valid. Do not add a Story Plan requirement or arbitrary word/chapter minimum.

`idempotency_key` is required for setup-v1, optional only on preserved legacy calls. The server owns source kind, author identity, tenant, timestamps, IDs, source hashes and proposal status; client-supplied authority metadata is rejected. New source/version edits use expected version CAS, not in-place overwrite.

## 4. Immutable snapshot and provenance

Reuse durable bootstrap_jobs.result JSON under existing reservation/finalization transactions unless a demonstrated invariant requires a separately reviewed additive migration.

Snapshot fields: schema version, scoped snapshot/job ID, source version, immutable setup object, exact text, separate hints/future outline/preferences/private settings, server-computed request hash and setup hash, mode, authenticated author, origin/source_kind, creation metadata and durable proposal IDs. Hash canonical UTF-8 JSON for the structured setup; also retain exact text UTF-8 hash for spans. Do not normalize/rewrite source text silently.

Text evidence specifies `offset_kind=unicode_codepoints`, start/end, exact quote, field path, snapshot ID/version/hash. Structured declarations refer to an immutable field path and declaration item key, not a fake prose occurrence. Quotes/spans must resolve exactly; private/hint/outline paths cannot serve as extract evidence. Server checks are mandatory even if the UI hides unsupported inputs.

Author-supplied rules and initial conditions are separately typed. Accepted world rules may use existing world_rule facts; approved character initial conditions may use supported static entity/profile fields with setup provenance. They cannot create chronological events/state-transition history merely to persist data. Confirm exact materialization mapping and retained original/edited source before implementing; unsupported initial-condition fields remain pending/unresolved rather than entering another store.

## 5. Identity and review/CAS

Reuse P1 exact canonical-ID validation, opaque reservation logic and complete-group Canon transactions. Adapt source envelopes narrowly for setup; do not fabricate revision IDs to satisfy chapter-only helpers.

- Names are display labels, never identity keys. Two people named Minh get different author-selected provisional groups/opaque UUIDs. Repeated references to one person reuse only the explicit author-selected identity.
- New provisional scope binds tenant, novel, snapshot/source hash and version. Existing IDs must be approved in the same scope; foreign IDs fail without mutation. Changing identity type requires explicit new grouping/review.
- Decisions bind expected setup/review/Brain versions and immutable source. Stale writes return 409 with reload/reconcile guidance; never auto-resubmit at a newer version.
- Genuine dependency groups remain atomic. Independent cards require genuine singleton groups or a separately frozen review wrapper; no omitted member or loop of single-item calls bypasses group membership.
- Use existing acceptance/materialization authority. A new setup review wrapper may validate source/review CAS and delegate to existing Canon commands; do not pass unknown setup fields to unchanged P1 DTOs or introduce an ambiguous accepted-but-not-authoritative proposal status.
- Pending/rejected suggestions never appear in approved memory. Edits retain raw proposal/source/author decision audit. Review is not automatic approval of later chapter Canon.

Activation must revalidate eligible scoped job, complete decisions and versions under existing locks. Preserve P1 manuscript activation compatibility. Empty/all-rejected setup policy is an owner decision: fail closed until explicit consent/review semantics are approved. Do not introduce a fake baseline revision. The later P2-04 M0/first-chapter bridge remains outside this PR.

## 6. Lifecycle and retry contract

Retain scoped admission before provider/source work, active-Brain 409 protection, exact replay and same-key changed input/mode conflict. Reserve immutable input before computation; atomically finalize source-bound proposals/job after token/version checks. No long provider call inside DB locks.

Snapshot changes create new versioned source records with expected-version CAS. Preserve prior accepted source and decisions. Reload/retry must reuse persisted proposal/identity IDs, not regenerate them from names. Define explicit failed-job retry and any abandoned-reservation recovery protocol before claiming crash recovery; current P2-01 fail-closed behavior is not a recovery lease.

## 7. Owner-scoped readback and frontend contract

Proposed readback `GET /v1/story-brains/{novel_id}/setup`, subject to DTO review: snapshot/version/source hash, origin badges, editable pending cards, accepted/rejected decisions and readiness/errors. Include exact stable IDs and source references. Keep private notes restricted to the owner, and excluded from provider payloads and public/context endpoints by default. Gateway enforces active AUTHOR/ADMIN and novel ownership; Python retains configured-tenant/service boundary. A local remembered job ID grants no access.

Reuse existing Author IDE, shared API clients and server-state cache. Cards distinguish author declaration/model proposal; edit/confirm/discard outcomes persist on server and reload/login. Invalid/stale/provider failures are visible, never fake success. A backend-only intermediate PR must say so explicitly; full Planning Studio/chapter board remains the later UI stage. No direct provider calls from React.

## 8. Acceptance and readiness gates for next PR

- [ ] Owner approves P2-01; Argon #91 evidence reviewed; fresh target/head pinned.
- [ ] Freeze setup-v1/legacy compatibility, complete item DTOs, privacy policy, activation CAS and empty-setup consent.
- [ ] Extract tests prove explicit-only spans/declarations, outline/hint/private-note exclusion, no blueprint fallback, malicious output rejection and no fabricated occurrences.
- [ ] Blueprint tests prove model-proposed lifecycle, raw versus edited audit, no automatic accepted world memory/history.
- [ ] Real PG tests prove immutable versions/hashes, two-key/same-key concurrency, failure/finalization/retry, stale review/activation, tenant/owner isolation and complete groups.
- [ ] Homonym tests prove separate IDs and reserved-ID reuse without name fallback; unsupported/foreign references fail atomically.
- [ ] Readback/reload/account-switch tests prove persistence, privacy, source/version accuracy and 409 recovery.
- [ ] No narrative.events/revision/mention/state-history rows arise from unwritten plans or setup declarations; approved rules/characters retain explicit setup authority.
- [ ] Affected P1 manuscript/identity/HITL/Writer/outbox regression, exact-source evidence and reachable UI or explicit backend-only limitation.
- [ ] Separate Draft PR to integration, GPT-6 review/owner gate; zero real Gemini calls and no quota/production changes.

No checklist box here claims implemented functionality. P2-02 remains NOT_STARTED until owner authorization.
