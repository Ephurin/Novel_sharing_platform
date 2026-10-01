# CTX-RD-01 Live Acceptance Summary

## Result: PASS

- **Tested Commit**: `7c95d6189d0b9a525718fbc35b906acf9cc50676`
- **Database**: PostgreSQL 16 + pgvector (`ephurin`)
- **Production Default Policy**: `legacy-v1` (UNCHANGED)
- **Balanced Routing Activation**: NOT YET AUTHORIZED
- **P8-05 Destructive Cleanup Gate**: BLOCKED_PENDING_STABILITY

### Baseline & Guard Verification
- `check_p8_cleanup_readiness.py`: **PASS**
- `check_p8_final_cleanup_gate.py --expect-blocked`: **PASS** (`BLOCKED`)
- Production default policy: `legacy-v1` (**PASS**)

### 1. Legacy Smoke (`legacy-v1`)
- Service start & structured context preview: **PASS**
- Generation pipeline execution: **PASS** (`completed`)
- Routing trace: **PASS** (legacy-compatible, routing trace absent)
- Token budget applied: `12000`

### 2. Balanced-v1 Smoke (`balanced-scope-v1`)
- Semantic retrieval status: `ok`
- Ranking version: `hybrid-v1`
- Hybrid signals resolved: `true`
- Chapter cutoff: `35`
- Semantic limit: `8` (retained: 8)
- Recent events limit: `20` (retained: 20)
- World rules retained: `4`
- Recent participant identity: `normalized-event-participants-v1`
- Routing version: `balanced-scope-v1`
- Routing status: `routed`
- Selected tier: `12000`
- Protected overflow: `false`
- Dropped artifacts: `0`
- Entity scope reduction: `25` -> `5` entities (all non-relevant baggage filtered)
- Story Brain estimated size: `5251` tokens
- Context hash: `209d48a5dfe9d6456a67741f13bdccc3cc91cef03d0319f622feab9c94c12daa`
- Generation success: **PASS** (`completed`)
- Latency: `76.68 ms`

### 3. Temporal Safety
- Future participant leakage (> ch35 cutoff): **0** (PASS)
- Superseded event participant leakage: **0** (PASS)
- Cross-tenant participant leakage: **0** (Tenant isolation PASS)

### 4. Fallback & Rollback
- Semantic / hybrid unavailable -> fallback to legacy: **PASS**
- Scoped package exceeds 24k -> fail closed (`CONTEXT_SCOPE_EXCEEDS_MAX_TIER`): **PASS**
- Flag rollback (`CONTEXT_ROUTING_POLICY=legacy-v1`) -> immediate rollback without DB rebuild: **PASS**
