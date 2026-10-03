# Active Project Handoff — CTX-RD-01

## ACTIVE EXECUTION DIRECTIVE — ASTRA APPROVED UNADAPTED NARRATIVE E2E

**Decision:** PROCEED with implementation on a dedicated branch `astra/ctx-rd-01-unadapted-narrative-e2e` from the latest `main`. This directive supersedes *planning-only* language in older sections below; it does not supersede accepted evidence or governance restrictions. Gemini / Antigravity should implement the runner, validator and tests; commit code before any new live execution.

**Acceptance target:** prove a genuinely unadapted production path for source-derived data:

`PostgresNarrativeRepository.get_structured_context() + Gemini document/query embeddings + PostgreSQL/pgvector + SemanticRetrieverService/hybrid-v1 -> WritingService (opt-in balanced-scope-v1) -> ContextBudgetPacker -> real Gemini generation`.

### Non-negotiable implementation requirements

1. **No narrative context adapter or injected package.** Both `preview_context()` and `start_generation()` must use the active `PostgresNarrativeRepository` directly. Never replace it with `RepoAdapter`, `eval01g.build_package()`, or another preassembled EVAL context path. Frozen_v1, Batch_7 and EVAL fixtures may provide *source records* for controlled materialization and independent expected-result comparison; they must not supply the actual retrieval/packing result.
2. **Persist each source domain according to its semantics.** Materialize `EntityRecord`, aliases, current states, `EventRecord`, normalized `EventParticipantRecord`, and relevant confirmed `FactRecord` world rules with accurate source/cutoff/locked/supersession metadata, alongside `MemoryChunkRecord` and version-matched `MemoryEmbeddingRecord` (768d, explicit L2). **Do not turn every important narrative memory or event into a world rule** to force retention. If the frozen corpus lacks enough support to create a world rule or state, mark that domain `MISSING / NOT_ASSESSED`, do not invent canonical facts or silently substitute fixture-supplied rules. Preserve exact source IDs in audit metadata so DB UUIDs map back to source provenance.
3. **Independent per-lane checks.** Capture actual raw semantic IDs before packing, independently retrieved structured entity/state/event/rule IDs from PostgreSQL, and each ID after packing. Record drop/overflow, selected tier, *actual generation-job* context hash, chapter cutoff, supersession and cross-tenant isolation. Verify normalized participants of the latest five eligible recent events. For `challenge:rq-0025`, explicitly trace `mem-000167` (Ch45), `mem-000174` (Ch47), `mem-000177` (Ch49) by semantic/recent/rule lane. A fact missing from semantic top 8 is **not** semantic recall; correct prose cannot repair false retrieval claims.
4. **Evidence integrity and privacy.** Add `scripts/run_ctx_rd_01_unadapted_narrative_e2e.py`, a separately testable manifest validator `scripts/verify_ctx_rd_01_unadapted_narrative_e2e_evidence.py`, and focused unit/postgres-integration tests. Live evidence must reject fake/dry-run PASS, zero genuine provider calls, incorrect tested-SHA lineage, and copied raw/packed ID checks. Export the *actual runtime database host/port/database* with credentials redacted (never hardcode `5432` or include a password). Record per-model attempt successes and 429/503 failures separately from wrapper/adapter call counts.
5. **Full-draft content audit without unnecessary manuscript publication.** Preserve the complete newly generated drafts in separately controlled local/CI artifacts rather than embedding them by default in the JSON committed to GitHub. The sanitized manifest should contain draft ID/path, SHA-256 and limited snippets. A source-grounded review (proposed `UNADAPTED-NARRATIVE-CONTENT-REVIEW.md`) must examine the *new* complete output against Frozen_v1: `rq-0011` Ch27 vs Ch32 and `rq-0025` Ch45 -> Ch47 -> contradictory Ch49. Distinguish automated lexical checks from independent source-fact review; mark future leakage / unsupported claims `NOT_ASSESSED` unless actually reviewed.

### Execution and evidence sequence

1. Branch from up-to-date `main`; implement runner, validator and regression tests without modifying production defaults, hybrid weights, embedding contracts or packer behavior. Add CI coverage for unit and PostgreSQL integration. Commit implementation first.
2. Open a focused PR and obtain passing GitHub Actions CI. If changes are merged before the live run, use the **actual clean merged code SHA** as the new tested SHA. Do not claim a commit was tested if it lacks the executed runner or contains uncommitted changes.
3. Use only an isolated/disposable PostgreSQL+pgvector staging database with accepted migrations and existing local Gemini keys. Reuse valid existing model-version-matched materialized embeddings when possible rather than re-embedding all 216 chunks needlessly. Run one or two targeted real-source cases; do not silently substitute fake embeddings or EVAL result adapters if quota/DB is unavailable.
4. Commit sanitized **execution evidence separately** with its correct tested SHA and clear fixture/source provenance; retain previous evidence unchanged. Append an execution-only report to this `promt.md` for Astra's independent review. Any unmet requirement must be `PARTIAL` or `BLOCKED`, never an invented PASS.
5. After technical acceptance, complete a small bounded opt-in stability/availability window before proposing any global default change. No sealed EVAL A/B rerun is required merely to finish this gate.

**Governance remains unchanged:** production `CONTEXT_ROUTING_POLICY=legacy-v1`; opt-in `balanced-scope-v1` only in designated staging; global activation NOT AUTHORIZED; P8-05 `BLOCKED_PENDING_STABILITY`; no credentials, full private manuscripts or unnecessary draft text in GitHub.

---

## Current canonical state

```text
EVAL-01                                  CLOSED
CTX-RD-01 implementation                 MERGED
Real-provider staging                    ACCEPTED
Frozen-source replay                     ACCEPTED WITH QUALIFICATION
Live source pgvector semantic path       ACCEPTED (MIXED-PROVENANCE / QUALIFIED)
E2E evidence guardrails                  MERGED / CI PASS
Corrected live source-provider evidence  ACCEPTED WITH QUALIFICATION (tested ece0738, evidence f8f8b57)
Offline evidence validator               PASS (0 errors)
Unadapted production narrative E2E       NOT YET DEMONSTRATED
Opt-in balanced-v1 staging               AUTHORIZED
Production default                       legacy-v1 (UNCHANGED)
Global balanced-v1 activation            NOT AUTHORIZED
P8-05 destructive cleanup                BLOCKED_PENDING_STABILITY
NEXT                                     UNADAPTED NARRATIVE E2E + OPT-IN STABILITY
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

## Targeted Live Execution Report — CTX-RD-01 (Commit `ece0738`)

- **Execution timestamp**: `2026-10-03T03:41:21Z`
- **Tested code commit SHA**: `ece073840545bd3b27fb4dc7c509735b85a4d39d` (verified clean working tree before live run)
- **Evidence commit**: `f8f8b57` (`docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json`, parent `ece0738`)
- **Staging environment**: Isolated staging PostgreSQL 16 + pgvector 0.8.6 (`localhost:5433/ephurin`), Alembic schema head `0007_semantic_memory_foundation`
- **Runner**: `scripts/run_ctx_rd_01_full_source_e2e.py` (executed live, zero local fallback)
- **Offline validator**: `scripts/verify_ctx_rd_01_full_source_e2e_evidence.py` $\to$ **PASS (0 errors)**

### 1. Attestation & Governance Declarations

```json
{
  "mode": "live",
  "methodology": "real_provider_pgvector_semantic_with_fixture_structured_context",
  "source_grounded_live_vector_query": "DEMONSTRATED",
  "canary_gate_verdict": "MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED",
  "structured_context_source": "eval01g_fixture_via_repo_adapter",
  "pgvector_live": true,
  "policy": "balanced-scope-v1",
  "production_default": "legacy-v1",
  "default_changed": false,
  "p8_05_blocked": true
}
```

### 2. Provider Call Counts & Embedding Integrity

- **Provider**: `GeminiEmbeddingProvider`
- **Model**: `gemini-embedding-2`
- **Version**: `gemini-embedding-2-768-v1` (768d, explicit L2 normalization)
- **Document adapter calls**: `11` (materialized all 216 canonical memory chunks into `narrative.memory_embeddings`)
- **Query adapter calls**: `6`
- **Zero-call / fake-mode guardrail**: Verified positive document/query calls; fake-mode rejected by validator.

### 3. Case-by-Case Execution & Provenance

| Metric / Attribute | `core_gold:rq-0011` (NORMAL) | `challenge:rq-0025` (CHALLENGE_CHRONOLOGY) |
|---|---|---|
| **Chapter cutoff** | Ch 32 | Ch 49 |
| **Routing policy** | `balanced-scope-v1` (Tier 12k) | `balanced-scope-v1` (Tier 12k) |
| **Entities (Input $\to$ Retained)** | 63 $\to$ 15 | 68 $\to$ 18 |
| **Raw pgvector retrieved IDs** | `['mem-000089', 'mem-000110', 'mem-000090', 'mem-000099', 'mem-000094', 'mem-000093', 'mem-000097', 'mem-000108']` | `['mem-000172', 'mem-000176', 'mem-000164', 'mem-000099', 'mem-000032', 'mem-000092', 'mem-000047', 'mem-000120']` |
| **Packed semantic preview IDs** | Identical (8 retained) | Identical (8 retained) |
| **Raw-to-packed match** | `true` | `true` |
| **Critical query memories retrieved** | `mem-000089` (Ch 27 origin, rank 1)<br>`mem-000110` (Ch 32 forging, rank 2) | None in top 8 (see provenance disclosure below) |
| **Recent events preserved** | 20 / 20 | 20 / 20 |
| **World rules preserved** | 6 / 6 | 12 / 12 |
| **Dropped artifacts / Overflow** | 0 / `false` | 0 / `false` |
| **Preview/Job context hash** | `2cbd93772926...` (MATCH) | `38120f852479...` (MATCH) |
| **Observed latency** | 14,528.4 ms | 31,103.8 ms |
| **Model attempts** | 2 total: 1 failed (503 ServerError high demand) $\to$ 1 success | 3 total: 2 failed (503 ServerError high demand) $\to$ 1 success |
| **Effective model** | `models/gemini-3.8-flash` | `models/gemini-3.8-flash` |
| **Checklist verdict** | PASS (origin established, Ch 32 distinguished) | PASS (complete chain 45 $\to$ 47 $\to$ 49 verified) |

### 4. Per-Lane Provenance Disclosure for `rq-0025`

- **Critical memories**: `mem-000167` (Ch 45), `mem-000174` (Ch 47), `mem-000177` (Ch 49).
- **Semantic lane**: None of these three appeared in the top 8 pgvector semantic matches (`mem-000172, 176, 164, 099, 032, 092, 047, 120`).
- **World-rule lane**: All three memories reached the LLM prompt via the preassembled fixture world-rule lane (`rules_retained_ids`, 12/12 retained).
- **Attestation**: Generation correctness for the chronology challenge demonstrates multi-lane packed budget retention and LLM reasoning under contradictory facts, **not** semantic retrieval recall of those three memories.

### 5. Invariants Maintained

- Production default configuration remains `CONTEXT_ROUTING_POLICY=legacy-v1` (**UNCHANGED**).
- Global default activation is **NOT AUTHORIZED**.
- P8-05 destructive cleanup remains **BLOCKED_PENDING_STABILITY**.
- No API keys, credentials, or confidential manuscript text committed.



## LATEST ASTRA REVIEW — Guarded Live Mixed-Provenance Evidence

**Canonical review:** `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-GUARDED-LIVE-ACCEPTANCE-REVIEW.md`.

Review commit: `8164b656f5371a0217f6657f3b8411fd1c758b35`.

**Decision:** `MIXED_PROVENANCE_PROVIDER_PATH_ACCEPTED_WITH_QUALIFICATION`. The new live evidence is on `main`, tested code `ece073840545bd3b27fb4dc7c509735b85a4d39d`, direct-child evidence commit `f8f8b578f49361f6594cb3e98d58e4d2673b8cfa`, and execution handoff `5439910050c5c4d68266877cf7cbf9e3407a67e1`.

The run captured 11 genuine Gemini **document-adapter** calls (216 frozen source chunks), 6 query-adapter calls, real pgvector + hybrid-v1 raw matches, exact raw-to-packed semantic ID retention, two real Gemini generations (five model attempts: two successes, three 503 failures), zero packer drops or protected overflow, and generation-job hash parity. Both selected 12k.

`rq-0011` retrieves `mem-000089` (Ch27) and `mem-000110` (Ch32) at ranks 1/2. For `rq-0025`, `mem-000167/174/177` **do not appear** in semantic top 8; the preassembled **world-rule lane** preserves them. Do not claim semantic recall of those three pivotal facts.

**Outstanding qualification:** The report cites database port `5433`, but the manifest writes `5432` because the runner hardcodes the `database` field instead of recording the actual (redacted) `DATABASE_URL`. Preserve historical evidence; repair exporter in the next harness revision. Adapter counts are not audited HTTP-attempt counts. Two jobs do not prove provider reliability. Automated checklist PASS is not a manual source-fact audit of new full E2E drafts; `future_leakage` and `unsupported_claim` remain `NOT_ASSESSED`.

### NEXT — Gemini / Antigravity: unadapted narrative-context E2E

Build a narrowly scoped integration using real `PostgresNarrativeRepository.get_structured_context()` over persisted Frozen_v1/Batch_7-derived entities, current states, event/participant records and world rules/facts, **without** `eval01g_fixture_via_repo_adapter`. Keep genuine semantic retriever/pgvector and opt-in `balanced-scope-v1`. Ensure chapter cutoff, supersession, normalized participants, source identities and tenant isolation. Do not conflate missing source-derived FactRecords with correctly populated world rules: measure and report those lanes independently.

Add focused unit/postgres-integration tests and fix database endpoint export by reading the runtime connection settings with credentials redacted. Commit runner/tests before the live run, open a PR and obtain CI, then run one or two targeted real-source cases on a clean exact SHA using isolated disposable staging. Save sanitized evidence in a new artifact or separate child commit and append execution-only reporting here. Do not change or silently rewrite accepted previous JSON measurements.

Review the **new full generated drafts**, not merely the 400-character snippets, against Frozen_v1 for `rq-0011` (Ch27 vs Ch32) and `rq-0025` (Ch45/47/49) if claiming content acceptance. Follow with a small, bounded opt-in stability/availability window; report model attempts and 503/429 failures. If this is blocked by source fact materialization or provider quota, report `PARTIAL/BLOCKED` rather than substituting a fixture or synthetic PASS.

```text
mixed-provenance provider path      ACCEPTED WITH QUALIFICATION
unadapted production narrative E2E NOT YET DEMONSTRATED
new-draft independent source review PENDING
bounded stability canary           PENDING
global default                     legacy-v1 (UNCHANGED)
balanced default activation        NOT AUTHORIZED
P8-05                              BLOCKED_PENDING_STABILITY
```

Do not reopen EVAL-01O, retune hybrid/packer/embedding contracts, change production default or perform destructive P8-05 cleanup.
