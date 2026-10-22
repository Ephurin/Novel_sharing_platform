# S09 FE handoff — ASTRA

**S09_BROWSER_RED_UNVERIFIED_THIS_RUN. Issue #56 remains OPEN.** This run independently passed the mounted PR55 hook fixture, not a production Author IDE S09, integrated pipeline UI, S10 or S11. No historical RED was overwritten.

## Current GitHub facts

PR55 head `7b15c078c1ffe2fca96c4e66c96577e3ff007c3c` targets exact PR54 head `18759ae65f33f935c7243b53f435630a7c53f4cb`; metadata updated2026-10-22T08:05:27Z. Issue56 updated08:05:49Z is open. Its latest owner comment [6335899266](https://github.com/Ephurin/Novel_sharing_platform/issues/56#issuecomment-6335899266) explicitly separates hook/component fixture evidence from full Author IDE/P1 acceptance. Green PR-head Defense Demo/P7/P8 runs are captured read-only, first page only, and do not close S09 on the pipeline tree.

Last proven historical RED: pipeline source `34fff042c3272e9661f7bf7163f290b4b5483568`, saved B→temporary A→Undo B inside1200ms; visible editor B while server/latest revision A. Evidence: [S09_DEFECT_PROOF.json](../../2026-10-21-p1-wave-1f/S09_DEFECT_PROOF.json), [executor report](../../2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md) and readback path in github-issue56.json. Current pipeline inline editor still returns on !hasChanged before clearing the pending timer at AuthorWritingIde.tsx:455–465. Do not attribute that old implementation's RED to the new PR hook.

## Independent rerun this task

Executed unmodified `web/tests/draft-persistence.browser.test.mjs` copied to a new external sandbox with source/fixture/backend junctions into the clean pinned PR55 worktree. This layout redirects its existing relative evidence path to a **new empty sandbox directory**, not the tracked historical FE evidence. Production web files and the original test source were unchanged. Backend uses real new PostgreSQL/Mongo fixture data; provider service points only to closed loopback port9, keys blank; no native AI worker launched.

| Attempt | Result and interpretation |
|---|---|
|01, direct host mapping to internal Docker DB network | Exit1: ECONNREFUSED before browser/fixture readiness. Preserved browser-attempt01.json and pr55-hook-browser-attempt01.txt. Infrastructure failure, not a hook/S09 defect. |
|02, fixed-destination loopback DB proxy | Exit0,1 browser test PASS, no skipped test, approx52 seconds. Backend/code unchanged. |
| PR55 web npm run typecheck | Exit0 at exact PR55 SHA; no inference of UI acceptance. |

Observed fixture checks: true hook + Strict Mode/router + NovelReviews mounted; B→A→B generated **0 PATCH** with unchanged checkpoint/outbox; latest-buffer debounce, in-flight A→B, chapter isolation, route blocker, account retirement/recovery, cross-tab409 conflict recovery, router remount and explicit snapshot hash matching outbox. Final explicit snapshot hash is `1c31f508e23011aa9e87458d772c78d68aff6012b218b0fcb7b157a66423d861`. It is an explicit checkpoint; this PR autosave does not independently demonstrate Core active-baseline automatic revision/extraction.

Evidence: browser-runtime.json; pr55-hook-browser.txt; draft-readback.json; fresh screenshots; sanitized trace. Raw trace remains private because it contained transient fixture JWTs. draft-trace-sanitized.zip removes23 JWT occurrences; trace-redaction.json observes7 HTTP URLs, all127.0.0.1. Sanitization is a transformation, not the raw original trace. No screenshot or fixture substitutes for the missing full editor run.

## FE-owned integration check order

1. Wait for Core ownership/security decision for **CORE_DRAFT_READ_SCOPE**: this preflight reproduced anonymous and foreign AUTHOR GET200 leaking a synthetic private DRAFT on pipeline. PR55 standalone API correctly denied401/403. Keep both records; do not merge whole services to fix it.
2. Agree minimal compatible hook/editor/auth/query-cache patch and API policy with Core owner. Retain ordered writer lease and active-baseline revision/outbox path. Confirm version0 initialization, returned draftVersion and optional-versus-required expectedVersion/428. PR55 separate API checked missing-version428, owner200, stale409 and pricing-only200.
3. Mount **full AuthorWritingIde with production auth/router**, not only hook fixture, against the finalized Core tree and fresh offline data. Establish an active baseline through permitted author review before testing automatic source effects. This preflight intentionally has no combined code tree to serve that full editor; future compatible patch is FE-owned.
4. Run real-editor B→A→Undo B before dispatch; assert visible draft, Mongo and immutable latest/outbox remain B with no stale A dispatch. Run dispatched A→B and settle all requests; intermediate histories may exist only under a documented consistency contract, never silently approve stale source as latest.
5. Chapter switch, account switch during debounce and in-flight request, route blocker, reload/remount/local recovery; never write X to Y or send retired buffers under a new actor. Two tabs must surface409 without losing local text; required-version clients must handle428 intentionally.
6. Read back visible editor == authoritative draft, latest canonical revision/hash and active Story Brain analysis source; retain HAR/trace/screenshots and sanitized owner/tenant IDs. Test title/VIP/price and accept/restore overlap under the Core lease. Draft save/review must never auto-publish.
7. Only after independent **S09** acceptance, separately execute S10/S11, P1/P2/P3 UI journeys and publication/notification smoke under their respective owners. Do not upgrade real provider, semantic RAG, prose quality or100k gates from fixture results.

No issue/PR comment was posted and no FE work was implemented. Stop for GPT-6 review of this handoff and the new Core read-access P0.
