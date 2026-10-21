# ACTIVE GEMINI TASK — P1 Wave 1D Integration Repair (OFFLINE ONLY)

**Agent:** Gemini 3.8 in Antigravity. **Allowed branch ONLY:** `codex/ai-copilot-pipeline-test`. **Baseline reviewed source SHA:** `3a511b7277b0202e548fd8752c1211a67e501cf1`.  
**New authoritative review:** `Pipeline_test/reviews/2026-10-21-p1-wave-1d/INDEPENDENT_FINDINGS.md`. **READ FIRST**, along with `Pipeline_test/WORKFLOW_CONTRACT.md` revision 1.3, `SHORT_LOOP_TEST.md`, `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`, and `Pipeline_test/reviews/2026-10-21-p1-wave-1c/GEMINI_WAVE_1C_REPORT.md`.  
**Old failed live run:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/` — never replay writes or destroy old data.
**Mission:** make the actual S01–S02 *application integration* testable and the provider guard enforceable, without claiming E2E from fake scripts. End at **`P1_WAVE_1D_READY_FOR_GPT6_REVIEW` or `P1_WAVE_1D_BLOCKED:<exact_reason>`**. This is still NOT `P1_PASS`.

## 0. Safety and branch isolation (absolute)

- Inspect `git branch --show-current`, `git status --porcelain`, `git rev-parse HEAD` and tracked/untracked files BEFORE changes; sync branch by safe fast-forward if appropriate. Never force checkout/reset/rebase/stash/clean unknown work. Commit/push to **this branch only**, no PR or merge. Do not modify `main`, `UI`, other `astra/*` branches or unrelated features.
- **Zero external Google AI Studio, OpenAI or other paid provider calls, including background work/retries.** Old approved limit (200 attempts, USD 5, **2 elapsed hours**) expired at `2026-10-21T05:47:52Z`; 8 historical attempts recorded. This task does NOT renew it. Ensure fake upstream and denied external egress; do not launch old workers connected to real credentials.
- New **uniquely named** offline-only Compose project, ports, ledger, data volumes, fake upstream, author account/novel and evidence; protect historical containers, 5 old outboxes, files and DBs. Verify ownership. Do not edit prior provider ledger or checkpoint to pretend past S02 passed. NO `docker compose down -v`, unscoped pruning, `dropdb`, unrelated migrations, or secret exposure. Cleanup only individually proven new-run owned resources after evidence.
- Narrow, opt-in changes to provider client seams, gateway, test tooling/config allowed. Do not weaken canon/entity validator, modify frozen narrative gold to match predictions, alter existing production defaults, add unsafe debug bypass or broad refactors. If work cannot be made safe, report a blocker rather than fake success.

## 1. P0 — Complete real Gemini provider path through guarded gateway (V1D-01)

Baseline mismatch: `ai-service/core/llm_service.py` with `LLM_PROVIDER=gemini` instantiates `genai.Client(api_key=...)` and calls direct `generate_content`, but Compose removes key and sets `LLM_BASE_URL` only; `budget_gateway.py::_handle_gemini_proxy` is **always a canned stub**. Existing "cross-container" tests use host-level `LLMService(provider=openai)` and do not prove the production-like P1 route.

- Inspect exact provider SDK request pathway and choose one **minimal test-only opt-in** working route: (A) real `google-genai` client directed to a guarded native Gemini endpoint, using only nonsecret dummy worker auth and gateway-side provider key; or (B) explicit, documented OpenAI-compatible Gemini route through gateway, matching actual required operations/structured JSON config, preserving correct model/trace semantics. No silent provider substitution.
- Implement **genuine forwarding** from gateway to a dedicated **fake upstream HTTP server** that verifies request shape and returns provider-contract-compatible structured output. A response fabricated inside the gateway itself is **not** a routed end-to-end test. For actual production provider route, design and verify how credentials stay only in gateway, never worker containers.
- Exercise *running isolated AI-service container* with effective `LLM_PROVIDER` and real app-level S02 structured operation using fake upstream. Prove fake upstream received the expected operation exactly once; verify model, JSON schema, expected return and no direct Google request. Also verify errors, retries, quota and failure behavior.
- If SDK cannot be safely redirected, STOP with design and exact `GEMINI_NATIVE_PATH_UNGUARDED` rather than claiming green.

## 2. P0 — One-shot trusted tickets and hard budget safety (V1D-02, V1D-03)

- Remove `X-Budget-Ticket` trust-on-presence shortcut in `budget_gateway.py`. Prefer proxy **always reserves its own attempt exactly once** (and app-side reserve must not duplicate that dispatch). If using external tickets, require atomically validated ticket existence, ownership, one-time redemption and expiry, and prevent replay. **Forbidden cases:** invented token, stolen/cross-client token, reused token, expired token, a ticket from a previous run, concurrent reuse.
- Prove 1 accepted upstream request = exactly 1 consumed attempt, including upstream 429/500, retry, timeout; no successful network dispatch after call 200 or time/cost expiry; no cost settlement doubled on retry/finalize replay. Test two simultaneous callers racing for last slot. Do not trust user-controlled `estimated_cost` or `prompt_tokens` without bounds/verification.
- Ensure `GEMINI embed_content` path in `ai-service/infrastructure/embedding_providers.py` and any LLM fallback/backend route is either guarded **or explicitly disabled with verified fail-closed test** for this limited P1 run. Inventory actual instantiated providers and background workers. Test that test worker containers cannot reach real provider endpoints (network policy/blocked egress or enforced credential isolation), not merely that key is blank.
- **USD 5 spending hard-cap:** maintain conservative **outstanding liability** for in-flight calls, max output token configurations, retries, all billable variants/embedding, and dated verified pricing if available. Reject new work if cost ceiling might be breached. If max liability or true provider pricing is unknown, **report `BUDGET_COST_HARD_CAP_UNPROVEN` and do not authorize live**. `USD 0.001` reserved per request alone is inadequate. State invoice actuals as UNKNOWN until verifiable.
- Ledger state save must fail closed on IO errors; remove direct-write fallback that can truncate the authoritative state. Prove restart after interrupted write, corrupted ledger, missing ledger, and gateway offline all **deny** or recover only from a verified authoritative state, not silently reset within an already-started run. Keep deadline absolute and nonrenewable without fresh owner approval.
- Boundary tests must use running test-only containers + fake upstream, not solely local Python server and mocked caller.

## 3. P0 — Actual browser/UI test, never synthetic screenshot (V1D-04)

- `Pipeline_test/tools/browser_author_driver.py` currently only constructs labels, synthetic PNG bytes and self-written manifests; it contains no Playwright/actual browser actions. Remove the synthetic-success path and canned `status=PASS`; write a **real browser automation** (e.g. Playwright) or explicitly use Antigravity's actual browser controls and export a verifiable trace. Login, navigate, create new novel, use **real FE import/editor workflow** to enter original 5 fixture chapters. S02: open author IDE, enter entity guidance and trigger extraction only when fake upstream supports it. Do not call HTTP POST to simulate author actions.
- Use a **new isolated fake-provider stack** and a fresh test user/novel, real screenshots/DOM, browser trace (click/fill/upload, URL, selector/action IDs/timestamps) and **read-only server readback** of novel, chapter IDs, revision IDs/hashes. Store a browser-session identifier and correlate action IDs with server state. No sensitive credentials in screenshot/trace or Git.
- Improve `validate_browser_evidence`: reject manifest-only evidence, minimal PNG headers + text, orphaned timestamps, missing `action_id`/`run_id`, mismatched novel/user/session, forged static trace and absent readback. Do not claim cryptographic authenticity from self-authored JSON. Browser tool trace is evidence only if backed by actual execution. Offline negative tests must prove dummy PNG+manifest does not qualify.
- If FE author import/review UI is missing, output `BLOCKED_UI_MISSING` with screenshots and route and switch to read-only diagnosis. Do **not** bypass missing UI with writable API and call it UI PASS. Treat a fake-provider E2E as `OFFLINE_BROWSER_UI_SMOKE`, **not** provider-live S01/S02 acceptance.

## 4. P1 — Strict replay, provenance, and isolated secrets (V1D-05)

- `verify_manuscript_gold_hashes()` must reject **missing** `contentHash`/latest revision hash, not just mismatches. Check chapter numbers/order/uniqueness, chapter ID != revision ID, revision ID nonempty, and gold text/source hash; readback from actual canonical revision. Absent/stale/partial server result => fail closed. Tests: 0/1/3/4/5/6 chapters, scrambled numbering, empty hash, duplicate number, duplicate ID, wrong owner, stale revision.
- In `docker-compose.isolated.yml`, remove default Postgres, JWT and platform tokens/passwords for live-style config: use required local environment variables (`${NAME?message}`) or secret files, never committed values. PostgreSQL config and app DATABASE_URL must use SAME required secret. Do not change real/other services. No secret values/keys in reports.
- In report distinguish **host-level unit tests**, **test container integration**, **offline browser with fake upstream** and **real-provider live UI**. Preserve prior failures and original 8-call ledger. Do not destroy old `HANDOFF_PROMPT.md`, scripts, logs, or prior runs.

## 5. Verify and hand off

Run offline deterministic regressions for entity/guidance, gateway security/admission/concurrency/durability/settlement, **provider-native or explicitly opted compatibility route** from running isolated containers through fake upstream, embedding/fallback fail-closed, browser evidence negative tests and actual browser UI workflow, replay/gold hash tests, backend/AI selected suites, backend typecheck and web build. **Do not run real paid provider.** Commands, exit codes, source/config SHA, fake upstream URL/received request counts, browser trace IDs, screenshot names and read-only readback hashes are required; missing coverage should be `NOT_RUN`, not `PASS`.

Use a NEW folder `Pipeline_test/reviews/2026-10-21-p1-wave-1d/` for `GEMINI_WAVE_1D_REPORT.md`, test logs, fixture manifests and safe evidence references. If a new offline browser stack is used, its run artifacts go under a uniquely named `Pipeline_test/runs/<run_id>/` without touching any existing run.

**Verdict matrix for V1D-01..06** with `PASS`/`FAIL`/`BLOCKED`/`NOT_RUN`, actual scope and evidence links.

- Only use `P1_WAVE_1D_READY_FOR_GPT6_REVIEW` if every P0 integration/evidence gate really passed the **intended level**; it is never synonymous with P1 acceptance.
- Otherwise `P1_WAVE_1D_BLOCKED:<reason>`, include a prioritized, narrow next patch. No pretending mocked route = real Gemini.
- Before pushing, check for secrets, changed paths and HEAD, ensure only branch `codex/ai-copilot-pipeline-test`. Commit/push sanitized code, tests, logs and report. **STOP** and return commit SHA, exact changed files, performed/not-performed tests, unresolved blockers, count of new external provider calls (must be **0**), and status for GPT-6 review.

P2, P3 and the terminal 100,000-word P3 novel remain OUT OF SCOPE until P1 functional acceptance and new instructions.
