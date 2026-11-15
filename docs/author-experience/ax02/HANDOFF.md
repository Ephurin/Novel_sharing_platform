# AX-02 UI implementation handoff

Verdict: **AX02_UI_READY_FOR_INTEGRATION_TEST**. This is not production or integrated acceptance.

## Exact source

- Dependency/base: `b98dab9712e587cc75449795d73252f662b57d6d` (PR #75).
- Prior AX-02 HEAD: `6407f31c673b8a511c676499f3316c40c9414ccb`.
- Dependency merge: `26bed7ac29c24e2fdc6907d1acf905b12454b347`.
- Tested source: `595ef1bd0d060a02140f7659560ce6e9bb242aeb`.
- Tested tree: `f2a9ba4758383d5f135f14b1753bf062eef9a454`.
- Both dependency and prior AX-02 HEAD ancestry checks returned exit 0. Prior documentation commits remain in history. Evidence is committed separately after source/testing; evidence HEAD has the same application source.

## Changed files

- `web/src/features/ai-copilot/author-memory-api.ts`: typed private GET/PATCH DTOs, canonical-only approved profile extension and bounded fail-closed transport validation.
- `EntityProfileEditor.tsx` in the same directory: private UUID-selected editing, explicit CAS reconciliation, manual idempotent retry, authoritative readback, scope/session guards.
- `entity-profile-form.ts` in the same directory: changed-field serialization, Unicode limits and explicit snapshot cutoff validation.
- `AuthorMemoryPanel.tsx` in the same directory: lazy profile tab and reuse of existing public-query refresh.
- `web/package.json`: focused test script; no dependency/lockfile changes.
- `web/tests/entity-profile.test.ts`, `web/tests/entity-profile.browser.test.mjs`, `web/tests/fixtures/entity-profile-fixture.tsx`: API/form and mounted component regressions.
- `UI-CONTRACT.md`: API/UI semantics. Existing PREPARATION.md and PR75-CI-HANDOFF.md are preserved.
- This handoff and evidence directory: new delivery evidence only. No historical AX-01 evidence changed.

## Contract mapping

See [UI-CONTRACT.md](UI-CONTRACT.md). Existing authenticated apiClient → Node Gateway GET/PATCH `/api/v1/ai/story-brains/:novelId/entities/:entityId/profile`; no backend contract changes.

`profile.description/appearance/personality/background` map to the four Canon inputs; `author_notes` maps only to the private notes input. `version`/`brain_version` supply expected_version/expected_brain_version; effective_from_chapter is mandatory on Canon change and absent for note-only mutations. Only changed fields are serialized. New saves/new edits use new keys; exact manual retry preserves its request snapshot. 409 preserves the draft and requires explicit server comparison. Public queries are invalidated without private data; success requires a subsequent GET.

## Verification and readbacks

Commands run from `web`, at the exact source SHA/tree above. Exact outputs and exits are in [evidence/readback.json](evidence/readback.json) and individual logs:

| Command | Exit | Classification |
| --- | --- | --- |
| `npm run typecheck` | 0 | PASS |
| `npm run build` | 0 | PASS; existing directive/chunk-size warnings |
| `npm run test:entity-profile` | 0 | PASS: 3 form/client cases and 16 mounted browser **mock HTTP** cases (17 including wrapper) |
| `npm run test:p1-hitl` | 0 | PASS: 25 unit cases; 11 mounted interactions (12 including wrapper), existing mock harness |

Build/typecheck and all component tests exercise production frontend source. Mounted tests cover GET rendering, changed-field Canon/notes saves, GET readback/reload, homonym UUID isolation, Unicode limits, 409 including failed reconciliation GET, manual same-key replay after ambiguous transport, GET-only retry after readback failure, statuses 401/403/404/422/503, all account/novel/entity pending GET and PATCH switches, and absence of the private sentinel in URL/storage/public query cache/console. A mock write/reload is **not proof of PostgreSQL durability**.

Screenshot files [profile-component-mock.png](evidence/profile-component-mock.png) and [profile-component-mock-save.png](evidence/profile-component-mock-save.png) were rendered in headless Edge and visually inspected. They show the real component with fictional Canon values and empty private notes; the second image shows the private section and disabled no-op save. These are mock-fixture UI captures, not integrated browser evidence.

## Remaining acceptance boundary

- Real integrated browser → Gateway → AI service → PostgreSQL save/reload, real ownership/permission isolation, Canon/AI context exclusion and generation acceptance: **NOT_RUN**. No new database or live provider was created/called. Independent reviewer and integrated acceptance must verify these against the approved stack.
- Pending requests already accepted for the previous UUID/account may complete at that original target; stale completion cannot populate or save the newly selected target. No cancellation/durability guarantee is claimed for an already accepted mutation.
- Private drafts intentionally disappear when account/novel/entity/tab changes or the panel closes; no persistence of unsaved private drafts.
- Cutoff-only edits are rejected unless a Canon field changes; the UI explicitly explains whole-snapshot semantics. Historical reconstruction remains outside this contract.
- Production auth/API and browser session end-to-end behavior are not inferred from mock successes. Existing build warnings remain.
- No P2/P3, backend, migration, retrieval, HITL authority or provenance changes. No merge/deploy. Draft PR targets `codex/p1-ax01-storybrain-core`; stop for independent review.
