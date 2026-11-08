# P2-05 — Unified Author Planning Studio

Draft implementation for Issue #101. Independent review required; no merge approval.

Base: `integration/p2-planning-studio` at `ac9d070b2b3e6b368e41e84735b8a3dde5740f99` (fetched again before push).
Working branch: `codex/p2-05-planning-studio-ui`.
Source and delivery SHAs, final CI conclusions and durable readbacks will be pinned after the source commit. Until then: **FIX_REQUIRED — verification in progress**.

## Mounted experience

Actual `app/router.tsx` `/author/ide` still uses `AuthorWritingIde`, AuthGate, RoleGuard and AuthorTheme. The unused AuthorIdeShell import is removed. Planning/Write mode reuses the existing Writer, Core create/PATCH, lease, Mongo CAS, immutable revisions/outbox and Memory drawer. Both planning editors stay mounted between steps; the Writer stays mounted while hidden. Entering Planning flushes Writer first and refuses the switch on save failure.

Five freely revisitable steps: Idea, World rules, Characters/locations, Chapter board, Write. Idea uses the existing typed `outline` future-direction field; manual explicit rule/entity cards use setup-v1 with empty source text, so production planning never invokes an extractor/provider. Production AI assistance is disabled truthfully. Offline fixture capability is an explicit optional prop unavailable from the mounted IDE. No P2-06.

Source cards retain declaration IDs. Full-group review reuses P2-02B, including explicit new/existing identities, homonyms, edited values and unresolved initial-condition labels. Submitted/accepted source is read-only in the production UI; accepted corrections use the existing Memory author operations where supported. There is no invented editable world-rule endpoint. Original and reviewed values are shown separately. M0 is an explicit readiness/POST action, never implied by a review or a plan.

The Chapter board uses only plan-edit-v1: manual outline import, 0/5/10/15/20 and append to 25+, title/target/goal, stable objective/event IDs, dependencies, unresolved participant hints or explicit confirmed UUIDs, private notes, server version selection/history, archive, fork/restore, activation and intentional skip. Desired outcome belongs in the existing goal text; no untyped field is written. Up/down actions preserve target chapter rather than silently renumbering it.

## Drafts, concurrency and privacy

Device-local recovery is keyed by account + novel + lane (review additionally by snapshot). It is not an alternative server store: no authority until explicit POST and GET readback. Edits synchronously keep a recoverable buffer, show dirty state and warn before closing. In-app unmount preserves recovery. If storage fails, warn and offer export; an in-memory fallback only survives the current tab. Reload reads server without replacing dirty text; explicit discard/fork resolves conflicts. Captured setup/plan/Brain versions survive recovery, so stale content is never silently rebased. Operation keys survive uncertain writes. Account changes synchronously abort planning requests before Axios can attach a new token. Retired responses do not update the next scope.

Chapter creation uses existing optional `clientRequestId`, persisted until confirmation. Retry keeps the key, current account/novel/session is checked after Writer flush, account-switch dispatch is aborted, and late success cannot redirect another scope. Merely visiting Write or skipping planning does not create a chapter. Empty genuine drafts remain subject to the existing P2-04 no revision/outbox rule. Before verified M0 (or a real P1 manuscript baseline), the UI explains ordinary draft behavior without automatic analysis. Summary reads real setup/review, readiness/M-FIRST, Brain and extraction states; read failures stay unknown.

## Narrow backend blocker

Real PostgreSQL reproduction confirmed that saving an idea with no setup cards, then adding/reviewing explicit cards in a later version, blocked M0 with `M0_BOOTSTRAP_IN_PROGRESS`. An older empty manual setup has no review group and cannot be reviewed at all. The guard exempts only a superseded setup-v1/extract source of the same author with exact empty setup, empty cards/required IDs and matching source hash. Current/latest setup still needs complete review, accepted materialized artifacts and all existing owner/hash/CAS/history checks. Running, legacy, nonempty, foreign, altered and pending-review sources still block. No migration/schema or other activation authority change.

## Verification in progress

Local Windows Edge/Chromium (HTTP mocks) mounted **actual Vite main.tsx and app/router.tsx**, including AuthGate, not a replacement Planning fixture: manual setup, homonyms, complete review, explicit M0/409, empty/25-card plans, event identity after reorder/CAS, local recovery, real Writer transition and stable create retry, account isolation, mobile/keyboard. Separate legacy mounted setup/plan regression and actual Core PG/Mongo Writer browser tests are retained. These results are not browser-to-database E2E for the new planning screens.

CI adds the actual-route browser scenario, web build and mounted P1 Writer DB browser regression to the existing disposable PG16/Mongo7 P2 job. Existing Gateway/Python setup review, plan, M0 first save/HITL and durable readbacks remain enabled. P7/P8 remain required. All providers fake; paid/live calls zero.

Final exact commands/counts/exit codes, source SHA and artifact links pending. Local exploratory logs remain alongside evidence (ignored); the original PostgreSQL failure is retained. Final screenshots will be captured after source freeze.

## Review gate / limitations

No generic accepted-rule mutation, brainstorming, production publishing, second data store, second editor or later P2 stage. Local private draft recovery remains on this browser profile for its matching account; it is not sent to providers or unauthorized APIs. Readiness to be evaluated only after exact-head CI and evidence.
