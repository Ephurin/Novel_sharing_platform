# ACTIVE HANDOFF — EVALUATION / PILOT

> Repo: `Ephurin/Novel_sharing_platform`  
> Source of truth: latest `main`  
> Current mode: **evidence-first real-novel evaluation**  
> Do not start a new coding/architecture phase automatically.

## NOW — EVAL-01 Aethelgard Runtime Baseline

Goal: measure the accepted production stack end-to-end on a real novel **before changing architecture**.

```text
real workload
→ materialization
→ retrieval
→ context packing
→ bounded generation
→ failure localization
→ only then consider code changes
```

### Frozen corpus contract

The Batch_7 working extraction has already been consolidated into:

`aethelgard-retrieval-eval-v1.0.0`

Use the source-defined policies exactly:

- **core-gold:** 21 queries against **216 canonical memories**;
- **challenge:** 19 queries against the **232-memory audit corpus**;
- **Vietnamese diagnostic:** 10 translated diagnostic queries against the **216 canonical memories**;
- source query IDs may overlap between core and VI, so every runtime record must use a split-qualified `case_id`.

Do not aggregate by numeric `rq-*` ID ranges.

Sources:

- [Frozen dataset report](.data/Frozen_v1/dataset_report.md)
- [P7 embedding benchmark](docs/development/P7-01-EMBEDDING-BENCHMARK-ADR-report.md)
- [P7 hybrid ranker](docs/development/P7-04-HYBRID-RANKER-report.md)
- [Detailed Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)

## Gemini / Antigravity — immediate task

Work on latest `main`. Measure first; do not silently fix architecture.

1. Verify P8-05 is still blocked:
   ```bash
   python scripts/check_p8_cleanup_readiness.py
   python scripts/check_p8_final_cleanup_gate.py --expect-blocked
   ```
2. Run `python scripts/check_eval01_fixture_contract.py` and require PASS.
3. Inventory exact frozen artifacts; do not mutate source novel/gold labels.
4. Run production-like PostgreSQL + pgvector path.
5. Materialize/rebuild both corpus policies through accepted tooling:
   - canonical 216 for core + VI;
   - audit 232 for challenge.
6. Measure semantic-only and accepted `hybrid-v1` retrieval with chapter cutoffs, keeping all splits separate.
7. Record Recall/MRR/nDCG/hit-rate/candidate counts + p50/p95 latency where measurable.
8. Audit temporal safety:
   - future rows surviving final retrieval = **0**
   - stale/wrong-version rows surviving final retrieval = **0**
9. Evaluate long-range cases: setup/payoff, old-but-important memory, relationships, object lifecycle, world rules, low lexical overlap, multi-memory reasoning, future-leak traps.
10. Evaluate context packing using real retrieved memory content: selected IDs, dedup, token budget, protected-artifact truncation, deterministic context hash.
11. Only after retrieval/context evidence is preserved, run a bounded generation pilot. Preserve output but do not self-award quality scores.
12. Classify failures before proposing fixes.
13. Commit evidence/results to `main`; do not open a coding phase automatically.


## Local Gemini API credentials for EVAL-01

Real runtime embedding/materialization and the bounded Gemini generation pilot require a live Gemini credential.

**Do not put API keys in `promt.md`, tracked docs, evidence, shell history captures, or commits.**

Use a local ignored file:

```text
.env.eval.local
```

The repository `.gitignore` already ignores `.env.*`.

Recommended local-only layout:

```env
GEMINI_API_KEY_SLOT_1=<secret>
GEMINI_API_KEY_SLOT_2=<secret>
GEMINI_API_KEY_SLOT_3=<secret>
GEMINI_API_KEY_SLOT_4=<secret>
```

Rules:

- all four values stay local and untracked;
- never print or copy key values into evidence;
- identify credentials only as `slot-1` .. `slot-4`;
- use **one fixed key slot per measured run** so latency/quota evidence remains interpretable;
- map the selected slot to the runtime variable `GEMINI_API_KEY` before starting the process/Compose stack;
- do not cycle through keys to bypass provider rate limits or quotas;
- on provider-directed throttling, honor backoff and record the throttle as runtime evidence;
- switch slots only for a new explicitly recorded run or when the selected credential is invalid/unavailable for a reason unrelated to bypassing quota;
- record the selected slot ID in `runtime-config.json`, never the secret.

For a live retrieval/materialization run, runtime must resolve to:

```text
EMBEDDING_PROVIDER=gemini
GEMINI_API_KEY=<selected local slot value>
embedding model/version = gemini-embedding-2 / gemini-embedding-2-768-v1
```

For a live generation pilot, additionally set explicitly:

```text
LLM_PROVIDER=gemini
LLM_MODEL=<explicit model under evaluation>
```

Do not rely on Compose defaults for live evaluation: root Compose defaults may use fake/no provider. Evidence must state whether each run was `live_provider`, `fake`, or `offline_proxy`.

Before running, Gemini should perform a secret-safe preflight:

```text
selected_key_slot = slot-N
credential_present = true
credential_value_logged = false
embedding_provider = gemini
llm_provider = gemini | not_enabled_yet
```

If no valid live credential is available, mark the affected measurement `BLOCKED` or `not_measured`; do not silently substitute fake-provider results for live EVAL-01 evidence.

Evidence directory:

```text
docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
  environment.txt
  corpus-inventory.json
  runtime-config.json
  materialization.txt
  retrieval-raw.json
  retrieval-metrics.json
  future-leak-audit.json
  context-packing.json
  generation-cases.json
  failure-analysis.md
  latency-cost.json
  summary.md
```

If something cannot be measured, write `not_measured` + reason. Never fabricate zero/PASS.

## Frozen contract — do not drift during EVAL-01

- Browser/mobile → Platform API `/api/v1` → Node AI Gateway `/api/v1/ai/*` → service-authenticated FastAPI.
- Production narrative repository = PostgreSQL.
- Semantic memory = derived/rebuildable, not canonical truth.
- Embedding = `gemini-embedding-2`, 768 dims, explicit L2, cosine `<=>`, version `gemini-embedding-2-768-v1`.
- Temporal cutoff runs before semantic ranking.
- `hybrid-v1` remains deterministic:
  ```text
  0.75 semantic_rank_score
  + 0.03 entity_overlap
  + 0.08 temporal_relevance
  + 0.10 importance
  + 0.04 relationship_relevance
  ```
- Context packing remains deterministic; protected canonical artifacts are not silently truncated.
- No ANN/HNSW/IVFFlat or specialized vector DB in accepted MVP.
- Do not retune weights on the same calibration set and call it generalization.

## Failure taxonomy

Use the first layer where behavior diverges:

```text
CORPUS_GOLD
INGESTION_EXTRACTION
CANONICAL_DATA
EMBEDDING
TEMPORAL_FILTER
CANDIDATE_RETRIEVAL
HYBRID_SIGNAL
HYBRID_WEIGHTING
CONTEXT_PACKING
GENERATION
EVALUATION_HARNESS
LATENCY_COST
UNKNOWN
```

A bad generation is not evidence that the embedding is bad until retrieval + packed context are traced.

## P8-05 runs in parallel — still BLOCKED

```text
Evaluation / Pilot          = ACTIVE
P8-05 destructive cleanup = BLOCKED_PENDING_STABILITY
```

Do not delete JSON, legacy routes/adapters, rollback backups, or PostgreSQL data. Do not fabricate release/stability evidence. Never set `supervisor_cleanup_gate_accepted=true` by inference.

Gate docs:

- [P8-05 report](docs/development/P8-05-FINAL-CLEANUP-GATE-report.md)
- [P8-05 runbook](docs/development/P8-05-FINAL-CLEANUP-GATE-runbook.md)
- [stability gate](docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json)
- [cleanup manifest](docs/development/P8-05-FINAL-CLEANUP-GATE/cleanup-manifest.json)

## Change control

Before any architecture/code change, preserve:

```text
reproducible case
+ evidence
+ localized failure layer
+ expected measurable improvement
+ regression risks
```

Then ChatGPT/Astra reviews; Supervisor decides whether to open an implementation slice.

## EVAL-01 attempt 1 review

Attempt-1 evidence remains preserved for audit:

- evidence commit: `0d7fa3e40db9bfa06218c11931d26e40b2d8665a`
- handoff commit: `67cf385e841d8bc9360358957977834d7308e61f`
- review: [ASTRA-REVIEW.md](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-REVIEW.md)

Status:

```text
EVAL-01 attempt 1 = PARTIAL / INVALID AGGREGATE
architecture defect = none demonstrated
P8-05 destructive cleanup = BLOCKED
```

Do not reuse the attempt-1 aggregate metrics or 5/5 generation rubric as accepted evidence.

## Corrected harness — MERGED

- PR: #10
- merge commit: `15f43f10b74ddf70e6c098de901036e757bef5bc`
- Evaluation Pilot Harness CI: SUCCESS
- fixture contract guard: PASS

Guarded contract:

```text
40 frozen retrieval queries
21 core-gold          -> canonical_216
19 challenge          -> audit_232
10 Vietnamese         -> canonical_216
duplicate rq IDs      -> split-qualified case_id
generation quality    -> REVIEW_REQUIRED
token/cost unavailable -> not_measured
```

## Gemini / Antigravity — rerun now

On latest `main`:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01.py
```

Requirements:

- all three guards must pass before interpreting evaluation results;
- use one fixed local Gemini key slot for the measured run;
- replace the EVAL-01 evidence files with corrected runner output;
- do not edit gold labels/source corpus;
- do not change embedding model, hybrid weights, or architecture;
- do not self-score generation quality;
- do not claim raw ingestion/extraction PASS;
- commit corrected evidence to `main`.

## Compact rerun handoff format

Append after the corrected run:

```markdown
### Gemini Verification — EVAL-01 CORRECTED RERUN

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Evidence commit: <sha>

- Fixture contract: PASS
- P8-05 cleanup gate: BLOCKED
- Core-gold corpus: 216 memories / 21 queries
- Challenge corpus: 232 memories / 19 queries
- Vietnamese diagnostic: 216 memories / 10 queries
- Materialization canonical: <generated/reused/fresh coverage>
- Materialization challenge: <generated/reused/fresh coverage>
- Core semantic @10: Recall=<...>, MRR=<...>, nDCG=<...>
- Core hybrid-v1 @10: Recall=<...>, MRR=<...>, nDCG=<...>
- Challenge diagnostic: <metrics/result>
- Vietnamese diagnostic: <metrics/result>
- Future leakage: <0 or exact failures>
- Stale/wrong-version: <0 or exact failures>
- Hybrid signals exercised: <count/result>
- Context packing: <determinism + relevant-memory retention>
- Protected canonical packing: not_measured | <real evidence>
- Generation execution: <success count>
- Generation quality: REVIEW_REQUIRED | <separate reviewed result>
- Latency: <artifact-derived p50/p95>
- Token/cost: not_measured | <measured result>
- Dominant failure category: <category>
- Confirmed production architecture defect: none | <exact defect>
- Architecture change proposed: NO | <proposal>
- Evidence: docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
- Remaining blocker: none | <exact blocker>
```

### Gemini Verification — EVAL-01 CORRECTED RERUN

Status: PASS
Tested commit: 8bae8276633ec9a9dae56d6f314907b9d12ee16d
Evidence commit: 1cdee3869911ee26989ea1c2a8657ea2e4a6a578

- Fixture contract: PASS
- P8-05 cleanup gate: BLOCKED
- Core-gold corpus: 216 memories / 21 queries
- Challenge corpus: 232 memories / 19 queries
- Vietnamese diagnostic: 216 memories / 10 queries
- Materialization canonical: 0 generated / 216 reused / 216 fresh coverage (100%)
- Materialization challenge: 232 generated / 0 reused / 232 fresh coverage (100%)
- Core semantic @10: Recall=0.6747, MRR=0.9024, nDCG=0.7097
- Core hybrid-v1 @10: Recall=0.7390, MRR=0.9063, nDCG=0.7310
- Challenge diagnostic: semantic @10: Recall=0.7614, MRR=0.8596, nDCG=0.6595; hybrid-v1 @10: Recall=0.7461, MRR=0.8584, nDCG=0.6677
- Vietnamese diagnostic: semantic @10: Recall=0.6702, MRR=0.8500, nDCG=0.6572; hybrid-v1 @10: Recall=0.7599, MRR=0.8643, nDCG=0.7166
- Future leakage: 0
- Stale/wrong-version: 0
- Hybrid signals exercised: 39 evaluated cases exposed entity/relationship signals after participant-table backfill
- Context packing: deterministic (6/6 cases match hash), relevant-memory retention=1.0
- Protected canonical packing: not_measured (locked canonical entity/state/rule package not reconstructed by this harness)
- Generation execution: 4/4 SUCCESS
- Generation quality: REVIEW_REQUIRED (not self-scored; preserved in generation-cases.json for Astra/Supervisor review)
- Latency: query_embedding p50=1478.29ms (p95=2618.07ms); sql_retrieval p50=62.75ms (p95=69.34ms); generation p50=1397.84ms (p95=2280.37ms)
- Token/cost: not_measured (LLMClient returns text only and does not expose provider usage/cost metadata)
- Dominant failure category: none demonstrated in retrieval/runtime (INGESTION_EXTRACTION & GENERATION_QUALITY require separate evaluation)
- Confirmed production architecture defect: none
- Architecture change proposed: NO
- Evidence: docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
- Remaining blocker: none (P8-05 destructive cleanup remains BLOCKED pending release stability)

## References / history

- [Detailed Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)
- [EVAL-01 Astra review](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-REVIEW.md)
- [Frozen dataset report](.data/Frozen_v1/dataset_report.md)
- [Previous Phase 0–8 handoff archive](docs/development/archive/P0-P8-HANDOFF-through-2026-09-26.md)
- [Implementation roadmap](ai-service/docs/IMPLEMENTATION_PLAN.md)

Roles remain: Supervisor = final ACCEPT; ChatGPT/Astra = developer/architect/reviewer; Gemini/Antigravity = local execution/measurement worker.
