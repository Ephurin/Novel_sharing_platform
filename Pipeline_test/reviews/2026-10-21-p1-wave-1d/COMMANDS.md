# Wave 1D offline rerun commands

Use branch codex/ai-copilot-pipeline-test. Read the Wave 1D task and report first.
Do not start historical Compose projects, reset ledgers, or call real providers.

1. `python -m pip install -r Pipeline_test/tools/requirements-wave1d.txt`
2. `python -m playwright install chromium`
3. `python Pipeline_test/tools/prepare_wave1d_offline.py --project p1-wave1d-<unique-boundary> --run-id <unique-wave1d-boundary-run>`
4. With that project's ignored env, run `docker-compose --env-file <env> -f Pipeline_test/tools/compose.wave1d-offline.yml config --quiet`, then `--profile initialize run --rm budget-init` **once only**, then `up -d --build`. No old mounts/keys. Check Docker labels and internal worker network ownership.
5. Set `WAVE1D_CONTAINER_PROJECT` to the exact new project and run `python -m pytest -q Pipeline_test/tests/test_wave1d_container_integration.py -p no:cacheprovider -o addopts=''`. This consumes its 200-call quota; never reset it.
6. `docker exec <verified-new-gateway-id> python /tools/container_boundary_probe.py`. This creates fresh sub-ledgers and preserves all attempts. Capture receipts/ledger with `python Pipeline_test/tools/capture_wave1d_runtime.py --project <project> --output <new-run>/runtime`.
7. Prepare a SECOND unique project/run for the browser, initialize once, build/up, verify ownership. `docker-compose --env-file <browser-env> -f Pipeline_test/tools/compose.wave1d-offline.yml exec -T backend node /wave-tools/seed_wave1d_author.mjs` creates one insert-only local author. Do not print env/secrets.
8. Load only WAVE1D_AUTHOR_EMAIL and WAVE1D_AUTHOR_PASSWORD into the agent process from that ignored env. Run `python -m Pipeline_test.tools.browser_author_driver --run-id <new-browser-run> --evidence-dir <new-run>/browser-attempt-01 --base-url http://127.0.0.1:<WEB_PORT>`. Never overwrite an attempt folder. This uses author UI for writes, GET for readback. Missing UI => BLOCKED, never use writable API to rescue.
9. Save safe runtime capture for the browser project, test logs, provenance and failure artifacts. Never commit `.env.*`, `.eval-private`, raw login traces, passwords/JWTs or full docker inspect env output. Preserve all old/new DBs, containers, ledgers and failed attempts.

Executed projects/ports/commands and exit codes are in the report and new run manifests. `verify_wave1d_worker_guards.py` is deliberately pinned to the executed boundary project and its captured before-state; do not aim it at historical projects. For a future run adapt its explicit project and baseline to the newly verified owned project, never change historical state.

Real provider calls, P2/P3 and the 100k journey are prohibited by this task. Synthetic offline tariff tests do not prove a real USD 5 hard cap.
