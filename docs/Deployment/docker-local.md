# Docker Local Deployment

This guide runs the current Web + Backend + PostgreSQL + MongoDB stack locally with demo seed data.

## Services

| Service | Container port | Host port | Purpose |
| :--- | :--- | :--- | :--- |
| `web` | `80` | `8080` | React web app served by Nginx. |
| `backend` | `4000` | `4000` | Node.js API. |
| `postgres` | `5432` | `5432` | PostgreSQL application database. |
| `mongodb` | `27017` | `27017` | MongoDB document/content database. |

The web container proxies `/api/v1` to the backend container, so external testers usually only need `http://localhost:8080`.

## Start

From repository root:

```powershell
docker-compose up --build
```

Or run in the background:

```powershell
docker-compose up -d --build
docker-compose logs -f backend
```

If your Docker installation supports the newer plugin command, `docker compose ...` is also valid.

## Demo Seed

The backend container automatically runs migrations and seed when these compose variables are enabled:

```yaml
RUN_MIGRATIONS: 'true'
RUN_DEMO_SEED: 'true'
```

Seeded accounts:

| Username | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| `reader02` | `reader02@example.com` | `StrongPassword123!` | `ADMIN` |
| `reader03` | `reader03@example.com` | `StrongPassword123!` | `AUTHOR` |
| `reader04` | `reader04@example.com` | `StrongPassword123!` | `READER` |

Seeded novels owned by `reader03`:

| Novel | ID | Chapters | Notes |
| :--- | :--- | :--- | :--- |
| `Ashenhold - Sample Story` | `81b923d7-5507-48ea-9a84-5303fd1de5f4` | 10 | Last chapter is VIP, price `50`. |
| `Thanh Van Sword Path - Sample Story` | `451e1280-214c-4500-980b-34b9af0989eb` | 3 | All chapters are free. |

To re-run seed manually:

```powershell
docker-compose exec backend npm run db:seed:demo
```

To reset all Docker database data:

```powershell
docker-compose down -v
docker-compose up --build
```

## Review URLs

- Web: `http://localhost:8080`
- Backend health: `http://localhost:4000/api/v1/health`
- Web-proxied backend health: `http://localhost:8080/api/v1/health`

## Expose With Ngrok

Expose only the web port so the frontend and API share one public origin:

```powershell
ngrok http 8080
```

Give testers the generated ngrok URL. They should use the web URL, not the direct backend URL.

## Optional AI Provider Env

By default, Docker points the backend AI client to the current ngrok LLM provider:

```text
https://foreseeable-kaliyah-fleshier.ngrok-free.dev/v1
```

If the local Docker run should call another external LLM provider, set variables before starting compose:

```powershell
$env:AI_LLM_BASE_URL='https://your-provider.example/v1'
$env:AI_LLM_MODEL='your-model-name'
docker-compose up -d --build
```

The Docker default keeps `AI_LLM_MAX_TOKENS` at `1000` to reduce long-running AI requests through Cloudflare Tunnel. If local-only AI calls are stable and you want longer output, override it:

```powershell
$env:AI_LLM_MAX_TOKENS='2048'
docker-compose up -d --force-recreate backend
```

If AI works on `localhost` but fails through Cloudflare Tunnel, first check:

```text
https://your-tunnel.trycloudflare.com/api/v1/ai/health
```

If health is OK but `/ai/copilot/suggestions` fails with `context canceled`, the request is taking too long through the tunnel. Use a shorter prompt, lower `AI_LLM_MAX_TOKENS`, or retry with a faster model/provider.

Phase 10 can replace this with a dedicated FastAPI AI service.

## Common Notes

- If `docker compose` is unavailable, use `docker-compose`.
- If Docker prints `Access is denied` for `C:\Users\Laptop\.docker\config.json`, fix Docker Desktop permissions or continue with `docker-compose` if the command still runs.
- If port `5432`, `27017`, `4000`, or `8080` is already used, stop the local service or change the host-side port in `docker-compose.yml`.
