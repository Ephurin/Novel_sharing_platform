# P2 live free-tier runbook (Gemini via the quota gateway)

How to run the app against the real model for evaluation. Fake-provider CI stays the gating evidence; live runs are evaluation only. Every model call goes through the quota gateway (`Pipeline_test/tools/p1_live_safety_gateway.py`), and only the gateway has network egress.

## 0. Preconditions (owner decisions)

- **Free tier only.** The owner must confirm in writing that every Google project whose key is used is free tier with no billing, and give its quotas. A paid tier or a new provider needs a fresh approval.
- **Several keys.** Allowed only if each key is a separate free-tier project and the owner has accepted Google's terms on multiple projects.
- **Never** print keys, commit them, or put them in compose files or CI logs.

## 1. Private files (git-ignored `.eval-private/p2-live/`)

| File | Content |
|---|---|
| `runtime.env` | Stack secrets: database, JWT, `OPERATOR_AUTH_TOKEN`, worker tokens, and `GEMINI_API_KEY` (key 1) |
| `keys.txt` | Optional multi-key pool: one key per line, `#` comments allowed |
| `quotas.json` | Per-model limits, e.g. `gemini-3.5-flash-lite`: rpm 15, tpm 250000, rpd 500, max_concurrency 2, headroom 0.10; plus `gemini-embedding-2` |
| `attestations.json` | One operator attestation per key (a list), from `quota_controller.create_operator_attestation(...)`, with the owner's confirmation in `attested_by`. Use a single object when there is one key |
| `compose.p2-live.yml` | Overlay on `Pipeline_test/tools/compose.p1-live-safety.yml`. `budget-init` and `budget-gateway` read `/operator/quotas.json` and `/operator/attestations.json`; `--upstream-api-keys-file /operator/keys.txt` / `UPSTREAM_API_KEYS_FILE` enables the pool |

The attestation expires (`expires_at`); its duration is the owner's choice. After it expires, every live call is refused with `FREE_TIER_STATUS_UNVERIFIED`. To refresh it, write a new `attestations.json`, stop the gateway, and apply it to every ledger slot with `FreeTierQuotaLedger(...).update_operator_attestation(...)` (slot files: `ledger.json`, `ledger.k2.json`, …).

## 2. Start the stack (live still off)

```bash
export LIVE_FREE_TIER_ENABLED=false LIVE_UPSTREAM_FORWARDING=false
C="docker-compose --env-file .eval-private/p2-live/runtime.env -f Pipeline_test/tools/compose.p1-live-safety.yml -f .eval-private/p2-live/compose.p2-live.yml"
$C build ai-service backend web
$C --profile initialize run --rm budget-init   # creates or loads one ledger per key
$C up -d
```

`budget-init` fails with `Resource temporarily unavailable` while the gateway holds the ledger lock. Stop `budget-gateway` first, then run it.

## 3. Turn live on (two steps, both required)

1. Restart with the flags on:
   ```bash
   export LIVE_FREE_TIER_ENABLED=true LIVE_UPSTREAM_FORWARDING=true
   $C up -d budget-gateway ai-service backend
   ```
2. **Operator enable.** After a restart the ledger stays disabled until an authenticated enable. Without this step every call is refused, even with the flags on.
   ```bash
   docker exec <project>-budget-gateway-1 python -c "import os,urllib.request; r=urllib.request.Request('http://localhost:18090/api/gateway/emergency/enable', data=b'{}', method='POST', headers={'Authorization':'Bearer '+os.environ['OPERATOR_AUTH_TOKEN'],'Content-Type':'application/json'}); print(urllib.request.urlopen(r).read()[:80])"
   ```
   On Git Bash for Windows, prefix `docker exec` with `MSYS_NO_PATHCONV=1`, otherwise paths such as `/state/...` are rewritten.

Check the gateway with `GET /status` and a worker token. It reports `live_free_tier_enabled`, `key_pool[]` (calls, cooldown and project fingerprint per slot) and `denied_count`. It never shows key values.

## 4. During a run

- **Cost reference:** about 11–14 calls per 1,000 words of manuscript (entity stage, events and facts, world rules), plus 1 call per writing, brainstorm or consistency action.
- **Capacity:** one key gives about 13 calls/min and 450/day after headroom; four keys about 52/min and 1,800/day.
- **Rate limits:** writing, brainstorm, setup and rule checks are sent as `interactive` and keep a reserved RPM share; analysis is `background`. A provider 429 cools that key down and moves the call to the next key.
- **Transient provider 5xx and timeouts:** retried twice (after 4 s and 10 s). If they persist, the import job fails cleanly; resume it from the import page ("Thử lại từ chương còn dở") or via `POST /ai/jobs/{id}/resume`.

## 5. Turn live off (always)

```bash
docker exec <project>-budget-gateway-1 python -c "...same as above with /api/gateway/emergency/disable..."
export LIVE_FREE_TIER_ENABLED=false LIVE_UPSTREAM_FORWARDING=false
$C up -d budget-gateway ai-service backend
```

Record the total calls and denials from `/status` in the evaluation report, and nothing else from the ledger.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `BUDGET_GUARD_DENIED` on every call | Operator enable missing (step 3.2), flags off, or attestation expired |
| `FREE_TIER_STATUS_UNVERIFIED` | Attestation missing or expired; refresh it (section 1) |
| `RPM_LIMIT_EXCEEDED` with `retry_after` | Window full; interactive calls wait up to 20 s, background work retries later |
| `PROVIDER_UNAVAILABLE`, `upstream_status: 503` | Google overloaded; retried automatically, then resume the job |
| `Resource temporarily unavailable` from `budget-init` | Gateway holds the ledger lock; stop it first |
| Login 401 for the seeded author on a reused stack | The account in `runtime.env` may not exist on that database; register a local test author (`/auth/register`, then `/auth/become-author`) and keep its credentials in `.eval-private` |
