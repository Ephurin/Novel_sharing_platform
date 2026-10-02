# ASTRA REVIEW — CTX-RD-01 Full-Source E2E Branch Audit

## Verdict

**REAL PGVECTOR + GEMINI SEMANTIC PATH OBSERVED; MIXED-PROVENANCE E2E PARTIAL — ACCEPTANCE BLOCKED PENDING EVIDENCE AND CI REPAIR**

Branch: `astra/ctx-rd-01-full-source-e2e`; head at review: `7a777b77bfb397f198d7c89ec568f6d9fdb961ce`, four commits ahead of `main`. No PR or GitHub Actions CI on the new branch at review time.

- Initial runner/test/content review: `dedff8aab24614c5e9e3c0b3fd31ff872b3543f5`.
- Runner query alignment: `6e6f26e7b308241f40eba953496c849778301ef4`.
- Evidence direct child: `6fe4a6a9e8c67fb7480ac3fc9aa78ba2dd2f3734`.
- Branch handoff: `7a777b77bfb397f198d7c89ec568f6d9fdb961ce`.

The evidence declares the actual code commit `6e6f26e...` and was committed as its child, which repairs the prior code/evidence lineage weakness. This is not an independent attestation of API calls.

## Positive evidence within tested scope

The runner inserts source-derived `Frozen_v1` records into an isolated staging database: 63 Batch_7 entities, 216 canonical memory chunks and corresponding event/event-participant rows. It writes Gemini-produced 768d L2-normalized document vectors into `MemoryEmbeddingRecord`, and wires production `PostgresSemanticMemoryRepository` + `SemanticRetrieverService` + `HybridRanker` to the opt-in production `WritingService`. The selected ranked IDs differ from preselected baseline IDs, indicating that the actual retrieval result is not merely replayed from the frozen EVAL ranking. The two generation jobs report a real `gemini-3.8-flash` response.

The committed JSON reports:

| Case | Tier | Entities | Retrieved semantic IDs | Recent | Rules | Drops | Overflow | Job/preview hash |
| --- | ---: | ---: | --- | --- | --- | ---: | --- | --- |
| `core_gold:rq-0011` | 12k | 63 -> 15 | 8 | 20/20 | 6/6 | 0 | false | equal |
| `challenge:rq-0025` | 12k | 68 -> 18 | 8 | 20/20 | 12/12 | 0 | false | equal |

The normal case actually retrieved `mem-000089` (Ch 27) and `mem-000110` (Ch 32) as its top two semantic results. This supports the intended origin-vs-later-claim retrieval use case.

The two jobs record **10 total model attempts: 2 successes and 8 failed attempts** (429/503). The normal job was ~112.4 s and the chronology job ~7.0 s. This is functional recovery from errors, not evidence of stable latency or error-free provider availability.

## Findings that block a full end-to-end or global-default verdict

### 1. The structured-context lane is still fixture-injected

Inside `scripts/run_ctx_rd_01_full_source_e2e.py`, `eval01g.build_package(...)` assembles the base entities, recent events and world rules from the existing EVAL fixture. An inline `RepoAdapter.get_structured_context()` returns this prebuilt `prod_pkg` to `WritingService`. In contrast, the **semantic** lane is obtained through the genuine pgvector retriever.

The actual demonstrated pipeline is:

`source-derived PG embeddings -> real pgvector/hybrid semantic retrieval + EVAL-prebuilt structured context -> production balanced scope/packer -> real Gemini generation`.

It does **not** demonstrate full production `PostgresNarrativeRepository.get_structured_context()` on the same source data. Do not call this an entirely unadapted production full-source E2E, or conflate the PostgreSQL fixture data with the supplied context package. The script creates event rows, but does not establish that the accepted world-rule lane came from corresponding persisted production `FactRecord` retrieval.

### 2. The critical rq-0025 semantic memories are not in top 8

The observed top 8 for `challenge:rq-0025` are:

`mem-000172, mem-000176, mem-000164, mem-000099, mem-000032, mem-000092, mem-000047, mem-000120`.

The crucial `mem-000167` (Ch 45), `mem-000174` (Ch 47) and `mem-000177` (Ch 49) are **not** present in this top 8. They appear in the preassembled world-rule lane, which preserves all 12 IDs. Thus a chronology-correct answer is useful evidence of **full packed context behavior**, but is not proof that semantic retrieval independently recovered the three pivotal memories.

Report per-lane provenance for all three facts. If the goal is semantic retrieval coverage for this query, investigate the actual provider/hybrid ranking separately; do not weaken the accepted retention gates or reinterpret a successful generation as retrieval recall.

### 3. Embedding-call fields are invalid in the JSON

The JSON reports `embedding.document_calls: 0` and `embedding.query_calls: 0`. The runner reads nonexistent `document_calls` and `query_calls` attributes through `getattr(..., 0)`. The imported `InstrumentedGeminiEmbeddingProvider` actually uses `document_provider_calls` and `query_provider_calls`.

This is an instrumentation/export defect. It does not by itself negate pgvector retrieval or vector insertion, but the current evidence cannot be used to claim audited nonzero provider call counts. Fix exporter fields and add checks requiring nonzero real document/query calls in live mode. Distinguish adapter calls from HTTP-level retries.

### 4. Dry-run falsely declares a live E2E PASS

`--dry-run` uses `DeterministicFakeEmbeddingProvider` and `FakeDeterministicLLMService`, then assigns `job_status="completed"`, `job_hash=preview_hash`, mock output, and a fallback fabricated successful model attempt when no actual attempts exist. Yet it still writes `methodology="real_provider_pgvector_retrieval_and_generation"`, `source_grounded_live_vector_query="DEMONSTRATED"`, and `canary_gate_verdict="FULL_SOURCE_E2E_DEMONSTRATED"`.

The new `test_dry_run_contract_execution` explicitly asserts this false live verdict. It also invokes a DB-backed runner from an ordinary unit test: the P7 `unit` job does **not** provision a local PostgreSQL database. CI is likely to fail when the new test is discovered by full `pytest -q`.

Required: dry-run must output `mode=offline_fake`, `real_provider_calls=0`, `canary_gate_verdict=DRY_RUN_ONLY`, and never synthesize model success. Replace unit DB dependency with mocks or a dedicated `postgres_integration` test running only in a configured service job; test explicitly that fake mode **cannot** satisfy the live E2E gate.

### 5. Narrative checks and stress remain qualified

`TARGETED-CONTENT-REVIEW.md` reviews and quotes the *previous frozen-source replay* output, not the **full draft** of the two new E2E generations. The E2E JSON includes only 400-character draft snippets, and the new checklists are lexical heuristics; `future_leakage` and `unsupported_claim` remain `NOT_ASSESSED`. A new E2E checklist PASS is not an independent source-based factual audit.

The script records `retrieved_semantic_ids` from the **already packed preview** and copies them as `semantic_retained_ids`; it has not independently recorded raw retriever top-8 before packing for this particular run. Capture pre-pack vs retained IDs independently, as already done in earlier acceptance work.

Only two functional requests at 12k are included in the new source-provider evidence; previous tier escalation was a separately labelled deterministic stress case. No live source-based 16/20/24k tier stability claim is justified. Safety and rollback claims still rely on other accepted tests.

## Next action — focused repair

1. Keep this work on its own PR branch. Correct the instrumentation fields and add a validator that refuses zero live document/query provider calls, dry-run labelled as live, copied/raw retrieval IDs, or a mismatched tested code SHA.
2. Make `--dry-run` explicitly non-acceptance and fix its test to be runnable in CI without assuming an unprovisioned PostgreSQL service; add targeted regression for these guardrails.
3. For the unadapted production E2E claim, persist and read source-derived structured context through `PostgresNarrativeRepository.get_structured_context()`, including the real facts/rules and normalized latest-five event-participant metadata. If that is not feasible, relabel and accept only the mixed-provenance semantic-path milestone; do not fabricate it.
4. Measure raw pre-pack semantic IDs separately from the packed preview IDs; preserve 0 drop/overflow and cutoff/tenant/supersession checks. Explain that the pivotal rq-0025 memories came from the world-rule lane unless a new real retrieval demonstrates otherwise.
5. If seeking source-based narrative-quality acceptance, independently inspect **new E2E** full drafts against the canonical rubric, explicitly retaining `NOT_ASSESSED` where necessary.
6. Commit code/tests, obtain PR CI, then run one minimal live smoke from the clean committed SHA and commit evidence separately. Preserve the current unmodified raw evidence as a historical record and report provider failures. A broad rerun of EVAL-01O is unnecessary.

```text
real source pgvector semantic retrieval    OBSERVED (qualified)
balanced packing + real LLM generation     OBSERVED (qualified)
unadapted narrative repository E2E        NOT DEMONSTRATED
evidence call-count integrity              FAILED
dry-run/live separation                     FAILED
source-provider CI                          NOT RUN
new-E2E full-draft source review            NOT DEMONSTRATED
production default                          legacy-v1
global balanced activation                  NOT AUTHORIZED
P8-05                                       BLOCKED_PENDING_STABILITY
```
