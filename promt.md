# Active Project Handoff — CTX-RD-01

## Canonical project state

```text
EVAL-01 evidence sequence             CLOSED
ARCH-CTX-RD-01 proposal               APPROVED
CTX-RD-01 implementation              MERGED
Fake-provider PostgreSQL smoke        PASS / REVIEWED
Real-provider staging                 REQUIRED / NOT YET RUN
Production default                    legacy-v1
Balanced-scope-v1 default             NOT AUTHORIZED
P8-05 destructive cleanup             BLOCKED_PENDING_STABILITY
```

Source-of-truth documents:

- `docs/development/EVAL-01-FINAL-CLOSURE.md`
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/ARCH-CTX-RD-01-ASTRA-REVIEW.md`
- `docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`
- `docs/development/CTX-RD-01-LIVE-ACCEPTANCE/ASTRA-REVIEW.md`

Implementation merge: `739b5f8cceb549fb96e97bbc3565621f9f036031`

Prior live smoke evidence: `4d073497c61f5d8a7477c7d7c189ae4a055f090c`.

The prior smoke used PostgreSQL/pgvector with `DeterministicFakeEmbeddingProvider` and did not prove actual generation-provider calls. It is an integration PASS, not real-provider staging completion.

## Real-provider staging — gate prepared

Staging-runbook and CI gate merged via PR #28:

`c724b110d84286cdbc7468f70137f0809c35027a`

Runbook:

`docs/development/CTX-RD-01-REAL-PROVIDER-STAGING-runbook.md`

Validator:

`scripts/verify_ctx_rd_01_real_provider_evidence.py`

CI run `36845566108`: SUCCESS — evidence-validator self-test, unit/non-Postgres regressions, PostgreSQL/pgvector integration, and full production-path Compose smoke all PASS. CI performs no real external-model calls.

## NEXT — Gemini / Antigravity on original machine

Work from latest `main`. Follow the runbook in order. Use an **isolated disposable staging DB** and the existing securely configured local keys.

Mandatory boundaries:

1. Query **and document** embeddings must both be genuine `gemini-embedding-2-768-v1`, 768d, explicit L2. Do not mix the earlier fake embedding corpus with a Gemini query.
2. Use the production `SemanticRetrieverService` + hybrid-v1 + `WritingService.preview_context()` with chapter cutoff.
3. Run one `balanced-scope-v1` generation with a **real LLM provider response**. Set `LLM_LOCAL_FALLBACK=false`; record requested and effective models and count actual provider calls.
4. Prove semantic/recent/rule ID retention, no drop, no protected overflow and final context hash.
5. Exercise a production-shaped package that selects a tier **above 12k**, with source labelled accurately.
6. Recheck temporal safety, >24k fail-closed, semantic failure fallback and immediate rollback.
7. Restore `legacy-v1` at the end. Never change production default as part of this smoke.

Write:

```text
docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/
  runtime-config.json
  real-provider.json
  tier-escalation.json
  safety-rollback.json
  summary.md
```

Before committing evidence:

```powershell
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_real_provider_evidence.py --self-test
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_real_provider_evidence.py --evidence-dir docs/development/CTX-RD-01-REAL-PROVIDER-STAGING
```

Do not commit API keys, credentials, unredacted auth logs or unnecessary manuscript text.

If real embedding/model/quota is unavailable, mark `PARTIAL` or `BLOCKED`, not PASS. The validator checks evidence consistency, not independent truth of reported API calls.

### Required execution-only Gemini report

```text
Gemini Verification — CTX-RD-01 REAL-PROVIDER STAGING
Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>
Embedding provider/model/version: <actual>
Document/query provider calls: <n>/<n>
Actual generation provider/model: <actual>
LLM provider calls: <n>
Local fallback disabled: true
Balanced scope/tier: <n>/<tier>
Semantic/recent/rules retained: <input>/<output>
Protected overflow: false
Dropped artifacts: 0
Tier above 12k tested: <tier/source>
Future/superseded/cross-tenant leakage: 0/0/0
Fallback/rollback: PASS | FAIL
Validator: PASS | FAIL
Production default changed: NO
P8-05: BLOCKED
```

Astra reviews committed staging evidence before any staged-default activation decision. No additional sealed EVAL A/B is required unless real implementation behavior diverges from evaluated behavior.
