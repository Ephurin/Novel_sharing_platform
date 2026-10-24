# Newly executed combined acceptance matrix

Final clean source `2313a15a5da0415539c1f999df2628674944469e`. Initial66c1052 results and old604 executions are not inherited. Primary rows below use disjoint file/marker partitions; repeated/subset/root-native runs are separate records and not added again.

| Primary suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Backend deterministic partition | 128 | 0 | 3 |
| Fixture resilience G01/G02 | 25 | 0 | 0 |
| Native provenance | 7 | 0 | 0 |
| Legacy reconciliation plus cleanup regression | 4 | 0 | 0 |
| Accept Draft trust | 14 | 0 | 0 |
| Native outbox | 2 | 0 | 0 |
| Native accepted persistence | 5 | 0 | 0 |
| Full AI non-PG partition | 251 | 0 | 2 |
| Full AI PG partition | 42 | 0 | 0 |

**Primary total:478 PASS,0 FAIL,5 SKIP.** Node counts include its parent/subtest units as reported; six additional pytest subtests pass separately. This is not the sum of all repeated executions.

Three backend skips are unrelated opt-in author-launch/workflow/comment integration suites. Two AI non-SQL repository variants intentionally skip SQL-only tenant assertions; the full42 PG partition runs the SQL paths. Logs disclose all skip/deselection counts.

| Diagnostic/backend flow | PASS | BLOCKED | Proof |
|---|---:|---:|---|
| HTTP persistence/version/pricing/retry |19|0|real HTTP + PG/Mongo + fake provider|
| HTTP Canon review/authorization |14|2|real extraction/pending/owner review; two missing P3 checkpoint cases blocked|
| Root01A/02A/02B/03A |62 checkpoint assertions|0|15+13+16+18; four verifiers0|
| Missing mutation opt-in |expected denial|0|exit1 and exact guard error; no fixture authorization|
| Root authorized native |5 repeated cases|0|exit0; already counted in native partition|
| Lifecycle guard unit |6 repeated cases|0|already in backend deterministic partition|

Backend typecheck/build, P8 boundary, backend migrations/replay and AI upgrade/downgrade/reupgrade exit0. Full command arrays/cwd/exits/source SHA in VALIDATION.json. Root wrapper final exits0 after requiring the intended negative exit1.

Migration inventory has18 backend SQL files, both distinct012 files and017; replay retains same18. Real empty-PG Alembic0013→0012→0013 succeeds. Newly executed SQLite migration test includes populated-row preservation and deeper downgrade/reupgrade. Backend reverse18 migration and populated-PG upgrade/rollback are not claimed; HTTP injected snapshot/outbox failure proves canonical transaction rollback and safe retry.

| Core/Canon invariant | Result | Durable proof |
|---|---|---|
| Missing version428; stale/concurrent409; pricing exemption; semantic replay |PASS|p2 HTTP rows03–09, native CAS/writer and trust tests|
| Different revision/same prose; newer manual edit |PASS|native7 before/after IDs, timestamps/version and PG latest fences|
| Save/Accept cannot auto-approve Canon |PASS|pending proposal records, completed outbox and identical approved projections/version before review|
| Owner approval exactly once; stale/replay denial |PASS|200 then409; version increments once, immutable source/hash and projections durable|
| Reject/edit/auth/tenant |PASS within supported boundaries|reject projection unchanged; reviewed payload applied; foreign authenticated owner403; trust actor/tenant fences and SQL tenant projection cases|
| G01/G02/cleanup failure/retry/sentinel |PASS|25 cases; foreign outbox identity/hash survives, malformed counts fail closed, final fixture readbacks all0|
| AI memory/entity/P3 checkpoint |BLOCKED|fresh route404 and missing waiting/state implementation; no alias or gate bypass|

Active response/Mongo 10/10; replay10→10; next response11. Accepted revision `1887b922-62ef-433c-af16-fc68b42a7ab8`, SHA256 `314cb931dd5ee62a446c320598d19bc90a5ec075961f0e9d33fdaf102feb265f`. Full IDs and readbacks in DURABLE_READBACKS.json and native-final/durable-query-log.jsonl.

HTTP/root fixtures are retained diagnostics in new stopped resources, not claimed globally empty. No residual fixture records is certified for the dedicated final native lifecycle database. All created containers stopped; historical resources untouched.
