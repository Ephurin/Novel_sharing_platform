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

## Store images in Cloudinary

Set `CLOUDINARY_URL` in the root `.env` and rebuild the backend. New uploads use
Cloudinary when the variable is set. An empty value selects local storage.
The backend can still serve old files from the media volume.

To move existing novel covers, avatars, and profile banners, back up
PostgreSQL, then preview the migration. Repeat `--source-host` for each trusted
HTTPS image host in the database.

```powershell
docker compose run --rm --no-deps --entrypoint node backend dist/scripts/migrate-media-to-cloudinary.js --source-host images.example.com
```

After checking the count, run the same command with `--apply`. Each URL changes
after its Cloudinary copy responds. The script keeps the old URL if a file
cannot be copied and exits with an error when any source fails. You can run it
again after fixing the failed sources.

For files in another Docker volume, mount that volume read-only and pass its
mount path with `--legacy-directory`. Add `--include-local-files` to copy unused
files from the active uploads directory as well.

## Email confirmation

Password registration sends a confirmation link and an eight-digit backup code. The link uses `WEB_ORIGIN` and works in the browser that started registration. For local testing, set these values in the root `.env` file and start the `dev-mail` profile:

```dotenv
SMTP_URL=smtp://mailpit:1025
SMTP_FROM="StoryCraft <no-reply@storycraft.test>"
```

```powershell
docker compose --profile dev-mail up -d --build
```

Open the Mailpit inbox at `http://localhost:8026`. A backend running directly on the host can use `smtp://localhost:1026` instead. For real delivery, set `SMTP_FROM` to the verified sender. Use `SMTP_URL` or leave it empty and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` separately. Keep credentials in environment configuration. SMTP authentication requires TLS. Use port 465 with implicit TLS or port 587 with STARTTLS for Gmail.

The bundled Compose stack trusts the private `web` service for authentication rate-limit addresses. Nginx replaces client-supplied `X-Real-IP` with the connection address. For a custom deployment, set `AUTH_TRUSTED_PROXY_HOST` to the dedicated proxy's private hostname or exact IP address if it applies the same header policy. Leave it empty for direct API traffic.

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
