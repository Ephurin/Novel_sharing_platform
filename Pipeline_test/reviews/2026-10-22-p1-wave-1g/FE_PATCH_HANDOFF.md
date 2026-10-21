# Wave1G FE handoff — no patch integrated

Issue [#56](https://github.com/Ephurin/Novel_sharing_platform/issues/56), PR [#55](https://github.com/Ephurin/Novel_sharing_platform/pull/55), inspected head `0c0b903f4cc86b7f469399ab6e616ffdba7e703b`. Review submissions:0; issue replies:0. No designated reviewed S09 fix exists at closeout. Production FE remains unchanged.

Run focused regression from repository root (requires existing web dependencies):

```powershell
node --test Pipeline_test/tests/wave1g_autosave.test.mjs
```

Expected current result: **17 tests,12 PASS/5 FAIL, exit1**. Failures are four old-inline B→A→B contracts (title/body/VIP/price) and one hook account-boundary diagnostic. The script transpiles actual source, replacing clock/API/React primitives with deterministic test doubles. It does not duplicate the autosave algorithm and does not prove a mounted React/browser/backend flow. PR source snapshots are byte-checked against the inspected commit.

PR hook results:11 PASS/1 FAIL. Pending is cleared on revert, so the leftover timer drains nothing: do not infer the old defect from timer placement alone. Tests cover latest-C coalescing, serialized A-in-flight→B including a timer firing while A is unresolved, expectedVersion progression after acknowledgment, 409 retaining local buffer and blocking retry, unchanged double flush, chapter-ID routing and unmount recovery. The account diagnostic re-renders the same hook instance as another user with the same chapter ID: `slots` is keyed by chapter only and `initialize()` returns the prior user's pending value. Confirm whether the real auth/router always remounts this component; browser exploit/security impact is **NOT_ASSESSED**. Do not mark it resolved solely by unit mocks or assume an actual cross-account request occurred.

Fresh Playwright RED: run `2026-10-22-p1-wave1g-s09-red-01`, browser `browser-red-01`, novel `9f22ab2b-fdfe-4e14-9b19-9e4c56af0f49`, chapter `ed22724c-a6b9-432a-a08a-f3d4236f4074`. B→A→B in391ms resulted in one real PATCH200 carrying A and a durable draft A while the editor shows B. New diagnostic brain was importing, so immutable revision remained B and outbox count0. This is a bounded independent RED, not S09 acceptance after S08; the historical Wave1F active-brain stale immutable revision is preserved separately.

Required deliverable from FE owner: an identified fix commit and tests reviewed for the actual implementation; explicit compatible patch scope for the pipeline branch. Never transplant the old inline cancellation fix into the hook blindly. The hook depends on backend `expectedVersion`/`draftVersion`, atomic version matching and409 `DRAFT_CONFLICT`; the current pipeline schemas/service do not implement that contract. PR also introduces workflow/migration dependencies015/016. Review backend compatibility and required migrations in a NEW database before any narrow integration. Do not merge the full FE branch.

After a reviewed compatible patch: build/typecheck the integrated web, targeted backend tests, fresh isolated browser scenarios for all six handoff groups, including actual concurrent tabs/409, in-flight/reorder and source/outbox safety with an **active** Story Brain; only then S10/S11. UI Continue replay remains a separate E2E gap. Browser navigation/reload/account switch acceptance, real semantic RAG and actual generation prompt context remain NOT_RUN/NOT_ASSESSED. No real provider calls are authorized by this handoff.
