# CTX-RD-01 — Real-Provider Staging Runbook

**Gate:** REAL_PROVIDER_STAGING_REQUIRED. **Production default:** `legacy-v1`. **P8-05:** BLOCKED_PENDING_STABILITY.

This is a narrow provider-path acceptance smoke, not a new EVAL benchmark and not permission to activate balanced routing by default.

## Strict preflight

- Use an **isolated disposable PostgreSQL/pgvector staging database**. Do not run the existing fixture-seeding harness against a database containing valuable novel data: it creates test records and runs migrations.
- Use latest `main`. Record the exact Git commit in every JSON artifact.
- Only opt in to `balanced-scope-v1` inside this test process; default and Compose configuration must remain `legacy-v1`.
- Load keys from the existing **local** key configuration (`key.txt` / local private environment) without echoing their values. Do not commit keys, raw auth headers, sensitive prompts or complete manuscript passages.
- Set `LLM_LOCAL_FALLBACK=false` and disable cross-provider fallback for this smoke. A locally generated fallback draft must never count as a real generation PASS.
- If Gemini embedding model/version is unavailable or quota-limited, report `BLOCKED`; never substitute a fake provider and label it a real-provider PASS.

## 1. Prepare production-shaped staging corpus

Use PostgreSQL 16 + pgvector with accepted migrations.

A convenient starting point is the **synthetic isolated dataset** from `scripts/verify_ctx_rd_01_live_acceptance.py`, but its initial materialization uses `DeterministicFakeEmbeddingProvider`.

**Required additional action:** write genuine document embeddings from `GeminiEmbeddingProvider` for the same active semantic memory chunks that will be queried by the real-provider smoke. Use the current `SemanticMemoryMaterializationService` / semantic repository APIs, with query and document version pinned to `gemini-embedding-2-768-v1`. If synthetic fixture setup already generated fake-version records, keep them out of the tested retrieval path; verify the indexed/queried subset contains only the intended real embedding version.

Do not assume changing `EMBEDDING_PROVIDER=gemini` automatically converts existing fake embeddings. Do not call the production materializer on a valuable real novel just to satisfy this smoke.

Verify that both document and query vectors are 768-dimensional and explicitly L2-normalized. Count actual provider calls without recording credentials or vectors.

## 2. Real retrieval + balanced preview

Run through production `PostgresSemanticMemoryRepository`, `SemanticRetrieverService`, `HybridRanker` and `WritingService.preview_context()`, with a valid chapter cutoff and defaults of semantic 8 / recent 20.

Required checks:

- retrieval status `ok`, ranking `hybrid-v1`, resolved query entity signals;
- requested and stored embedding versions both `gemini-embedding-2-768-v1`;
- normalized newest-five recent participant IDs;
- `balanced-scope-v1` active only inside the test process;
- tier selected from 12k/16k/20k/24k;
- exact input-vs-retained IDs for semantic/recent/rules, comparing rule order under canonical packer semantics;
- zero artifact drops and zero protected overflow.

If the source package has fewer than 8 semantic or 20 recent items, report actual counts instead of manufacturing an 8/8 or 20/20 PASS.

## 3. Real generation

Execute a small generation through the configured **actual** provider using the final packed context. A direct fake-LLM invocation does not satisfy this gate.

Record the requested and *effective* generation model, actual response received, provider-call count, success/nonempty output, context hash and latency. Keep the generated passage local if not essential to auditing.

Check `LLM_LOCAL_FALLBACK=false` in the actual process. In particular, `LLMService.generate_writing_draft()` can otherwise silently produce a local fallback string and still return success.

If the configured model silently changes to another model/provider, disclose the effective model; do not claim the originally requested model was tested.

## 4. Tier escalation and failure boundaries

Exercise at least one scoped package requiring a minimum full-fit tier above 12k using the same production builder/router/packer code. A deterministic production-shaped stress fixture is acceptable, but label `fixture_origin=production_shaped_deterministic`; do not portray it as a second real-provider generation or as a genuine real-novel distribution measurement.

Separately verify:

- scoped package above 24k fails closed (`CONTEXT_SCOPE_EXCEEDS_MAX_TIER`);
- semantic/provider failure returns to legacy-compatible context handling;
- future/superseded participants and cross-tenant IDs do not leak;
- setting policy back to `legacy-v1` restores previous behavior without migration.

Restore `legacy-v1` after the smoke.

## 5. Submit auditable evidence

Create `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/` with:

- `runtime-config.json`
- `real-provider.json`
- `tier-escalation.json`
- `safety-rollback.json`
- `summary.md`

The JSON keys below are the validator's contract. Additional non-sensitive metadata and hashes are welcome.

`runtime-config.json`:
```json
{
  "tested_commit": "<40-character git SHA>",
  "isolated_staging_database": true,
  "pgvector_live": true,
  "production_default": "legacy-v1",
  "default_changed": false,
  "llm_local_fallback_enabled": false
}
```

`real-provider.json`:
```json
{
  "tested_commit": "<same SHA>",
  "embedding": {
    "provider": "GeminiEmbeddingProvider",
    "model": "gemini-embedding-2",
    "version": "gemini-embedding-2-768-v1",
    "document_version": "gemini-embedding-2-768-v1",
    "query_version": "gemini-embedding-2-768-v1",
    "indexed_versions": ["gemini-embedding-2-768-v1"],
    "dimension": 768,
    "query_l2_normalized": true,
    "documents_l2_normalized": true,
    "document_provider_calls": 1,
    "query_provider_calls": 1
  },
  "retrieval": {
    "status": "ok",
    "ranking_version": "hybrid-v1",
    "hybrid_signals_resolved": true,
    "chapter_cutoff": 35
  },
  "generation": {
    "provider": "gemini",
    "requested_model": "<actual configured model>",
    "effective_model": "<observed effective model>",
    "actual_provider_response": true,
    "provider_calls": 1,
    "status": "completed",
    "nonempty_output": true,
    "context_hash": "<64-character SHA256>"
  },
  "routing": {
    "policy": "balanced-scope-v1",
    "status": "routed",
    "selected_tier": 12000,
    "entities_before": 25,
    "entities_after": 5,
    "semantic_input_ids": [],
    "semantic_retained_ids": [],
    "recent_input_ids": [],
    "recent_retained_ids": [],
    "rules_input_ids": [],
    "rules_retained_ids": [],
    "protected_overflow": false,
    "dropped_artifacts": 0
  }
}
```

**Important:** the numeric counts and lists shown above are only an illustration. Populate them with measured run results, not copied values; the validator compares actual input/retained lists.

`tier-escalation.json`:
```json
{
  "tested_commit": "<same SHA>",
  "cases": [{
    "fixture_origin": "production_shaped_deterministic",
    "selected_tier": 16000,
    "semantic_exact": true,
    "recent_exact": true,
    "rules_exact": true,
    "dropped_artifacts": 0,
    "protected_overflow": false
  }]
}
```

`safety-rollback.json`:
```json
{
  "tested_commit": "<same SHA>",
  "future_participant_leakage": 0,
  "superseded_participant_leakage": 0,
  "cross_tenant_leakage": 0,
  "semantic_failure_legacy_fallback": true,
  "over_24k_fails_closed": true,
  "rollback_to_legacy": true,
  "p8_05_blocked": true
}
```

Validate **before** committing:

```powershell
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_real_provider_evidence.py --self-test
.\.venv\Scripts\python.exe scripts/verify_ctx_rd_01_real_provider_evidence.py --evidence-dir docs/development/CTX-RD-01-REAL-PROVIDER-STAGING
```

The validator only checks evidence contract consistency; it cannot independently verify that provider calls occurred. Capture enough safe execution metadata to support Astra's subsequent manual review.

If a prerequisite is unavailable, report `PARTIAL`/`BLOCKED` in `summary.md` and do not fabricate PASS evidence.

Append an execution-only report to `promt.md` with tested/evidence commits, actual models, counts, tier, fallback, stress results, validator result, default-policy state and P8-05 state. Astra reviews it before any rollout decision.
