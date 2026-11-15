# Owner-scope evidence index

Final source: 2f8ce3ac82a1c438a3d5ae402a32f394af70b8e5. See parent handoff for trust boundary and limitations.

| Archive | GitHub artifact ID | Role |
|---|---|---|
| source-2f8ce3ac.zip | 13575583850 | Final feature raw logs, JUnit and durable readbacks |
| rollback-2f8ce3ac.zip | 13575464014 | Final P8 rollback authoritative readbacks |
| initial-edf1397e.zip | 13575340318 | Preserved initial SQL failure; not a privacy PASS |
| source-11d35d47.zip | 13575730993 | Intermediate only; not final acceptance |
| rollback-11d35d47.zip | 13575342222 | Intermediate only; not final acceptance |

Run from repository root (offline):

```powershell
python docs/development/p2/p2-02a-owner-scope-evidence/verify_artifacts.py
```

Actual exit code: 0. Verifies archive hashes, source/tree, JUnit, DB readbacks, provider counters, log scans and rollback. SHA256SUMS.json records Git-normalized evidence bytes (excludes itself).

Exact final CI commands are preserved inside the archives and in `.github/workflows/p2-setup-provenance.yml` at the tested source. Selected commands, all exit 0:

```sh
# ai-service; disposable TEST_DATABASE_URL and fake/offline environment from workflow
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py tests/test_setup_author_scope_postgres.py
# backend
npx tsx --test src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts
P2A_EVIDENCE_FILE="$RUNNER_TEMP/p202/gateway-readbacks.json" npx tsx --test src/modules/ai/p2-bootstrap-guard.live.test.ts
P202_EVIDENCE_FILE="$RUNNER_TEMP/p202/setup-gateway-readbacks.json" npx tsx --test src/modules/ai/setup-provenance.live.test.ts
# web; mocked HTTP, actual browser
node --test tests/setup-foundation.browser.test.mjs
```

P7/P8 job conclusions are in ci-jobs.json. Overlapping suite counts and intermediate sources must not be summed. Logs use synthetic fixture values; no real author private data was used.
