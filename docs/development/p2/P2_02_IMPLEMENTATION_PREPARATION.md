# P2-02 preparation — design only

2026-11-07. Codex owns backend, Gateway and React. **No P2-02 production implementation in PR #89.** Start a separate `codex/p2-02-setup-provenance` PR targeting `integration/p2-planning-studio` only after P2-01 independent review/owner gate. Verify fresh remote HEAD; do not assume current source is approved. P2-01 runtime blockers are tracked in the closure report and Argon handoff.

## Intended behavior and authority

| Lane | Persisted meaning | Allowed authority |
|---|---|---|
| WORLD SETUP | Explicit author declarations or reviewed creative suggestions; characters can exist before appearing in prose | Approved identity/rule memory, with setup provenance and no invented mention/revision/event |
| FUTURE STORY PLAN | Outline, hints about future scenes, unwritten objectives | Existing `story_plans`/`story_plan_objectives`; never historical event evidence |
| CANON HISTORY | Actual immutable chapter revision evidence and author Canon decision | Existing P1 HITL → transactional Canon store only |

`extract` reads explicit setup only. Hints aid lookup but are not evidence; outline-only names must not enter setup extraction. Return only grounded supported entities (minimum characters/locations), exact source spans/references and unresolved ambiguities. No creative blueprint fallback, inferred event, premise/constraint converted to historical fact or fabricated source. Unknown names/types/offsets fail validation or remain unresolved, never silent success.

`blueprint` is explicitly creative. Suggestions have `origin=model_proposed` and remain pending until author edit/accept/reject. Author declarations retain distinct origin. Neither proposal generation nor setup activation grants historical Canon authority. A future chapter-8 betrayal remains a plan while writing chapter 3; actual approved prose controls history and can only prompt a plan correction.

## Contract checklist before coding

- [ ] Freeze additive typed input: `mode`, explicit `setup_text` (or documented legacy `idea` alias), optional hints, separate future outline, preferences and private constraints. Specify conflicting alias rejection and limits. Preserve documented missing-mode legacy blueprint path; new UI sends an explicit mode.
- [ ] Freeze versioned setup snapshot envelope in existing job result JSON: exact source text, server-computed UTF-8 SHA-256, schema/source version, author/tenant/novel scope, mode, origin, creation metadata and source references. Keep raw text for offsets; do not normalize it silently. Hash relevant request fields canonically, including mode, without breaking P2-01 replay compatibility.
- [ ] Separate public creative preferences from private author notes/constraints. Provider input is an explicit allowlist; private notes are excluded by default. Retention/readback is owner-scoped and must not leak through context, logs or suggestions.
- [ ] Proposed authorized readback: `GET /story-brains/{novel_id}/setup` with snapshot/version, source kind/origin, pending cards/decisions and readiness, distinct from approved memory. Confirm exact path/DTO against existing job APIs before freezing. Reload must use server state, not local remembered job IDs as authority.
- [ ] Proposed review/update commands carry expected setup/review/Brain version and stable operation key. Same key + changed source/mode conflicts; stale edit gets 409/reload, never silent retry at a newer version. Accepted source snapshots remain immutable; changed text creates a new source version.
- [ ] Define activation expected-version compatibility and empty/all-rejected setup policy explicitly. No empty baseline inference. Keep P1 manuscript DTOs compatible. Approved M0 is later consumed by P2-04; no revision fabrication or first-chapter bridge in this PR.

## Implementation sequence for the next PR

1. Publish DTO examples and schema validation tests. Preserve independent `extract`/`blueprint` behavior and existing P1 Canon group semantics.
2. Extend the existing bootstrap reservation/finalization lifecycle to persist immutable setup input before provider work, then atomically finalize source-bound proposals. Retain scoped Brain/job locks, failed replay and explicit retry semantics; any recovery lease needs its own bounded contract/tests.
3. Reuse P1 identity validators, opaque reservations and explicit existing-ID/provisional-group selection. Scope new group keys to setup snapshot/hash/version. Two people with one name keep distinct groups/IDs; repeated occurrences of one identity share only the author's chosen group. Never use display name as identity or generate chapter occurrences to satisfy a validator. Inspect P1 helpers' revision assumptions and adapt their source envelope narrowly.
4. Validate every extracted candidate against exact setup spans before proposing. Reject hostile/hallucinated provider output, unsupported types, foreign IDs and outline/hint-only names. Model creativity remains in separate blueprint proposal DTOs.
5. Reuse existing full-group review/Canonical acceptance. Independent cards require genuine singleton groups or an explicitly designed review contract; do not loop individual accepts/rejects to bypass group membership. Pending/rejected suggestions must not enter approved memory or event history.
6. Add owner/tenant-guarded snapshot readback and typed shared API client support. Prepare existing Author IDE card integration (edit/confirm/discard, author/model badges, reload and 409 handling); keep complete Planning Studio UI/chapter board in P2-05. Label any intermediate backend-only scope explicitly.
7. Verify context labels: approved world rules/entities separate from private settings and future plan. Reuse existing stores; no second Story Brain, Writer or Plan Store. Prefer existing job JSON and plan metadata. Propose a migration only if a concrete durability/CAS/query invariant cannot be met, with upgrade/data-compatibility proof.

## Acceptance checklist

- [ ] Explicit setup versus absent hint/outline names; extract cannot call blueprint.
- [ ] Blueprint is model-proposed, raw output retained separately from author edits; pending/rejected never materialize.
- [ ] Immutable source/hash/version and exact spans; source mutation, bad hash, empty setup, unsupported keys/mode/types fail closed.
- [ ] Same-name distinct identities, known-ID scope, provisional reuse, stale/foreign identity rejection; no name fallback.
- [ ] Sequential/concurrent replay, changed mode/input, provider/final-save interruption and explicit retry with stable IDs.
- [ ] Pending/missing/partial/foreign review and stale activation rejected with durable no-mutation readbacks; valid setup review does not auto-approve later chapter Canon.
- [ ] No chapter revision/mention/historical event from setup or future plan; optional no-plan path remains valid.
- [ ] Owner-only readback; account/novel switch and reload; private notes excluded from outbound provider payloads.
- [ ] Fake-provider unit + fresh PG HTTP/transactions + Gateway ownership tests on exact SHA; reachable Author IDE behavior or explicit backend-only limitation, no fake AI success buttons.
- [ ] P1 manuscript/HITL/Writer/revision/outbox affected regression only; exact command/exit/evidence report and separate Draft PR/review gate.

Unresolved product decisions are surfaced in the DTO review: empty setup consent, independent-card grouping, settings retention, private constraints outbound policy and activation CAS compatibility. These are preparation questions, not authorization to weaken source/identity/Canon checks. Real provider calls remain zero.
