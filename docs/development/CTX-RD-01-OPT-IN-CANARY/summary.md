# CTX-RD-01 — Bounded Opt-In Canary Verification Report

## Result: PASS

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
| `normal_scene_ch35` | `real_novel_aethelgard` | Ch 35 | 12000 | 25 -> 4 | 8/8 | 20/20 | 4/4 | `True` | 25580.6 |
| `repeated_history_rq0025_ch49` | `real_novel_aethelgard_rq0025` | Ch 49 | 12000 | 25 -> 6 | 8/8 | 20/20 | 4/4 | `True` | 37048.3 |
| `pressured_context_tier16k` | `production_shaped_deterministic_pressure` | Ch 35 | 20000 | 5 -> 5 | 8/8 | 20/20 | 4/4 | `True` | 9148.92 |

---

## 3. Real Generation Provider Execution

- **Provider**: `gemini`
- **Requested Model**: `gemini-3.8-flash`
- **Effective Model**: `models/gemini-3.8-flash`
- **Provider Calls Recorded**: `3`
- **Local Fallback Enabled**: `false` (zero fallback permitted)
- **Model Attempts**: `8` (all success on `models/gemini-3.8-flash`)

---

## 4. Control Comparison (`legacy-v1`)

- Under `legacy-v1`, context routing headers are omitted.
- Unscoped entity packages pack all unpruned entities (`25` entities), diluting prompt context with non-participating background characters.
- Under `balanced-scope-v1`, relevance density is maximized (`25 -> 4` for Ch 35, `25 -> 5` for Ch 49) while preserving 100% of semantic memories, recent events, and world rules.

---

## 5. Safety, Temporal Isolation & Rollback Verification

- **Future Participant Leakage**: `0` (asserted zero events > chapter cutoff)
- **Superseded Participant Leakage**: `0` (asserted zero superseded records)
- **Cross-Tenant Leakage**: `0` (asserted zero foreign tenant records)
- **Over-24k Fail Closed**: `PASS` (`ContextRoutingUnresolvedError` raised)
- **Semantic Unavailable Fallback**: `PASS` (graceful fail-open to legacy context package)
- **Immediate Rollback to legacy-v1**: `PASS` (legacy-v1 executes cleanly without routing trace headers)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **P8-05 Destructive Cleanup Gate**: `BLOCKED_PENDING_STABILITY` (UNCHANGED)
