# Astra — CTX-RD-01 E2E Guardrail Repair Review

## Decision

**GUARDRAIL_IMPLEMENTATION_ACCEPTED; LIVE E2E RERUN REQUIRED.**

The evidence-integrity repair is merged and its CI passed. This is **code acceptance**, not approval of a new live Gemini experiment or global balanced-routing activation.

## Traceability

- PR: [#32](https://github.com/Ephurin/Novel_sharing_platform/pull/32).
- Guardrail PR head: `af9b324f2c3d27847c8704deaddcbf0690b2cff9`.
- Merge commit: `68511eea1d6f8210efd13b383808aa3ddf2132df`.
- P7 Semantic Memory Foundation run `36993160724`: all jobs SUCCESS (unit, PostgreSQL/pgvector, Compose).
- P8 Cutover and Migration run `36993160746`: all jobs SUCCESS (unit, PostgreSQL, frontend, rollback, cleanup gate, Compose).

The CI executes unit tests and an offline self-test of the new validator; it does **not** call Gemini, create real document embeddings, or certify a full-source E2E run.

## Corrections

1. `--dry-run` emits `DRY_RUN_ONLY`, `mode=offline_fake`, no invented real generation attempt, and no live-retrieval claim. The DB-dependent dry-run was removed from ordinary unit CI.
2. The live runner reads `document_provider_calls` and `query_provider_calls`, rejects zero calls and requires a successful model attempt. Counts are adapter invocations, not necessarily underlying HTTP requests.
3. The live runner separately fetches raw production `SemanticRetrieverService` IDs before packing and compares them with the independent `WritingService.preview_context()` semantic output.
4. The manifest explicitly identifies `structured_context_source=eval01g_fixture_via_repo_adapter` and restricts the live outcome to `MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED`, even if semantic vector retrieval and generation pass.
5. The offline validator `scripts/verify_ctx_rd_01_full_source_e2e_evidence.py` refuses dry-run/fake evidence, invalid provider counts, inconsistent raw/packed semantic IDs, dropped context and false full-E2E verdicts.
6. Live mode enforces a clean working tree and disables local LLM fallback.

The prior raw evidence, including the incorrect zero call counts, remains unchanged on branch `astra/ctx-rd-01-full-source-e2e` (evidence commit `6fe4a6a9e8c67fb7480ac3fc9aa78ba2dd2f3734`). Do not treat it as passing the new contract.

## Remaining work

- Run the merged runner on an isolated **local** PostgreSQL/pgvector staging database with genuine Gemini API keys, from a clean and exact tested SHA, then run the new validator. Commit the new evidence separately. If quotas or other prerequisites block the run, report BLOCKED rather than substituting fake data.
- The real source-derived context package is **still assembled by the EVAL fixture and injected via RepoAdapter**. Full production narrative-context E2E requires a separate run exercising actual `PostgresNarrativeRepository.get_structured_context()` on persisted source facts/events/entities.
- The `rq-0025` Ch45/47/49 critical memories were not in semantic top 8 of the historical run; they were retained in the fixture-provided world-rule lane. The rerun must disclose semantic versus world-rule provenance rather than equate correct generation with semantic recall.
- Complete source-grounded review of the *new live* generated drafts if claiming narrative-quality acceptance, and run a bounded provider stability window before proposing any global default switch. Frequent 429/503 retries in previous samples remain a risk.

```text
guardrail implementation       ACCEPTED / MERGED
PR CI                          PASS
new live provider evidence     NOT YET RUN
full unadapted narrative E2E   NOT YET DEMONSTRATED
balanced-v1 opt-in staging     AUTHORIZED
production default            legacy-v1
global activation             NOT AUTHORIZED
P8-05                         BLOCKED_PENDING_STABILITY
```
