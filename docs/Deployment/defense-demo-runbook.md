# Graduation Defense Demo Runbook

## Purpose

This is the operational runbook for the graduation-defense demo. It packages the already verified backend, databases and Flash-Lite provider path into one repeatable procedure while the UI is still being refactored.

The machine-readable companion is `docs/Deployment/defense-demo-manifest.json`.

## Freeze policy

Two layers are intentionally separated:

1. **Frozen now:** model choice, Compose profile, routing policy, demo accounts, seeded story IDs, recovery procedure and provider-fallback policy.
2. **Frozen later:** the exact final Git commit, after the UI refactor is merged and the final manual browser sanity pass succeeds.

Do not pin the current UI as final while UI work is still in progress.

### Locked runtime decisions

| Item | Defense value |
| --- | --- |
| Compose | `docker-compose.yml` + `docker-compose.flash-lite-demo.yml` |
| Local env file | ignored `.env.demo` |
| Generation model | `gemini-3.5-flash-lite` |
| Alternate model | `gemini-3.1-flash-lite`, manual choice only |
| Automatic fallback to 3.8 | forbidden |
| Context routing | `legacy-v1` |
| Python local suggestion fallback | disabled |
| Migrations | enabled |
| Demo seed | enabled |
| P8-05 destructive cleanup | forbidden / still blocked |

The model choice is for practical demo request capacity, not a literary-quality claim.

## Canonical demo data

Use the repository's existing deterministic Docker seed. Do not create a separate ad-hoc defense dataset unless this seed becomes unusable.

### Author account

- Username: `reader03`
- Email: `reader03@example.com`
- Password: `StrongPassword123!`
- Role: `AUTHOR`

These are committed non-production demo credentials already used by system-test documentation.

### Primary story

- Title: `Ashenhold - Sample Story`
- Novel ID: `81b923d7-5507-48ea-9a84-5303fd1de5f4`
- Primary chapter ID: `c660bede-0493-4a46-97f2-6d01c8ddd3db`
- Primary chapter position: 1
- Seed source: `backend/src/scripts/seed-sample-stories.ts`

The smaller `Thanh Van Sword Path - Sample Story` remains a backup story, not the default defense path.

## One-time preparation before defense day

1. Copy the example environment file:

```powershell
Copy-Item docs/Deployment/flash-lite-demo.env.example .env.demo
```

2. Add one valid local Gemini key to `.env.demo`. Never commit or screen-share the key.
3. Keep the following values unchanged:

```text
DEMO_LLM_MODEL=gemini-3.5-flash-lite
CONTEXT_ROUTING_POLICY=legacy-v1   # supplied by demo Compose
LLM_LOCAL_FALLBACK=false           # supplied by demo Compose
```

4. Do not enable semantic retrieval just for the defense unless the chosen demo story already has compatible persisted embeddings. The defense path must not depend on a last-minute re-embedding job.
5. After UI refactor is complete, update `final_demo_commit` in the manifest and do not move the demo machine to another commit after the final rehearsal unless a blocker is fixed.

## Start the defense stack

From repository root:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml config --quiet
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml ps
```

Expected externally useful endpoints:

- Web: `http://localhost:8080`
- Web-proxied backend health: `http://localhost:8080/api/v1/health`
- Backend health: `http://localhost:4000/api/v1/health`
- AI service health: `http://localhost:8000/health`

## T-15 minute preflight

Perform this before opening the presentation.

### 1. Container health

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml ps
```

All required services should be running; PostgreSQL and MongoDB should be healthy before backend-dependent actions.

### 2. HTTP health

```powershell
Invoke-WebRequest http://localhost:8080/api/v1/health -UseBasicParsing
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
```

Do not continue to the live AI portion if either endpoint is unavailable.

### 3. Verify effective AI model and routing without printing secrets

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml exec -T ai-service python -c "import main; s=main.settings; assert s.llm_provider == 'gemini'; assert s.llm_model == 'gemini-3.5-flash-lite'; assert s.context_routing_policy == 'legacy-v1'; print('AI demo runtime OK:', s.llm_model, s.context_routing_policy)"
```

The backend AI health endpoint should also report the configured Flash-Lite model as available.

### 4. Verify deterministic demo data

If the author account or sample story is missing, rerun the idempotent seed:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml exec -T backend npm run db:seed:demo
```

Use the IDs in `defense-demo-manifest.json`; do not search for a random project during the defense.

## Defense presentation path

The exact UI labels may change during refactor, but the functional story should remain stable:

1. Open the platform and log in as the seeded AUTHOR account.
2. Open the seeded Ashenhold project.
3. Show the author workspace / IDE and one existing chapter.
4. Briefly show the context/Story Brain capability if the refactored UI exposes it safely.
5. Run one AI Copilot suggestion.
6. Run one AI-writing generation.
7. Apply or preview the returned patch depending on the final UI.
8. Explain that the two AI entry paths are routed to the same demo-safe Flash-Lite model while backend context routing stays on `legacy-v1`.

Do not spend the defense repeatedly generating text. One successful Copilot call and one successful AI-writing call are enough to prove the live path.

## What to say if the AI provider fails

A provider error is not a reason to change models live.

1. Keep automatic fallback to `gemini-3.8-flash` disabled.
2. Show that the rest of the platform and persisted demo data still work.
3. Retry once only if the failure is transient.
4. If the second attempt fails, continue with the already prepared explanation/screenshots/results rather than burning quota.
5. State accurately that external model availability is a third-party dependency; the application path has already been verified separately in bounded live runs.

## Recovery ladder

Use the smallest recovery that can solve the problem.

### Level 1 — one service

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml restart backend
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml restart ai-service
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml restart web
```

### Level 2 — recreate application services

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build --force-recreate backend ai-service web
```

### Level 3 — restart the whole stack without deleting data

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml down
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build
```

### Level 4 — destructive local reset, last resort only

Do this only before the defense or when enough recovery time remains:

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml down -v
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build
```

The backend should rerun migrations and the deterministic demo seed. Never use this against valuable databases.

## Stop after rehearsal or defense

```powershell
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml down
```

Do not add `-v` unless you intentionally want to delete local demo database volumes.

## Final gates still pending

The following should happen later, after the team finishes UI refactor:

1. Pin the exact final demo commit in `defense-demo-manifest.json`.
2. Perform one manual browser sanity pass on that exact commit.
3. Perform one complete defense rehearsal, from startup through the presentation path and shutdown.
4. Freeze the demo machine after that rehearsal.

The following are deliberately **not** required to pass the graduation demo gate:

- browser automation;
- high-concurrency certification;
- population-level provider reliability;
- a complete literary-quality audit;
- P8-05 destructive cleanup.
