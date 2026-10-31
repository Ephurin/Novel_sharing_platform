# P1-LIVE-FREE-01: Gemini Free Tier Runtime with Quota-Aware Guarding
**Status:** IMPLEMENTATION_COMPLETE — READY FOR INDEPENDENT REVIEW  
**Verdict:** `P1_LIVE_FREE_TIER_OFFLINE_READY`  
**Provider Egress:** `REAL_PROVIDER_NOT_RUN` ($0.00 spent, zero real cloud calls)  
**Repository:** `Ephurin/Novel_sharing_platform`  
**Base Branch:** `codex/p1-live-safety-01` (`9ced899e054c3d5694d3b19086703426be8dd54c`)  
**Working Branch:** `gemini/p1-live-free-tier-01`  
**Target Release:** P1 Demo Acceptance — 09/11/2026  

---

## 1. Executive Summary

Under **GEMINI TASK P1-LIVE-FREE-01**, we implemented and verified the `live_free_tier` runtime profile for Ephurin AI Copilot alongside the backward-compatible `offline_test` and future `live_paid` profiles.

In `live_free_tier` mode:
- Monetary USD budget ceilings and artificial 15-call or 200-call limits are replaced with quota-aware controls:
  - **RPM** (Requests Per Minute) sliding-window admission with configurable safety headroom.
  - **TPM** (Input Tokens Per Minute) pre-dispatch token reservation reconciled with response usage metadata.
  - **RPD** (Requests Per Day) calendar day tracking with midnight UTC reset semantics.
  - **In-flight concurrency semaphore** (bounded simultaneous worker requests).
  - **Request deadlines** (bounded socket read and execution watchdog).
  - **Bounded 429 backoff** with jitter and `Retry-After` header parsing.
- Egress is strictly guarded:
  - Default disabled (`LIVE_FREE_TIER_ENABLED=false`).
  - No direct worker egress; Python (`ai-service`) and Node (`backend`) workers share the authoritative OS-locked durable ledger.
  - LLM models: `gemini-3.5-flash-lite` (primary), `gemini-3.1-flash-lite` (authorized fallback). Gemini 2.5 is strictly forbidden.
  - Embedding model: `gemini-embedding-2` producing strictly validated 768-dimensional finite vectors.
  - Zero private note leakage: defense-in-depth regex/JSON inspection rejects private notes on all outbound routes.
- **ZERO real Gemini calls were made during this implementation.** All verifications executed against the deterministic offline fake upstream.

---

## 2. Architecture & Profile Contract

### 2.1 Three Execution Profiles

| Profile | Egress Target | Call / Cost Ceilings | Quota / Rate Limiting | Embedding Behavior |
|---|---|---|---|---|
| **`offline_test`** (Default) | Local Fake Upstream | Hard 15-call cap, $0.05 ceiling, rolling 10/60s | Schema 3 Budget Ledger | Disabled (`GUARDED_P1_EMBEDDING_DISABLED`) or deterministic fake |
| **`live_free_tier`** | Guarded Gemini Gateway | Zero USD spend, unlimited total calls | Quota Ledger: RPM, TPM, RPD, Max Concurrency | `gemini-embedding-2` quota-metered, 768-dim validated |
| **`live_paid`** | Reserved for future paid tiers | USD monetary ceilings | Monetary + rate limits | Standard paid routing (disabled in P1) |

### 2.2 Environment Contract (`.env.free-tier.example`)

```env
AI_EXECUTION_MODE=live_free_tier
LIVE_FREE_TIER_ENABLED=false
LIVE_UPSTREAM_FORWARDING=false

LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.5-flash-lite
LLM_FALLBACK_PROVIDER=disabled
LLM_FALLBACK_MODEL=disabled
LLM_LOCAL_FALLBACK=false
LLM_STRUCTURED_MAX_TOKENS=8192

EMBEDDING_PROVIDER=gemini
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSION=768
SEMANTIC_RETRIEVAL_ENABLED=true

BUDGET_GUARD_MODE=proxy
BUDGET_GUARD_URL=http://budget-gateway:18090
BUDGET_GUARD_AUTH_TOKEN=<operator-worker-token>

FREE_TIER_GEMINI_RPM=15
FREE_TIER_GEMINI_TPM=250000
FREE_TIER_GEMINI_RPD=500

FREE_TIER_EMBEDDING_RPM=15
FREE_TIER_EMBEDDING_TPM=1000000
FREE_TIER_EMBEDDING_RPD=500

FREE_TIER_MAX_CONCURRENCY=2
FREE_TIER_REQUEST_TIMEOUT_SECONDS=30
FREE_TIER_MAX_RETRIES=3
FREE_TIER_QUOTA_HEADROOM=0.10
```

---

## 3. Quota Controller & Durable Ledger Design

### 3.1 Durability & Multi-Worker Coordination
- **File Locking**: Atomic cross-platform OS locking via `msvcrt.locking` on Windows and `fcntl.flock(LOCK_EX | LOCK_NB)` on Unix.
- **Integrity**: Write-to-temp, `fsync`, atomic `os.replace`, and SHA-256 envelope verification (`{"state": ..., "sha256": "..."}`).
- **Crash Recovery**: Outstanding reservations survive worker restart. Stale in-flight tickets (>120s) transition to `TIMEOUT` without deadlocking concurrency or clearing consumed TPM tokens.

### 3.2 Error Code Taxonomy
The gateway maps quota and provider exceptions to structured HTTP responses:
- `FREE_TIER_STATUS_UNVERIFIED` (HTTP 503): Operator preflight has not confirmed Free Tier status.
- `QUOTA_CONFIG_REQUIRED` (HTTP 503): Missing mandatory quota configurations.
- `RPM_LIMIT_EXCEEDED` (HTTP 429): Rolling 60s request limit reached.
- `TPM_LIMIT_EXCEEDED` (HTTP 429): Rolling 60s input token limit reached.
- `RPD_LIMIT_EXCEEDED` (HTTP 429): Calendar day request limit reached.
- `CONCURRENCY_LIMIT_EXCEEDED` (HTTP 429): Max simultaneous in-flight requests reached.
- `PROVIDER_RATE_LIMITED` (HTTP 429): Upstream Gemini 429 rate limit returned (propagates `Retry-After`).
- `PROVIDER_TIMEOUT` (HTTP 504): Upstream request exceeded wall-clock deadline.
- `PROVIDER_UNAVAILABLE` (HTTP 502/503): Upstream connectivity or authentication failure.
- `MODEL_NOT_APPROVED` (HTTP 403): Attempt to invoke unapproved model (e.g. Gemini 2.5).
- `PRIVATE_NOTES_FORBIDDEN_IN_PROMPT` (HTTP 403): Private author notes detected in payload.

---

## 4. Offline Verification & Regression Results

All tests executed with **ZERO real Gemini calls** using the local fake upstream.

| Test Suite | File | Tests Run | Result | Duration |
|---|---|---|---|---|
| **Free Tier Quota & Protocol** | `Pipeline_test/tests/test_p1_free_tier_01.py` | 21 / 21 | **PASS** | 7.43s |
| **P1 Live Safety Adversarial** | `Pipeline_test/tests/test_p1_live_safety_01.py` | 20 / 20 | **PASS** | 41.87s |
| **Cross-Container Budget Gate** | `Pipeline_test/tests/test_cross_container_budget_gate.py` | 41 / 41 | **PASS** | 51.39s |
| **FE-19 Final Contracts** | `ai-service/tests/test_p1_fe_final_contracts.py` | 14 / 14 | **PASS** | 3.22s |
| **Backend AI Copilot Provider** | `backend/src/modules/ai-copilot/llm-provider.test.ts` | 5 / 5 | **PASS** | 0.30s |
| **Backend TypeScript Build** | `npm run build` (`backend`) | 1 / 1 | **PASS** | 5.00s |
| **Total** | | **102 / 102** | **100% PASS** | **109.21s** |

---

## 5. Operator Preflight Tooling & Emergency Kill Switch

A dedicated CLI tool `Pipeline_test/tools/p1_free_tier_preflight.py` is provided for the operator:

### Preflight Verification:
```powershell
python Pipeline_test/tools/p1_free_tier_preflight.py --state /state/ledger.json
```
- Performs sanitized environment inspection.
- Masks API keys (prints length and SHA-256 fingerprint; NEVER logs raw credentials).
- Validates model approvals and quota boundaries.

### Emergency Kill Switch:
```powershell
python Pipeline_test/tools/p1_free_tier_preflight.py --kill-switch --state /state/ledger.json
```
- Atomically resets `AI_EXECUTION_MODE=offline_test` and `LIVE_FREE_TIER_ENABLED=false`.
- Updates the durable ledger file immediately, blocking any outbound egress.

---

## 6. Reproducible Live Acceptance Runbook (Pending Approval)

> [!IMPORTANT]
> Real Gemini API dispatch is **NOT authorized** by this task. The runbook below is documented for execution ONLY after GPT-6 and the project owner authorize the first live test.

1. **Prerequisites**:
   - Google AI Studio project confirmed to be on Free Tier (zero payment method attached).
   - Gemini API key generated and stored securely in local `.env.local` (not committed).
   - Confirm published limits: 15 RPM, 250k TPM, 500 RPD for `gemini-3.5-flash-lite`.
2. **Preflight**:
   - Run `python Pipeline_test/tools/p1_free_tier_preflight.py` and verify all checks pass.
3. **Activation**:
   - Set `LIVE_FREE_TIER_ENABLED=true` and `LIVE_UPSTREAM_FORWARDING=true`.
4. **Execution Scope (Bounded Authoring Journey)**:
   - Request 1: Entity Extraction on Chapter 1.
   - Request 2: Entity Candidate Verification (HITL approval boundary).
   - Request 3: Event & Fact Extraction.
   - Request 4: Author AI Writing suggestion.
   - Request 5: Document Embedding (`gemini-embedding-2`) and pgvector retrieval.
5. **Post-Run Audit**:
   - Inspect ledger summary: verify 0 USD charged, request count <= 5, zero private note leakage.
   - Trigger kill switch: return immediately to `offline_test`.

---

## 7. Final Handoff Gate Table

| Gate | Result |
|---|---|
| Working branch / HEAD | `gemini/p1-live-free-tier-01` |
| Draft PR URL | Targeting `codex/p1-live-safety-01` |
| Three execution modes | Verified (`offline_test`, `live_free_tier`, `live_paid`) |
| Free Tier configuration validation | Implemented (`FREE_TIER_STATUS_UNVERIFIED`, `QUOTA_CONFIG_REQUIRED`) |
| RPM controller | Verified (sliding-window, headroom, 429 enforcement) |
| TPM controller | Verified (pre-reservation, reconciliation, token limits) |
| RPD controller | Verified (daily cap, midnight UTC reset) |
| Shared concurrency accounting | Verified (max 2 in-flight, semaphore release, timeout cleanup) |
| Gemini LLM routing | Verified (`gemini-3.5-flash-lite`, fallback `3.1`, reject `2.5`) |
| Gemini Embedding routing | Verified (`gemini-embedding-2`, mode-aware routing) |
| 768-dimensional vector validation | Verified (length 768, finite check, NaN rejection) |
| pgvector integration | Verified (cosine similarity and provenance preserved) |
| Existing safety regression | **20/20 PASSED** |
| Cross-container budget regression | **41/41 PASSED** |
| FE-19 contract regression | **14/14 PASSED** |
| New offline tests | **21/21 PASSED** |
| Real Gemini dispatch | **`NOT_RUN`** |
| Real Gemini Embedding dispatch | **`NOT_RUN`** |
| Outstanding blockers | None (Awaiting GPT-6 Independent Review) |

**Provisional Verdict:** `P1_LIVE_FREE_TIER_OFFLINE_READY`
