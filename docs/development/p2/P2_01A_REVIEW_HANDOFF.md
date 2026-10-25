# P2-01a independent review handoff

**Bounded G10/A16 implementation submitted for GPT-6 review. Do not merge or deploy.** [Draft PR72](https://github.com/Ephurin/Novel_sharing_platform/pull/72), [Issue71](https://github.com/Ephurin/Novel_sharing_platform/issues/71).

## Provenance and scope

- Baseline `main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`, verified before work. Dedicated branch `codex/p2-01a-active-brain-guard`, worktree `p2-01a-active-brain`.
- Contract was committed before implementation: `eda01124`. Final tested source **`f42194f25cf6548bf65db3d7768489c48ecb5f61`**, Git tree **`32f2c2f92ab8e1fb62940b1a41e858e117ea1382`**. Intermediate source repairs remain in history (`e3b038bb`, `735ab563`); their successes are not substituted for final results.
- All six final command records prove clean source before/after, same exact SHA/tree and exit0. Evidence is a separate documentation commit after testing. Its own hash is recorded in PR72/final delivery (a containing commit cannot embed its own SHA); resolve with `git log -- docs/development/p2/P2_01A_REVIEW_HANDOFF.md`.
- No production FE, Core writer/outbox/Mongo CAS, migrations, feature-flag defaults or historical evidence changed. No separate P2 workspace/memory/writer. P2-01b extract/identity, P2-01c null-baseline first-save bridge and P3 are not implemented. No full P1 SPA E2E or live Gemini/embedding call.

## Root cause and repair

Old idea bootstrap called provider, persisted an analysis run/proposals, then created a job; job creation unconditionally set Brain importing. Manuscript shared that insert. Distinct setup on active P1 could therefore disable the existing active-baseline revision/outbox predicate. Replay alone could not protect distinct requests, and an insert-only final guard was too late.

`bootstrap_service.py` now validates tenant scope, exact replay and mode, then obtains a short durable reservation **before provider work**. PostgreSQL `create_bootstrap_job` uses scoped advisory admission plus Brain row lock, checks active status and competing queued/running workers, and creates only an importing reservation. Provider work runs outside locks. Finalization reacquires the same scoped lock, validates active status, reservation nonce/status and Brain version, then inserts run+proposals and waiting_review job atomically. Failure after flushed proposal insert rolls everything back except the separately established failed reservation. Failed exact idea replay returns persisted failure; it never allocates a second group.

Manuscript worker admission and failed-job resume use the same active guard. Duplicate worker attempts do not run analysis twice. Activation validates a scoped waiting_review job, required terminal proposals and no running bootstrap worker under the same lock, and completes the job in the activation transaction. Completed replay is read-only. Existing group acceptance/rejection/CAS authority is untouched; activation/rejection alone do not advance Brain version.

Newly allocated empty Brains now start draft rather than falsely active. Existing active rows—including null-revision setup baselines—are never reclassified. This is necessary because ordinary summary reads can allocate empty Brains before initialization; actual activated P1 state still requires a real baseline revision. A16 confirms normal established-P1 save behavior remains intact after rejection. No P2 first-chapter predicate workaround was introduced.

## Contract/compatibility

See [P2_01A_CONTRACT.md](P2_01A_CONTRACT.md). Public paths remain `/api/v1/ai/story-brains/bootstrap/from-idea` and `/from-manuscript`, backed by trusted-service Python `/v1` endpoints. Gateway owner/active-account checks remain authoritative for human ownership; Python rejects mismatched configured tenant.

- Distinct supported bootstrap on active Brain:409 ALREADY_ACTIVE, no job/run/proposal/Canon/Core/Mongo mutation. No implicit re-baseline.
- Exact authorized replay:202 with existing job ID/status, no provider work or writes—even after activation.
- Optional body idempotency_key: tenant/novel/entry scoped, conflicting supported payload409 IDEMPOTENCY_CONFLICT. Manuscript hash now survives progress/final job writes; locale/content conflicts after activation are covered.
- Omitted mode explicitly preserves historical blueprint behavior; explicit blueprint equivalent. Extract is typed but **unsupported422 EXTRACT_NOT_IMPLEMENTED**, validated before operation-key replay; it cannot silently generate blueprint or mutate an existing operation. Unknown modes/idea fields fail422. Existing UI extract now fails visibly pending P2-01b/02 integration; no UI workaround.
- Queued/running bootstrap conflict:409 BOOTSTRAP_IN_PROGRESS; premature activation409 BOOTSTRAP_NOT_REVIEWABLE. Final stale Brain409 BRAIN_VERSION_CONFLICT; invalid source hash422; wrong scope403/404. More than one legacy completed-extraction job may await review, but activation cannot race any pending worker.
- PostgreSQL is the authoritative concurrent lifecycle. JSON retains the repository protocol and its other operations, but **new JSON bootstrap fails503 BOOTSTRAP_REQUIRES_POSTGRES** rather than claiming transactional safety. This explicit compatibility restriction needs reviewer acknowledgment; no silent JSON fallback. In-memory adapter provides deterministic locked test semantics only.

## Exact-source validation

| Suite | Actual result | Evidence |
|---|---|---|
| Corrected immutable-baseline RED |5 FAIL, exit1 as expected | `p2a-correct-red.log`, baseline/archive/test hashes in `p2a-red-provenance.json`. Initial fixture-signature RED is excluded. |
| AI units |358 PASS,10 SQL-only SKIP,200 PG deselected; exit0 | `p2a-final-unit.log/.xml` |
| Targeted PostgreSQL |132 PASS,74 memory variants deselected; exit0 |13 new A16 +119 existing P1 identity/contract/C-01/atomic rejection; `p2a-final-pg.xml`, `pg-regression-summary.log` |
| Gateway auth/contract units |18 PASS, exit0 | `p2a-final-gateway.log` |
| Real Gateway→Python→PG/Mongo |1 scenario PASS,17 public HTTP requests; exit0 | `p2a-final-node.log`, full `p2a-final-node-durable.json` |
| Backend TypeScript / Python compile |exit0 / exit0 | `p2a-final-typecheck.log`, `p2a-final-compile.log` |

Counts are unique cases in these suites, not summed development retries;5 unit guard cases are included in358. PostgreSQL132 includes13 new cases, not another132 A16-only tests. The live scenario makes4×401,4×403,4×404,4×409 and1×200 save; Python PG adds authoritative422 mode/source,403 tenant,409 stale/replay/activation and rollback cases. No browser acceptance is claimed.

[Machine evidence](p2-01a-evidence-2026-10-25/summary.json), [commands/exits](p2-01a-evidence-2026-10-25/commands-and-exits.json), [full A16 PG snapshots](p2-01a-evidence-2026-10-25/a16-postgres-readbacks.json), [negative equality checks](p2-01a-evidence-2026-10-25/negative-equality-checks.json), [manifest](p2-01a-evidence-2026-10-25/manifest.json). Full verbose unchanged P1 readback log remains externally retained with SHA256/byte count in summary; JUnit and all critical A16 readbacks are committed. No historical artifact was overwritten.

## A16 durable matrix

| Case | Evidence / result |
|---|---|
| Active P1 and active setup/null baseline, idea and manuscript | Python real HTTP4 cases409; Node4 scoped before/after pairs include all narrative tables, decisions, Core chapters/revisions/outbox and Mongo drafts. Existing approved entity UUID, Brain status/version/baseline retained exactly. |
| Foreign author/novel, anonymous | Node401/403/404 before Python mutation; scoped PG/Mongo snapshots identical. Python mismatched configured tenant403, invalid immutable-source hash422; no provider call/new Brain. |
| Exact replay / changed operation payload | Provider call count exactly1; same job returned after activation with no mutation. Changed key payload409; unsupported extract422; manuscript source/locale conflicts after completed processing also fail without mutation. |
| Concurrent exact/distinct launch | One durable reservation/run/proposal set; same-job replay returns running without calling provider. Other running operation409. Full state identical across rejected requests. |
| Activation races | Current running reservation cannot activate; older waiting_review activation blocked while another worker runs. After worker finalizes, authorized activation succeeds. Locks demonstrably do not span the fake-provider callback. |
| Late response after active transition | Forced active-state transition during fake callback then finalization409; no analysis run/proposal group persisted. Brain stays active; only the pre-existing reservation is marked failed. This adversarial writer simulation is distinct from a production incident. |
| Late Brain version / persistence failure |409 stale finalization or injected failure after proposal flush; no orphan run/proposals. Failed reservation remains auditable. |
| Subsequent ordinary P1 save | Real owner PATCH advances Mongo draft1→2, Core revisions1→2 and exactly one scoped INCREMENTAL_ANALYSIS outbox to COMPLETED. Brain remains active/version5, approved entity ID unchanged; extraction-only authority preserved. |

All **14 negative before/after equality pairs** are machine rechecked (10 PG-scoped plus4 full Node/Core/Mongo pairs). For late-state/failure tests, failed reservations are intentional lifecycle changes; they are not falsely reported as byte-identical rejections.

## GitHub exact-source CI

- [P7 40166652269](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40166652269): **3/3 individual jobs SUCCESS**.
- [P8 40166652268](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40166652268): **7/7 individual jobs SUCCESS**.
- All10 checkout logs use synthetic PR72 merge `0e497fd5b252818cfbd3cd0d77c6c30fd51cb392`, parents current main+tested source, **tree exactly32f2c2f92ab8e1fb62940b1a41e858e117ea1382**. [Individual jobs/checkout proof](p2-01a-evidence-2026-10-25/source-ci.json). Different SHA is not called identical source without tree verification. These are final source runs, not a claim that CI already ran on the later evidence commit.

## Environment and reproduction

Fresh labeled task-only containers `eph-p2a-pg-20261025` (pgvector/pg16, host loopback57110) and `eph-p2a-mongo-20261025` (Mongo7, loopback57112), unique named volumes of the same names. Gateway57114, Python57115. IDs, image IDs, mounts and published ports are sealed in summary. Existing SQL migrations applied through017 (both012 files), Alembic through0013; no migration edits. PG trust authentication is limited to this isolated loopback test instance, not a deployment configuration.

Reproduce on fresh task-owned instances: set TEST_DATABASE_URL and Python DATABASE_URL to a psycopg URL; Node DATABASE_URL uses standard postgresql URL; set MONGODB_URI to the isolated p2a database. Supply fresh disposable test JWT/service secrets locally, never real keys. Apply existing `npm run db:migrate` and Alembic upgrade head. Use LLM_PROVIDER=fake (local core.fake_llm), no cloud base URL/keys, PLATFORM_API_BASE_URL=http://127.0.0.1:<gateway-port> **without /api/v1**; candidate verification remains default OFF for live writer guard, ON only inside existing HITL fixtures. Embeddings are disabled in live runtime; existing PG tests use local fake embeddings. Start Python main:app on57115, run the recorded pytest commands and `TEST_P2A_LIVE=1 tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts` with Gateway port57114 available. The live test requires DB name p2a and retains only task-owned fixture data for audit. Do not point it at another task or production.

FakeBlueprint assertions prove zero calls on active rejection and exactly one on replay/concurrent accepted setup. Live service selects the deterministic fake code path; no paid/live Gemini or embedding client request was made. No JWT/API key/password is exported in artifacts; only actor labels are stored. Manifest seals canonical LF artifact bytes. Display log copies have trailing whitespace removed for Git; original external raw log hashes and the exact normalization policy are in log-normalization.json. Structured database readbacks are not semantically edited. Six actual final commands/exits/source-integrity records are included; setup commands and excluded development attempts are explicitly recorded rather than represented as passing tests.

Only exact task container IDs with ephurin.task=p2-01a were stopped after collection; volumes/data retained. Python process stopped separately by its owned session; Node test closes its server/connections. No global Docker prune, other task restart, historical volume reuse/deletion or deployment occurred. [Cleanup receipts](p2-01a-evidence-2026-10-25/cleanup.json).

## Remaining limits / owner decisions

- Source-backed active-Brain safety is now covered by runtime negatives; this is not full P2 M0/M-FIRST, mounted UI/manual UAT or production readiness.
- No automatic lease/timeout takeover for a process-crash running reservation. It remains fail-closed; an audited recovery procedure is a separate liveness decision. Failed idea replay returns its failure; a new explicit key can retry while inactive.
- JSON bootstrap's503 restriction and explicit extract422 are deliberate compatibility changes requiring independent acceptance. Existing active rows, including legacy empty active rows, are not silently reset; re-baseline needs an explicit separate design.
- Activation request expected-version DTO and full setup-source/identity semantics remain P2-01b; setup-null first-save bridge remains P2-01c. No new staged proposal state or migration was introduced.
- Existing provider-quality, broader product/security/deployment gates remain separate. Default verification OFF is preserved. Gemini must consume the frozen supported/unsupported contract and cannot bypass safety in React.

**Request independent GPT-6 review. PR72 stays Draft. No merge or deployment authorization.**


## Subsequent independent-review correction — 2026-10-25

The original source/evidence above is preserved as the accepted G10 checkpoint. Current narrow JSON compatibility correction, exact new SHA/tests/CI and unresolved owner UX gate are in [P2_01A_COMPAT_REVIEW_HANDOFF.md](P2_01A_COMPAT_REVIEW_HANDOFF.md). This does not retroactively relabel the original runs.
