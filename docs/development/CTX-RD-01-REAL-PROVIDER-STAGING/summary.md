# CTX-RD-01 Real-Provider Staging Summary

## Result: PASS

- **Tested Commit**: `9e0f1e88a9a10b924ab0c4636268de84e9faf270`
- **Evidence Timestamp**: `2026-10-01T10:20:14.231148+00:00`
- **Database**: PostgreSQL 16 + pgvector (Isolated Staging DB)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **Balanced Routing Default Activation**: NOT AUTHORIZED
- **P8-05 Destructive Cleanup Gate**: BLOCKED_PENDING_STABILITY

### 1. Real Embedding Provider
- **Provider**: `GeminiEmbeddingProvider`
- **Model**: `gemini-embedding-2`
- **Version**: `gemini-embedding-2-768-v1`
- **Dimension**: `768` (explicit L2 normalized)
- **Indexed Versions**: `["gemini-embedding-2-768-v1"]` (zero fake embedding mixture)
- **Document Provider Calls**: `3`
- **Query Provider Calls**: `2`

### 2. Real Retrieval & Balanced Routing
- **Status**: `ok`
- **Ranking Version**: `hybrid-v1` (signals resolved: `true`)
- **Chapter Cutoff**: `35`
- **Policy**: `balanced-scope-v1` (status: `routed`)
- **Selected Tier**: `12000`
- **Entities Scoped**: `25` -> `4` (distractors pruned)
- **Semantic Retained**: `8 / 8`
- **Recent Events Retained**: `20 / 20`
- **World Rules Retained**: `4 / 4`
- **Protected Overflow**: `false`
- **Dropped Artifacts**: `0`
- **Context Hash**: `529215bdbee2fe7297675c088b49439e5c48391ec476ebc2e92d8ca0ecf34924`

### 3. Real Generation Provider
- **Provider**: `gemini`
- **Requested Model**: `gemini-3.8-flash`
- **Effective Model**: `models/gemini-3.7-flash`
- **LLM Local Fallback Enabled**: `false`
- **Actual Provider Response**: `true` (status: `completed`)
- **Provider Calls**: `1`
- **Latency**: `12606.59 ms`

### 4. Tier Escalation Stress Testing
- **Fixture Origin**: `production_shaped_deterministic`
- **Selected Tier**: `16000` (escalated above 12000)
- **Semantic Exact**: `true`
- **Recent Exact**: `true`
- **Rules Exact**: `true`
- **Protected Overflow**: `false`
- **Dropped Artifacts**: `0`

### 5. Safety, Isolation & Rollback
- **Future Participant Leakage**: `0` (PASS)
- **Superseded Participant Leakage**: `0` (PASS)
- **Cross-Tenant Leakage**: `0` (Tenant isolation PASS)
- **Over 24k Fails Closed**: `True` (PASS)
- **Semantic Failure Fallback to Legacy**: `True` (PASS)
- **Immediate Rollback to legacy-v1**: `True` (PASS)
- **P8-05 Final Cleanup Gate**: `BLOCKED` (PASS)
