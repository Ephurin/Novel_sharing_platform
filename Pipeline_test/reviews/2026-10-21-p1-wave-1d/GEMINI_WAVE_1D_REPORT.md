# Wave 1D — executed offline integration repair

Agent: Codex. Date: 2026-10-21. Branch: `codex/ai-copilot-pipeline-test`.
Verdict: **P1_WAVE_1D_READY_FOR_GPT6_REVIEW** (offline integration review only).
Source before changes: `5da4412dc294f306090438c45980bb53584f2b6e`, safely fast-forwarded from the initial checkout; independent findings reviewed baseline `3a511b7277b0202e548fd8752c1211a67e501cf1`.

## Gate results

| Gate | Result | Executed evidence and limits |
|---|---|---|
| V1D-01 | PASS | Actual google-genai 1.69.0 / LLMService structured entity verification in running AI container; compiled backend provider in running backend; gateway forwards to a separate fake HTTP server. Exactly one reservation/receipt per operation. `offline-logs/container-integration.txt`, both new runs' runtime receipts. No gateway canned generation result. |
| V1D-02 | PASS | Forged/replayed/cross-client/old tickets denied; public reserve/finalize denied. Host adversarial suite; actual two-container race for slot 200; request 201 denied. Container HTTP fault/retry/timeout/redirect probes and idempotent settlement. Receipt-to-ledger reconciliation has zero unmetered or duplicate dispatches. |
| V1D-03 | PASS (offline) | Actual workers have only an internal network, no real provider keys; public TCP and direct fake-upstream connections denied from both. Embedding and fallback fail closed in actual AI container. Conservative outstanding liability and output/body/variant bounds tested. **BUDGET_COST_HARD_CAP_UNPROVEN for real provider pricing; live authorization remains false.** |
| V1D-04 | PASS | Genuine Playwright Chromium execution, UI login/new novel/editor entry of all original 5 chapters, hints save, extraction trigger; UI and GET readback reach waiting_entity_review. Final attempt has 16 actions, screenshots/DOM/trace, canonical owner/IDs/hashes. Scope **OFFLINE_BROWSER_UI_SMOKE**, never LIVE_UI/P1_PASS. |
| V1D-05 | PASS | Strict missing/order/duplicate/ownership/canonical revision/hash and partial-import negatives; exact original text read back for 5 chapters. Required local secrets and consistent DB passwords; new project labels, mounts, networks, volumes exported. No credential values committed. |
| V1D-06 | PASS | Durable atomic replacement only, exclusive process lock, checksum/initialized marker, errors fail closed. Missing/corrupt/restart/write-failure probes run in a new gateway container using fresh sub-ledgers. Actual main gateway process restarted: same 200 calls/deadline/state. Historical file/fixture hashes verified. |

## Changes and actual scope

Opt-in proxy mode directs native Gemini SDK to `/v1beta/models/...:generateContent` with structured schema and explicit model. SDK hidden retries disabled; app retries create distinct metered dispatches. Backend chat and model discovery use guarded transport; discovery is also metered. Legacy client-side reserve/finalize removed. Embedding, alternate model/provider fallback and local fallback are disabled in guarded mode. Production defaults outside opt-in guard mode retained.

Gateway owns authentication-to-worker identity and durable admission before transport. Any client ticket is rejected. Client cost/token claims are not trusted. Reservations cover bounded text input/output using an explicitly synthetic offline tariff; uncertain/error usage retains the upper liability. No real HTTPS upstream or unknown-price live mode is enabled. Redirects and environment proxy bypass are denied. Actual invoice amount is **UNKNOWN**, not synthetic charges.

New Compose projects:

- `p1-wave1d-20261021-offline-01`: main quota ledger 200 calls; separate fault/durability sub-ledgers, no main reset.
- `p1-wave1d-20261021-browser-01`: 30 fake upstream calls across three successfully executed UI imports/extractions. Final novel `6249b30e-56c9-44d8-9a7e-ad0f73f0d09a`; author `471849d1-ced3-440f-a56b-b01095ef5525`; session `1dbc9dfc-167e-4d5b-b437-e2c206e8338f`.

AI/backend use `workers` internal network only; fake server uses a separate internal `upstream` network; gateway bridges those internal networks. Only static nginx UI also has host-facing `browser-edge`, required for Docker Desktop to publish localhost UI. Browser blocks third-party subresources. No arbitrary proxy is provided by nginx. Fake upstream address from the gateway: `http://fake-upstream:18091`; per-host ephemeral addresses for host tests are recorded in `host-dispatch-observations.jsonl`.

`dispatch-reconciliation.json` in each new run matches all fake receipts to ledger reservation IDs: boundary stack **224/224** (200 main + 24 across three fault-probe executions), browser stack **30/30**; **0 unmetered, 0 duplicate dispatches**. Deliberate cost probes also reserve without dispatch. Early failed diagnostic assertions used new sub-ledgers; retained logs and data explain these additional receipts. Nothing was reset to hide them.

## Validation

| Executed command | Exit | Result / log in offline-logs |
|---|---:|---|
| `python -m pytest -q Pipeline_test/tests -p no:cacheprovider -o addopts='' --basetemp=<new review pytest dir>` | 0 | 76 passed, 4 skipped; `offline-tools-final.txt`. Skips are opt-in container tests, executed separately below. |
| `WAVE1D_CONTAINER_PROJECT=p1-wave1d-20261021-offline-01 python -m pytest -q Pipeline_test/tests/test_wave1d_container_integration.py -p no:cacheprovider -o addopts=''` | 0 | 4 passed; `container-integration.txt`. |
| `docker exec <new gateway> python /tools/container_boundary_probe.py` | 0 | 10 checks PASS; `container-boundary-probes.txt`; new sub-ledgers only. |
| `python Pipeline_test/tools/verify_wave1d_worker_guards.py` | 0 | Embedding/fallback disabled and actual gateway restart preserved state; `container-disabled-routes.txt`. |
| `python -m pytest` in ai-service, LLM/embedding disabled, selected default suite, no cache | 0 | 407 passed, 2 skipped, 42 deselected; `ai-service-suite.txt`; deprecation warnings. |
| `npx tsx --test src/modules/ai/*.test.ts src/modules/ai-copilot/llm-provider.test.ts src/jobs/outbox-processor.test.ts` in backend | 0 | 62 passed; `backend-targeted.txt`. |
| `npm run typecheck` / `npm run build` in backend | 0 / 0 | `backend-typecheck.txt`, `backend-build.txt`. |
| `npm run build` in web | 0 | `web-build.txt`; Mantine directives / large-bundle warnings. |
| `docker-compose --env-file <ignored local env> -f Pipeline_test/tools/compose.wave1d-offline.yml up -d --build` for each new project | 0 | `compose-build-up.txt`, `browser-compose-up.txt`. |
| `python -m Pipeline_test.tools.browser_author_driver --run-id 2026-10-21-p1-wave1d-browser-01 --evidence-dir <new run>/browser-attempt-04 --base-url http://127.0.0.1:27912` | 0 | `browser-ui-attempt-04.txt`, 16 genuine action bundles. Credentials read only from ignored local env. |
| Historical/fixture SHA audit | 0 | `protected-after.json`: 40 historical files checked, 38 unchanged, 2 authorized script/config edits; 10 fixture files match frozen manifest. |
| `git -c core.whitespace=cr-at-eol diff --cached --check -- . ":(exclude)Pipeline_test/reviews/**/offline-logs/**"` | 0 | Source-only Windows CRLF-compatible check; raw captured logs retain emitted trailing whitespace and are excluded from this style check. |

See `COMMANDS.md` for safe rerun sequence. Builds download dependencies/images only; **new external AI provider calls = 0**.

## Browser evidence and retained failures

Final evidence: `../../runs/2026-10-21-p1-wave1d-browser-01/browser-attempt-04/`:
`browser-result.json`, `browser-session.json`, `browser.trace.zip`, `ACT-S02-CHECKPOINT.png`, `.dom.txt`, `.json`, `.readback.json`, and `s02-entity-checkpoint.readback.json`. Every action bundle references the real trace and readback hashes. Trace validation is consistency checking, **not cryptographic authenticity**. Login trace is excluded; sanitized post-login trace retained; raw private trace is ignored and never staged.

Initial environment had no engine/Playwright. After owner started Docker, no containers were running; only the new projects were launched. First real browser attempt exposed missing published UI ports on the internal network. Second actual execution completed but the old trace parser expected apiName/params.name rather than current Playwright method/title; its original blocked result is preserved, with read-only revalidation recorded separately. Attempts 03 and 04 ran from login to new novel through extraction; attempt 04 additionally waits for visible UI checkpoint text. Earlier SDK/atomic-write/Node test harness diagnostics are retained as intermediate logs, not relabeled PASS.

The fake provider deliberately emits deterministic empty discovery/not_entity decisions. **No entity quality, 35-gold recall, narrative quality or real-provider S02 acceptance is inferred.** Readback records include the candidate audit so this limitation is explicit.

## Preservation, blockers, next step

Historical `2026-10-21-gemini-p1-live-01/budget_state.json` unchanged: **8 attempts, estimated USD 0.007379**, approval expired `2026-10-21T05:47:52.543771+00:00`. Stored ACTIVE text was not edited to hide expiry. Evidence, checkpoint, outboxes and historical DB/container resources were not replayed, migrated, restarted or deleted. Only its two task-authorized helper/config files changed; hashes are listed in `protected-after.json`. Existing 13 inaccessible tracked pytest-cache entries were present before work and left unstaged.

No remaining blocker to **offline GPT-6 integration review**. Real-provider pricing/liability hard cap remains **UNPROVEN**, invoice UNKNOWN, live disabled; fresh owner authorization plus verified pricing/limits is required before any provider call. Full P1 S03–S11 and 35-gold functional audit remain NOT_RUN in this task. P2, P3 and 100k remain NOT_RUN. No main/other-branch changes, PR or merge.

Next: independent GPT-6 review of code plus actual container/browser evidence. Keep all new containers/volumes/DBs and budgets for that review; do not reset exhausted quota or reuse these run IDs for a fresh journey.
