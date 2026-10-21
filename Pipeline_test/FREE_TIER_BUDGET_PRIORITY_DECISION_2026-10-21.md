# Owner priority decision — Defer USD hard-cap engineering for verified Gemini Free Tier

**Date:** 2026-10-21 (Asia/Bangkok). **Branch ONLY:** `codex/ai-copilot-pipeline-test`.  
**Decision origin:** user/owner explicitly asked to *temporarily set aside budget hard-cap concerns because the Google AI Studio API is free*.  
**Scope:** Priority change for Wave 1E/P1 test development. **NOT a provider-live run authorization, paid-tier approval, unlimited-call allowance or waiver of safety/isolation controls.**

## Decision

**DEFERRED, not resolved:** `BUDGET_COST_HARD_CAP_UNPROVEN` for real paid Google Gemini usage. Do **not** consume additional engineering cycles pursuing a mathematically exact USD $5 cost bound for a **verified Free Tier-only** P1 demonstration. Do not remove or weaken the already working fail-closed test gateway to bypass this gate.

Official model pricing: `https://ai.google.dev/gemini-api/docs/pricing` (reviewed 2026-10-21) lists `gemini-3.5-flash-lite` **Free Tier input/output free of charge**, within its accessible quota. Official billing guide `https://ai.google.dev/gemini-api/docs/billing/` states tiers are at project/billing-account level; a key inherits project status. This does **not** prove any specific user project is presently free. Official rate limit guide `https://ai.google.dev/gemini-api/docs/rate-limits` details RPM, TPM, RPD, 429 and per-project aggregation.

### Minimal pre-live Free Tier conditions (retain)

1. **Verify the exact API key/project and model currently used are on Free Tier** from Google AI Studio account information; do not upload/log API keys or billing credentials. Avoid connecting paid billing, switching projects or enabling any paid fallback. If tier cannot be verified or provider operation is not free, stop and ask owner; do not assume USD 0.
2. **Keep operational guardrails**, not full USD price hard-cap work: cap test attempts, stop on quota exhaustion, avoid runaway retries/background loops, track RPM/TPM/RPD 429s and results; preserve last-run history and idempotency. Use separate project/ledger/run ID for any new provider-backed evaluation after approval. Multiple keys in the same project do not increase project quota.
3. **Provider access remains permission-gated.** The previous 2h live authorization expired at `2026-10-21T05:47:52Z`; owner merely deprioritized USD hard-cap work and did not explicitly approve a new window, specific run or quota consumption. Wave 1E is still **OFFLINE ONLY** until separate permission. There is no live authorization attached to this document.
4. Do not set `offline_only=False`, wire an actual upstream key into Wave 1D fake-only Docker or claim the synthetic tariff is real. For a future Free Tier test path, safely configure a separate reviewed deployment and preserve proven per-dispatch metering/call limits; if this requires minor gate adjustments, isolate and separately review them.
5. Preserve security/network isolation, no publishing, no API-write substitute for UI, no loss of historical evidence, no untracked secret commits.

### Wave 1E reprioritization

**P0 (now first):** S01 source Markdown **title/body** mapping and canonical body hash/revision source provenance, actual Playwright offline rerun.  
**P0 (now first):** test mixed positive/negative/unresolved entity review and author keep/reject/correct/continue to downstream with a **fake upstream** if UI supports it.  
**P1:** timestamp-faithful per-action readback and browser trace/test result honesty.  
**P2 DEFERRED:** exact **paid-tier** billable-token/pricing hard-cap design, account-specific tariff engineering, and full USD liability proof. Record `BUDGET_COST_HARD_CAP_UNPROVEN_FOR_PAID_TIER`; do **not** count as failure of Free Tier-only offline S01/S02 acceptance.
**Never drop:** no real calls without owner permission; quota/RPM/TPM/RPD protections, worker isolation, safe retry, idempotency and network egress control.

**Status:** `PRIORITY_DECISION_ACCEPTED_FREE_TIER_CONDITIONAL`, `P1_LIVE_NOT_AUTHORIZED`. No historical issue is retroactively closed and P1 S01–S11 not accepted.
