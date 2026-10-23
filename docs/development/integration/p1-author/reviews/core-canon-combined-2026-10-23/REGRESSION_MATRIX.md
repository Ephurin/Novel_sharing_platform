# Combined regression matrix

All final local results below are newly executed on clean source `c4d29c6b4039ea4060d0f91313bba62f88b7896a`; no inherited PR59/60 PASS counted. Exact argv/cwd/exits are embedded in VALIDATION.json and raw command manifests.

| Suite / proof | PASS | FAIL | SKIP | BLOCKED | Exit |
|---|---:|---:|---:|---:|---:|
| backend-unit / UNIT | 81 | 0 | 0 | 0 | 0 |
| AI-unit / UNIT | 61 | 0 | 0 | 0 | 0 |
| P7-unit / UNIT | 64 | 0 | 0 | 0 | 0 |
| P8-full-AI-unit / UNIT | 251 | 0 | 2 | 0 | 0 |
| reconciliation / REAL_ISOLATED_PG_MONGO | 7 | 0 | 0 | 0 | 0 |
| integration-reconciliation / REAL_ISOLATED_PG_MONGO | 3 | 0 | 0 | 0 | 0 |
| accept-contract / REAL_ISOLATED_PG_MONGO | 14 | 0 | 0 | 0 | 0 |
| outbox-postgres / REAL_ISOLATED_PG_MONGO | 2 | 0 | 0 | 0 | 0 |
| accepted-persistence / REAL_ISOLATED_PG_MONGO | 5 | 0 | 0 | 0 | 0 |
| P7-pgvector / REAL_PG_FAKE_EMBEDDING | 11 | 0 | 0 | 0 | 0 |
| persistence-HTTP / REAL_HTTP_PG_MONGO_FAKE_PROVIDER | 19 | 0 | 0 | 0 | 0 |
| canon-HTTP / REAL_HTTP_PG_MONGO_FAKE_PROVIDER | 14 | 0 | 0 | 2 | 0 |
| root-01a / ROOT_COMPOSE_REAL_PG_MONGO_FAKE_PROVIDER | 15 | 0 | 0 | 0 | 0 |
| root-02a / ROOT_COMPOSE_REAL_PG_MONGO_FAKE_PROVIDER | 13 | 0 | 0 | 0 | 0 |
| root-02b / ROOT_COMPOSE_REAL_PG_MONGO_FAKE_PROVIDER | 16 | 0 | 0 | 0 | 0 |
| root-03a / ROOT_COMPOSE_REAL_PG_MONGO_FAKE_PROVIDER | 18 | 0 | 0 | 0 | 0 |
| root-native-executions / REAL_PG_MONGO | 10 | 0 | 0 | 0 | 0 |

Total recorded execution units: **604 PASS / 0 FAIL / 2 SKIP / 2 BLOCKED**. Counts include deliberately repeated/subset suites and root native5 repeated twice; not604 unique tests. Six pytest subtests additionally pass and are not added. Verifiers/typecheck/build/migrations/boundary are command checks, not extra tests. Full AI default deselects42 PG-marked cases; selected P7 eleven run with real PG separately. Two non-SQL state-projection fixture variants intentionally skip SQL-only tenant assertions; reasons printed by -rs.

| Required invariant | Result | Actual proof |
|---|---|---|
| Supplied version / stale semantic metadata | PASS | persistenceHTTP06b/06c/06d;409 and PG/Mongo unchanged; fresh pricing CAS and exact replay |
| Missing content version428 / pricing exemption | PASS | HTTP03/06d; no public compatibility downgrade |
| Distinct immutable provenance / older equal prose | PASS | native7 including probe5 version2→3 and probe7 skipped_newer_draft |
| Authoritative response / next save / exact replay | PASS | HTTP10a/10b/10c response10==Mongo10, replay10→10, next11 |
| Concurrent writer / accept replay / rollback-retry | PASS | HTTP07/10/11, native31; explicit500 with rolled-back revision/outbox and successful retry |
| Save/Accept extraction→pending→authorized review | PASS | Persistence19 plus canon14 and root smoke; unchanged canon before review and exact-once3 after explicit decision |
| Reject/edit/stale/replay/owner isolation | PASS | Canon HTTP05/06/09/10, protected trust14, fail-closed auth34 HTTP unit plus real internal HTTP matrix |
| P3 controller separation | PASS legacy / BLOCKED HITL | worker six unit tests;03A18 real smoke; two missing checkpoint cases BLOCKED |
| Missing /memory/entity routes | BLOCKED | fresh route404 readbacks; context-preview200 not substituted |
| S09–S11 full editor | NOT_RUN | No FE changes/combined browser proof; separate Gemini acceptance |

Local commands to reproduce (always new output names/resources; initialize HTTP runtimes sequentially):

```text
python scripts/combined_validation/targeted.py <NEW_TARGETED_OUTPUT>
python scripts/combined_validation/native.py <NEW_NATIVE_OUTPUT>
python scripts/combined_validation/http_runtime.py <NEW_PERSISTENCE_OUTPUT> persistence
python scripts/combined_validation/http_runtime.py <NEW_CANON_OUTPUT> canon
python scripts/run_pr60_root_smoke.py --output <NEW_ROOT_OUTPUT> --allow-new-test-resources --scripts 01a 02a 02b 03a
```

Targeted unit URLs deliberately use loopback port9; real native/HTTP/root commands allocate fresh test-only pairs. No shared DB/volume reuse. All42 created containers stopped; volumes retained. Actual environments and source IDs are in containment/resource/command JSONs.

Remote exact-source proof: P7 run39924434308 SUCCESS; P8 run39924434320 overall FAILURE solely frontend partitioning. Root-compose-cutover-smoke job120317242010 and all other P8 jobs SUCCESS. Remote tests are not added to604 local execution totals.
