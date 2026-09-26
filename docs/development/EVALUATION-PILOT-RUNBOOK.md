# Evaluation / Pilot Runbook

> **Active handoff:** [`promt.md`](../../promt.md)  
> **Historical Phase 0–8 handoff:** [archive](archive/P0-P8-HANDOFF-through-2026-09-26.md)
>
> Detailed execution contract for the evidence-first Evaluation / Pilot phase.

# 8. ACTIVE PHASE — EVALUATION / PILOT

**Development status:** core architecture, migration, cutover and rollback foundations are complete through accepted P8-04.  
**P8-05 destructive cleanup:** still BLOCKED_PENDING_STABILITY and runs in parallel as an operational gate.  
**Primary mode now:** evidence-first evaluation on real-novel workloads, not feature-first development.

## 8.1 Phase intent

The system now moves from:

```text
design -> implementation -> migration -> cutover -> rollback rehearsal
```

to:

```text
real novel workload
  -> ingestion/materialization
  -> retrieval evaluation
  -> context evaluation
  -> generation evaluation
  -> failure classification
  -> evidence-driven architecture changes only when justified
```

Do **not** open a new architecture/coding slice merely because an optimization is possible.

The default action is now:

```text
measure first
reproduce failure
classify failure
only then propose code/architecture change
```

## 8.2 Gemini / Antigravity role

Gemini is the **local execution / measurement worker** for this phase.

Gemini should:

- work on latest `main`;
- run real Docker/PostgreSQL/pgvector workloads where applicable;
- preserve exact tested commit SHA;
- record commands, configs, model/version identifiers, latency, token/cost data when available, and raw/derived metrics;
- commit evidence and reports, not speculative architecture changes;
- keep evaluation inputs immutable;
- separate runtime behavior from offline proxy behavior;
- stop and report a reproducible blocker instead of silently changing architecture.

Gemini must **not**:

- change embedding model/version/dimension without a separate reviewed decision;
- change accepted hybrid weights merely to improve the same calibration set;
- add ANN/HNSW/IVFFlat or a specialized vector DB;
- loosen temporal cutoff/future-leak safety;
- silently alter corpus gold labels;
- delete legacy JSON, routes, adapters, backups or PostgreSQL data;
- set `supervisor_cleanup_gate_accepted=true`;
- fix a quality failure before first preserving reproducible evidence.

## 8.3 Frozen production contract — do not drift during evaluation

Phase 7 accepted contract remains:

- embedding model: `gemini-embedding-2`;
- dimension: `768`;
- explicit L2 normalization;
- cosine distance: `<=>`;
- embedding version: `gemini-embedding-2-768-v1`;
- semantic memory is derived/rebuildable, never canonical truth;
- temporal cutoff occurs before semantic ranking;
- stale / wrong-version / future rows are excluded;
- hybrid rank is deterministic `hybrid-v1`;
- context packing is deterministic;
- protected canonical artifacts are not silently truncated;
- no ANN/HNSW/IVFFlat in accepted MVP.

Accepted `hybrid-v1` recipe:

```text
0.75 * semantic_rank_score
+ 0.03 * entity_overlap
+ 0.08 * temporal_relevance
+ 0.10 * importance
+ 0.04 * relationship_relevance
```

Do not tune these weights on the same calibration set and then report the result as unbiased generalization quality.

## 8.4 Evaluation corpora — keep the versions distinct

### Frozen P7 benchmark

Source report:

`docs/development/P7-01-EMBEDDING-BENCHMARK-ADR-report.md`

Contract:

- corpus: `aethelgard-retrieval-eval-v1.0.0`;
- 216 canonical memories;
- 21 core-gold queries;
- 10 Vietnamese cross-lingual diagnostic queries.

Accepted semantic-only @10 baseline:

```text
Recall  = 0.674717
MRR     = 0.902381
nDCG    = 0.709746
```

Accepted `hybrid-v1` offline proxy @10:

```text
Recall  = 0.718556
MRR     = 0.906349
nDCG    = 0.721033
```

These numbers are regression/calibration references, **not** unbiased held-out quality claims.

### Frozen whole-story consolidation

The Batch_7 extraction has already been consolidated and frozen as `aethelgard-retrieval-eval-v1.0.0`.

Source of truth:

`.data/Frozen_v1/dataset_report.md`

Policies:

- full source/audit memories: **232**;
- canonical benchmark memories: **216**;
- total frozen retrieval queries: **40**;
- primary core-gold split: **21** queries using the 216 canonical corpus;
- challenge split: **19** queries using the full 232-memory audit corpus because some positives are intentionally inferred/uncertain;
- Vietnamese diagnostic: **10** translated core-derived queries using the 216 canonical corpus;
- Batch_7 remains the historical working source snapshot, not the active benchmark contract.

Do not mix these split/corpus policies in one aggregate.

## 8.5 First active experiment — EVAL-01 Aethelgard runtime baseline

**Goal:** establish the first end-to-end baseline of the accepted production stack on a real novel before changing architecture.

This experiment must distinguish:

```text
A. frozen offline benchmark/proxy
B. actual production-runtime retrieval/context path
```

Never substitute A for B.

### Required EVAL-01 work

1. Pull latest `main`; record exact SHA.
2. Verify P8-05 remains BLOCKED:
   - `python scripts/check_p8_cleanup_readiness.py`
   - `python scripts/check_p8_final_cleanup_gate.py --expect-blocked`
3. Inventory the exact Aethelgard corpus artifacts used.
4. Do not mutate gold labels or source novel files.
5. Run the accepted runtime stack with PostgreSQL + pgvector.
6. Materialize/rebuild semantic memory only through accepted production tooling.
7. Record actual memory counts by memory type and embedding version.
8. Run retrieval queries with chapter cutoffs using source-defined split membership. Never infer split from numeric query IDs.
9. Enforce corpus policy:
   - core-gold -> canonical 216;
   - challenge -> audit 232;
   - Vietnamese diagnostic -> canonical 216.
10. Compare at minimum:
   - recent-only reference where available;
   - semantic-only;
   - accepted `hybrid-v1`.
11. Record retrieval metrics where gold labels support them:
    - Recall@5/@10/@20;
    - MRR@5/@10/@20;
    - nDCG@5/@10/@20;
    - hit rate;
    - candidate counts;
    - latency p50/p95 when available.
12. Run explicit future-information leakage audit:
    - future candidates before cutoff filter: diagnostic only if observable;
    - future candidates surviving final retrieval: MUST be 0;
    - stale/wrong-version candidates surviving final retrieval: MUST be 0.
13. Evaluate long-range categories separately:
    - old-but-important memory;
    - setup -> payoff;
    - relationship evolution/supersession;
    - important-object lifecycle;
    - world-rule retrieval;
    - low lexical overlap;
    - multi-memory reasoning;
    - future-leak trap.
14. Evaluate context packing using real retrieved memory content:
    - selected artifact IDs;
    - dedup behavior;
    - token-budget usage;
    - protected canonical artifact truncation count;
    - deterministic repeatability/context hash;
    - relevant-memory retention.
15. Run a bounded generation pilot only after retrieval/context evidence is preserved.
16. For generation runs, preserve:
    - prompt/context hash;
    - generation model/version;
    - temperature/settings;
    - retrieved memory IDs;
    - output;
    - latency/tokens/cost if available.
17. The harness must not self-score generation. Preserve outputs with `REVIEW_REQUIRED`; a separate reviewer/evaluator may later score:
    - canonical factual consistency;
    - character/state consistency;
    - relationship consistency;
    - temporal/future leakage;
    - unsupported fact introduction;
    - context adherence;
    - continuity across long-range dependencies.
18. Do not use a single opaque LLM-judge score as the only evidence. Preserve per-criterion findings and representative failures.
19. If the full locked canonical entity/state/rule package is not reconstructed, protected-artifact truncation must be `not_measured`, not zero.
20. Classify every important failure before proposing a fix.

## 8.6 Failure taxonomy

Use one primary cause per reproduced failure, plus secondary contributors if needed:

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

For each failure record:

- query/case ID;
- chapter cutoff;
- expected evidence;
- actual retrieved/context/generated evidence;
- first layer where behavior diverges;
- reproducibility;
- severity;
- proposed next experiment.

Do not jump from “bad generation” directly to “embedding model is bad” without tracing retrieval and packed context first.

## 8.7 Evidence layout

Write EVAL-01 evidence under:

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

If a category cannot be measured, record `not_measured` plus the concrete reason. Do not fabricate zeros or estimates.

## 8.8 Evaluation report requirements

`summary.md` must distinguish:

- **reproduced accepted baseline**;
- **new runtime measurement**;
- **working-corpus diagnostic**;
- **inference/hypothesis**;
- **confirmed defect**.

The final report must answer:

1. Does real runtime semantic retrieval reproduce the expected direction of the frozen benchmark?
2. Does `hybrid-v1` improve useful long-range retrieval without harming temporal safety?
3. Which query archetypes remain weakest?
4. Does context packing preserve the right old-but-important memories under budget?
5. Are any canonical/protected artifacts truncated or lost?
6. Does any future information leak into retrieval, context, or generation?
7. What is the latency/token/cost profile?
8. Is the dominant bottleneck data quality, retrieval, packing, generation, or evaluation harness?
9. Which proposed improvement has the strongest evidence-to-complexity ratio?
10. Is a code/architecture change actually justified?

## 8.9 Change-control rule during pilot

A quality observation alone does not authorize a code change.

Before modifying architecture, Gemini must provide:

```text
reproducible case
+ preserved evidence
+ localized failure layer
+ expected measurable improvement
+ regression risks
```

Then ChatGPT/Astra reviews the proposal and the Supervisor decides whether to open a new implementation slice.

## 8.10 P8-05 continues in parallel

Evaluation/Pilot does not bypass the cleanup gate.

Until real post-release stability evidence exists:

```text
P8-05 destructive cleanup = BLOCKED
Evaluation / Pilot          = ACTIVE
```

Gemini may collect genuine operational stability observations while running the pilot, but must not invent a release identifier, observation period, error budget, incident status or Supervisor acceptance.

## 8.11 Immediate Gemini handoff

On latest `main`:

1. read this entire Evaluation / Pilot section;
2. verify P8-05 remains blocked;
3. inspect the existing Aethelgard frozen benchmark and 61-chapter working corpus;
4. prepare EVAL-01 runtime-baseline evidence directories/files;
5. run measurements before changing code;
6. commit evidence/results to `main`;
7. append a concise handoff:

```markdown
### Gemini Verification — EVAL-01 AETHELGARD RUNTIME BASELINE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
Corpus:
- frozen benchmark: aethelgard-retrieval-eval-v1.0.0
- working whole-story corpus: <state/version>

- Materialization: <result>
- Semantic retrieval: <metrics/result>
- Hybrid retrieval: <metrics/result>
- Future leakage: <0 or exact failures>
- Context packing: <result>
- Generation pilot: <result/not_measured>
- Latency/token/cost: <result/not_measured>
- Dominant failure category: <category>
- Confirmed code defect: none | <exact defect>
- Architecture change proposed: NO | <proposal reference>
- P8-05 cleanup gate: BLOCKED
- Evidence: docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
- Remaining blocker: none | <exact blocker>
```

Do not open a new coding phase automatically.
