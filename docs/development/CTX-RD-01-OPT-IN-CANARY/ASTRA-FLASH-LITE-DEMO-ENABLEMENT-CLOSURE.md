# Astra — Flash-Lite demo enablement: PR #34 and PR #35 closure

## Goal and scope

The user explicitly selected Gemini Flash-Lite **to avoid exhausting Gemini 3.8 Flash's restrictive request-per-day allowance during a real interactive demonstration**, not to claim better manuscript quality. The demo path and request-capacity decision are separate from narrative quality, population-level provider uptime and any future production default rollout.

**Decision: DEMO_LITE_CODE_AND_CONFIG_ACCEPTED; REAL_UI_DEMO_SMOKE_PENDING_LOCAL_VERIFICATION.**

## Merged changes and evidence

- [PR #34](https://github.com/Ephurin/Novel_sharing_platform/pull/34), merge SHA `b30775befd0060db84fcf86efd0aac03ac2c0487`: isolated model-specific evidence, validator checks that reject silent Flash-Lite → 3.8 fallback, model-path regression tests and a bounded genuine 3.5 Flash-Lite functional canary.
  - Clean live-tested code `e22ea63590b0d4cc715be34b041e1ecdb1746b61` → direct-child evidence `48f65231e0d435a36da7f7e45f5d259c6ca4112a`.
  - Historical 3.8 data remains unchanged; separate Lite JSON: `docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-narrative-e2e-gemini-3.5-flash-lite.json`.
  - Two reported real `gemini-3.5-flash-lite` generations completed on isolated PostgreSQL/pgvector, 2/2 successful attempts, no recorded 429/503 or 3.8 fallback, with 3.24s and 4.37s latencies.
  - CI on synchronized PR head `97a4ee558352816ce7ebff91dfa93df5c799d79b`: P7 `37197026960`, P8 `37197027098`, Evaluation Pilot `37197026973`, all SUCCESS.
- [PR #35](https://github.com/Ephurin/Novel_sharing_platform/pull/35), merge SHA `cff881f1da4272f0bf0ed43f8c8e32350066fadb`: new opt-in `docker-compose.flash-lite-demo.yml` configures **both** generation entry points for the real demo:
  - Python `ai-service`: `LLM_PROVIDER=gemini`, `LLM_MODEL=${DEMO_LLM_MODEL:-gemini-3.5-flash-lite}`, `LLM_LOCAL_FALLBACK=false`, explicit required `GEMINI_API_KEY`.
  - Node AI Copilot backend: Google's OpenAI-compatible `https://generativelanguage.googleapis.com/v1beta/openai` endpoint, `AI_LLM_MODEL` set to the same demo model, the same required Gemini API key (only in local untracked `.env.demo`).
  - `gemini-3.1-flash-lite` is an explicitly selected alternative via `DEMO_LLM_MODEL`. There is no automatic fallback to quota-constrained Gemini 3.8.
  - Production/base `docker-compose.yml` is unchanged; demo override continues to use `CONTEXT_ROUTING_POLICY=legacy-v1`.
  - Runbook: `docs/Deployment/flash-lite-demo.md`; secret-free env template `docs/Deployment/flash-lite-demo.env.example`.
  - PR #35 P7 CI [run 37197428749](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37197428749) SUCCESS: unit, pgvector integration and root Compose smoke. Its new demo Compose wiring step checks BOTH 3.5 and 3.1 selections with a **dummy** key; no actual provider calls in CI.

## Explicit exclusions and content observations

The 3.5 Flash-Lite canary's summary accurately separates:
```text
technical_execution             PASS (two-case functional smoke)
automated_content_check         PARTIAL (both cases)
independent_full_draft_review   NOT_ASSESSED
provider_stability              INSUFFICIENT (two successes, narrow sample)
```

The Ch32 answer is 191 characters and does not explicitly distinguish Ch27/Ch32; the Ch49 answer is 706 characters and does not satisfy the full Ch45/47/49 conflict-handling requirements. These are **separate quality limitations**, not a reason to block merging the demo-enablement work. Do not claim no hallucinations/future-information leakage without a separate independent complete-draft review. Do not claim population-level reliability or that Lite always outperforms 3.8 based on two attempts.

## Next: localized demo-readiness check for Gemini / Antigravity

1. In a **disposable** local demo checkout of updated `main`, copy `docs/Deployment/flash-lite-demo.env.example` to the ignored root `.env.demo` and fill `GEMINI_API_KEY` locally from the user's already-configured valid key. Do not commit or print keys; `key.txt` itself is not automatically imported into containers.
2. Execute `docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml config --quiet` and `... up -d --build`, per `docs/Deployment/flash-lite-demo.md`. Confirm that AI-service and backend use `gemini-3.5-flash-lite`, the configured provider accepts the model, Python local fallback is disabled, and routing remains `legacy-v1`.
3. Execute **one authenticated AI Copilot suggestion and one AI-writing generation** through the actual running application endpoints/UI with disposable demo content. Attest each effective model, provider result, request errors 429/503, retry count/latency and any fallback. Fail explicitly if the key/model is unavailable; never silently route to 3.8 or synthetic generation.
4. Optionally run a small bounded repeatability window using the anticipated demo request rate/concurrency **within the provider's actual quota**. Record attempts/errors/recovery and latency without committing secrets or manuscripts. This is a practical demo-readiness signal; it is not proof of high-volume production reliability.
5. Append an execution-only status to `promt.md` with exact tested Git SHA and sanitized evidence. If local key or Docker is unavailable, report `BLOCKED/NOT_EXECUTED` without inventing results. Do **not** re-embed all 216 source chunks or reopen EVAL-01 solely for this demo configuration.

`CONTEXT_ROUTING_POLICY=legacy-v1` remains production default, balanced routing global activation NOT AUTHORIZED and destructive P8-05 `BLOCKED_PENDING_STABILITY`. This demo-profile acceptance does not authorize either change.
