# GPT-6 independent source/evidence review — Wave 1D → Wave 1E

**Date:** 2026-10-21 (Asia/Bangkok). **Reviewed HEAD:** `dea20421c612a79aa0534e74341c311ef60de772`. **Branch ONLY:** `codex/ai-copilot-pipeline-test`.  
**Method:** remotely inspected GitHub source, `GEMINI_WAVE_1D_REPORT.md` (its agent label is **Codex**), scoped logs, saved browser trace **metadata**/DOM/readback, receipt and ledger reconciliation. The reviewer **did not execute local Docker or browser, inspect each binary trace screenshot manually, or call an external LLM**.  
**Contract:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4, `SHORT_LOOP_TEST.md`, `AGENT_GUIDE.md` and `API_ADAPTER.md`.

## Verdict

**`WAVE_1D_OFFLINE_INTEGRATION_ACCEPTED_WITH_PRELIVE_GATES`**, not `P1_PASS`.

- V1D-01: SDK `genai.Client` has an opt-in guarded HTTP route; gateway forwards real HTTP to a **distinct deterministic fake upstream**, not a canned gateway result. AI-service container and backend were exercised with a shared gateway, matching reported ledger receipts. Source inspection and committed integration logs substantiate **OFFLINE_TEST_INTEGRATION_PASS** only; real Google compatibility after pricing/wiring remains untested.
- V1D-02: `X-Budget-Ticket` is now rejected on proxy endpoints; gateway owns reservation/finalization; independent-process/concurrency, 200/201, timeout/retry, restart and corrupt-ledger tests were reported. Host logs: 76 passed/4 skipped. Container-specific: 4 passed, 10 negative checks. Reported receipts `224/224` boundary and `30/30` browser stack, zero unmetered/duplicate; **reviewed saved evidence, not live re-execution**.
- V1D-03: isolated Compose's worker networks are internal-only, worker provider keys blank, embedding disabled in guarded P1. Pricing and cost hard cap still **`BUDGET_COST_HARD_CAP_UNPROVEN`**: the gateway computes reservations via synthetic `input_rate=1 / 1M`, `output_rate=4 / 1M` and an unproven byte-to-token upper bound. Current `offline_only` branch rightly blocks actual external dispatch. Do not infer spending < USD 5 from synthetic quota.
- V1D-04: browser driver now imports Playwright and executes `page.get_by_role().click`, `.fill`, screenshot, DOM, trace zip and read-only `GET` server reconciliation. The committed attempt-04 result records 16 validated action bundles and `waiting_entity_review` in UI DOM + API readback. This is credible **OFFLINE_BROWSER_UI_SMOKE** with fake provider, not provider-backed S01/S02 and not all S01–S11. Review did not independently replay Chromium.
- V1D-05/06: strict revision/owner/hash checks and atomic ledger/old-evidence preservation tests are reported; frozen fixtures and 40 historic files protected except 2 explicitly modified scripts/config. Historical 8-call/old 2-hour live approval remains expired. No new real-provider attempts reported.

### NEW finding WE-01 — P1 fixture-derived canonical body differs from declared workflow

`Pipeline_test/AGENT_GUIDE.md` says **line 38**: *“nạp nguyên văn body từ input/manuscript/chNN.md; tiêu đề tách khỏi body”*. `Pipeline_test/API_ADAPTER.md` says *“body thật của ch01.md, bỏ dòng tiêu đề Markdown”*. **But** `Pipeline_test/tools/browser_author_driver.py` currently fills the entire `chNN.md` as textarea body and chooses `Wave1D chapter {index}` as title. The actual persisted chapter 1 readback begins `# Chương 1 — Bến trở về\n\nChiếc phà...` and title is `Wave1D chapter 1`. `provenance.py::verify_manuscript_gold_hashes` then enforces SHA256 of **the entire source file**, codifying this inconsistent behavior. S01 source text is preserved but its title/body layout does not comply with the intended author's data model.

**Required:** derive a source-body mapping: exact first Markdown H1 → title, remainder → body, with frozen `chNN.md` untouched. Record separate `source_file_sha256`, normalized `canonical_body_sha256`, and a transparent `conversion_rule_version`. Verify server persisted title, chapter ordering, canonical revision body/hashes and source mapping; do not mistake raw fixture hash for a server body hash. Handle BOM/CRLF/Unicode normalization **explicitly, deterministically** and fail closed on malformed/missing first H1 or empty body. Preserve failed/previous successful attempt-04 as immutable historic evidence; new browser test must use a **new novel/run**. Valid Unicode title punctuation need not be 'normalized' arbitrarily.

### NEW finding WE-02 — official model pricing exists but billable-call ceiling not proven

Official Google Developer API pricing page: `https://ai.google.dev/gemini-api/docs/pricing` (reviewed 2026-10-21). For exact `gemini-3.5-flash-lite`, **Standard paid tier** displayed **$0.30/1M input tokens** (text/image/video/audio) and **$2.50/1M output tokens including thinking tokens**. Cache, search/map grounding, provider tier, modalities and other possible billing must be excluded or bounded separately; the local project's free-tier applicability is account-specific and not verified. Prices can change; store retrieval date/source and verify immediately before a later authorized live run.

The source `Pipeline_test/tools/budget_gateway.py` currently charges synthetic offline `1 / 4 USD per million` and estimates `len(UTF8 request bytes)+4096` input token upper bound + max output. **This is not a proven provider-billing upper bound.** Required: a versioned pricing/cap contract, bounded eligible text-only request shape, robust token accounting/worst-case liability including thinking/billable-output behavior, reservations across concurrent in-flight calls, request metadata, retries and errors, and rejection of all billable variants not covered. A displayed price is evidence of tariff, NOT proof of charge bounds. Continue fail-closed `BUDGET_COST_HARD_CAP_UNPROVEN` if missing a defensible worst-case model. Do not enable `offline_only=False` or issue real calls without separate user authorization.

### NEW finding WE-03 — fake provider does not test positive entity-review quality path

The committed `s02-entity-checkpoint.readback.json` at attempt-04 records **170 candidates**, all **170 `not_entity`**, no accepted identities. That is *intentional deterministic fake response*, **not** evidence of successful real entity recognition, alias resolution, 35-gold recall or event/fact downstream. Offline S02 proves gate suspension/routing, not author processing of actual positive candidates. For greater pre-live confidence, separately script a **small positive fixture** with valid source-grounded `entity` + alias and genuine `not_entity`/`unresolved`, then exercise UI author keep/reject/correct/continue to downstream using fake upstream, if UI is present; do NOT label this as semantic/real-provider PASS. Preserve negative-only run too.

### NEW finding WE-04 — action readback timing/provenance granularity

`browser_author_driver.py` performs user actions and later writes identical final `chapters` snapshots to individual `ACT-*.readback.json` files. These show **final persisted state correlated to browser session**, not independent readback captured immediately after each action. Improve honest artifact timestamp labeling or capture bounded readback at actual action time; never imply step-local server state if it was captured after entire workflow.

## Gate status and next step

| Area | Independent verdict |
|---|---|
| Gemini Native ↔ gateway ↔ fake upstream, evidence inspected | `OFFLINE_INTEGRATION_PASS_WITH_SCOPE` |
| Ticket bypass / process ledger / worker isolation | `OFFLINE_INTEGRATION_PASS_WITH_SCOPE` |
| Actual author browser + S02 gate with fake provider | `OFFLINE_BROWSER_UI_SMOKE_PASS` |
| S01 title/body fixture contract | `MISMATCH_NEEDS_FIX` |
| Real cost hard cap / supported pricing | `BLOCKED:BUDGET_COST_HARD_CAP_UNPROVEN` |
| Human review of positive candidate + downstream fake path | `NOT_RUN` |
| Real Gemini S02 after prompt repair | `NOT_RUN` |
| Full P1 S01–S11 / P2 / P3 / final 100k | `NOT_RUN / NOT_ACCEPTED` |

Proceed **Wave 1E narrow offline fixes and verification**, preserving old runs and source. No new paid external requests, no P2/P3/100k, no PR/merge, no production gateway promotion without independent review.
