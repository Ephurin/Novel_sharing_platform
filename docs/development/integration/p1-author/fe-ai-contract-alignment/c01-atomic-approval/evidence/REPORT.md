# C-01 — Atomic Canon approval and dependency integrity

**C01_CLOSED_PR64_READY_FOR_GPT6_REVIEW** for the bounded P1 PostgreSQL/Gateway scope.
Draft PR: https://github.com/Ephurin/Novel_sharing_platform/pull/64
Finding: https://github.com/Ephurin/Novel_sharing_platform/pull/64#issuecomment-6378046116

## Source and evidence provenance

- Reviewed base, fetched unchanged before edits: `839b9525385f0ab137512c76ba4d434bdb736dbc`.
- Integration target remains `dd2f8003b0ad94e6097819cdca0249aa591f54fa`.
- Exact clean tested source: **`46da7223aa3152614a75c86ae39db99475e0097a`**.
- Source Git tree: **`e5b0aa98aa08fd33d940a83f9e7da2013bb08812`**.
- GitHub PR checkout `f4304552223bb8ab5746795e7574cb2326e3498d` has that identical full tree;
  parents are the integration target and exact source SHA. This is a CI merge ref, not a PR merge.
- Evidence is a separate commit directly after the source. Its exact SHA is in PR #64 and the
  final delivery; a commit cannot embed its own hash. MANIFEST.sha256.json hashes committed Git blobs.

All final acceptance suites asserted clean HEAD before execution. RED-source-integrity.json seals
the reviewed base and exact test overlays, including production file hashes. Only regression tests
differed during RED; no production repair was present. Fake providers and fresh isolated owned
PostgreSQL/pgvector 16 + MongoDB 7 were used. No live provider, production or historical DB was used.

## Root cause and authoritative correction

The group service preflight required complete membership, but single accept/edit-and-accept called
the same repository with only one ID. The repository checked selected statuses and group compatibility,
not equality with the entire persisted group. An entity could commit alone and advance Brain version,
stranding dependent pending proposals. A separate legacy decide_proposal(accepted=True) path advanced
version and status without materializing Canon at all.

The PostgreSQL acceptance transaction now rejects empty/duplicate canonical proposal IDs, locks the
scoped Brain, validates version, locks selected rows, validates pending status and one group, then
loads/locks **all persisted members** with the same tenant + novel + dependency_group_id. No status
filter removes previously decided members. The submitted ID set must equal this complete set.
Therefore single-member subsets, mixed groups and omission of rejected members fail closed.

The existing B5 edit/frozen-inventory checks, all materialization, projection validation, proposal and
decision writes, and Brain increment remain in the **same transaction**. Version advances once only
after successful projection. Any exception rolls the transaction back. There is no post-commit version
update and no automatic approval of unsubmitted members.

Legacy PostgreSQL decide_proposal(accepted=True) now delegates to this transaction. A genuine
singleton still commits independently; a member of a larger group does not. Rejection locks its row
before checking status so it cannot overwrite an acceptance that committed while it waited.

Existing repository fixtures that supplied malformed status-only facts now supply valid standalone
facts, and the stale-version fixture explicitly uses two independent groups. Existing assertions are
retained, with a new assertion that approval actually materialized a fact. No test coverage was removed.

## Entry points inspected

| Entry point | Result |
|---|---|
| Public Node /api/v1/ai/proposals/:id/edit-and-accept | Existing active-author/owner/evidence guard; authoritative rejection now comes from repository |
| Python /v1/proposals/:id/edit-and-accept | Trusted service → accept_proposal_by_id → accept_proposal → atomic repository guard |
| Python /v1/proposals/:id/accept | Trusted unedited path → same guard; Node does not mount this endpoint |
| Node/Python /proposal-groups/:group/accept | Existing service preflight retained; transaction independently verifies complete persisted membership |
| Service accept_proposal / accept_proposal_by_id | Same guarded repository transaction |
| Service accept_proposal_group / accept_proposal_group_by_ids | Same guarded repository transaction |
| Direct PostgreSQL accept_proposal_group | Authoritative invariant, independent of Gateway/service checks |
| Service/repository decide_proposal(accepted=True) | Legacy status-only PostgreSQL branch removed; delegates to atomic Canon |
| Existing autonomous-controller group caller | Uses the guarded group endpoint; no P3 implementation changed |
| Reject path | Final rejection retained; row lock prevents stale overwrite of committed approval |

JSON/in-memory legacy adapters were inspected, but they do not provide PostgreSQL transaction
authority and are not used as proof of the supported P1 PostgreSQL execution gate. Legacy suggestion
validation status="accepted" is not proposal Canon materialization. Full design and future-review
storage assessment: [../CONTRACT_NOTE.md](../CONTRACT_NOTE.md).

## Focused RED → GREEN

Verified RED on reviewed HEAD: **9 FAIL, 8 PASS**, exit 1, in test-red-verified-c01.log.
Real Gateway RED: **1 FAIL**, exit 1, in test-red-verified-live.log, with 32 recorded requests before
the assertion stopped the flow. The owner single-item request returned **200** and Brain **1 → 2**;
red-http-readbacks.json records one accepted entity/proposal/decision alongside remaining pending
group members. The immutable chapter and Mongo readbacks are retained. This is observed executor
runtime evidence, not merely the source-derived finding.

The first development RED included a wrong-tenant fixture missing actor_id; that setup error was
corrected before the verified RED above. The initial logs remain and are not counted as security
proof. An initial unit run exposed obsolete status-only fixtures; pre-fixture-unit-failure.log is
retained separately. Verified RED test overlays and source hashes were sealed before production edits.

| Case | RED finding / baseline | Final GREEN assertion |
|---|---|---|
| C01-A | Public single edited entity accepted alone | 422; full scoped Canon/Brain/proposals/decisions unchanged; subsequent complete group succeeds |
| C01-B | Trusted unedited API and direct service/repository/legacy decision could commit partial approval | Same authoritative rejection with durable before/after equality |
| C01-C | Full edited group already worked | Exact edited summary/fact persist; all dependent artifacts materialize; one version increment; retry has no mutation |
| C01-D | True public singleton worked | Unedited, edited and internal singleton acceptance all materialize Canon and increment once |
| C01-E | Single-first/overlap could strand a partial group | Single-first, group-first and true overlap produce one complete commit; partial path 422/409; no partial Canon |
| C01-F | Duplicate IDs and omitted decided member bypassed checks; existing scope/version guards already worked | Duplicate/mixed/foreign-novel/wrong-tenant/stale/decided-member selections reject without mutation; foreign owner 403 and anonymous 401 over Gateway |
| C01-G | Existing accepted H-01–H-05/B5 behavior | Full 116-case PostgreSQL HITL/contract/C01 suite passes, preserving frozen IDs, homonyms, locks, edits and pending-memory separation |

Additional rejection-versus-complete-acceptance race verifies either a complete accepted group at
Brain 2 or no Canon commit at Brain 1 with a rejected member; a late rejection cannot rewrite committed
status. This does not add staged review semantics.

c01-postgres-readbacks.json contains **47** focused snapshots, including decision rows and all
affected Canon/state tables. Raw focused and full-suite logs retain the complete diagnostics.
green-http-readbacks.json compares durable state across 401/403/422 single-item attempts and trusted
unedited rejection. The real overlap commits the full group once; the losing single request fails.

## Exact-source regression results

| Suite | Result |
|---|---|
| Focused C-01, real PostgreSQL | **20 PASS** |
| Full P1 HITL / H-01–H-05 / B5 contracts / C-01 | **116 PASS**, includes those 20 |
| Other PostgreSQL narrative/semantic/cutover regressions | **31 PASS** |
| Full AI non-PostgreSQL unit | **339 PASS, 10 SKIP** |
| Focused backend Gateway/authorization/CAS/Canon | **74 PASS** |
| Real Node → Python → PostgreSQL/Mongo HTTP | **1 PASS, 70 requests** |
| Python compile, backend TypeScript, FE contract TypeScript | **exit 0** |

**561 distinct local PASS cases**. Focused repeats, HTTP request counts, development reruns and CI
are not added again. Every final suite's command, cwd, UTC time, exit and clean SHA seal are committed
in commands.json and per-suite command/source files. Migrations both exited 0 on the fresh final DB.
Unit skips are reported as skips, not passes. The separate P8 all-PostgreSQL CI job reports **158 PASS**;
it overlaps local suites and is not added to the unique local count.

The actual HTTP flow also retains accepted PR64 coverage: two newly discovered same-name characters,
human provisional grouping, guidance refresh, edited Canon, exact-ID author lock, subsequent revision,
approved-only correction and provenance reload. It adds owner/foreign/anonymous partial approval,
trusted unedited partial rejection, concurrent complete/single acceptance, and a public genuine
singleton. Brain reaches 6 only through valid whole-group Canon actions and the genuine singleton.

## New exact-source CI

- P7: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40050580516 — **3/3 jobs SUCCESS**.
- P8: https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40050580581 — **7/7 jobs SUCCESS**.

These runs belong to source **46da7223**, not the previous accepted source. ci-source.json records
individual jobs/steps, source SHA, the 158-case PostgreSQL CI result and checkout/tree verification.
P7 now includes the C-01 PostgreSQL file explicitly; P8 runs all PostgreSQL tests. Frontend API cutover,
backend integration, root Compose, rollback and cleanup gates succeeded.

## Review versus commit and limits

No staged states, migrations or endpoints were introduced. Existing accepted still means Canon.
The architectural note describes possible future pending/staged per-item decisions, independent group
review CAS, immutable source/membership fences and one atomic final commit. Current final decision
rows lack a stage discriminator/group review version; a safe future feature needs a separately
reviewed storage design, likely migration, and a new FE staging/commit contract. This is not implemented.

The current FE contract remains: approve a complete group; use single accept only for a true singleton.
Already partially decided historical groups fail closed; this task does not repair production data
or silently rebase proposals. No such production incident is asserted from the isolated RED fixture.

Accepted B1/B4/B5/B6 behavior and B2/B3 handoff remain. FE controls and Gemini mounted S09–S11 remain
separate gates, NOT_RUN here. No browser E2E or production readiness is claimed. No main/integration/
feat branch, FE production source, dependency/migration or historical evidence was changed. PR #57
was not merged. No deployment, live AI provider or P3 work was initiated.

Four C-01-owned containers were stopped after validation; resource-cleanup.json records ownership,
commands/exits, mount identities and equal before/after Docker volume inventories. Old resources and
every volume were preserved. For reproduction copy c01_final_runner.py to fresh scratch, set ROOT
to the clean source checkout and keep OUT outside committed evidence, then run provision, migrate
and the recorded test-accept-* modes. All real keys are cleared and providers are fake.

Stop for independent GPT-6 delta review. Keep PR #64 Draft; do not merge or deploy.
