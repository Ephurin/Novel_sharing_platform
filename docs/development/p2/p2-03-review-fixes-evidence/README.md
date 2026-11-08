# PR #98 review-fix evidence — F-01 / F-02 / F-03

Implementation `caacaf67dfc06e4709d42e0c87219f33d86ba6f4`; CI checkout `3b5a7da356d68c80f80f005de621e8074986eef6`; identical tree `071b2c1e0dee9ed18bcfed62ca0a8764f0675682`. Base f20d0df38a90f5a61d1ac6472c0152d828697117; previous delivery9ecb2be9. Final delivery adds docs/evidence only; exact delivery SHA/rerun links are in PR #98 metadata.

| Archive | Artifact ID | SHA256 |
|---|---|---|
| source-caacaf67.zip |13609923841|c3bba1389811076e87f21ff11ece30c85e039adff33f6d049b7cb4eee1633259|
| rollback-caacaf67.zip |13610302653|627a6ebf372490e58c850cb8090d799f27b79d4038a20984b6b933de03e23219|
| initial-3bd9cb04.zip |13610176425|fa6a052b1ca86ab428b7e03ec71427da9186816a4fde11e9eae5c37588828282|
| fixture-7aa7d290.zip |13609738451|1ad40edd3880d322c071c49e17f8f9ccb3ec5223b4c96909f0895d13b0b95868|

Both initial archives preserve82 PASS/1 FAIL in the selected SQL suite. First failure was optional-null fixture shape; second was a shallow edit-body list alias mutating a prior test receipt expectation. Assertions were retained. Runtime services/logs were not reached, so their missing-log scans are NOT privacy PASS. historical-failures.json retains exact observed source/run excerpts. Intermediate successes are not pooled into final counts. Old p2-03-evidence and its handoff section remain historical.

Offline verifier from repository root, actual exit0:

```powershell
python docs/development/p2/p2-03-review-fixes-evidence/verify_artifacts.py
```

Verifies archive hashes/source/tree, JUnit counts,84 real SQL cases (including12 fixes),34 fix readbacks and12 exact negative/replay pairs, archived receipt/source immutability and explicit fork lineage, event IDs/participants after first/middle removal, legacy NULL/foreign/owned invariants, same-novel clock/active uniqueness and protected Canon. It also reruns prior setup/review/plan/P1 immutable revision/outbox/Mongo and rollback artifact checks. Generated fix/plan/review-readback-hashes.json and verified-summary.json derive from raw retained rows. The verifier reconstructs SQL state and checks source-pinned runtime assertions; it does not claim that unlogged raw context/HTTP bodies were independently reconstructed. ci-jobs.json includes final job conclusions and actual log excerpts. SHA256SUMS.json hashes Git-normalized handoff/evidence bytes, excluding itself.

Exact main commands from the tested workflow, all exit0; services/environment are disposable PostgreSQL16/pgvector + MongoDB7 and fake/fake providers:

```sh
(cd backend && npm run db:migrate)
(cd ai-service && DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head)
# ai-service
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py tests/test_setup_author_scope_postgres.py tests/test_setup_review_postgres.py tests/test_plan_edit_postgres.py tests/test_plan_review_fixes_postgres.py
# backend
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p202/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
P202_EVIDENCE_FILE="$RUNNER_TEMP/p202/setup-gateway-readbacks.json" npx tsx --test src/modules/ai/setup-provenance.live.test.ts
# web: actual Chromium, mocked HTTP
P203_FIX_EVENT_SCREENSHOT="$RUNNER_TEMP/p202/fix-events-ui.png" P203_FIX_ARCHIVE_SCREENSHOT="$RUNNER_TEMP/p202/fix-archive-ui.png" P203_SCREENSHOT="$RUNNER_TEMP/p202/plan-ui.png" P202_REVIEW_SCREENSHOT="$RUNNER_TEMP/p202/review-ui.png" node --test tests/setup-foundation.browser.test.mjs
```

Local component regression commands, actual exit0 (12 legacy/autonomous/SQLite tests;7 browser tests; typechecks):

```powershell
$env:LLM_PROVIDER='none'; $env:EMBEDDING_PROVIDER='none'; $env:NARRATIVE_REPOSITORY='json'; $env:SEMANTIC_RETRIEVAL_ENABLED='false'
python -m pytest ai-service/tests/test_story_plan_routes.py ai-service/tests/test_autonomous_routes.py ai-service/tests/test_migrations.py -q -o addopts= --basetemp="$env:TEMP/p203-review-legacy"
npm run typecheck --prefix backend
npm run typecheck --prefix web
$env:PLAYWRIGHT_CHANNEL='msedge'; node --test web/tests/setup-foundation.browser.test.mjs
```

Exact-source acceptance is CI; local runs cover exercised component bytes and are not substituted for SQL runtime. Local Docker daemon pipe is missing: local PG/Mongo NOT_RUN_ENVIRONMENT. Source tests use real disposable PG/Mongo in CI. Chromium HTTP is mocked; real Gateway→Python→PostgreSQL and Mongo/P1 save run separately. Screenshots were visually inspected and contain only synthetic fixture content. Actual operational logs exclude private fixture markers; raw SQL readbacks intentionally retain synthetic note values for immutability proof. No actual author private data was used.
