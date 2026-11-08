# P2-02B evidence index

Exact implementation: b0abca026824ed4df83aba99df33c8126b8dce50; CI checkout426b23e1ee4b2603584eac3eb8801005717bf4c7, identical tree249152b719c51be0ea7d7b3b28b2e68dd77c7cca. Delivery adds docs/evidence only; final delivery SHA and rerun links are in PR #96 metadata.

| Archive | GitHub artifact ID | SHA256 |
|---|---|---|
| source-b0abca02.zip | 13605989173 | c6a2ffb010beab26c55619116ba4685ab1d1e72dc21beb632da3fa9451e6914c |
| rollback-b0abca02.zip | 13605214908 | 832040fae6798fc28b04f691394067f71c46539c6c06f8b37aa662f2404fb697 |
| initial-cf1941ae.zip | 13606107201 | ad7b41328c76cee6138281c733ea979bf526d5f7ce47488d10b15433dbbe0f4a |

The initial archive preserves the 3 fixture failures/47 passes; it is not final acceptance or a privacy PASS. Intermediate source results are not pooled. `ci-jobs.json` includes all final required conclusions and exact log excerpts. `verified-summary.json` and `review-readback-hashes.json` are generated from retained archives, not hand-entered PASS claims. Only synthetic fixture data is present. SHA256SUMS.json records Git-normalized handoff/evidence bytes, excluding itself.

Offline verification from repo root, actual exit0:

```powershell
python docs/development/p2/p2-02b-evidence/verify_artifacts.py
```

Exact CI commands/environment/fixtures are in `.github/workflows/p2-setup-provenance.yml` at tested source; no manual real-provider configuration. Main commands all exit0:

```sh
# disposable DBs/ports and fake env from workflow; backend migrations
(cd backend && npm run db:migrate)
(cd ai-service && DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head)
# ai-service
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py tests/test_setup_author_scope_postgres.py tests/test_setup_review_postgres.py
# backend
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p202/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
P202_EVIDENCE_FILE="$RUNNER_TEMP/p202/setup-gateway-readbacks.json" npx tsx --test src/modules/ai/setup-provenance.live.test.ts
# web, Chromium and mocked HTTP
P202_REVIEW_SCREENSHOT="$RUNNER_TEMP/p202/review-ui.png" node --test tests/setup-foundation.browser.test.mjs
```

Local commands (all exit0 when run on host; providers none):

```powershell
$env:LLM_PROVIDER='none'; $env:EMBEDDING_PROVIDER='none'; $env:NARRATIVE_REPOSITORY='json'; $env:SEMANTIC_RETRIEVAL_ENABLED='false'
python -m pytest ai-service/tests/test_setup_v1.py ai-service/tests/test_p2_bootstrap_guard.py ai-service/tests/test_manuscript_bootstrap.py ai-service/tests/test_idea_bootstrap_routes.py ai-service/tests/test_p2_bootstrap_pacing_compat.py ai-service/tests/test_p2_json_bootstrap_compat.py -q -o addopts= --basetemp="$env:TEMP/p202b-final-source"
npm run typecheck --prefix backend
npm run typecheck --prefix web
$env:PLAYWRIGHT_CHANNEL='msedge'; node --test web/tests/setup-foundation.browser.test.mjs
```

52 local Python tests, 4 browser tests. The browser run used the same frontend/test bytes as final CI; authoritative exact-source acceptance is CI. Sandbox-only browser launch failed before product interaction, exit1; host run succeeded. Docker daemon named pipe missing: local PG/Mongo NOT_RUN_ENVIRONMENT. Real PG/Mongo PASS comes from disposable CI, not local mocks. Browser evidence is HTTP-mocked, not browser-to-DB.
