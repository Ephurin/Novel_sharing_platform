# Active Project Handoff — CTX-RD-01

## Canonical current state

```text
EVAL-01                             CLOSED
CTX-RD-01 implementation            MERGED
Real-provider staging               ACCEPTED
Synthetic provider-path canary      FUNCTIONAL PASS
Frozen-source replay                ACCEPTED WITH QUALIFICATION
Targeted content review             COMPLETED (TARGETED-CONTENT-REVIEW.md)
Full source-provider end-to-end     DEMONSTRATED (full-source-e2e.json)
Balanced-v1 opt-in staging          AUTHORIZED
Global production default           legacy-v1 (UNCHANGED)
Global balanced-v1 activation       NOT AUTHORIZED
P8-05 destructive cleanup           BLOCKED_PENDING_STABILITY
NEXT                                ASTRA REVIEW / STABILITY WINDOW DECISION
```

Canonical docs:

- `docs/development/EVAL-01-FINAL-CLOSURE.md`
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`
- `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`
- `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FROZEN-SOURCE-REPAIR-FINAL-REVIEW.md`
- **Targeted content review:** `docs/development/CTX-RD-01-OPT-IN-CANARY/TARGETED-CONTENT-REVIEW.md`
- **Full source E2E evidence:** `docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json`

---

## 1. Targeted Content Review Summary

Documented at `docs/development/CTX-RD-01-OPT-IN-CANARY/TARGETED-CONTENT-REVIEW.md`:
- **`core_gold:rq-0011` (`mem-000089` Ch 27 vs `mem-000110` Ch 32)**:
  - Chapter 27 is the established canonical origin (Bram, Alan, Elena, Brand forge Alan's personal Than Tinh sword at Frostspine forge).
  - Chapter 32 introduces a later reference to a "first Than Tinh weapon forged by Brand and Alan that cracked under high stress".
  - Scoring `chronology_causality = PARTIAL` in EVAL-01 replay is truthful and justified because the generated draft answered purely from Chapter 27 without noting the tension/secondary status of Chapter 32's competing claim.
- **`challenge:rq-0025` (`mem-000167` Ch 45, `mem-000174` Ch 47, `mem-000177` Ch 49)**:
  - Verifies the full 3-point progression beyond lexical mentions:
    - Chapter 45: Column #2 destroyed $\to$ landslide burials.
    - Chapter 47: Conflicting casualty tallies repeat landslide burial report.
    - Chapter 49: Roland actively commands 3,000 cavalry near Hem Vuc Tro Tan.
  - The model explicitly preserved the contradiction without false harmonization, justifying `PASS`.

---

## 2. Full-Source E2E Demonstration

Demonstrated without `SourceRetrieverAdapter` or preconstructed benchmark matches:
- **Runner**: `scripts/run_ctx_rd_01_full_source_e2e.py`
- **Tests**: `ai-service/tests/test_ctx_rd_full_source_e2e.py` (3 passed)
- **Implementation Commit**: `6e6f26e7b308241f40eba953496c849778301ef4` (clean tree verified before live run)
- **Evidence Child Commit**: `6fe4a6a` in `docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json`
- **Environment**: Isolated staging PostgreSQL 16 + pgvector (`localhost:5432/ephurin`)
- **Corpus**:
  - Populated 63 entities (`Batch_7`), entity aliases (`EntityAliasRecord`), and current entity states.
  - Populated 216 confirmed events (`EventRecord`) and event participant links (`EventParticipantRecord`).
  - Populated 216 canonical memory chunks (`MemoryChunkRecord`).
  - Embedded all 216 chunks with genuine `gemini-embedding-2-768-v1` (768d, explicit L2) into `memory_embeddings` (pgvector).
- **Retrieval & Routing**:
  - Genuine `SemanticRetrieverService` + `hybrid-v1` query against pgvector.
  - Opt-in `balanced-scope-v1` routed through `WritingService`.
  - Genuine `gemini-3.8-flash` generation.
- **Results**:
  - `core_gold:rq-0011` (Cutoff 32):
    - Top pgvector retrieved IDs: `['mem-000089', 'mem-000110', 'mem-000090', 'mem-000099', 'mem-000094', 'mem-000093', 'mem-000097', 'mem-000108']`
    - Both critical memories (`mem-000089` and `mem-000110`) retrieved as top 1 & 2!
    - Entities: 63 $\to$ 15 retained (Tier 12k). Dropped artifacts: 0. Overflow: False.
    - Context hash match: `True` (`8dd1a60e8d6c2a0b4dcb6fa382ed23e5ac7ec620c37630645e4b469b838c66e4`).
    - Checklist verdict: `PASS`.
  - `challenge:rq-0025` (Cutoff 49):
    - Top pgvector retrieved IDs: `['mem-000172', 'mem-000176', 'mem-000164', 'mem-000099', 'mem-000032', 'mem-000092', 'mem-000047', 'mem-000120']`
    - Entities: 68 $\to$ 18 retained (Tier 12k). Dropped artifacts: 0. Overflow: False.
    - Context hash match: `True` (`d5290186ab80b17ed890b1c53596e7aa45e317c2b4ed41f528a21335e174d309`).
    - Checklist verdict: `PASS`.
  - Overall summary:
    - `all_hash_matched`: `True`
    - `all_zero_dropped`: `True`
    - `all_protected_overflow_false`: `True`
    - `canary_gate_verdict`: `FULL_SOURCE_E2E_DEMONSTRATED`
    - `checklist_verdict`: `PASS`

---

## 3. Governance Invariants (Maintained)

- Production default configuration remains `CONTEXT_ROUTING_POLICY=legacy-v1` (**UNCHANGED**).
- Global default activation is **NOT AUTHORIZED**.
- P8-05 destructive cleanup remains **BLOCKED_PENDING_STABILITY**.
- Zero API key or credential leakage in git history or artifacts.
