# P2-03 exact-source evidence

Implementation62a872aa23ee2d2d60816e716fd7e1650fa4e16d; CI checkout5f0e8e9e29ec3619e722fc811e0c1e00f58a6408; identical tree3b02d4865782eb841655c6bb4389e3e7968dc356. Delivery adds docs/schema/evidence only; final delivery SHA and rerun conclusions are in PR #98 metadata.

| Archive | Artifact ID | SHA256 |
|---|---|---|
| source-62a872aa.zip |13608036609|e9c13abffaad749e81ded351efa41ce402506ccbc3a2561ab84694627b346cef|
| rollback-62a872aa.zip |13607752201|8169f681764c42085bd06bc54cdd97ab5ea088036b94c056a1c0c347f81389b7|
| initial-e4308852.zip |13606964550|8eb6988a8cb4ef2442601680cfe9c52207a3686c4b8e5bfb6dec39666b06d5d4|

Initial artifact is a retained migration failure; runtime did not start and privacy scan is NOT a PASS. historical-failures.json preserves observed failure excerpts/source/run links for initial migration duplication, SQLite predicate handling, test-fixture downgrade contamination and legacy ADMIN denial. Intermediate-source successes are not pooled into final counts. ci-jobs.json records all final conclusions and actual log excerpts.

Offline verifier from repo root, exit0:

```powershell
python docs/development/p2/p2-03-evidence/verify_artifacts.py
```

Checks archive SHA256/source/tree, JUnit counts/no failures,26 plan readbacks,11 exact negative/replay pairs, logical/physical objective links and per-novel unique versions/single active, canonical digests, migration up/down/re-upgrade proof, P2-02A/B source/review/scope invariants, private runtime logs, P1 real revision/outbox/Mongo/unchanged Canon and full rollback parity. Generated plan-readback-hashes.json/review-readback-hashes.json and verified-summary.json are derived from raw artifacts. SHA256SUMS.json verifies Git-normalized evidence/handoff bytes, excluding itself. Source-pinned test assertions additionally cover context semantics and concurrent winner outcomes; do not claim raw HTTP/context bodies were independently reconstructed when the artifact retains only test assertions/digests.

Main exact CI commands (all exit0), in .github/workflows/p2-setup-provenance.yml at tested SHA. Use only the workflow's disposable services/fake environment:

```sh
(cd backend && npm run db:migrate)
(cd ai-service && DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head)
# ai-service
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py tests/test_setup_author_scope_postgres.py tests/test_setup_review_postgres.py tests/test_plan_edit_postgres.py
# backend
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p202/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
P202_EVIDENCE_FILE="$RUNNER_TEMP/p202/setup-gateway-readbacks.json" npx tsx --test src/modules/ai/setup-provenance.live.test.ts
# web: real Chromium, HTTP mocks
P203_SCREENSHOT="$RUNNER_TEMP/p202/plan-ui.png" P202_REVIEW_SCREENSHOT="$RUNNER_TEMP/p202/review-ui.png" node --test tests/setup-foundation.browser.test.mjs
```

Local regression commands, actual exit0 (none/fake providers):

```powershell
$env:LLM_PROVIDER='none'; $env:EMBEDDING_PROVIDER='none'; $env:NARRATIVE_REPOSITORY='json'; $env:SEMANTIC_RETRIEVAL_ENABLED='false'
python -m pytest ai-service/tests/test_story_plan_routes.py ai-service/tests/test_autonomous_routes.py ai-service/tests/test_migrations.py -q -o addopts= --basetemp="$env:TEMP/p203-last-legacy"
npm run typecheck --prefix backend
npm run typecheck --prefix web
$env:PLAYWRIGHT_CHANNEL='msedge'; node --test web/tests/setup-foundation.browser.test.mjs
```

Local legacy/autonomous/SQLite12 PASS and browser5 PASS belong to the exercised component bytes; exact-source full acceptance is CI. Docker info exits1 (Desktop Linux Engine pipe missing): local PG/Mongo NOT_RUN_ENVIRONMENT. Do not treat SQLite or HTTP mocks as PostgreSQL acceptance. All published source/SQL/UI notes are synthetic; no actual author private data was used. Owner-only private fixture notes can appear in the owner screenshot/raw SQL, while actual operational logs are separately scanned and clean. Browser evidence is HTTP-mocked, not browser→DB E2E.
