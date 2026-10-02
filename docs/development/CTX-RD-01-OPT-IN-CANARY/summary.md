# CTX-RD-01 — Bounded Opt-In Canary Verification Report

## Result: TECHNICAL_CANARY_PASS (SYNTHETIC & REAL-SOURCE GROUNDED)

- **Tested Commit**: `5d3d5a29ac5b8dcb0b405af3f332701d09eca331`
- **Evidence Timestamp**: `2026-10-02T03:35:36.028914+00:00`
- **Canary Environment**: `isolated_demo_staging`
- **Database**: PostgreSQL 16 + pgvector (Isolated Staging DB)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **Canary Opt-In Policy**: `balanced-scope-v1`
- **Global Default Switch**: NOT AUTHORIZED
- **P8-05 Cleanup Gate**: `BLOCKED_PENDING_STABILITY` (UNCHANGED)

---

## 1. Provider & Embedding Integrity

- **Provider**: `GeminiEmbeddingProvider`
- **Model**: `gemini-embedding-2`
- **Version**: `gemini-embedding-2-768-v1`
- **Dimension**: `768` (explicit L2 normalized)
- **Document Calls / Items**: `4` / `52`
- **Query Calls / Items**: `9` / `9`

---

## 2. Canary Generation Cases

| Case Name | Origin | Cutoff | Selected Tier | Entities (Before -> After) | Semantic Retained | Recent Retained | Rules Retained | Context Hash Match | Latency (ms) |
|---|---|---|---|---|---|---|---|---|---|
| `normal_scene_ch35` | `source_inspired_synthetic_aethelgard` | Ch 35 | 12000 | 25 -> 4 | 8/8 | 20/20 | 4/4 | `True` | 25580.6 |
| `repeated_history_rq0025_ch49` | `source_inspired_synthetic_rq0025` | Ch 49 | 12000 | 25 -> 6 | 8/8 | 20/20 | 4/4 | `True` | 37048.3 |
| `pressured_context_tier_escalation` | `production_shaped_deterministic_pressure` | Ch 35 | 20000 | 5 -> 5 | 8/8 | 20/20 | 4/4 | `True` | 9148.92 |

---

## 3. Real Generation Provider Execution

- **Provider**: `gemini`
- **Requested Model**: `gemini-3.8-flash`
- **Effective Model**: `models/gemini-3.8-flash`
- **Provider Calls Recorded**: `3` completed generation jobs
- **Local Fallback Enabled**: `false` (zero fallback permitted)
- **Model Attempts**: `8 total: 3 successful / 5 failed` (transient 429/503 provider errors handled via multi-key rotation and exponential backoff)

---

## 4. Control Comparison (`legacy-v1`)

- Under `legacy-v1`, context routing headers are omitted.
- Unscoped entity packages pack all unpruned entities (`25` entities), diluting prompt context with non-participating background characters.
- Under `balanced-scope-v1`, relevance density is maximized (`25 -> 4` for Ch 35, `25 -> 6` for Ch 49) while preserving 100% of semantic memories, recent events, and world rules.

---

## 5. Safety, Temporal Isolation & Rollback Verification

- **Future Participant Leakage**: `0` (asserted zero events > chapter cutoff)
- **Superseded Participant Leakage**: `0` (asserted zero superseded records)
- **Cross-Tenant Leakage**: `0` (asserted zero foreign tenant records)
- **Over-24k Fail Closed**: `PASS` (`ContextRoutingUnresolvedError` raised)
- **Semantic Failure Legacy Fallback**: `PASS` (graceful fail-open to legacy context package)
- **Immediate Rollback to legacy-v1**: `PASS` (legacy-v1 executes cleanly without routing trace headers)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **P8-05 Destructive Cleanup Gate**: `BLOCKED_PENDING_STABILITY` (UNCHANGED)

---

## 6. Source-Grounded Canary Execution (`real-source-canary.json`)

To address Astra's review, two truly source-grounded canary cases were executed against isolated staging PostgreSQL + pgvector using the frozen source-derived corpus (`.data/Frozen_v1/memory_chunks_canonical.json`, `.data/Frozen_v1/retrieval_queries.json`, `.data/Batch_7/entities.json`, `docs/development/EVAL-01-AETHELGARD-RUNTIME-BASELINE/retrieval-raw.json`) through genuine `WritingService.start_generation` with real `gemini-3.8-flash`:

| Case Name | Query ID | Role | Origin | Cutoff | Selected Tier | Entities (Before -> After) | Semantic Retained | Recent Retained | Rules Retained | Context Hash Match | Latency (ms) | Checklist Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `source_grounded_normal_rq0011` | `core_gold:rq-0011` | NORMAL | `source_grounded_canonical_aethelgard` | Ch 32 | 12000 | 63 -> 21 | 8/8 (100%) | 20/20 (100%) | 6/6 (100%) | `True` (`5bb32e...a14`) | 50855.1 | PASS |
| `source_grounded_chronology_rq0025` | `challenge:rq-0025` | CHALLENGE | `source_grounded_canonical_rq0025` | Ch 49 | 12000 | 68 -> 20 | 8/8 (100%) | 20/20 (100%) | 12/12 (100%) | `True` (`c552b5...5da`) | 12138.6 | PASS |

### Source-Grounded Chronology / Correctness Checklist

1. **`core_gold:rq-0011` (Alan Than Tinh Sword Origin, Cutoff 32)**:
   - **Canonical source status correctness**: PASS. Identifies Chapter 27 as the initial canonical forging origin (Bram, Alan, Elena, Brand at Frostspine forge).
   - **Chronology / causality**: PASS. Maintains distinction without overwriting Chapter 27 with Chapter 32.
   - **Ambiguity handling**: PASS. Avoids conflating Chapter 27 and 32 into a single event.
   - **Future leakage**: NONE (0 events > Ch 32).
   - **Unsupported claim**: NONE.
   - **Legacy control delta**: Legacy packs all 63 unpruned entities; `balanced-scope-v1` prunes to 21 active entities while retaining 100% of semantic, recent, and rule lanes.

2. **`challenge:rq-0025` (Roland 3,000 Cavalry Chronology, Cutoff 49)**:
   - **Canonical source status correctness**: PASS. Surfaces Roland's 3,000 heavy cavalry forces explicitly.
   - **Chronology / causality**: PASS. Identifies Chapter 45 as the earliest burial/landslide event and surfaces Chapter 47's incompatible continuation/re-burial.
   - **Ambiguity handling**: PASS. Explicitly notes the contradiction in sequence rather than silently collapsing them into a false linear timeline.
   - **Future leakage**: NONE (0 events > Ch 49).
   - **Unsupported claim**: NONE.
   - **Legacy control delta**: Legacy packs all 68 unpruned entities; `balanced-scope-v1` prunes to 20 active entities while retaining 100% of semantic, recent, and rule lanes.

### Provider Model Attempts (Real-Source Canary)
- **Total attempts across real-source jobs**: `8`
- **Successful calls**: `2`
- **Failed transient provider calls (429/503 handled via backoff & rotation)**: `6`
- **Zero local fallback**: Asserted `LLM_LOCAL_FALLBACK=false`.

