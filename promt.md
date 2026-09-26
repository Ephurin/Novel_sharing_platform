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

### Corpus

Keep these distinct:

- **Frozen P7 benchmark:** `aethelgard-retrieval-eval-v1.0.0`
  - 216 canonical memories
  - 21 core-gold queries
  - 10 Vietnamese diagnostics
- **Whole-story working corpus:**
  - all 61 Aethelgard chapters processed
  - 40 working retrieval queries
  - not a new frozen benchmark until cross-story consolidation/audit is complete

Sources:

- [P7 embedding benchmark](docs/development/P7-01-EMBEDDING-BENCHMARK-ADR-report.md)
- [P7 hybrid ranker](docs/development/P7-04-HYBRID-RANKER-report.md)
- [61-chapter working corpus](.data/Batch_7/dataset_report.md)
- [Detailed Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)

## Gemini / Antigravity — immediate task

Work on latest `main`. Measure first; do not silently fix architecture.

1. Verify P8-05 is still blocked:
   ```bash
   python scripts/check_p8_cleanup_readiness.py
   python scripts/check_p8_final_cleanup_gate.py --expect-blocked
   ```
2. Inventory exact corpus artifacts; do not mutate source novel/gold labels.
3. Run production-like PostgreSQL + pgvector path.
4. Materialize/rebuild semantic memory only through accepted tooling.
5. Measure semantic-only and accepted `hybrid-v1` retrieval with chapter cutoffs.
6. Record Recall/MRR/nDCG/hit-rate/candidate counts + p50/p95 latency where measurable.
7. Audit temporal safety:
   - future rows surviving final retrieval = **0**
   - stale/wrong-version rows surviving final retrieval = **0**
8. Evaluate long-range cases: setup/payoff, old-but-important memory, relationships, object lifecycle, world rules, low lexical overlap, multi-memory reasoning, future-leak traps.
9. Evaluate context packing: selected IDs, dedup, token budget, protected-artifact truncation, deterministic context hash.
10. Only after retrieval/context evidence is preserved, run a bounded generation pilot; record model/settings/context hash/retrieved IDs/output/latency/tokens/cost where available.
11. Classify failures before proposing fixes.
12. Commit evidence/results to `main`; do not open a coding phase automatically.

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

## Compact handoff format

Append after EVAL-01:

```markdown
### Gemini Verification — EVAL-01 AETHELGARD RUNTIME BASELINE

Status: PASS | PARTIAL | BLOCKED
Tested commit: <sha>
- Materialization: <result>
- Semantic retrieval: <metrics/result>
- Hybrid retrieval: <metrics/result>
- Future leakage: <0 or exact failures>
- Context packing: <result>
- Generation pilot: <result/not_measured>
- Latency/token/cost: <result/not_measured>
- Dominant failure category: <category>
- Confirmed code defect: none | <exact defect>
- Architecture change proposed: NO | <proposal>
- P8-05 cleanup gate: BLOCKED
- Evidence: docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/
- Remaining blocker: none | <exact blocker>
```

## References / history

- **Previous Phase 0–8 handoff archive:** [P0–P8 archive](docs/development/archive/P0-P8-HANDOFF-through-2026-09-26.md)
- **Detailed active protocol:** [Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)
- **Implementation roadmap:** [ai-service/docs/IMPLEMENTATION_PLAN.md](ai-service/docs/IMPLEMENTATION_PLAN.md)
- **Acceptance/evidence index:** [docs/development/](docs/development/)

Roles remain: Supervisor = final ACCEPT; ChatGPT/Astra = developer/architect/reviewer; Gemini/Antigravity = local execution/measurement worker.
