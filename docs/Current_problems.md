This file lists current system problems and should be continuously updated throughout development.

|Prob. Num |Problem Description| Solution| Status |
|:---:|:---:|:---:|:---:|
| 01 | Author role cannot update chapter after published even though click publish again | Save published chapter changes as MongoDB draft revision, then copy latest draft to SQL on publish | Fixed, needs system retest |
| 02 | Report button for comments does not trigger full moderation outcome flow | Add report action, route report to Admin moderation, delete comment on approval, keep comment on rejection, notify reporter and comment owner | Fixed, API regression tested |
| 03 | AI Copilot works on localhost but `/ai/copilot/suggestions` can fail through Cloudflare Tunnel with `context canceled` | Increase proxy timeout, reduce AI token limit, test `/api/v1/ai/health` through tunnel, consider async AI job flow later | Partially mitigated |
| 04 | Docker AI env can be overridden by stale host PowerShell variables after `down/up` | Check container env and clear/reset host env when needed | Monitoring |
| 05 | Font rendering issue | Check frontend font rendering and terminal/log encoding | Open |
# Problem Details

## 03. AI Copilot fails through Cloudflare Tunnel

### Status

- Local Docker web/backend are running.
- Local AI health endpoint works:
  - `http://localhost:8080/api/v1/ai/health`
- Docker backend has correct LLM env:
  - `AI_LLM_BASE_URL=https://foreseeable-kaliyah-fleshier.ngrok-free.dev/v1`
  - `AI_LLM_MODEL=qwen3:8b`
- Cloudflare Tunnel log shows:
  - `Incoming request ended abruptly: context canceled`
  - request path: `/api/v1/ai/copilot/suggestions`

### Likely Cause

The AI generation request is taking too long when routed through:

```text
Browser
  -> Cloudflare Tunnel
  -> Docker web / Nginx
  -> Backend
  -> ngrok LLM provider
  -> model
```

This is probably not a Docker env issue because the local AI health check succeeds.

### Changes Already Applied

- Increased Nginx proxy timeout for `/api/v1` to `180s`.
- Reduced Docker default `AI_LLM_MAX_TOKENS` from `2048` to `1000`.
- Rebuilt/recreated Docker `web` and `backend` containers.

### Review Steps

1. Start Docker:

```powershell
docker-compose up -d
```

2. Start Cloudflare Tunnel:

```powershell
cloudflared tunnel --url http://localhost:8080
```

3. Open AI health through the tunnel:

```text
https://your-tunnel.trycloudflare.com/api/v1/ai/health
```

Expected:

```text
ready = true
message = LLM provider is reachable and configured model is available
```

4. If health works but IDE AI generation fails, test with a shorter instruction and smaller context.

5. If it still fails, lower max tokens:

```powershell
$env:AI_LLM_MAX_TOKENS="500"
docker-compose up -d --force-recreate backend
```

### Possible Long-Term Fixes

- Use a faster LLM provider/model for demo.
- Reduce context sent by Author IDE.
- Add a dedicated async AI job flow instead of waiting for one long HTTP request.
- Move AI service to a dedicated FastAPI service in Phase 10.

## 04. Docker env defaults may hide stale local shell variables

### Status

`docker-compose.yml` allows overriding AI config through host env variables:

```yaml
AI_LLM_BASE_URL: ${AI_LLM_BASE_URL:-https://foreseeable-kaliyah-fleshier.ngrok-free.dev/v1}
AI_LLM_MODEL: ${AI_LLM_MODEL:-qwen3:8b}
AI_LLM_MAX_TOKENS: ${AI_LLM_MAX_TOKENS:-1000}
```

### Risk

If PowerShell has stale env variables set, Docker may use those instead of the defaults.

### Check

```powershell
docker-compose exec -T backend printenv AI_LLM_BASE_URL AI_LLM_MODEL AI_LLM_MAX_TOKENS
```

### Fix

Clear or reset PowerShell env before starting Docker:

```powershell
Remove-Item Env:AI_LLM_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:AI_LLM_MODEL -ErrorAction SilentlyContinue
Remove-Item Env:AI_LLM_MAX_TOKENS -ErrorAction SilentlyContinue
docker-compose up -d --force-recreate backend
```
