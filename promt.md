# Active Project Handoff — CTX-RD-01

## Current status (latest Astra review takes precedence over historical handoffs)

```text
EVAL-01 evidence sequence                 CLOSED
ARCH-CTX-RD-01 proposal                   APPROVED
CTX-RD-01 implementation                  MERGED
Real-provider staging remediation         CLOSED / ACCEPTED
Opt-in demo/staging balanced-v1            AUTHORIZED
Global production default switch          NOT AUTHORIZED
Production default                        legacy-v1
P8-05 destructive cleanup                 BLOCKED_PENDING_STABILITY
NEXT                                       BOUNDED OPT-IN CANARY
```

Canonical evaluation closure: `docs/development/EVAL-01-FINAL-CLOSURE.md`.

Architecture proposal/review:
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/ARCH-CTX-RD-01-ASTRA-REVIEW.md`

Implementation: PR #27 / merge `739b5f8cceb549fb96e97bbc3565621f9f036031`.

Real-provider staging evidence (corrected): `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/`.
- Tested code SHA: `019d39222ce0b0d26e130ba57c0fedf92eac453e`.
- Evidence SHA: `d2b50be731590b531a17ae2708af2f389667d5af`.
- Repair PR #29 merged at `6f4d034bbf3c5857e34a6299f8ea9d736c829ff0`.
- Final Astra review: `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`.
- Final review commit: `79431abfd3f63fed8c8b92b0bb3f04469d936089`.

CI for PR #29: all SUCCESS.
- Evaluation Pilot Harness `36957124427`.
- P7 Semantic Memory Foundation `36957124446`.
- P8 Cutover and Migration `36957124460`.

Staging results:
```text
embedding version               gemini-embedding-2-768-v1 / 768d / explicit L2
document calls/items            3 / 36
query calls/items               3 / 3
generation requested/effective  gemini-3.8-flash / models/gemini-3.8-flash
generation attempts             1 / success
balanced context scope          25 -> 4 entities
selected tier                   12k
semantic/recent/rules           8/8, 20/20, 4/4 exact
drops / protected overflow      0 / false
generation job context hash     equals same-input preview hash
deterministic stress tier       16k
fallback / rollback             PASS
```

This is a successful **functional provider-path smoke**. It is not a general generation-quality or latency benchmark. Do not reopen EVAL unless new implementation behavior diverges.

## NEXT — Gemini / Antigravity: bounded opt-in canary

Use latest `main` and an isolated demo/staging environment. Keep `CONTEXT_ROUTING_POLICY=legacy-v1` in production, and opt in to `balanced-scope-v1` only in the designated canary process/config. Keep existing API keys local; do not commit keys or unnecessary manuscript text.

1. Run representative real-novel generation requests using accepted PostgreSQL+pgvector, hybrid-v1 and genuine `gemini-embedding-2-768-v1` document/query vectors. Reuse pre-existing data without destructive rematerialization; isolate or back up any writable test database.
2. Cover a normal context, a repeated/conflicting-history or source-status request (prefer the known rq-0025 archetype where possible), and a pressured request expected to escalate above 12k if real data supports one. Clearly label deterministic stress separately if no real pressured request is available; do not fabricate real-novel coverage.
3. Capture actual *generation-job* routing summary and context hash, tier, before/after entity/state counts, independently checked semantic/recent/rule IDs, drop/overflow traces, provider model/attempts, request success and validation status. Compare with existing `legacy-v1` reference or safe opt-in legacy control where feasible.
4. Verify chapter cutoff, supersession and tenant isolation in applicable lanes, as well as semantic-unavailable fallback and flag rollback. On unexpected information loss, leakage, routing failure, or material generation regression, switch the canary back to `legacy-v1` and record the failure.
5. Keep the current global default unchanged. Do not change ContextBudgetPacker, embedding model, hybrid weights or P8-05 status during the canary.

Save execution evidence and a concise pass/partial/fail summary under:

`docs/development/CTX-RD-01-OPT-IN-CANARY/`

Record the tested Git SHA, environment, real-versus-deterministic fixture provenance, actual model/provider used, observed failures, and whether the default remains `legacy-v1`. Append an execution-only canary report here. Astra will review it before any proposal to switch the global default.

No new blind A/B experiment is required merely to run this acceptance canary.
