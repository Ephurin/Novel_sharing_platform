# PR72 compatibility review correction

Responds to [GPT-6 review6394175233](https://github.com/Ephurin/Novel_sharing_platform/pull/72#issuecomment-6394175233). **Correction submitted for quick independent re-review; no merge/deployment.** Previous G10/A16 acceptance/evidence remains historical and intact.

## Exact delta and behavior

Reviewed HEAD `79389ceb96de9140d310b52c4c20808545fc436a` → tested correction **`5d3449d4dc75dc9659c054496a713f8d7675b04d`**, tree **`2af5781d2e7471775700ad0dd39e367b7fcc42d8`**. Main remains `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`.

Only production change: factor existing lifecycle-capability check into `_require_lifecycle()` and invoke it in manuscript `start()` after exact replay, before `_preflight_active` and immutable-source work. `_reserve` uses the same check. JSON cannot reach its incompatible read_only port; new idea/blueprint and manuscript requests consistently fail503 BOOTSTRAP_REQUIRES_POSTGRES without mutations/provider work. No JSON lifecycle is re-enabled and no global read-only API/PG transaction is changed. Exact replay retains precedence.

RED on unchanged79389ceb plus the new test overlay reproduced manuscript HTTP500 in both empty and persisted JSON cases:2 FAIL/3 PASS, exit1. GREEN tests cover both entry points against empty and actual persisted active JSON files, compare exact disk bytes/in-memory jobs/runs and assert provider/source calls0. Two seeded cases have nonempty before-file hashes, avoiding vacuous empty-directory assertions.

Nested DTO strictness is now explicit in P2_01A_CONTRACT: top-level idea extra-forbid and typed mode; nested IdeaBootstrapPreferences retains legacy extra-ignore. A compatibility test confirms recognized genre survives and unknown nested preference is discarded. Hardening nested semantics belongs to P2-01b.

## Exact-clean-source checks

| Check | Result |
|---|---|
| JSON route/strictness |5 PASS, included in AI total |
| AI unit |363 PASS/10 SQL-only SKIP/200 PG deselected |
| Relevant real PostgreSQL A16 |13 PASS on fresh task-owned PG/pgvector |
| Python compile |exit0 |

All four recorded commands exit0 with identical clean SHA/tree before/after. [Commands](p2-01a-compat-evidence-2026-10-25/commands-and-exits.json), [JSON no-mutation hashes](p2-01a-compat-evidence-2026-10-25/json-nonmutation-readbacks.json), [full A16 scoped PG readbacks](p2-01a-compat-evidence-2026-10-25/a16-postgres-readbacks.json), [summary/attempt policy](p2-01a-compat-evidence-2026-10-25/summary.json), JUnit and logs are committed. Display log LF/trailing-whitespace normalization and original raw hashes are disclosed; artifact manifest hashes are canonical Git bytes. No JWT/API credential is included.

One earlier PG attempt failed at connection/setup after an old task container restart changed its port;13 errors are not counted as tests passing. A fresh instance `eph-p72-compat-pg-20261025`, owned label p72-json-compat, actual host port46099/database p72compat, ran all13 cases successfully. Only this new container was started and stopped; volume retained. The old P123 stacks were not restarted. No Mongo/browser/full P1 E2E or live provider was needed for this correction. Accepted prior119 P1 PG,18 Gateway and real Node→Python→PG/Mongo evidence is referenced as prior evidence, not falsely relabeled newly executed at this SHA; current CI independently checks the correction.

## Current source CI

- [P7 40168748490](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40168748490):3/3 individual jobs SUCCESS.
- [P8 40168748465](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40168748465):7/7 individual jobs SUCCESS.
- All10 logs checkout synthetic merge `6c94b3d2ab63ce016cd58e7450169cfeebfc1ca4`; its tree exactly equals tested correction tree above. [Individual job/checkout proof](p2-01a-compat-evidence-2026-10-25/p72-compat-ci.json). These are source CI checks, not a claim about the later evidence commit.

## Owner gate remains OPEN

Current AuthorMemoryPanel sends extract; intentional422 EXTRACT_NOT_IMPLEMENTED leaves its setup action nonfunctional until P2-01b/P2-02. Before shared-main merge, owner must explicitly acknowledge that transitional UX or explicitly choose an integration hold. This follow-up does not grant acknowledgment, retarget/merge the Draft PR, modify FE, claim P2 extract/M0/M-FIRST PASS or production readiness. JSON new-bootstrap503, fail-closed crash-running reservations and prior bounded limits remain documented.

Evidence is a separate docs-only commit; its exact hash is recorded in PR72/final delivery because a containing commit cannot embed its own SHA. Stop for GPT-6 quick independent re-review.
