# Atomic dependency group rejection — independent review handoff

Verdict: `ATOMIC_GROUP_REJECTION_READY_FOR_GPT6_REVIEW` (bounded backend/API scope).

- Base: `2eca7f19c20a71202d7c827af2e15d8fb6dc88bb`.
- Contract published before implementation: `3616b503dec46e293a58c98be977fcdad5bf8bdb`.
- Tested source: `e0c0e72651d2fd7eb52b82fdf53932aa4e849123`.
- Source Git tree: `f2fde602c427fc143d50918844b11f9262a8a5c1`.
- Draft [PR #66](https://github.com/Ephurin/Novel_sharing_platform/pull/66), target `integration/p1-author`. The separate evidence commit SHA is published in the PR body to avoid a self-referential hash.

## Root cause and repair

`PostgresNarrativeRepository.decide_proposal(accepted=False)` locked and changed only the selected proposal. The public single reject route could therefore leave siblings pending; a FE loop could partially reject a group. Unlike C-01 acceptance, rejection lacked an authoritative group transaction and shared Brain lock.

New public `POST /api/v1/ai/proposal-groups/{groupId}/reject` accepts only current `expected_brain_version` and optional `reason`. Gateway enforces active AUTHOR/ADMIN policy and resolved novel ownership, forwarding its own tenant and authenticated actor. Internal Python requires service authentication plus tenant/author UUID headers, validates repository tenant, and refuses nontransactional repositories with 503.

One PostgreSQL helper now handles group rejection and legacy singleton rejection. It locks scoped Brain first, checks requested current version when supplied, resolves/locks every persisted group member in materialization-order/UUID order, rejects multi-member single selections, requires every member pending, and flushes all rejection statuses/audit decisions within the same `session_scope` transaction. Group audit uses the authenticated author UUID. No Canon artifact/projection or Brain version is written. Legacy singleton request `{reason?}` remains supported without adding a new CAS requirement; internal singleton audit retains its existing repository actor convention.

Group lookup fails closed on an ambiguous cross-novel persisted group UUID. Repository writes always scope tenant + novel. Rejection may discard an obsolete pending analysis group using **current** Brain CAS; acceptance retains its stricter source/creation-version/frozen-identity validation.

No migration, new proposal state, staged review, FE production change, provider call, P3 implementation or deployment was introduced. B5 edited approval, H-01–H-05, B1/B4/B6 and C-01 remain covered.

## Entry points inspected

| Boundary | Result |
| --- | --- |
| Node single reject controller/routes | Existing owner resolution retained; multi-member selection now fails inside PostgreSQL. |
| New Node group reject controller/routes | Resolves trusted group novel, checks active account/role/ownership, forwards body and trusted actor headers. No browser membership/novel/tenant override. |
| Python single reject route → `reject_proposal_by_id` → `reject_proposal` → `decide_proposal(False)` | Same authoritative group helper; genuine singleton compatibility retained. |
| New Python group route → `reject_proposal_group_by_id` → repository | Scoped resolution followed by authoritative transaction reload; 404/409/422/503 mapping. |
| Python plain accept, edited accept, group accept; internal service/repository/`decide_proposal(True)` | Existing C-01 complete membership and B5 payload validation preserved. |
| `ProposalDecisionRecord` | Existing reject/actor/reason storage suffices; no schema change. |

## RED → GREEN

| Case | Evidence/result |
| --- | --- |
| Partial reject through public HTTP/service/repository | Baseline actually mutates one proposal/decision with siblings pending; public Gateway and Python return 200. GREEN HTTP422 / repository conflict with full durable equality; complete group can still be approved afterward. |
| Entire pending group | Baseline endpoint absent (404). GREEN all rejected, exactly one decision/member with exact actor/reason, no approved Canon/version change. |
| Genuine singleton | Existing `{reason}` succeeds; repeat conflicts without new decisions/version change. |
| Accept vs reject (both serial orders + overlap) | One winner, all accepted or all rejected; no mixed artifacts or audit decisions; Brain advances only when acceptance wins. |
| Two group rejects | One 200, one 409, exactly one decision set. |
| Stale, repeated, decided member | 409; full scoped state unchanged. Historical inconsistent decided-member fixture is explicit SQL setup, not a newly permitted public operation. |
| Wrong owner/inactive/anonymous | Real Gateway 403/403/401; full novel state/Canon/revision/Mongo equality. |
| Foreign tenant/novel, ambiguous cross-novel group, missing group | Fail closed; both owned and foreign scoped readbacks compared. |
| Invalid actor/missing trusted headers/body overrides/missing CAS/service token | 422/403 as applicable, no mutation. |
| Final member audit persistence failure | Test-owned PG trigger raises `owned final decision failure` on the last ordered member. HTTP500 and direct SQLAlchemy DBAPI error; all earlier updates/inserts roll back. Removing trigger permits the same complete group to succeed. |
| Obsolete pending group | Old CAS409; current CAS can discard it without modifying already-approved unrelated Canon. |

Focused GREEN contains 25 cases and 56 full PostgreSQL readbacks. HTTP GREEN has 87 actual Node→Python requests and 42 readbacks, covering the prior exact-ID/edited approval loop and new rejection paths. Readbacks include all narrative tables carrying tenant+novel scope, proposal decisions and event participants; HTTP also retains platform immutable revision and Mongo draft readbacks. Full raw output is retained alongside extracted JSON.

RED provenance: initial pre-fix PG run produced **16 FAIL / 2 PASS**, and the original real Gateway RED is retained (partial rejection 200, mixed pending/rejected group, unchanged Brain version). The initial PG raw log was accidentally overwritten by a development GREEN invocation with the old `test-red-rejection` label. That GREEN artifact is explicitly preserved under `development/first-green-mislabeled-*`, excluded from RED proof. Full PG RED was recaptured from an immutable `git archive` of contract commit `3616b503` plus the **sealed original test overlay**, yielding the same **16 FAIL / 2 PASS**. `red/RED-source-integrity.json` seals pre-fix production files; `red/RED-baseline-replay.json` records archive/test hashes, command, time and exit. Missing-method failures for the not-yet-existing repository API establish missing capability, not the partial-rejection bypass; the HTTP/status/readback cases establish the bypass. Existing historical evidence was not modified.

Development failures are preserved separately and excluded from acceptance counts: an obsolete-group test initially used the group helper on an unpersisted singleton object whose returned group ID was None (400); corrected fixture uses the documented single approval route. A TypeScript test response needed an explicit JSON type annotation. Final committed-source validation is clean and green.

## Exact-source validation

Each final suite checks `git rev-parse HEAD` and empty `git status --porcelain` before executing. `commands.json` records actual argv, cwd, UTC and exit code; `green/*-source.json` records source/database/fake-only seals. All final commands exit **0**.

| Suite | Actual result |
| --- | --- |
| Focused atomic rejection | 25 PASS |
| Full P1 PostgreSQL HITL/H-01–H-05/B contracts/C-01 + rejection | 141 PASS |
| Existing PostgreSQL narrative/semantic/cutover | 31 PASS |
| AI non-PostgreSQL unit | 339 PASS, 10 SKIP |
| Backend ownership/revision/CAS/Canon/outbox regressions | 74 PASS |
| Real Node Gateway → Python → PG/Mongo acceptance | 1 PASS (87 requests) |
| Python compileall, backend tsc, exported contract tsc | PASS |

**586 unique local PASS, 10 SKIP.** The 25 focused cases repeat within 141 and are not added again. CI repeated suites are not added. Ten skips belong to existing non-PostgreSQL/in-memory tests; the new authoritative rejection cases all executed on PostgreSQL.

- [P7 source run 40069972929](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40069972929): **3/3 SUCCESS** — unit, pgvector-integration, root-compose-smoke.
- [P8 source run 40069972923](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40069972923): **7/7 SUCCESS** — frontend-api-cutover, unit, root-compose-cutover-smoke, backend-integration, final-cleanup-gate, rollback-rehearsal, postgres-integration.

Every job's checkout log was checked: synthetic PR merge `461e09fa36585b687059dc937dc7a488fc3ca4d5`, parents base `2eca7f1` + source `e0c0e72`. Its Git tree is **exactly** the tested source tree `f2fde602c427fc143d50918844b11f9262a8a5c1`. CI P1 PostgreSQL is 141 PASS and full PostgreSQL is 183 PASS. `ci/source-ci.json` retains individual job/step conclusions and checkout/test excerpts; no old CI result is reused.

## Environment, resources and limits

Two newly provisioned pairs: `astra-group-reject-51c44309-{pg,mongo}` for RED/development and `astra-group-reject-2e286818-{pg,mongo}` for final clean-source acceptance. Images pgvector/pgvector:pg16 and mongo:7, fresh unique ephurin_test databases, random localhost-only ports. Node migrations and AI Alembic head were applied with captured successful commands. Fake text/embedding providers only; live-provider keys cleared and LLM URL pinned to localhost port 9. Test-owned failure trigger is removed in finally.

Only these four label-verified task containers were stopped after tests; containers and volumes retained. No other task resource was stopped/deleted. `resource-cleanup.json` and owned PG container logs retain provenance, failure injection and cleanup exits.

Gemini must implement the single group request on FE PR #65 after independent backend acceptance; no FE branch or PR was modified. Mounted Author IDE E2E is **NOT_RUN** and is not inferred from HTTP tests. No production readiness, merge or deployment permission is claimed. Default HITL OFF behavior, extraction-only outbox and author-only Canon approval remain unchanged. Legacy JSON/in-memory stores do not implement this new transactional endpoint (503); this acceptance is bounded to PostgreSQL.

Large raw logs/readbacks are gzip-compressed without changing their bytes; `compression-index.json` records uncompressed SHA256/length. Example: `python -c "import gzip,pathlib; print(gzip.decompress(pathlib.Path('green/test-accept-rejection.log.gz').read_bytes()).decode('utf8'))"`. `MANIFEST.json` hashes committed Git blob bytes, excluding itself.
