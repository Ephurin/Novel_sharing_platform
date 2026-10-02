# Active Project Handoff — CTX-RD-01

## Current status (latest Astra review takes precedence over historical handoffs)

```text
EVAL-01 evidence sequence                 CLOSED
ARCH-CTX-RD-01 proposal                   APPROVED
CTX-RD-01 implementation                  MERGED
Real-provider staging remediation         CLOSED / ACCEPTED
Opt-in demo/staging balanced-v1            AUTHORIZED
Global production default switch          NOT AUTHORIZED
Production default                        legacy-v1
P8-05 destructive cleanup                 BLOCKED_PENDING_STABILITY
NEXT                                       SOURCE-GROUNDED CANARY / EVIDENCE CORRECTION
```

Canonical evaluation closure: `docs/development/EVAL-01-FINAL-CLOSURE.md`.

Architecture proposal/review:
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/ARCH-CTX-RD-01-ASTRA-REVIEW.md`

Implementation: PR #27 / merge `739b5f8cceb549fb96e97bbc3565621f9f036031`.

Real-provider staging evidence (corrected): `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/`.
- Tested code SHA: `019d39222ce0b0d26e130ba57c0fedf92eac453e`.
- Evidence SHA: `d2b50be731590b531a17ae2708af2f389667d5af`.
- Repair PR #29 merged at `6f4d034bbf3c5857e34a6299f8ea9d736c829ff0`.
- Final Astra review: `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`.
- Final review commit: `79431abfd3f63fed8c8b92b0bb3f04469d936089`.

CI for PR #29: all SUCCESS.
- Evaluation Pilot Harness `36957124427`.
- P7 Semantic Memory Foundation `36957124446`.
- P8 Cutover and Migration `36957124460`.

Staging results:
```text
embedding version               gemini-embedding-2-768-v1 / 768d / explicit L2
document calls/items            3 / 36
query calls/items               3 / 3
generation requested/effective  gemini-3.8-flash / models/gemini-3.8-flash
generation attempts             1 / success
balanced context scope          25 -> 4 entities
selected tier                   12k
semantic/recent/rules           8/8, 20/20, 4/4 exact
drops / protected overflow      0 / false
generation job context hash     equals same-input preview hash
deterministic stress tier       16k
fallback / rollback             PASS
```

This is a successful **functional provider-path smoke**. It is not a general generation-quality or latency benchmark. Do not reopen EVAL unless new implementation behavior diverges.

## NEXT — Gemini / Antigravity: bounded opt-in canary

Use latest `main` and an isolated demo/staging environment. Keep `CONTEXT_ROUTING_POLICY=legacy-v1` in production, and opt in to `balanced-scope-v1` only in the designated canary process/config. Keep existing API keys local; do not commit keys or unnecessary manuscript text.

1. Run representative real-novel generation requests using accepted PostgreSQL+pgvector, hybrid-v1 and genuine `gemini-embedding-2-768-v1` document/query vectors. Reuse pre-existing data without destructive rematerialization; isolate or back up any writable test database.
2. Cover a normal context, a repeated/conflicting-history or source-status request (prefer the known rq-0025 archetype where possible), and a pressured request expected to escalate above 12k if real data supports one. Clearly label deterministic stress separately if no real pressured request is available; do not fabricate real-novel coverage.
3. Capture actual *generation-job* routing summary and context hash, tier, before/after entity/state counts, independently checked semantic/recent/rule IDs, drop/overflow traces, provider model/attempts, request success and validation status. Compare with existing `legacy-v1` reference or safe opt-in legacy control where feasible.
4. Verify chapter cutoff, supersession and tenant isolation in applicable lanes, as well as semantic-unavailable fallback and flag rollback. On unexpected information loss, leakage, routing failure, or material generation regression, switch the canary back to `legacy-v1` and record the failure.
5. Keep the current global default unchanged. Do not change ContextBudgetPacker, embedding model, hybrid weights or P8-05 status during the canary.

Save execution evidence and a concise pass/partial/fail summary under:

`docs/development/CTX-RD-01-OPT-IN-CANARY/`

Record the tested Git SHA, environment, real-versus-deterministic fixture provenance, actual model/provider used, observed failures, and whether the default remains `legacy-v1`. Append an execution-only canary report here. Astra will review it before any proposal to switch the global default.

No new blind A/B experiment is required merely to run this acceptance canary.

---

## Canary Execution Report — Bounded Opt-In Canary for `balanced-scope-v1`

- **Execution Date**: 2026-10-02
- **Result**: **PASS** (functional contract compliance on synthetic fixtures)
- **Tested Code Commit**: `5d3d5a29ac5b8dcb0b405af3f332701d09eca331`
- **Canary Environment**: `isolated_demo_staging` (PostgreSQL 16 + pgvector)
- **Production Default Policy**: `legacy-v1` (**UNCHANGED**)
- **Global Default Switch**: **NOT AUTHORIZED**
- **Canary Opt-In Policy**: `balanced-scope-v1` (explicit opt-in canary only)
- **Local LLM Fallback**: Disabled (`LLM_LOCAL_FALLBACK=false`)
- **P8-05 Destructive Cleanup Gate**: `BLOCKED_PENDING_STABILITY` (**UNCHANGED**)
- **Evidence Directory**: `docs/development/CTX-RD-01-OPT-IN-CANARY/`

### 1. Genuine Provider & Embedding Verification

- **Embedding Provider**: `GeminiEmbeddingProvider` (`gemini-embedding-2`)
- **Version**: `gemini-embedding-2-768-v1`
- **Vector Dimension & L2**: `768`, explicit L2 normalization verified on all document and query vectors (`abs(norm - 1.0) < 1e-4`)
- **Calls & Items**: 4 document batch calls (52 memory chunks embedded), 9 query calls
- **Generation Provider**: `gemini` (`gemini-3.8-flash` -> `models/gemini-3.8-flash`)
- **Provider Calls Recorded**: 3 completed generation jobs (zero local fallback)

### 2. Canary Generation Results

| Case Name | Fixture Origin | Cutoff | Selected Tier | Entities (Before -> After) | Semantic Retained | Recent Retained | Rules Retained | Context Hash Parity | Job Status |
|---|---|---|---|---|---|---|---|---|---|
| `normal_scene_ch35` | `source_inspired_synthetic_aethelgard` | Ch 35 | 12000 | 25 -> 4 | 8/8 (100%) | 20/20 (100%) | 4/4 (100%) | `preview == job` (`46b8dc...51d`) | `completed` |
| `repeated_history_rq0025_ch49` | `source_inspired_synthetic_rq0025` | Ch 49 | 12000 | 25 -> 6 | 8/8 (100%) | 20/20 (100%) | 4/4 (100%) | `preview == job` (`6439c1...bed`) | `completed` |
| `pressured_context_tier16k` | `production_shaped_deterministic_pressure` | Ch 35 | 20000 | 5 -> 5 | 8/8 (100%) | 20/20 (100%) | 4/4 (100%) | `preview == job` (`407b93...1bf`) | `completed` |

- **Artifacts Dropped**: 0 across all cases
- **Protected Overflow**: False across all cases
- **Context Hash Match**: 100% byte-for-byte equivalence between standalone preview and `WritingService.start_generation`

### 3. Control Comparison (`legacy-v1`)

- Under `legacy-v1`, context routing headers (`context_routing_version`, `context_routing_status`) are omitted.
- Unscoped entity packages under `legacy-v1` pack all 25 entities into the context budget without relevance pruning.
- Under `balanced-scope-v1`, relevance density is maximized (`25 -> 4` for Ch 35, `25 -> 6` for Ch 49) while preserving 100% of semantic memories, recent events, and world rules.

### 4. Safety, Temporal Isolation & Rollback Verification

- **Future Participant Leakage**: `0` (asserted zero events > chapter cutoff)
- **Superseded Participant Leakage**: `0` (asserted zero superseded records)
- **Cross-Tenant Leakage**: `0` (asserted zero foreign tenant records)
- **Over-24k Fails Closed**: `PASS` (`ContextRoutingUnresolvedError` raised)
- **Semantic Failure Legacy Fallback**: `PASS` (graceful fail-open to legacy context package)
- **Immediate Rollback to `legacy-v1`**: `PASS` (`legacy-v1` executes cleanly without routing trace headers)
- **Offline Evidence Validator**: `PASS` (`scripts/verify_ctx_rd_01_opt_in_canary_evidence.py` verified 0 errors)

---

## LATEST ASTRA REVIEW — CTX-RD-01 OPT-IN CANARY (2026-10-02)

Canonical review: `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-REVIEW.md`.

Review commit: `3d33491170ff183d434b9eccf631bf550dc56c54`.

Evidence currently exists **only on** branch `astra/ctx-rd-01-opt-in-canary`, commit `53a5177cd00760a338db2094cef678a2548a2918`, and is NOT yet merged into `main`. PR #30 merged the harness/code at `5c037242b93d359f072ec06b7d31ff28d983feb7` and passed P7/P8 CI.

**Verdict:** `TECHNICAL_CANARY_PASS_ON_SOURCE_INSPIRED_FIXTURES — REAL_SOURCE_CANARY_PENDING`.

Actual metrics from JSON:

```text
normal ch35           12k / entities 25 -> 4
rq-0025-style ch49    12k / entities 25 -> 6
deterministic pressure 20k / entities 5 -> 5
all cases             semantic 8/8, recent 20/20, rules 4/4, zero drops/overflow
generation            3 jobs completed using gemini-3.8-flash
model attempts        8 total: 3 success / 5 errors (429/503)
```

Correction required: normal and rq-0025 fixtures were **manually assembled** from Aethelgard-inspired descriptions; no original novel/Frozen_v1 records were loaded. Do not label them `real_novel_aethelgard`. The rq-0025-style prompt asks about cavalry origin, not the source-grounded chapter 45 -> 47 -> 49 chronology regression. The case called `tier16k` actually selected 20k, and summary ch49 says 25 -> 5 while JSON says 25 -> 6. Fix labels/reporting without rewriting measurements; report 8 attempts as 3 successes plus 5 failed attempts.

### Gemini / Antigravity next action

1. Correct evidence provenance labels and the summary on the existing canary branch; amend validator to distinguish source-inspired synthetic from source-grounded cases. Preserve measured JSON output values.
2. Reuse the existing frozen source-derived corpus (`.data/Frozen_v1/memory_chunks_canonical.json`, `.data/Frozen_v1/retrieval_queries.json`, `.data/Batch_7/entities.json`) and the EVAL-01O source_1x package builder to run **one or two** truly source-grounded canary cases through production routing in isolated staging, including actual rq-0025 chronology and ideally a NORMAL case.
3. Record source IDs/provenance, original-vs-retained lane IDs, actual job hash/tier, actual model/attempt deltas and a small chronology/source-status correctness checklist. Reuse valid materialized embeddings where possible. If real-source execution is unavailable, report PARTIAL rather than fabricating source provenance.
4. Open a PR for harness and evidence changes; run CI on the code before merging. Do not change production default or P8-05. Another sealed EVAL A/B is unnecessary.

Status:

```text
synthetic canary    functional PASS
real-source canary  functional PASS
balanced default    NOT AUTHORIZED
production default  legacy-v1
P8-05               BLOCKED_PENDING_STABILITY
```

