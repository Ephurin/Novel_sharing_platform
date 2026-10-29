# PR #79 — UX-01-F01 remediation

**P1_DEMO_UX_01_READY_FOR_REVIEW — F01 fixed, pending independent re-review.**

## Source and minimal change

- Reviewed PR head: `0e7ede8e7cd17aa537e37bceff5d40c39df8860c`.
- Tested source/test commit: `e603aa692b23e52ce22e2107036fabb552f7608b`.
- Tested tree: `36b8c5827d48c3b088ac74aa669fd4f2d45a1ae7`.
- Same branch/PR: `codex/p1-demo-ux-01`, [PR #79](https://github.com/Ephurin/Novel_sharing_platform/pull/79).
- One production change, in `EntityExtractionReview.tsx::applyToMatchingSurface()`: return the original source decision unchanged; build other targets from their existing decision when present; explicitly retain that target's identity_quote and status_quote, including intentional empty values. Undecided targets use their own machine decision, never the source quotes.
- Eligibility, UUID/group isolation, CAS, Freeze/HITL authority and backend validation remain unchanged.
- Two existing browser test files extended. No backend, migration, API contract, main or Canon logic changed.
- Historical report/evidence preserved; this supplement and new evidence are a separate commit.

## RED and GREEN

Before changing the component, the new mounted browser regression failed at `Evidence must stay with loc-1`: both authored source quotes became empty after bulk confirmation. Seven existing subcases passed. Node reports 9 total tests including parent, 2 failures including parent; the single failing subcase is F01. [RED log](evidence/p1-demo-ux-01-f01/red.txt).

After repair, eight focused subcases pass (9 Node tests including parent). The F01 case:

1. Authors enter identity/status quotes for source and a same-identity target, with different values per candidate.
2. Confirm bulk to those candidates and one undecided occurrence.
3. Navigate to another page and back, save partial decisions, fully reload.
4. Assert source and target quotes remain on their own candidate; undecided occurrence retains empty quotes.
5. Resolve remaining fixture candidates, Freeze and assert the same quote mapping in its payload. The source's authored reason is also retained.

Mounted regression uses mocked API boundaries. The separate smoke below uses the production frontend, actual Gateway, PostgreSQL and reviewed fake provider.

## Exact commands and exits

All final runtime tests ran against e603aa6. Commands from repository root unless noted:

| Command | Exit | Result |
|---|---:|---|
| `node --test web/tests/p1-entity-checkpoint-ux.browser.test.mjs`, before fix | 1 | F01 RED |
| Same focused command after fix, before source commit | 0 | Component bytes match the committed fix; rerun included below |
| `npm.cmd --prefix web run test:p1-hitl` | 0 | Unit 25/25, legacy browser 12/12, focused browser 9/9; no skip/xfail |
| `python scripts/p1_final_acceptance.py web-build --output ..\p1-ux-f01-private` | 0 | Underlying `npm.cmd run typecheck` and `npm.cmd run build`, cwd web, each exit 0; API base /api/v1 |
| `npm.cmd --prefix web run test:p1-checkpoint-real` | 0 | All six real-stack steps PASS, including added quote/PG/provenance assertions |
| Driver provision → bridge-config → db-up → up | 0 | New owned project, actual backend/AI migrations applied |
| Driver cleanup-owned, plus cleanup after metadata-only ledger read | 0 | Only task-owned resources; no remaining project containers |

[HITL command metadata](evidence/p1-demo-ux-01-f01/hitl-command.json), [real command metadata](evidence/p1-demo-ux-01-f01/real-command.json), [driver argv/exit ledger](evidence/p1-demo-ux-01-f01/commands-and-exits.jsonl), [source provenance](evidence/p1-demo-ux-01-f01/source-provenance.json). Public log copies normalize EOF whitespace; originals remain private.

## Real Gateway / PostgreSQL / HITL

Fresh owned project: `codex-p1-final-c6f98821bb`. Flag selected and applied: `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`. LLM transport targets the local budget gateway/fake upstream; fallback disabled, embeddings none. Five received fake requests; zero live LLM/embedding calls. Configuration evidence is the resolved compose configuration used by successful up, not a post-cleanup live-container env probe.

API fixture setup creates author/novel/chapter; UI performs bootstrap, group/type edits, quote entry, bulk confirmation, pagination, partial save/reload, genuine CAS 409 handling, Freeze, separate Canon approval and activation. No SQL fixture writes.

Final novel `bbc4c61e-a3ff-4ad4-8d12-97fa8553d4d0`, analysis `df4289a0-7089-4723-97b3-80671cd19e0a`.

| Candidate | Role | SHA-256 of its own quote pair |
|---|---|---|
| `e9e97db1820ed3bf823d0e69` | Bulk source | `cc20a337425f162e394a8115814ce8c7e4d102007b6f91c5a37fff3931153267` |
| `b530a172152bf81d226138f0` | Existing target | `5713d91c8fb3364e0fe359eeb3f37c24a5cead1e6559744fdbca2964a2a6b9f1` |

Hash encoding: SHA256 of UTF-8 JSON.stringify([identity_quote, status_quote]). Gateway Freeze hashes match the production repository/PG assertion proof.

Verified with runtime assertions:

- Save payload and PostgreSQL JSONB `narrative.analysis_runs.entity_candidate_audit.reviewed_decisions` retain the respective quotes.
- Full reload returns the same quotes in each candidate's UI fields.
- Freeze payload, PG reviewed_decisions and review_submitted_decisions retain both pairs.
- Machine decisions and candidate/source projections compare equal with the initial database snapshot.
- Frozen occurrence revision IDs, source hashes and exact offsets/quotes match the original immutable chapter revision.
- Every queued HITL proposal evidence span matches that revision's text/hash. The authored fields do not replace canonical source spans.
- LOC status remains Unknown; entered source excerpts do not create an alias or state-transition proposal. No fabricated life-status fact.
- Canon remains unapproved immediately after Freeze; separate explicit HITL approval is still required.
- After approval/activation, PG audit quotes remain intact; immutable revision ID/hash/content are unchanged; confirmed entity types and UUID preservation checks still pass.

[PG/Freeze/HITL proof](evidence/p1-demo-ux-01-f01/ux-checkpoint-proof.json), [Gateway quote hashes](evidence/p1-demo-ux-01-f01/gateway-quote-hashes.json), [actual browser steps](evidence/p1-demo-ux-01-f01/browser-steps.json). Browser runtime errors: empty.

A metadata exporter initially used Windows' default text codec, causing a cross-runtime quote-hash comparison to fail. It was regenerated with explicit UTF-8 before publication; the Gateway/PG hashes now agree. Application/test assertions were unaffected. The retained fake ledger was read through a temporary task-owned container after shutdown; it started no provider server and was cleaned up.

## Hygiene and limits

New evidence contains hashes and sanitized readbacks, no raw prompts/auth responses/traces/private audit snapshots. Targeted secret hygiene result is recorded alongside the evidence. Private configuration and raw outputs remain outside Git. Existing evidence was not rewritten.

Full browser reload is verified after Save; no new persistent local draft store is introduced. Fake-provider smoke establishes persistence/provenance and existing LOC/UUID/CAS behavior, not live-model quality or production acceptance. No broader Author IDE redesign or new Canon feature.

Keep PR #79 Draft. No merge/deploy; independent reviewer must decide the new finding's acceptance.
