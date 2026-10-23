# Source and provenance

Branch: codex/ai-copilot-pipeline-test. Initial fetch confirmed remote/local `2279b41d2dcd90fb47a2c4886379510c6564fee5`; initial working tree clean. Final fetch before evidence commit still reports remote at that checkpoint. No reset, clean, stash, branch overwrite or external worktree.

| Commit | Scope |
|---|---|
| 7ef0e5d7783527015a4dd56ea69d9f01064106a7 | HTTP regression test before production fix, real fail-open RED |
| ebe018fe | Correct test fixture PostgreSQL rowCount; subsequent sandbox attempt blocked |
| ef6c6d46 | Fail-closed authorization + test-only real persistence/AI client probe |
| 8640ba92bf43442be1b4f5748d9f009508b2ac22 | Correct probe outbox table and preserve production formatting; first complete GREEN |
| 117337539da666172cf7b173c3a78730a2aa7ea1 | LF normalization of new tests only; final clean tested source |

Net production change: chapter-revisions.controller.ts line 72 replaces `!token || (expectedToken && token !== expectedToken)` with `!expectedToken?.trim() || !token || token !== expectedToken`. No DTO, environment parser, routes, database migrations, AI adapter or web changes. Other additions are test source only.

Reproduction: install existing backend/AI test dependencies; run commands in FINAL-commands.json with dummy isolated unit environment DATABASE_URL/MONGODB_URI pointing to closed loopback port 9, JWT_ACCESS_SECRET/JWT_REFRESH_SECRET dummy strings >=16 characters and AI_SERVICE_URL=http://127.0.0.1:9. Optional INTERNAL_AUTHZ_UNIT_EVIDENCE must name a nonexistent output directory. Real integration: from repository root run `python Pipeline_test/reviews/2026-10-23-internal-revision-authz/run-isolated.py`; it creates random new named test volumes/containers using locally available pgvector:pg16 and mongo:7, loopback ports, generated credentials, explicit mutation opt-in, migrations and the committed probe. It stops and retains resources. No populated upgrade claim. Do not manually point probe at shared databases.

Original RED and all blocked/failed attempts are retained. HTTP_TEST_MATRIX.json records case-level provenance/status, proof level, command/exit references and durable evidence where applicable. No inherited results are counted as fresh PASS. The unit fixture error and loopback permission failures are explained in RED_GREEN_REPORT.md. The actual AI revision adapter was exercised against local backend HTTP; no model server or embedding provider was used.
