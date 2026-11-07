# Issue #90 — P2 CI PostgreSQL 16 rollback recovery

2026-11-07 Asia/Saigon. **Verdict: READY_FOR_REVIEW for the CI fix. P2-01 runtime acceptance remains BLOCKED by Issue #91.**

Draft PR: [#92](https://github.com/Ephurin/Novel_sharing_platform/pull/92), addresses [#90](https://github.com/Ephurin/Novel_sharing_platform/issues/90); related [#89](https://github.com/Ephurin/Novel_sharing_platform/pull/89). No self-merge, deployment, Issue closure or P2-02 implementation.

## Exact provenance and branch decision

- Independent branch/worktree: `codex/p2-ci-pg16-rollback-fix`, created from fetched `integration/p2-planning-studio` at `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627`; base had not advanced.
- PR #89 fetched/verified unchanged at `a2aeb9a0cf74d2ec21b5993574ee8e03b621a181`. No commit, metadata or branch changes were made to #89.
- Final tested source: `2b365505551c51c71884ee7c340ada5273a5fe3c`.
- Actual CI synthetic checkout: `938d5f953a1c09628498a32123d6ccf1d37faf78`; its tree exactly equals source tree `567a2c4f0788dda714e1d87f6a6e914e0a1e6816`.
- Final delivery adds this report/evidence only. Exact delivery SHA is recorded in PR #92's description and head metadata; completed checks below belong to the tested source, not a later evidence commit.
- The CI-fix branch deliberately excludes unmerged #89 product code. Counts here must not be added to #89's separate 213-PASS source result or called a combined-branch runtime acceptance.

## Root cause, measured versions and reproduction

The inherited workflow starts PG16 but invokes unpinned runner `pg_dump`, `pg_restore` and `psql`. Actual final-run measurements, not guesses about old runs:

| Component | All three clients / server version |
|---|---|
| Unpinned host clients (recorded, then bypassed) | PostgreSQL 18.6, Ubuntu 18.6-1.pgdg26.04+2 |
| Matched pg_dump, pg_restore, psql | PostgreSQL 16.15, Debian 16.15-1.pgdg12+2 |
| PostgreSQL server | 16.15, server_version_num 160015 |
| Intentionally incompatible clients | PostgreSQL 17.11, Debian 17.11-1.pgdg12+2 |
| pgvector | 0.8.7 |

Historical failing runs did not record host versions, so no precise historical version is retroactively claimed. The new measurements establish runner drift, and the negative control proves the specific incompatibility on the same fully migrated source fixture: PG17 custom backup succeeds; PG17 `pg_restore --exit-on-error` into separate `p8_incompatible_verify` returns **1**, with `unrecognized configuration parameter "transaction_timeout"` / `SET transaction_timeout = 0;`. The expected failure is explicitly asserted; an unexpected success or different failure fails the job. No SET line is removed and normal restore errors are never suppressed.

PG16 clients then back up the same source and restore into fresh `p8_restore_verify` with exit **0**. This is a real GitHub Actions PG/vector fixture, not mock/in-memory evidence or P1 QA data.

## Bounded implementation and files

- `.github/workflows/p8-cutover.yml`: rollback service image digest pin, client/server version checks and host diagnostics, incompatible-client control, streaming backup/restore through matching clients, readback artifact upload. All other six P8 jobs are unchanged.
- `scripts/p8_pg16_client.sh`: fail-closed psql/pg_dump/pg_restore wrapper using the current job's disposable service container. PATH shims are scoped to this job. Client commands cannot drift independently of the server image. Dump stdout and restore stdin preserve archive bytes without a TTY.
- `scripts/p8_rollback_readback.py`: read-only repeatable-read snapshot of 23 user tables (public/narrative), including columns/defaults, constraints, indexes and every row, with pgvector distance probe and stable comparison hashes. Restricts targets to this rehearsal's two named databases.
- `scripts/tests/test_p8_rollback_readback.py`: three comparison tests, including negative controls for changed constraints/indexes/columns/data and changed predicate values.
- This report and `p2-ci-pg16-evidence/`: command ledgers, exact-source log excerpts, version/readback summaries, original and final task-owned evidence ZIPs and hashes. No historical evidence was edited.

Pins resolved from public registry manifests before implementation:

- Server + matching clients: `pgvector/pgvector:pg16@sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f`.
- Negative-control clients: `postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994`.

No migrations, application/business logic, provider routing, Author review/Canon, tenant/provenance checks, Writer or production configuration changes. P7 is triggered by the new scripts; its workflow was not changed.

## Backup, restore, parity and source integrity

The existing canonical snapshot, Alembic/version comparison, vector-extension comparison and source-unchanged steps are retained verbatim. Local YAML comparison verifies their step definitions and all other P8 jobs match the base. The new checks are additional evidence:

- Backup archive SHA-256: `12b7498b6e57c39d048fdf379681c913da9fc5e3f8c9123e12c011c8ed2993ce`, nonempty and independently rehashed from the downloaded ZIP.
- Source and restored migrations: `0016_entity_profile_audit_timestamp`.
- Source and restored extension: `vector:0.8.7`; distance of equal vectors = 0.
- All 23 table readbacks match after narrowly accounting for equivalent PG16 catalog cast distribution; normalized schema/data digest on source, restored and source-after: `ae2524f1b8c92b429bf5f4a35291229064462210d09b29466865f43903b1b680`.
- **Raw source-before equals raw source-after**, without normalization. Raw digest both: `98ab0fec8ea031d242a7920910456dd9096ad03cce5ff83d63e0b019f256880b`. The source was not changed by either restore.
- Raw restore digest is `ae2524f1b8c92b429bf5f4a35291229064462210d09b29466865f43903b1b680`; the catalog difference is disclosed below, not discarded from artifacts.
- Full raw snapshots, both custom-format archives, original canonical snapshot, migration/vector readbacks, red exit/error and version outputs are in [final evidence ZIP](p2-ci-pg16-evidence/final-2b365505/evidence.zip). This ZIP contains only the synthetic task fixture, not P1 QA or private author data.
- Original Actions artifact ID `13560405333`, [P8 run artifact](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42336942401/artifacts/13560405333), ZIP SHA-256 `1074fa39e1f1d29274083c3e7167447fcd2e732b4414ecd120b4f4e0e5eaae14`. Downloaded bytes, backup hash, JSON manifest, source equality and migration/vector parity were independently verified locally; see `final-2b365505/verified-readbacks.json`.

### Earlier checker failure, preserved rather than relabeled

First source `cb29a5e9` already passed normal PG16 restore and all original integrity gates, but its newly added raw-definition equality failed. PostgreSQL reparses DDL on restore and deparses `varchar[]::text[]` differently in an active-job index predicate and proposal-decision CHECK constraint: array-level casts become equivalent per-element casts. Artifact `initial-cb29a5e9/evidence.zip` preserves that actual FAIL. No data corruption or migration defect was demonstrated.

The final checker normalizes only explicit quoted-varchar array casts to text element casts in constraint/index definitions. It does not ignore definitions, names, types, other casts or row data. Both raw catalogs remain in the artifact; raw hashes are reported separately. Three tests prove equivalent rendering passes and real schema/data changes still fail. An intermediate test on `47c7676f` incorrectly compared a whole fixture while its unrelated index was intentionally normalized; the assertion was scoped to the untouched cast. Final source `2b365505` has all three actual PASS. No earlier-source PASS is counted as a final-source result.

## Exact commands and exit codes

Complete original workflow commands and step exits are recorded in `p2-ci-pg16-evidence/rollback-command-exits.json`; local commands are in `local-commands.json`. Key actual CI commands on final source:

| Command / check | Exit / actual outcome |
|---|---|
| Runner client `--version`; service client `--version`; `SHOW server_version`, `SHOW server_version_num` | 0; measured values above, major guard = 16 |
| `python -m unittest discover -s scripts/tests -p test_p8_rollback_readback.py -v` | 0; 3 tests PASS |
| `python -m alembic upgrade head` and existing cutover fixture import | 0 |
| `python scripts/p8_rollback_readback.py --database-env SOURCE_DATABASE_URL --output /tmp/p8-rollback-evidence/source-readback.json` | 0; source captured |
| Digest-pinned PG17 `pg_dump -Fc ...` | 0 |
| Digest-pinned PG17 `pg_restore --exit-on-error --no-owner --no-acl ... < incompatible.dump` | 1, EXPECTED_FAIL asserted for transaction_timeout |
| Matched PG16 `pg_dump --format=custom --no-owner --no-acl --dbname=.../p8_rehearsal > /tmp/p8-rehearsal.dump` | 0; backup hash verified |
| Matched PG16 `pg_restore --exit-on-error --no-owner --no-acl --dbname=.../p8_restore_verify < /tmp/p8-rehearsal.dump` | 0; fresh restore successful |
| Existing canonical equality + migration/vector `diff -u` + source snapshot equality | 0; original gates all PASS |
| Readback `--database-env RESTORE_DATABASE_URL --expected source-readback.json`, then SOURCE_DATABASE_URL against same expected | 0 each; full normalized parity and raw unchanged source |
| Artifact download/hash/readback re-verification | 0; actual CI bytes, no mock |
| Local Bash syntax, workflow structure, Python syntax, three comparison tests and source diff | 0 each; syntax/source checks only |
| Local Docker server probe | 1, missing Docker Desktop Linux engine; local database reproduction NOT_RUN_ENVIRONMENT |

## Same-source regression matrix

All results in this table are from `2b365505`, synthetic tree-identical checkout `938d5f9`. No cross-SHA aggregation:

| Workflow/job or test | Actual result |
|---|---|
| [P8 42336942401](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42336942401) | **7/7 jobs SUCCESS** |
| rollback-rehearsal | SUCCESS, including asserted incompatible control + complete matched restore |
| root-compose-cutover-smoke | SUCCESS; existing production-path fake-provider validations retained |
| postgres-integration | SUCCESS; **198 PASS, 8 SKIP, 405 deselected** (base integration tests, not #89's separate test tree) |
| backend-integration | SUCCESS; isolation guard 11/11, accept-draft contracts 15/15, P1 production persistence 5/5, fixture lifecycle 25/25; 0 failures/skips in those invocations |
| frontend-api-cutover / unit / final-cleanup-gate | SUCCESS each |
| [P7 42336942369](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42336942369) | **3/3 jobs SUCCESS**: unit, pgvector-integration, root-compose-smoke |
| P7 P1 memory/identity/Canon PG invocation | 145 PASS, 110 deselected; separate invocation on same source, not added to P8 count |
| Local DB runtime | NOT_RUN_ENVIRONMENT; real CI DB execution above is available |
| Argon Issue #91 dedicated P2 A16/Gateway/readback acceptance | BLOCKED, open with zero comments at final check |

Job IDs/conclusions and exact-source excerpts are committed beside this report. There is no unexpected final-source FAIL; 8 PostgreSQL SKIPs remain explicitly reported. No database runtime is substituted by a mock. Full suites were rerun after the checker correction because the earlier source failed, not to pool results.

## Effect on PR #89 and merge gate

PR #89 remains Draft at `a2aeb9a0cf74d2ec21b5993574ee8e03b621a181`, base `3adab5c...`, GitHub `mergeable=true`. `git merge-tree --write-tree origin/codex/p2-01-bootstrap-foundation HEAD` returns exit 0 (candidate union tree `dc28964a4ab3e7247a8eee1d55cbece4917f20ab`); this writes only an object, not a branch merge/index change. No CI test of that candidate union is claimed. Owner must refresh CI on the actual post-review integration composition.

Roadmap comparison: #89 remains the bounded P2-01 bootstrap safety/replay/review foundation; intentionally unavailable extract on the unreleased P2 branch is documented. It does not complete P2-02 provenance/extraction, M0/M-FIRST bridge or mounted Planning Studio. This CI-only PR removes the inherited rollback blocker without granting Canon authority or modifying #89 source. Fresh QA acceptance and independent review are still required.

Issue #91 was read again: open, no Argon result/comments. **Do not declare P2-01 complete or merge #89 merely because this PR is green.** Required next steps: GPT-6 reviews #92; owner decides CI PR integration; Argon returns #91 durable acceptance; then refresh #89 mergeability and same-composition checks for independent final review. No self-merge, deploy, P2-02 implementation, quota changes or real Gemini calls (0).
