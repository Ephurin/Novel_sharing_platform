# P2-01 closure investigation and P2-02 preparation

2026-11-07 Asia/Saigon. **Verdict: ENV_BLOCKED** for complete runtime acceptance; source correction is READY_FOR_REVIEW. PR #89 remains Draft. This is Codex implementation/self-review, not GPT-6 independent acceptance. No merge, deployment, live forwarding or P2-02 implementation.

## Base, source, delivery

- Fetch verified before editing: integration base `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627`; PR head/local head `ad5c9c92c163c43c94d1dbd346aec326d705b19e`. Neither had advanced. Existing clean P2 worktree/branch reused.
- Correction source: `a4e602a5b59dad74d112efd188155aefdaed5323`; tree `1988e9094dd3b069a0d02532b75d36b6bb5313c4`.
- Tested CI synthetic merge: `e99ae84da42786d0ce7195dc1b4ebb6ab4169e33`, identical tree. Old CI merge `69072d3d54eb68cd09bbad47b29670fccfe70c23` has tree `b385599245c31ba9251d9959909468cb75c16d44`, identical to old delivery.
- Delivery after this report is a documentation/evidence-only commit; its exact SHA is recorded in the updated PR description. Do not call source CI checks checks of that later delivery SHA.
- Re-read roadmap, gap audit, current bootstrap contract/handoff and pinned WORKFLOW_CONTRACT v1.4 at `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`. Sole Codex ownership supersedes stale Gemini assignments.

## P8 failure 1: root-compose-cutover-smoke

**Classification: regression caused by PR #89; fixed.**

Original [run 42271351664, job 128076425008](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42271351664/job/128076425008) fails at AI-PIPE-03A bootstrap, before controller validation: HTTP 422 `extra_forbidden`, location `body.preferences.pacing`, input `fast`. The unchanged runner sends `preferences={genre:[...],pacing:'fast'}`. PR #89 added nested `extra='forbid'` to a previously permissive preferences DTO without accounting for this existing caller.

Base schema probe accepts the payload (formerly ignores pacing); old delivery rejects it; corrected source accepts it as a typed optional nonempty string. See `p2-01-closure-evidence/base-head-payload-probe.json`. This is a local base/head schema reproduction plus actual CI HTTP failure, not a full local root-compose reproduction.

Fix: declare `pacing`, pass validated preferences to the existing blueprint service, and omit null fields from serialization. Omitted pacing preserves the previous preference dictionary and request hash/job identity. Unknown fields remain forbidden. No test/runner assertion, author review requirement or Canon contract was weakened. Invalid pacing and unrelated unknown keys still fail before reservation/provider.

New HTTP tests prove the existing request succeeds, replay dispatches exactly once, no event history appears, and activation still returns `BASELINE_REVIEW_REQUIRED`. They also verify absent-pacing replay compatibility. The source [P8 rerun 42330565819](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42330565819), [root job 128275887244](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42330565819/job/128275887244), now passes the complete root smoke, including `Gate AI-PIPE-03A Verification PASS` and following route/backend tests.

## P8 failure 2: rollback-rehearsal

**Classification: inherited CI configuration/client-server compatibility defect, exposed by runner environment; outside P2-01. Not a PR #89 runtime/migration regression.**

Original [job 128076425146](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42271351664/job/128076425146) successfully prepares source, migrates, captures snapshots and creates backup. Restore then fails with `unrecognized configuration parameter "transaction_timeout"`; offending command is `SET transaction_timeout = 0;`, exit 1. Source rerun [job 128275887257](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42330565819/job/128275887257) reproduces the identical failure.

`.github/workflows/p8-cutover.yml` is byte-identical at base, old head and corrected source (hashes in `unchanged-ci-paths.json`). It provisions `pgvector/pgvector:pg16` but uses unpinned host `pg_dump`/`pg_restore`. The generated restore preamble is incompatible with the PG16 target. [PostgreSQL 17 documents transaction_timeout](https://www.postgresql.org/docs/17/runtime-config-client.html); [pg_dump compatibility notes](https://www.postgresql.org/docs/17/app-pgdump.html) do not guarantee loading into older server versions. Exact installed host client major was not logged, so it is not claimed as measured. No workflow, backup utility, migrations or restore-target schema were changed by #89. Base restore was not rerun locally; classification is supported by actual two-run error plus identical inherited configuration, not a fabricated base runtime PASS/FAIL.

Reproduction already observed twice: execute the unchanged P8 `rollback-rehearsal` on an environment whose host restore client emits the unsupported preamble against its PG16 service. A smaller proposed reproduction uses a new disposable PG16 container, creates two empty task databases, produces a custom-format dump with a PG17 client, then restores with that client using `--exit-on-error` into the PG16 target. Record `pg_dump --version`, `pg_restore --version`, `SHOW server_version`, dump hash and the exact exit. This controlled small reproduction is **NOT_RUN_ENVIRONMENT** locally; do not point it at P1 or the Argon acceptance databases.

Proposed controlled reproduction commands (new unused names only; no host DB connections; not run here):

```bash
set -euo pipefail
docker network create p2-rollback-repro-20261107
docker run -d --name p2-rollback-pg16-20261107 --network p2-rollback-repro-20261107 \
  -e POSTGRES_PASSWORD=offline-repro -e POSTGRES_DB=p2_source postgres:16
# Wait for pg_isready exit 0 before continuing.
docker exec p2-rollback-pg16-20261107 pg_isready -U postgres -d p2_source
docker exec p2-rollback-pg16-20261107 createdb -U postgres p2_restore
docker run --rm --network p2-rollback-repro-20261107 -e PGPASSWORD=offline-repro \
  postgres:17 pg_dump -h p2-rollback-pg16-20261107 -U postgres -d p2_source -Fc > /tmp/p2-rollback-repro.dump
docker run --rm -i --network p2-rollback-repro-20261107 -e PGPASSWORD=offline-repro \
  postgres:17 pg_restore -h p2-rollback-pg16-20261107 -U postgres -d p2_restore \
  --exit-on-error --no-owner --no-acl < /tmp/p2-rollback-repro.dump
```

Expected last command: nonzero exit with the unsupported `transaction_timeout` preamble. The minimal reproduction isolates client compatibility rather than exercising application data. The proposed follow-up must additionally pass the unchanged full migration/vector/snapshot/source-integrity rehearsal with matching clients. Stop only this named container after capturing evidence; retain it for review.

**Proposed separate PR: `fix(ci): match rollback rehearsal PostgreSQL clients to server`.** Use PG16 client binaries from the service/container or an explicit matching client image for dump, restore and psql; log client/server versions. Keep the custom backup, `--exit-on-error`, restored schema/vector/snapshot parity and source-before/after equality gates. Test the old mismatched-client failure and matched-client success on the same fixture. Do not strip failing SET statements, ignore restore exit codes, weaken assertions or modify application migrations to make CI green. No separate PR was opened or workflow changed here.

## Six-boundary source review

| Boundary | Reviewed behavior and evidence | Remaining limit |
|---|---|---|
| Active Brain | Shared PG advisory/Brain lock rejects active new operations; manuscript read-only preflight precedes revision source access; idea reservation precedes provider | No new local SQL runtime |
| Replay/idempotency | Scoped key/hash lookup before dispatch; atomic admission returns same reservation; finalization verifies token/version; failed idea exact replay returns persisted failure | Crash-abandoned running jobs have no recovery lease; no exactly-once delivery claim |
| Review/Canon | Eligible job + all required persisted terminal decisions rechecked under transaction; missing/pending members reject; generation writes only pending proposals | Existing empty-setup/activation CAS limitations remain documented; no redesign |
| Locks/transactions | Admission → Brain → job lock order; finalization writes run/proposals/job in one transaction; activation shares Brain serialization with Canon changes | No blanket absence-of-races proof; scoped PG CI passes, durable readback package still absent |
| Tenant/auth | Configured repository tenant mismatch rejects; service credentials protect Python; Gateway active AUTHOR/ADMIN and novel ownership precede bootstrap/activation; trusted job scope checked | Single configured tenant, not dynamic multitenancy; dedicated Gateway A16 negative suite still needs Argon |
| P1 Writer/revisions/outbox | No source diff in Node Writer, revision services or outbox; affected offline manuscript tests pass; source CI root production persistence and backend integration pass | No new dedicated Gateway A16 readbacks or mounted browser acceptance |

No additional concrete source defect was demonstrated in these boundaries during this pass. This is not permission for controller auto-approval of author setup/Canon, nor a P2 M0/M-FIRST verdict. Future plan and setup source/identity improvements remain P2-02 or later.

## Files changed in this closure

Production: `ai-service/api/schemas.py` and `api/narrative_routes.py` only (typed pacing, omit null serialization). Tests: new `tests/test_p2_bootstrap_pacing_compat.py`; two pending/missing review cases added to existing `test_p2_bootstrap_postgres.py`. Contract: additive compatibility note. No migration/Writer/Canon/Plan Store changes.

Documentation/evidence: this report, Argon runtime handoff + standalone compose, P2-02 preparation plan, focused-check runner and `p2-01-closure-evidence/` (JUnit, local commands, base/head reproduction, CI excerpts/status/identity). The new closure manifest hashes committed Git blob bytes (checkout CRLF conversion can change filesystem byte hashes). Prior handoff and historical logs remain intact; its status is superseded by this report, not retroactively rewritten.

## Commands and results

Exact argv, cwd, exit codes and clean-source integrity: `p2-01-closure-evidence/commands.json`. Repeat focused checks with `python docs/development/p2/run_p2_01_closure_checks.py` from repository root; it writes only the new closure evidence directory and OS temp test data.

| Check | Source/result | Verdict |
|---|---|---|
| Base/head/current schema probe; unchanged CI-path hash comparison | Base accepts, old delivery rejects, source accepts; CI paths identical | PASS local, exit 0 |
| Focused bootstrap/JSON/idea/manuscript HTTP suite | `a4e602a5`: 31 passed, exit 0 | PASS offline only |
| PG A16 collection | 15 tests collected, exit 0 | Collection only, not runtime PASS |
| Source diff whitespace | `git diff --check ad5c9c92 a4e602a5`, exit 0 | PASS |
| Docker engine availability | `docker version --format '{{.Server.Version}}'`, exit 1, missing Linux engine pipe | NOT_RUN_ENVIRONMENT local runtime |
| Argon Compose validation | Docker Compose plugin unavailable (`unknown shorthand flag: p`), exit 1; Python YAML parser/structural check exit 0 | Runtime config validation NOT_RUN_ENVIRONMENT; YAML structure only PASS |
| Previous source P7 | [42271351755](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42271351755), 3/3 | Historical CI PASS, unchanged evidence |
| Previous source P8 | [42271351664](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42271351664), 5/7; PG 211 passed/8 skipped | Historical actual CI |
| Corrected source P7 | [42330565878](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42330565878), 3/3 | PASS source CI |
| Corrected source P8 | [42330565819](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42330565819), 6/7; only inherited rollback fails | PARTIAL source CI |
| Corrected source PG suite | Actual service PG/vector, `pytest -o addopts= -q -m postgres_integration`, 213 passed/8 skipped/424 deselected, exit 0 | PASS aggregate CI; includes the scoped A16 file selected by marker, not new exported readbacks |
| Corrected root production-path stack | AI-PIPE-01A 15/15, 02A 13/13, 02B 16/16, 03A verification PASS | PASS CI fake-provider composition, not dedicated A16/browser |
| Dedicated Gateway → AI → PG/Mongo A16 + following P1 save/outbox readbacks | Not invoked by existing CI; local engine unavailable | NOT_RUN_ENVIRONMENT |
| Mounted browser acceptance | No local stack/browser run | NOT_RUN_ENVIRONMENT |

The first local focused invocation was interrupted before assertions: restricted sandbox prevented Python's loopback socketpair from completing. A faulthandler rerun showed `socket._fallback_socketpair`/`asyncio` during TestClient startup. Both sessions were stopped; the same unchanged source then passed outside the restricted sandbox. This is an execution-environment failure, not a product-test PASS. No prior full PASS suite was rerun locally.

## Runtime evidence and blockers

The old NOT_RUN PostgreSQL statement is now qualified by verified aggregate CI SQL execution on both old and corrected source. However, CI `-q` captures passing tests' scoped readback prints, and no new durable DB snapshot/JUnit artifact was retrieved for those cases. There are **no newly produced local PostgreSQL/MongoDB readbacks**. Do not promote aggregate CI to the dedicated Gateway A16 package. Runtime acceptance remains incomplete.

Argon has exact isolated-stack setup, fake-provider variables, migration/test commands and expected DB readbacks in [P2_01_ARGON_RUNTIME_HANDOFF.md](P2_01_ARGON_RUNTIME_HANDOFF.md). Its supplied compose has only task PG/vector and Mongo containers, no shared volumes. The document is a handoff artifact, not an outbound message to Argon. Local blockers: missing Docker engine and Compose plugin; no local PG tools. Existing CI has actual fresh service runtimes and remains independently attributable.

Zero real Gemini calls; no quota ledger, P1 QA data, main/demo branches or production changes. Original independent review/owner merge gate remains open. New P2-02 [implementation checklist](P2_02_IMPLEMENTATION_PREPARATION.md) covers explicit extract versus creative blueprint, immutable setup provenance/readback, three authority lanes, private-note policy, same-name identity/HITL, idempotency/version checks and existing-store reuse. It is preparation only, to be frozen in its own next PR after P2-01 approval.
