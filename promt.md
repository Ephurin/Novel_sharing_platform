# Active Project Handoff — CTX-RD-01

## Current canonical state

```text
EVAL-01                                  CLOSED
CTX-RD-01 implementation                 MERGED
Real-provider staging                    ACCEPTED
Frozen-source replay                     ACCEPTED WITH QUALIFICATION
Live source pgvector semantic path       PREVIOUSLY OBSERVED / EVIDENCE SUPERSEDED
E2E evidence guardrails                  MERGED / CI PASS
Corrected live source-provider evidence  REQUIRED
Unadapted production narrative E2E       NOT YET DEMONSTRATED
Opt-in balanced-v1 staging               AUTHORIZED
Production default                       legacy-v1 (UNCHANGED)
Global balanced-v1 activation            NOT AUTHORIZED
P8-05 destructive cleanup                BLOCKED_PENDING_STABILITY
NEXT                                     TARGETED LIVE RERUN + EVIDENCE REVIEW
```

## Latest Astra decision — guardrail repair accepted

Read:
- `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-E2E-GUARDRAIL-REVIEW.md` (latest).
- `docs/development/CTX-RD-01-OPT-IN-CANARY/E2E-GUARDRAIL-RUNBOOK.md`.
- `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FULL-SOURCE-E2E-REVIEW.md` (initial E2E defects).

PR #32 merged: `68511eea1d6f8210efd13b383808aa3ddf2132df`.
Final guardrail review commit: `7ac5299dca379c9f25f2697a89489906378b5ccd`.

GitHub Actions:
- P7 Semantic Memory Foundation `36993160724`: SUCCESS (unit, integration PostgreSQL/pgvector, Compose, new validator self-test).
- P8 Cutover and Migration `36993160746`: SUCCESS (unit, PostgreSQL, frontend, rollback, cleanup gate, Compose).

**No new external Gemini calls were made in CI.** Guardrail code acceptance is not E2E acceptance.

Corrected runner: `scripts/run_ctx_rd_01_full_source_e2e.py`.
Validator: `scripts/verify_ctx_rd_01_full_source_e2e_evidence.py`.

Important behavior:
- Dry-run only emits `mode=offline_fake` / `DRY_RUN_ONLY` and **cannot** claim live E2E or invent successful model calls.
- Live runner counts actual `document_provider_calls` and `query_provider_calls`, rejects zero, requires actual LLM success, and compares independent raw retriever IDs to packed preview IDs.
- This runner intentionally retains `eval01g_fixture_via_repo_adapter` for structured entities/events/rules. Its maximum legitimate live verdict is `MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED`, **not** `FULL_SOURCE_E2E_DEMONSTRATED`.

Prior full-source raw evidence remains on historical branch `astra/ctx-rd-01-full-source-e2e`, commit `6fe4a6a9e8c67fb7480ac3fc9aa78ba2dd2f3734`. Its exported embedding counters are wrong (0/0) and its dry-run mechanism could mislabel fake evidence; do not import those assertions as a new PASS or merge the outdated branch's `promt.md`.

## NEXT — Gemini / Antigravity targeted local execution

1. Checkout **latest main**, confirm clean worktree and isolated disposable staging PostgreSQL/pgvector with accepted migrations. Use existing local `key.txt`/environment keys securely; never commit keys/auth logs. Production `CONTEXT_ROUTING_POLICY` remains `legacy-v1`; only this canary process opts in to `balanced-scope-v1`. Do not run against valuable production novel data.
2. Execute the corrected runner **without `--dry-run` or `--skip-clean-check`**:

```powershell
.\.venv\Scripts\python.exe scripts/run_ctx_rd_01_full_source_e2e.py
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_full_source_e2e_evidence.py --evidence docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json
```

3. Require positive document/query Gemini embedding adapter calls, real pgvector/hybrid retrieval, independent raw-vs-packed semantic IDs, 0 drops/overflow, actual generation-job hash and model attempts. State exactly which lane preserves `rq-0025` memory IDs `mem-000167/174/177`; do **not** claim they were semantically retrieved unless they appear in the recorded raw semantic results. Preserve prior corpus source identifiers and chapter cutoffs.
4. New evidence must declare actual tested SHA and `structured_context_source=eval01g_fixture_via_repo_adapter`, with verdict `MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED` if it passes. Record provider errors/429/503 and actual observed latencies. Commit **new sanitized evidence separately**, with tested code SHA as parent; append an execution-only report to this handoff. If quota or DB blocks execution, report `BLOCKED` or `PARTIAL`; do not fake success.
5. For **unadapted full E2E**, plan a distinct source-based test using actual `PostgresNarrativeRepository.get_structured_context()` for persisted entities, event participants and rules/facts alongside the now-verified semantic path. If generation quality is claimed, independently audit the **new** drafts against Frozen_v1 (prior targeted review covered replay drafts, not the new E2E runs). A bounded provider stability window is also required before any global-default proposal.

Do not reopen sealed EVAL-01O, alter ContextBudgetPacker/embedding/hybrid contracts, change the global default or unblock P8-05 as part of this execution.

## Previous accepted reference documents

- `docs/development/EVAL-01-FINAL-CLOSURE.md`.
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`.
- `docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`.
- `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`.
- `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FROZEN-SOURCE-REPAIR-FINAL-REVIEW.md`.
