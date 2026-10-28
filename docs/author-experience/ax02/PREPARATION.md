# AX-02 UI preparation — handoff only

2026-10-27, Asia/Saigon. Preparation branch: `codex/p1-ax02-editable-codex-ui`.

## Dependency and stopping point

Start snapshot is AX-01 evidence HEAD `ed207b409aa903c950b03b9400a8a556bdb077e3`; backend tested source is `47b194bb1b7783105827c08c27d42dfe7c984e54`. This branch depends on Draft PR [#75](https://github.com/Ephurin/Novel_sharing_platform/pull/75), targeting `integration/p1-demo-20261109`. It does not imply PR75 has merged or passed CI. No rebase, merge, code cherry-pick, UI implementation, retrieval change or deployment was performed for this preparation.

Independent verdict: AX01_REMEDIATION_OFFLINE_ACCEPTED. Offline approval is not production acceptance. GPT-6 review and Gemini integrated acceptance remain required. Stop at this handoff; the following is a bounded UI implementation/acceptance plan, not executed acceptance.

Authority: [reviewed contract](https://github.com/Ephurin/Novel_sharing_platform/blob/ed207b409aa903c950b03b9400a8a556bdb077e3/docs/author-experience/ax01/CONTRACT.md), [remediation handoff](https://github.com/Ephurin/Novel_sharing_platform/blob/ed207b409aa903c950b03b9400a8a556bdb077e3/docs/author-experience/ax01/remediation-20261027/HANDOFF.md).

## Small UI slice

Extend the existing approved-memory entity list in AuthorMemoryPanel. Select a confirmed entity by UUID, show canonical name/type and an identity discriminator for homonyms, and load the private owner-scoped profile. Keep baseline fields, private author notes and existing historical facts/current state visibly distinct. Do not add a second Codex store, rename/alias UI, relationship-lock editor, retrieval engine or Author IDE redesign.

- `web/src/features/ai-copilot/author-memory-api.ts`: add typed EntityProfile readback/PATCH DTO and GET/PATCH helper through the existing authenticated Node Gateway client. MemoryEntity gains optional approved_profile typed to the reviewed canonical fields/cutoff. Existing memoryPost is POST-only: use the underlying client's PATCH support, not a new direct FastAPI call.
- `web/src/features/ai-copilot/AuthorMemoryPanel.tsx`: mount a focused profile form or small extracted component by selected UUID. Preserve review queue, group acceptance/rejection, existing identity review and final author decisions.
- Reuse existing request/error/account-context handling and memory reload hooks. No backend/LLM changes are expected for this slice.

## API behavior to preserve

GET/PATCH `/api/v1/ai/story-brains/:novelId/entities/:entityId/profile`.

GET readback: entity_id, novel_id, version, brain_version, profile {description, appearance, personality, background}, effective_from_chapter and private author_notes. Respect no-store; notes belong only to this owner/private view and must not enter public state, URLs, telemetry, console/error logs, exported approved memory, persistent browser storage or prompt construction.

PATCH requires both expected_version>=0 and expected_brain_version>=1, plus a stable Idempotency-Key using1..128 ASCII letters/digits/underscore/hyphen. Send only intended changed fields. Canonical strings allow4000 Unicode code points each; notes allow8000. Empty string clears; null is invalid. Avoid JavaScript UTF-16 length as a substitute for Python code-point bounds.

Any canonical profile change requires an explicit effective_from_chapter in1..1000000. Explain that it applies to the whole resulting snapshot, including retained fields. Baseline profile is background knowledge; an in-story change uses existing event/state correction. Note-only edits omit cutoff and never create Canon facts/events. Future plans stay in existing planning facilities, not a historical profile control.

One user save intent owns one key and exact payload/preconditions. Keep the key on transport retry; do not reuse it after content/target changes.409 requires current readback and author reconciliation, not automatic resubmission. Exact replay may return an older committed response after subsequent edits: GET obtains current state. Missing preconditions, invalid payload and missing key fail closed.

401/403 clear/disable the private view as existing account/ownership rules require;404 handles unavailable scope;422 shows bounded field/precondition feedback;503 shows backend capability/storage unavailable. Never display a successful save based only on local form state.

After successful save, reload private profile and approved memory/version through existing APIs. Do not locally manufacture Canon events or alter UUID/aliases/locks. Invalidate the selected form on account/novel/entity switch; discard stale async responses and never submit to a previously selected identity.

## Gemini integrated acceptance checklist — NOT_RUN

1. On a running integrated stack, edit confirmed profile, explicitly save, reload browser and verify durable readback and version. Capture actual request/response and scoped DB state with safe fake-data fixtures.
2. Two same-name UUIDs with different appearance/personality: edit/select one, show independent readbacks. No name-based merge or profile contamination.
3. Two browser sessions: successful first save then stale second save409, no audit/version change from rejection; reload/reconcile remains an explicit author action.
4. Missing version/key and invalid/oversize payloads fail; wrong account/novel/entity never exposes private notes. Notes-only mutation leaves Brain version/history unchanged.
5. Network interruption and same-key retry create one mutation/audit. A changed intent gets a new key. Account/novel/entity switching cannot redirect an in-flight save.
6. Private notes stay outside approved memory, public/browser logs and writing prompts. Author edit -> real durable profile -> ordinary generation demonstrates relevant UUID profile inclusion without a separate Preview prerequisite. Keep H-01/H-02 backend routing unchanged.
7. Whole-snapshot cutoff: update description and move cutoff; retained appearance remains in private readback but the whole profile is absent from earlier-chapter prompts and appears at/after cutoff. This is not historical reconstruction.
8. Existing entity HITL, Canon group approval/rejection, correction, relationship locks and teacher/author final decisions remain usable. UI profile save must not auto-approve AI proposals.
9. Long/locked profiles preserve existing routing limits/fail-closed behavior. Render an actionable generation failure; do not bypass token budgets from React.

Use fake provider for deterministic integrated acceptance. A real-provider run still requires separate authorization/budget. Record exact combined source SHA/tree, migrations/config, browser steps, network/readback evidence and PASS/FAIL/BLOCKED/NOT_RUN per case. Existing offline tests do not replace this mounted browser acceptance.

## Current preparation status

Only this document is added. No frontend/backend source changed; no integrated tests were run. Branch is for review/continuation after PR75 CI and review handoff. No AX-02 PR is opened here.
