# Real-demo Flash-Lite configuration

> Graduation-defense packaging: use this provider configuration together with `docs/Deployment/defense-demo-manifest.json` and `docs/Deployment/defense-demo-runbook.md`. The defense runbook is the operational source of truth for startup, seeded data, preflight and recovery; this file remains the provider-specific reference.

## Why this exists

The real interactive demo must not accidentally consume the restrictive `gemini-3.8-flash` daily request allowance. This opt-in Compose override selects **`gemini-3.5-flash-lite`** for both generation entry points: the Python AI-writing service and the Node.js AI Copilot. It is a **quota/capacity choice, not a writing-quality claim**. The alternate `gemini-3.1-flash-lite` is available explicitly using `DEMO_LLM_MODEL`. The base production Compose and `CONTEXT_ROUTING_POLICY=legacy-v1` remain unchanged.

The Python AI service uses the Gemini SDK. The Node backend uses the official Gemini OpenAI-compatible API at `https://generativelanguage.googleapis.com/v1beta/openai`, which supports `/models` and `/chat/completions`: https://ai.google.dev/gemini-api/docs/openai .

**Important:** The canary's `CTX_RD_GENERATION_MODEL` does not configure the running web/backend services. The demo override sets the *actual service environment*. The backend and AI service both use the same `DEMO_LLM_MODEL`, but their independent generation paths have not been live-tested together by the earlier canary. A local authenticated application-level smoke is still necessary.

## Run on a disposable local demo environment

1. Copy `docs/Deployment/flash-lite-demo.env.example` to `.env.demo` in the repository root. Enter one valid `GEMINI_API_KEY` locally; `.env.demo` and `key.txt` are Git-ignored. Do not put secrets in tickets, prompts, screenshots or committed example files. Using `key.txt` for the earlier local runner does **not** automatically inject a key into Docker Compose.
2. From the repository root, validate the override, then start the services:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml config --quiet
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build
```

3. Check the running AI service model without printing any keys:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml exec -T ai-service python -c "import main; s=main.settings; assert s.llm_provider == 'gemini'; assert s.llm_model in ('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'); assert s.context_routing_policy == 'legacy-v1'; print('AI demo model and routing verified:', s.llm_model)"
```

4. Verify the backend's authenticated provider-health endpoint returns `ready=true` and the same model, then perform **one** actual AI Copilot suggestion and **one** AI-writing generation on non-sensitive demo content. Record model identity, response status, failures (especially 429/503), latency and recovery; do not expose API keys or full manuscript text in evidence. An HTTP health check alone does not prove generation works.
5. Stop the demo when finished:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml down
```

To use the alternate model, set `DEMO_LLM_MODEL=gemini-3.1-flash-lite` in your untracked `.env.demo` and recreate the affected containers. The demo profile deliberately disables the Python service's local suggestion fallback; provider failures should remain visible instead of being mistaken for real LLM success.

## Boundaries and acceptance

- Do **not** run the demo profile against valuable production databases, real users or manuscripts. It uses the existing demo Compose's application defaults and must be secured before any public deployment.
- Do **not** switch globally to `balanced-scope-v1` or unblock P8-05; default context policy remains `legacy-v1`. Enable semantic retrieval only when the demo novel has valid persisted embeddings; changing the embedding model/version requires its own compatibility and reindex review.
- The earlier two successful 3.5 Flash-Lite canary generations establish a functional provider path but **not** multi-user demo stability or reliable remaining RPD. Rate limits and key quotas are enforced by the provider. Keep the real demo within the actual project/key quota and avoid automatic 3.8 fallback.
- CI statically checks this Compose overlay with a **dummy** key and never calls the real provider. Only an explicitly executed local application-level smoke can close the real-demo readiness gate.
