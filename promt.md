# ACTIVE HANDOFF — EVALUATION / PILOT

> Repo: `Ephurin/Novel_sharing_platform`  
> Source of truth: latest `main`  
> Current mode: **evidence-first real-novel evaluation**  
> Active experiment: **EVAL-01C — Dual-Lane Context & Intent-Conditioned Ranking**  
> Do not change production architecture until the diagnostic is reviewed.

## Current verified baseline

Frozen corpus: `aethelgard-retrieval-eval-v1.0.0`

```text
core-gold              21 queries -> canonical 216 memories
challenge              19 queries -> audit 232 memories
Vietnamese diagnostic  10 queries -> canonical 216 memories
```

EVAL-01 corrected runtime:

```text
core semantic @10
Recall  0.674717
MRR     0.902381
nDCG    0.709746

core hybrid-v1 @10
Recall  0.738964
MRR     0.906349
nDCG    0.731047

future chapter leakage       0
stale/wrong embedding        0
generation execution         4/4
generation manual review     3 clean / 1 temporal-causal error
context budget-pressure      NOT_MEASURED
raw ingestion/extraction     NOT_MEASURED
```

Detailed review:
[ASTRA corrected EVAL-01 review](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/ASTRA-CORRECTED-RERUN-REVIEW.md)

## EVAL-01B — accepted diagnostic findings, not production changes

Machine evidence:
[diagnostic.json](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/diagnostic.json)

Corrected summary:
[summary.md](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/summary.md)

Evidence commit:

`014fb1d22a749b45838e8cda3f67f287ae3e74c2`

Gemini handoff commit:

`ed6aa76d6120023fb0fef38b19d9f268f0ed394b`

Machine-derived EVAL-01B result:

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

Three pairwise failures:

```text
core_gold:rq-0011
  replay mem-000110 ch32      #1
  origin mem-000089 ch27      #2

challenge:rq-0023
  replay mem-000155 ch42      #4 hybrid
  origin mem-000149 ch40      #7 hybrid

challenge:rq-0025
  replay mem-000172 ch47      #1
  first burial mem-000164 ch45 #3
```

Important interpretation:

- grade `-1` is query-conditioned, not a global memory-invalid flag;
- a memory can be positive for one query and prohibited for another;
- therefore global deletion/filtering is unsafe;
- future-cutoff safety itself is working correctly.

Current HybridRanker temporal term is:

```text
age = cutoff_chapter - memory_chapter
temporal_score = 1 / (1 + age / 12)
```

For first/origin queries this recency preference can favor a later replay.

## Provenance finding — corrected layer localization

Do not say that `WritingContextPackage` inherently strips all semantic metadata.

Actual path:

```text
EventRecord.event_metadata
  -> PostgresSemanticMemoryRepository.list_event_memory_sources()
  -> EventMemorySource.metadata
  -> SemanticMemoryMaterializationService
  -> MemoryChunkRecord.memory_metadata
  -> SemanticMemoryMatch.metadata
  -> WritingService._semantic_match_payload()
```

`WritingService` does pass `match.metadata`.

However, `list_event_memory_sources()` currently projects only:

```text
event_type
chapter_number
source_type
importance_score
```

Source tags/review status such as:

```text
narrative_echo
temporal_reset
do_not_use_as_clean_ground_truth
review_status=ambiguous
```

do not currently survive semantic-memory materialization.

This is an EVAL finding, **not yet authorization to patch production**.

## EVAL-01C harness — MERGED

- PR: #12
- merge commit: `caac0f881bc5e9fb075839898f85c4dc69cbc8b9`
- Evaluation Pilot Harness CI: **SUCCESS**
- baseline recompute order mismatches: **0**

CI preview:

```text
policy                      core R@10   core nDCG   challenge R@10   challenge nDCG   pairwise failures
baseline                    0.738964    0.731047    0.746115         0.667668         3
neutral_first_occurrence    0.738964    0.730166    0.746115         0.668872         3
inverse_first_occurrence    0.729441    0.726604    0.746115         0.668872         3
```

First-occurrence pairwise results:

```text
core_gold:rq-0011
  baseline  positive #2 / replay #1
  neutral   positive #2 / replay #1
  inverse   positive #2 / replay #1

challenge:rq-0023
  baseline  positive #7 / replay #4
  neutral   positive #6 / replay #4
  inverse   positive #6 / replay #5

challenge:rq-0025
  baseline  positive #3 / replay #1
  neutral   positive #3 / replay #1
  inverse   positive #3 / replay #1
```

Preliminary interpretation:

- temporal recency alone is **not** the root cause of the 3 inversions;
- neutral/inverse recency do not remove any pairwise failure;
- inverse recency damages core Recall/nDCG;
- do not implement either temporal policy from this preview.

Dual-lane preview:

```text
top10 memories inspected                    400
provenance_variant                           83
positive memories in variant lane            26
same/past grade -1 in variant lane            5
same/past grade -1 left in primary lane       0
queries whose best positive is variant       11
mean annotation overhead            ~538 tokens/query
```

This supports **retain + annotate**, not suppression. Official evidence must still be generated from merged `main` by Gemini.

# NOW — EVAL-01C

Goal: compare candidate contracts offline before deciding whether a production implementation slice is justified.

Harness:

`scripts/run_eval_01c_dual_lane_intent.py`

EVAL-01C compares three ranking policies over the **same preserved semantic top-20 candidates**:

```text
1. baseline
   current accepted hybrid-v1

2. neutral_first_occurrence
   first-occurrence queries only:
   remove the temporal-recency contribution

3. inverse_first_occurrence
   first-occurrence queries only:
   diagnostic inverse-recency temporal contribution
```

Accepted production weights remain unchanged. Policies 2–3 are **offline simulations only**.

Deterministic intent classifier for this diagnostic:

```text
temporal_supersession
temporal_replay_hard_negative
  -> first_occurrence

lifecycle/history_temporal
  -> lifecycle_history

ambiguity/contradiction
  -> contradiction

future_leakage*
  -> future_cutoff

everything else
  -> generic
```

This classifier is diagnostic scaffolding, not an approved production query classifier.

## Dual-lane simulation

No memory is deleted.

Each retrieved memory is annotated offline as:

```text
primary_evidence
or
provenance_variant
```

Variant lane includes evidence with ambiguous/non-high-confidence/noncanonical or replay/conflict/attributed provenance markers.

Measure:

- how many top-10 memories enter the variant lane;
- how many **positive** memories also enter it;
- whether same/past replay negatives become distinguishable;
- whether any replay negative remains in the primary lane;
- how many queries have their best positive in the variant lane;
- estimated token overhead of carrying lane/status/review-status/tags.

A positive memory in the variant lane is **not a failure**. The point is to retain it with provenance rather than globally suppress it.

## Required EVAL-01C measurements

For baseline / neutral / inverse policies:

- core Recall@10 / MRR@10 / nDCG@10;
- challenge Recall@10 / MRR@10 / nDCG@10;
- first-occurrence subset metrics;
- replay-vs-positive pairwise failure count;
- per-query nDCG improvements/regressions;
- non-target query changes;
- exact three known replay cases.

Harness must also verify that recomputed baseline ordering matches preserved runtime hybrid ordering.

Expected:

```text
baseline_recompute.raw_order_mismatch_count = 0
```

If not zero, stop interpretation and report harness mismatch.

## Gemini / Antigravity — after EVAL-01C harness is merged

EVAL-01C is offline and **does not require an API key**.

Run on latest `main`:

```bash
git switch main
git pull origin main

python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01b_replay_diagnostic.py --stdout-only
python scripts/run_eval_01c_dual_lane_intent.py
```

Evidence directory:

```text
docs/development/EVAL-01C-DUAL-LANE-TEMPORAL-INTENT/
  diagnostic.json
  summary.md
```

Gemini must commit only evidence/handoff. Do not modify the harness or production code during the run.

## EVAL-01C decision questions

The report must let Astra/Supervisor answer:

1. Does removing recency for first-occurrence intent reduce the 3 replay inversions?
2. Does inverse recency reduce them further?
3. Which policy causes fewer metric regressions?
4. Are non-target queries unchanged?
5. Can provenance lane annotation distinguish replay/ambiguous evidence without deleting valid dual-role memories?
6. How many valid positives are themselves provenance variants?
7. What is the estimated context-token overhead?
8. Is the next justified change:
   - provenance propagation only;
   - intent-conditioned ranking only;
   - both;
   - neither?

Do **not** convert the experiment winner directly into production code.

### Gemini Verification & Handoff — EVAL-01C DUAL-LANE & INTENT DIAGNOSTIC

Status: COMPLETE (Offline Diagnostic)
Tested commit: e31afe720e53a2909f1dc8bc8f9b98687baea246
Evidence commit: 4f7b5f0d3aa1dfab40149020fbbad9e89ee65b79
Evidence: docs/development/EVAL-01C-DUAL-LANE-TEMPORAL-INTENT/ (diagnostic.json, summary.md)

- Preflight guards:
  - P8 cleanup readiness: PASS
  - P8-05 cleanup gate: BLOCKED
  - EVAL-01 fixture contract: PASS
- Baseline Recompute Integrity:
  - `raw_order_mismatch_count`: 0 (exact match with preserved EVAL-01 runtime hybrid rankings)
- Decision Question Answers:
  1. Recency removal on first-occurrence intent: NO, does not resolve any of the 3 inversions (`rq-0011`: #2 vs #1, `rq-0023`: #6 vs #4, `rq-0025`: #3 vs #1). Total pairwise failures remain 3.
  2. Inverse recency: NO, pairwise failures still remain 3/3 (`rq-0011`: #2 vs #1, `rq-0023`: #6 vs #5, `rq-0025`: #3 vs #1).
  3. Metric regressions: Neutral first-occurrence preserves Core R@10 (0.738964) with trivial nDCG delta (0.731047 -> 0.730166). Inverse recency actively damages Core Recall (0.738964 -> 0.729441) and nDCG (0.731047 -> 0.726604).
  4. Non-target queries: UNCHANGED across all policies (intent classifier strictly isolates first_occurrence).
  5. Provenance lane annotation: YES, segregates 100% (5/5) same/past grade -1 replay hits into `provenance_variant`. Exactly 0 replay negatives remain in `primary_evidence`.
  6. Positive memories in variant lane: 26 positive memories (and 11 queries' best positives) are provenance variants. Global suppression/filtering of the variant lane is confirmed unsafe.
  7. Token overhead: Mean ~538 estimated tokens/query (max 560), well within the 12k budget.
  8. Justified next step: **Provenance propagation only** (from `EventRecord.event_metadata` through to `MemoryChunkRecord` / `WritingContextPackage`). Do NOT change production ranking weights or implement intent-conditioned reranking.


## Frozen production contract — do not drift

- embedding: `gemini-embedding-2`, 768 dimensions, explicit L2;
- embedding version: `gemini-embedding-2-768-v1`;
- cosine: `<=>`;
- temporal chapter cutoff before semantic ranking;
- hybrid-v1 weights:
  ```text
  0.75 semantic
  + 0.03 entity_overlap
  + 0.08 temporal
  + 0.10 importance
  + 0.04 relationship
  ```
- no ANN/HNSW/IVFFlat;
- semantic memory remains derived/rebuildable;
- no frozen-gold mutation;
- no automatic architecture changes.

## P8-05 remains blocked

```text
Evaluation / Pilot          = ACTIVE
P8-05 destructive cleanup   = BLOCKED_PENDING_STABILITY
```

Never set `supervisor_cleanup_gate_accepted=true` by inference.

## Roles

```text
Astra / ChatGPT
  design harness
  review evidence
  prepare implementation proposal only if justified

Gemini / Antigravity
  execute merged harness on main
  commit evidence
  do not broaden scope

Supervisor
  final decision / ACCEPT
```

## References

- [EVAL-01C script](scripts/run_eval_01c_dual_lane_intent.py)
- [EVAL-01B diagnostic](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/diagnostic.json)
- [EVAL-01B corrected summary](docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/summary.md)
- [EVAL-01 runtime evidence](docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/)
- [Evaluation / Pilot Runbook](docs/development/EVALUATION-PILOT-RUNBOOK.md)
- [Phase 0–8 archive](docs/development/archive/P0-P8-HANDOFF-through-2026-09-26.md)
