# CTX-RD-01 — E2E Guardrail Repair Runbook

## Scope

This PR repairs the full-source runner's **evidence integrity**, not the production narrative-context builder or semantic-ranking weights. The current runner loads genuine frozen corpus memory chunks into isolated PostgreSQL + pgvector, obtains genuine Gemini embeddings and semantic matches, but supplies the **structured context** via a frozen EVAL package and a `RepoAdapter`.

Therefore the *maximum* successful live verdict for this runner is:

`MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED`

It must not publish `FULL_SOURCE_E2E_DEMONSTRATED` until a separate run verifies the actual `PostgresNarrativeRepository.get_structured_context()` lane and the complete context provenance.

Previous, unmodified raw evidence remains on branch `astra/ctx-rd-01-full-source-e2e` at `6fe4a6a9e8c67fb7480ac3fc9aa78ba2dd2f3734`. That evidence reported incorrect zero embedding call counters and must not be relabelled as a fresh passing run.

## Guardrails introduced

1. Dry-run can only emit `mode=offline_fake`, `methodology=dry_run_fake_pgvector_contract`, `source_grounded_live_vector_query=NOT_DEMONSTRATED`, and `canary_gate_verdict=DRY_RUN_ONLY`; no fabricated model-attempt success. Dry-run is DB-backed and optional; it is **not** executed in ordinary unit CI.
2. Live mode records `document_provider_calls` and `query_provider_calls` from the actual instrumented embedding provider. Both must be strictly positive, and at least one successful actual model attempt must exist.
3. The runner explicitly retrieves raw semantic matches from the production retriever **before** packing and compares those IDs independently against packed preview IDs; a mismatch blocks the canary.
4. The runner records `structured_context_source=eval01g_fixture_via_repo_adapter` to avoid claiming an unadapted production narrative context path.
5. Live mode enforces a clean working tree (except its generated evidence output), disables local LLM fallback and does not allow `--skip-clean-check`.
6. Standalone evidence validator rejects fake-mode or inflated FULL E2E verdicts, missing real provider calls, non-retained raw semantic IDs and mismatched generation context hashes.

The offline validator verifies **consistency of evidence**, not independently audited Gemini provider requests or source-fact correctness.

## Gemini / Antigravity: execution after PR CI and merge

Use an isolated, disposable PostgreSQL/pgvector staging database with accepted migrations. Do not run this against a valuable novel's production database. Keep API keys in existing local key configuration; do not commit credentials, auth traces or full manuscript text.

From a **clean, exact Git SHA containing the merged guardrail code**, with the default `CONTEXT_ROUTING_POLICY=legacy-v1`:

```powershell
.\.venv\Scripts\python.exe scripts/run_ctx_rd_01_full_source_e2e.py
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_full_source_e2e_evidence.py --evidence docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json
```

`--dry-run` is a developer diagnostic that still requires a disposable DB, never an acceptance PASS. If Gemini/pgvector/quota is unavailable, report `BLOCKED`, not a fake-provider replacement.

Record the actual tested SHA, embedding counts and version, raw/packed semantic IDs, real model attempts (including 429/503), tier, drop/overflow, chapter cutoff, job hash and result. For `rq-0025`, explicitly identify whether Chapter 45/47/49 facts reached generation through semantic, recent or world-rule lanes; do not treat world-rule preservation as semantic retrieval recall.

Commit **new sanitized evidence separately from runner code**, with tested code SHA as the evidence commit's parent. Record an execution-only handoff in `promt.md`.

Full-source unadapted narrative repository acceptance, full output content review and a bounded provider stability window remain **separate gates**. Do not change global default `legacy-v1`, reopen sealed EVAL-01 or unblock P8-05.
