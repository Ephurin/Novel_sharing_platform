# EVAL-01B Replay / Temporal-Intent Diagnostic Summary

- **Experiment ID:** `EVAL-01B`
- **Dataset Version:** `aethelgard-retrieval-eval-v1.0.0`
- **Execution Mode:** Offline diagnostic using frozen corpus labels and corrected EVAL-01 retrieval artifacts (`docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/retrieval-raw.json`)
- **Evaluated Commit:** `44261764bb76de5daa9452e6c9e0d52cbfec961a` (PR #11 merge)
- **Artifacts:**
  - Diagnostic JSON: [`diagnostic.json`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/diagnostic.json)
  - Summary Markdown: [`summary.md`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/docs/development/EVAL-01B-REPLAY-TEMPORAL-INTENT/summary.md)

---

## 1. Diagnostic Baseline Metrics

| Diagnostic Metric | Count / Value | Description |
|---|---:|---|
| `queries_with_grade_minus_one` | **12** | Queries in frozen corpus containing at least one grade -1 label |
| `future_grade_minus_one_labels` | **20** | Prohibited labels where `chapter_number > chapter_cutoff` (future leakage) |
| `same_or_past_query_conditioned_labels` | **5** | Prohibited labels where `chapter_number <= chapter_cutoff` (narrative replay/echo) |
| `semantic_grade_minus_one_top20_hits` | **5** | Top-20 appearances of prohibited labels under semantic-only retrieval |
| `hybrid_grade_minus_one_top20_hits` | **5** | Top-20 appearances of prohibited labels under hybrid-v1 retrieval |
| `semantic_pairwise_failures` | **3** | Queries where a prohibited replay outranks the best positive in semantic top-20 |
| `hybrid_pairwise_failures` | **3** | Queries where a prohibited replay outranks the best positive in hybrid top-20 |
| `cross_query_dual_role_memories` | **12** | Memories that are grade > 0 in one query but grade -1 in another |
| `global_filter_safe` | **false** | Global deletion/filtering of grade -1 memories is prohibited |

---

## 2. Answers to the 10 Required Evaluation Inquiries

### Q1. Number of queries with grade -1 labels
- **12 queries** across the frozen retrieval query set (out of 40 total queries):
  - `challenge:rq-0001`, `challenge:rq-0004`, `challenge:rq-0006`, `challenge:rq-0007`, `challenge:rq-0008`, `challenge:rq-0009`, `challenge:rq-0026`, `challenge:rq-0033` (future cutoff boundaries)
  - `core_gold:rq-0011`, `core_gold:rq-0036` (narrative supersession / replay)
  - `challenge:rq-0023`, `challenge:rq-0025` (temporal replay hard negatives)

### Q2. Genuine future grade -1 count
- **20 labels** represent genuine future events (`chapter_number > cutoff`).
- **Audit status:** In the runtime retrieval pipeline, **0 of these 20 survive** into candidate retrieval because the SQL cutoff clause (`WHERE EventRecord.chapter_number <= chapter_cutoff`) is an absolute structural boundary. Future safety is 100% maintained.

### Q3. Same/past query-conditioned grade -1 count
- **5 labels** represent narrative replays or superseded claims at or before the query cutoff (`chapter_number <= cutoff`):
  1. `core_gold:rq-0011` $\rightarrow$ `mem-000110` (ch 32, cutoff 32): Replayed sword forging.
  2. `core_gold:rq-0036` $\rightarrow$ `mem-000110` (ch 32, cutoff 61): Replayed sword forging for an object history query.
  3. `challenge:rq-0023` $\rightarrow$ `mem-000155` (ch 42, cutoff 45): Replayed pillar destruction.
  4. `challenge:rq-0023` $\rightarrow$ `mem-000164` (ch 45, cutoff 45): Replayed pillar destruction.
  5. `challenge:rq-0025` $\rightarrow$ `mem-000172` (ch 47, cutoff 49): Replayed cavalry burial.

### Q4. Semantic and hybrid top-20 grade -1 hits
- **Semantic Top-20:** 5 hits across 3 queries:
  - `core_gold:rq-0011`: `mem-000110` (rank 1)
  - `core_gold:rq-0036`: `mem-000110` (rank 7)
  - `challenge:rq-0023`: `mem-000155` (rank 4), `mem-000164` (rank 7)
  - `challenge:rq-0025`: `mem-000172` (rank 1)
- **Hybrid-v1 Top-20:** 5 hits across 3 queries:
  - `core_gold:rq-0011`: `mem-000110` (rank 1)
  - `core_gold:rq-0036`: `mem-000110` (rank 8)
  - `challenge:rq-0023`: `mem-000155` (rank 4), `mem-000164` (rank 6)
  - `challenge:rq-0025`: `mem-000172` (rank 1)

### Q5. Pairwise failures where a prohibited replay outranks the best positive
Both semantic and hybrid pipelines experience the exact same 3 pairwise inversion failures:
1. **`core_gold:rq-0011`** (Temporal supersession / origin query):
   - Prohibited replay `mem-000110` ranks **#1** (semantic & hybrid).
   - Best positive `mem-000080` (actual origin forging in ch 24) ranks **#2** (semantic & hybrid).
2. **`challenge:rq-0023`** (Temporal replay hard negative):
   - Prohibited replay `mem-000155` (ch 42) ranks **#4** in both semantic & hybrid.
   - Best positive (first pillar destruction in ch 40) ranks **#6** in semantic, **#7** in hybrid.
3. **`challenge:rq-0025`** (Temporal replay hard negative):
   - Prohibited replay `mem-000172` (ch 47 cavalry burial echo) ranks **#1** in both semantic & hybrid.
   - Best positive `mem-000164` (first cavalry burial in ch 45) ranks **#3** in both semantic & hybrid.

### Q6. Memories that are positive in one query and prohibited in another
**12 distinct memories** serve dual roles depending on the query context:
- `mem-000064`: Positive in `rq-0021`, `rq-0026`, `rq-0032`, `rq-0033`; Prohibited in `rq-0001`.
- `mem-000067`: Positive in `rq-0003`, `rq-0026`, `rq-0032`, `rq-0033`; Prohibited in `rq-0001`.
- `mem-000070`: Positive in `rq-0004`, `rq-0026`, `rq-0032`, `rq-0033`; Prohibited in `rq-0001`.
- `mem-000071`: Positive in `rq-0004`, `rq-0026`, `rq-0032`, `rq-0033`; Prohibited in `rq-0001`.
- `mem-000080`: Positive in `rq-0011`, `rq-0014`, `rq-0036`; Prohibited in `rq-0004`.
- `mem-000081`: Positive in `rq-0011`, `rq-0014`, `rq-0036`; Prohibited in `rq-0004`.
- `mem-000094`: Positive in `rq-0007`, `rq-0010`, `rq-0014`, `rq-0036`; Prohibited in `rq-0006`.
- `mem-000105`: Positive in `rq-0010`, `rq-0013`, `rq-0019`, `rq-0022`; Prohibited in `rq-0009`.
- `mem-000106`: Positive in `rq-0010`, `rq-0014`, `rq-0019`, `rq-0022`; Prohibited in `rq-0009`.
- `mem-000110`: Positive in `rq-0010`, `rq-0014`; Prohibited in `rq-0011`, `rq-0036`.
- `mem-000164`: Positive in `rq-0025` (grade +3); Prohibited in `rq-0023` (grade -1).
- `mem-000193` & `mem-000194`: Positive in `rq-0032`, `rq-0033`; Prohibited in `rq-0026`.

### Q7. Whether a global memory-level filter is safe
- **Result: `FALSE` (Unsafe).**
- Grade -1 is strictly a **query-conditioned relevance label**, not an intrinsic property of the chunk. Deleting or globally filtering any of these memories would destroy recall for the queries in which they are valid ground truth.

### Q8. Examples where recency temporal score favors the wrong replay
The production `HybridRanker` computes recency score as:
$$\text{recency\_score} = \exp\left(-\ln(2) \cdot \frac{\text{cutoff\_chapter} - \text{memory\_chapter}}{\text{half\_life}}\right)$$
Because narrative replays and echoes occur in *later* chapters closer to `chapter_cutoff`, the distance $(\text{cutoff} - \text{mem\_chapter})$ is smaller, actively amplifying the replay over the true origin:
1. **`core_gold:rq-0011` (Cutoff ch 32):** Query asks for the initial forging of the Thần Tinh sword.
   - Original event `mem-000080` (ch 24): $\Delta = 8$ chapters $\rightarrow \text{recency} \approx 0.63$.
   - Replay event `mem-000110` (ch 32): $\Delta = 0$ chapters $\rightarrow \text{recency} = 1.00$.
   - The temporal recency bonus boosts the replay echo directly into rank #1.
2. **`challenge:rq-0025` (Cutoff ch 49):** Query asks for the first on-page burial of Roland's cavalry.
   - First burial `mem-000164` (ch 45): $\Delta = 4$ chapters $\rightarrow \text{recency} \approx 0.79$.
   - Repeated burial echo `mem-000172` (ch 47): $\Delta = 2$ chapters $\rightarrow \text{recency} \approx 0.89$.
   - The temporal component reinforces the later echo, placing it at rank #1 over the origin.
3. **`challenge:rq-0023` (Cutoff ch 45):** Query asks for the first on-page destruction of the numbered pillar.
   - Original destruction in ch 40 has $\Delta = 5$, whereas echoes in ch 42 (`mem-000155`, $\Delta=3$) and ch 45 (`mem-000164`, $\Delta=0$) receive higher temporal weights.

### Q9. Whether retrieved/context artifacts retain enough structured provenance to distinguish replay/ambiguous evidence
- **Result: `NO`.**
- In [`WritingContextPackage.semantic_memories`](file:///c:/Users/Laptop/OneDrive/Documents/testproject/ai-service/application/context_budget.py), items are serialized as a flat list:
  ```json
  {
    "memory_chunk_id": "mem-000110",
    "chapter_number": 32,
    "content": "...",
    "importance_score": 0.5,
    "source_key": "corpus:mem-000110"
  }
  ```
- The context package strips out narrative tags (`narrative_echo`, `temporal_reset`), ambiguity flags (`review_status: ambiguous`), and entity/event lifecycle provenance. Downstream LLMs have no structural signal to discern whether a chunk represents a foundational event, an on-page flashback, or an unverified rumor.

### Q10. Recommendation for next experiment (Not a production patch)
In response to the EVAL-01B acceptance question:

> *For user-facing generation context, should replay/ambiguous memories be:  
> 1. suppressed from canonical answer context;  
> 2. retained in a separately annotated contradiction/provenance lane;  
> 3. handled by another evidence-backed policy.*

**Recommended Next Step: Open EVAL-01C Diagnostic Slice (Dual-Lane Context & Intent-Conditioned Ranking):**

1. **Retain in a Separately Annotated Lane (Option 2):**
   - For user-facing generation, do not blindly delete replay/ambiguous memories.
   - Enrich `WritingContextPackage` with an explicit `narrative_status` or `evidence_lane` (`primary_evidence` vs `narrative_echo_or_variant`), populated from memory tags and extraction provenance.
2. **Intent-Conditioned Temporal Ranking for Origin Queries:**
   - Detect query temporal intent (`first_occurrence` / `origin` vs `latest_status` / `lifecycle_history`).
   - For `first_occurrence` queries, invert or neutralize the recency half-life penalty on early chapters, preventing narrative echoes from dominating rank #1 solely due to chapter proximity.
3. **Zero Production Changes in EVAL-01B:**
   - Maintain the frozen gold labels, database schema, hybrid weights, and retrieval code strictly intact until an implementation slice is approved by Astra/Supervisor.
