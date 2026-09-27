# ACTIVE HANDOFF — EVALUATION / PILOT

> Repo: `Ephurin/Novel_sharing_platform`  
> Source of truth: latest `main`  
> Current mode: **evidence-first real-novel evaluation**  
> Do not start a new coding/architecture phase automatically.

## NOW — EVAL-01B Replay / Temporal-Intent Diagnostic

Goal: localize the replay/temporal-intent contract exposed by EVAL-01 **before changing production retrieval**.

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

## EVAL-01 corrected rerun — Astra review

Reviewed:

- tested commit: `8bae8276633ec9a9dae56d6f314907b9d12ee16d`
- evidence commit: `1cdee38c5dd7fe3a865123b93a670177b6fd8129`
- Gemini handoff: `ef21ba0cdb5de004054f37b2bccd9a387536f561`
- detailed review: [ASTRA-CORRECTED-RERUN-REVIEW.md](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-CORRECTED-RERUN-REVIEW.md)

Validated:

```text
semantic runtime reproduction       PASS
core hybrid aggregate              PASS / improved
Vietnamese diagnostic              PASS / improved
challenge diagnostic               MIXED
future chapter leakage             0
stale/wrong embedding              0
context determinism                PASS
generation execution               4/4
generation quality                 3 clean / 1 temporal-causal error
context budget-pressure quality    NOT_MEASURED
raw ingestion/extraction           NOT_MEASURED
```

EVAL-01 remains **PARTIAL**, not accepted.

### Key follow-up finding

Grade `-1` labels are query-conditioned:

- genuine future grade -1 memories are correctly blocked by chapter cutoff;
- some same/past replay memories still appear in semantic/hybrid top-20;
- the same memory can be positive for one query and prohibited for another.

Examples:

- `mem-000164`: grade -1 for `rq-0023`, grade +3 for `rq-0025`;
- `mem-000110`: replayed sword forging ranks #1 for `rq-0011`;
- `mem-000172`: later cavalry-burial replay ranks #1 for `rq-0025`.

Therefore **do not globally delete/filter a memory merely because it is grade -1 in another query**.

The open question is product semantics:

```text
A. canonical answer context suppresses replay/hard-negative memories
or
B. replay memories may be surfaced, but must carry provenance/ambiguity
   so reasoning can explicitly reject them
```

No production change is authorized until EVAL-01B resolves this.

## EVAL-01B harness — MERGED

- PR: #11
- merge commit: `44261764bb76de5daa9452e6c9e0d52cbfec961a`
- Evaluation Pilot Harness CI run: SUCCESS
- offline diagnostic execution: SUCCESS

CI diagnostic baseline:

```text
queries_with_grade_minus_one           12
future_grade_minus_one_labels          20
same_or_past_query_conditioned_labels   5
semantic_grade_minus_one_top20_hits     5
hybrid_grade_minus_one_top20_hits       5
semantic_pairwise_failures              3
hybrid_pairwise_failures                3
cross_query_dual_role_memories         12
global_filter_safe                  false
```

Pairwise failures currently include:

- `core_gold:rq-0011` — replay rank 1 vs best positive rank 2;
- `challenge:rq-0023` — replay rank 4 vs best positive rank 7 in hybrid;
- `challenge:rq-0025` — replay rank 1 vs best positive rank 3.

These are diagnostic findings, not authorization to change production.

## Gemini / Antigravity — EVAL-01B immediate task

EVAL-01B is offline and **does not require an API key**.

On latest `main` after the EVAL-01B harness merge:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py

python scripts/run_eval_01b_replay_diagnostic.py
```

Expected evidence:

```text
docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/
  diagnostic.json
  summary.md
```

Gemini must report:

1. number of queries with grade -1 labels;
2. genuine future grade -1 count;
3. same/past query-conditioned grade -1 count;
4. semantic and hybrid top-20 grade -1 hits;
5. pairwise failures where a prohibited replay outranks the best positive;
6. memories that are positive in one query and prohibited in another;
7. whether a global memory-level filter is safe;
8. examples where recency temporal score favors the wrong replay;
9. whether retrieved/context artifacts retain enough structured provenance to distinguish replay/ambiguous evidence;
10. a recommendation for the **next experiment**, not a production patch.

Do not:

- mutate frozen gold labels;
- retune hybrid weights;
- change embedding model/version;
- add ANN;
- delete replay memories from source/audit data;
- modify production retrieval;
- claim a production defect before localization is complete.

## EVAL-01B acceptance question

The experiment should end with a concrete contract proposal:

```text
For user-facing generation context, should replay/ambiguous memories be:

1. suppressed from canonical answer context;
2. retained in a separately annotated contradiction/provenance lane;
3. handled by another evidence-backed policy.
```

The proposal must explain behavior for:

- origin / first-occurrence queries;
- lifecycle queries;
- contradiction/ambiguity queries;
- future-leak queries.

ChatGPT/Astra reviews the evidence. Supervisor decides whether an implementation slice is justified.

## P8-05 remains parallel and blocked

```text
Evaluation / Pilot          = ACTIVE
P8-05 destructive cleanup   = BLOCKED_PENDING_STABILITY
```

Do not alter the cleanup gate while running EVAL-01B.

## References

- [EVAL-01 corrected rerun review](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-CORRECTED-RERUN-REVIEW.md)
- [EVAL-01 evidence](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/)
- [Frozen dataset report](.data/Frozen_v1/dataset_report.md)
- [Detailed Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)
- [Previous Phase 0–8 archive](docs/development/archive/P0-P8-HANDOFF-through-2026-09-26.md)

Roles remain: Supervisor = final ACCEPT; ChatGPT/Astra = developer/architect/reviewer; Gemini/Antigravity = local execution/measurement worker.
