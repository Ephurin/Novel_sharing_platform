# G-03 RED / GREEN

| Proof | RED at unchanged 3df13ed5 live suite | GREEN at 118ede77311fe160c7f0142cc237acf689a0b818 | Evidence |
|---|---|---|---|
| Missing mutation opt-in | FAIL: deleteMany + countDocuments | PASS: zero writes/reads, after disconnects run | red.log; green-final.log |
| Forbidden PG name | FAIL: deleteMany + countDocuments | PASS: zero writes/reads | same |
| Forbidden Mongo name | FAIL: deleteMany + countDocuments | PASS: zero writes/reads | same |
| Expected PG identity mismatch | NOT_RUN in RED | PASS: zero writes/reads | green-final.log |
| Expected Mongo identity mismatch | NOT_RUN in RED | PASS: zero writes/reads | green-final.log |
| Authorized real PG/Mongo reconciliation | Not rerun on RED | PASS 4/4; owned records zero; foreign draft preserved | n2/persistence-integration-reconciliation-*.txt; readback-integration-reconciliation.json |
| Backend deterministic partition | Not rerun on RED | 133 PASS / 0 FAIL / 3 SKIP | deterministic.log; final-local-commands.json |
| Typecheck | Not rerun on RED | PASS, exit 0 | typecheck-final.log |
| Fixture resilience | Not rerun on RED | 25 PASS | n2 fixture-resilience log |
| Native provenance | Not rerun on RED | 7 PASS | n2 reconciliation log |
| Accept Draft trust | Not rerun on RED | 14 PASS | n2 accept-contract log |
| Outbox / accepted persistence | Not rerun on RED | 2 + 5 PASS | n2 logs |
| AI real PostgreSQL/pgvector | Not rerun on RED | 42 PASS, 253 deselected by marker | n2 P7-pgvector log |
| Guard lifecycle repeat | Not rerun on RED | 6 PASS, already in deterministic partition | n2 guard-lifecycle log |
| Migrations/replay/Alembic rollback/re-upgrade | Not rerun on RED | 5 commands exit 0; both SQL 012 retained | n2 command manifest and readbacks |

Primary newly executed non-overlapping local count: **232 PASS / 0 FAIL / 3 SKIP** = deterministic 133 + native 57 + PostgreSQL AI 42. Focused five-case GREEN and native guard-lifecycle six-case reruns overlap these partitions and are not added again. Intermediate bc8c4b17 runs are diagnostic repeats. The three SKIPs are existing opt-in end-to-end launch, author-workflow and comments suites; no new G-03 test is skipped. Historical 478 PASS is not inherited.

Exact commands and exits: final-local-commands.json and n2/persistence-runtime-*.json. Native runner overall exit 0. All 13 native subprocess commands exit 0. Every suite's independently read-back owned PG rows and Mongo drafts are zero. This is bounded G-03 verification, not a new full P1 acceptance run.
