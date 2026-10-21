# GPT-6 Independent Review — Wave 1C → Wave 1D integration findings

**Date:** 2026-10-21 (UTC+7). **Source branch only:** `codex/ai-copilot-pipeline-test`. **Reviewed source HEAD:** `3a511b7277b0202e548fd8752c1211a67e501cf1`.  
**Scope:** remote GitHub source, deterministic test logs and Wave 1C report. Reviewer **did not run local Docker, a browser session, AI Studio API, or a real provider**.  
**Source of record:** `Pipeline_test/reviews/2026-10-21-p1-wave-1c/GEMINI_WAVE_1C_REPORT.md`; `Pipeline_test/tools/budget_gateway.py`; `ai-service/core/llm_service.py`; `ai-service/infrastructure/embedding_providers.py`; `backend/src/modules/ai-copilot/llm-provider.ts`; `Pipeline_test/tools/browser_author_driver.py`; `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/execute_p1_journey.py` and `docker-compose.isolated.yml`; `Pipeline_test/tests/test_cross_container_budget_gate.py`, `test_ui_evidence_authenticity.py`.

## Verdict

**`WAVE_1C_REVIEW_BLOCKED_INTEGRATION` — do not open new live provider window.** The committed deterministic tests support narrow offline behavior, but Wave 1C's claimed closure of V1C-01, V1C-02 and V1C-04 is too broad. The historical S02 real-provider failure remains historical; its prompt fix from Wave 1B still passed offline regression only. **P1 S01 LIVE_UI, S02 retest and S03–S11 have NOT passed.** P2/P3/100k NOT_RUN.

Wave 1C test logs reported: budget gateway **8 passed**; UI evidence **9 passed**; partial import **12 passed**; entity review **76 passed**; AI service selected suite **400 passed, 2 skipped, 49 deselected**; backend targeted **63 passed**; builds/typechecks passed. These are **offline/provider-stub**, not full real-stack E2E.

## Findings

### V1D-01 — P0 — Gemini Native path is not actually routed through the provider gateway

`ai-service/core/llm_service.py` calls `genai.Client(api_key=self.api_key)` and then `client.models.generate_content(...)`. `_call_llm()` rejects missing API key before request dispatch. Committed Compose sets `LLM_PROVIDER: gemini`, `GEMINI_API_KEY: ""`, `BUDGET_GUARD_URL` and `LLM_BASE_URL`. Setting `LLM_BASE_URL` does **not by itself** change the endpoint of `genai.Client(api_key=...)`. Meanwhile `budget_gateway.py::_handle_gemini_proxy` always returns a stub result, even with upstream configured. Thus no working **real Gemini Native through guarded gateway** has been established. Test `test_ai_service_llm_service_cross_container_integration` instead constructs `LLMService(provider="openai")` with fake key, not the configured `gemini` provider.

**Acceptance:** with a real **fake upstream** (not Google), prove from isolated running AI-service configured as production-like Gemini provider that request reaches guarded gateway and the fake upstream exactly once with valid structured JSON contract; no direct Google requests. Make the test fail if it receives the hardcoded stub. Or explicitly select a documented, tested, opt-in OpenAI-compatible route to Google Gemini and ensure product's effective provider/model tracing reports it accurately. Never silently switch models or use empty key to fake a green gate.

### V1D-02 — P0 — Unverified X-Budget-Ticket skips budget reservation

`budget_gateway.py::_handle_chat_completions_proxy`: if arbitrary `X-Budget-Ticket` header exists, the gateway uses it without validating existence, reservation state, ownership, one-shot consumption, expiry, or previous dispatch. It also conditionally skips finalize. The upstream forwarding path can therefore be reached without a fresh counted reservation.

**Acceptance:** one externally dispatched request attempt must atomically consume exactly one validated ticket, with a single authoritative dispatcher. Prefer forbidding client-supplied tickets on proxy routes (gateway owns the reservation), or implement binding and exactly-once atomic redemption. Reject forged, reused, expired and cross-service tickets. Test retries, upstream 5xx and concurrent ticket races: **zero upstream requests on denial** and exactly one accounted attempt per permitted upstream request. Avoid double reservation if AI-service makes a reserve call and then the proxy reserves again; redesign to exactly once, with trusted binding.

### V1D-03 — P0 — Missing provider egress coverage and conservatism

`ai-service/infrastructure/embedding_providers.py` uses `genai.Client(...).models.embed_content(...)`; the guard coverage for embeddings is unproven, even if `build_embeddings=False` in S02. Either route ALL enabled provider APIs (including embedding/fallback) through mandatory guarded egress, or **explicitly disable, test and assert the disabled routes for P1**. The proxy's `estimated_cost=0.001` per request and ledger's `estimated_cost_usd` without outstanding reservation liability are not sufficient proof of a **hard USD 5 ceiling** for large token responses or concurrent requests. Prove conservative max-output/token pricing upper-bound reservations and safe settlement; unknown provider price/usage/response size ⇒ stop, not a claim of hard-cap enforcement. Disallow network/credential bypass in all worker containers and prove it via negative network tests on the test-only Compose network.

### V1D-04 — P0 — Browser driver manufactures plausible evidence, does not drive UI

`Pipeline_test/tools/browser_author_driver.py::execute_browser_s01_import_path` and `execute_browser_s02_entity_review_path` call `record_browser_step()`, which **writes PNG bytes locally** including a fallback synthetic PNG string and a user-authored manifest. There are **no real page.goto/click/fill/upload operations**. It returns `status: PASS` without opening the application. `Pipeline_test/tests/test_ui_evidence_authenticity.py` writes fake PNG bytes/JSON itself and expects "authentic" acceptance. File size + a self-written manifest ≠ real browser provenance.

**Acceptance:** replace stub with genuine Playwright/browser-control interactions against a new isolated **fake-provider** stack; save actual screenshot/trace/DOM, action log (selectors and URL), author account/novel ID and read-only server chapter/revision/hash readback. Record `LIVE_UI` only for actual browser actions correlated to persisted state. Tests must reject synthetic `record_browser_step` artifacts, fabricated PNG headers/manifests, absent trace or server mismatch. If FE route/UI is missing, report `BLOCKED_UI_MISSING`, not `PASS`; no author-write API substitute.

### V1D-05 — P1 — Partial-import hash and credential fail-closed gaps

`verify_manuscript_gold_hashes()` only rejects when `server_hash` is present and mismatched: `if server_hash and server_hash != expected_sha`. Missing hash therefore passes, and chapter position is zipped without verifying `chapterNumber` corresponds to source order. Reject missing hashes, missing IDs, duplicated chapters, wrong order and differing revision/fixture content; no new novel POST when any existing state is ambiguous. The Compose file still sets literal `POSTGRES_PASSWORD: postgres` and fallback passwords/tokens/JWT secrets (`${POSTGRES_PASSWORD:-postgres}`, etc.). Fail closed for missing test-only secrets rather than using demo defaults, record no values, and verify project/volume ownership. Current historical secrets in Git are not retroactively erased; do not rewrite history as part of this run.

### V1D-06 — P1 — Historical guard and test fixture preservation

`budget_gateway.py` includes an `os.replace()` error fallback that rewrites ledger directly and permits state loss on interrupted save. No live work until durable/fail-closed behavior is credible. All Wave 1D tests must use **new test-owned state files and offline fake upstream**. Historical `2026-10-21-gemini-p1-live-01` remains at **8 reported provider attempts, estimated USD 0.007379, expired 2-hour window**; preserve its state, failed S02 evidence and resources. Preserve old outboxes/volumes and frozen narrative gold.

## Next gate

**Wave 1D OFFLINE INTEGRATION REPAIR**, not a new P1 live attempt. Require executed end-to-end isolated **fake upstream + app containers + actual browser** where available, and adversarial budget security tests. If any route is unguarded, missing UI, or mock-only, report precise `BLOCKED` and tested scope. New owner approval is required before any Google AI Studio call; the old approval expired.

**Reviewer will accept only evidence bounded by what was actually run.** No P2/P3/100k, merge, PR, deletion of past test evidence, or alterations to `main`.
