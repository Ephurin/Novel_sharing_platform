# ASTRA Review — EVAL-01 Corrected Rerun

**Reviewed tested commit:** `8bae8276633ec9a9dae56d6f314907b9d12ee16d`  
**Evidence commit:** `1cdee38c5dd7fe3a865123b93a670177b6fd8129`  
**Gemini handoff:** `ef21ba0cdb5de004054f37b2bccd9a387536f561`  
**Review status:** PARTIAL — SAFETY/PROVENANCE GAP FOUND  
**Production architecture change authorized:** NO

## What is validated

### Retrieval/runtime baseline

The corrected run successfully separated the frozen corpus policies:

- core-gold: 21 queries / 216 canonical memories;
- challenge: 19 queries / 232 audit memories;
- Vietnamese diagnostic: 10 queries / 216 canonical memories.

Primary core-gold @10:

| Metric | Recent | Semantic | hybrid-v1 |
|---|---:|---:|---:|
| Recall | 0.409486 | 0.674717 | 0.738964 |
| MRR | 0.328571 | 0.902381 | 0.906349 |
| nDCG | 0.316010 | 0.709746 | 0.731047 |

The live semantic runtime reproduces the accepted P7 semantic baseline. On core-gold, hybrid-v1 improves Recall/MRR/nDCG overall.

Vietnamese diagnostics also improve materially under hybrid-v1.

Challenge diagnostics are mixed: hybrid-v1 improves nDCG overall but lowers Recall/MRR slightly, with notable regressions on `rq-0021` and `rq-0039`.

### Materialization

- canonical 216: 216 reused / 216 fresh / 0 stale / 0 missing;
- challenge 232: 232 generated this run / 232 fresh / 0 stale / 0 missing.

### Basic temporal/version safety

- chapter-after-cutoff survivors: 0;
- stale/wrong-version survivors: 0.

These two checks are valid but incomplete by themselves.

## Critical finding — grade -1 prohibited memories survive retrieval

Frozen v1 defines grade `-1` as `prohibited_future_or_invalid` regression traps.

The frozen dataset report states these items must not survive temporal/provenance filtering.

Astra independently compared the corrected `retrieval-raw.json` against the frozen labels and found **10 stage-level violations across 4 query cases**:

| Case | Stage | Rank | Prohibited memory | Reason |
|---|---|---:|---|---|
| core_gold:rq-0011 | semantic | 1 | mem-000110 | replayed “first forging” chronology reset |
| core_gold:rq-0011 | hybrid | 1 | mem-000110 | same replay remains rank 1 |
| core_gold:rq-0036 | semantic | 7 | mem-000110 | replayed sword-origin scene |
| core_gold:rq-0036 | hybrid | 8 | mem-000110 | replay remains in final candidates |
| challenge:rq-0023 | semantic | 4 | mem-000155 | later replay of Pillar No. 2 destruction |
| challenge:rq-0023 | semantic | 7 | mem-000164 | third replay of same destruction |
| challenge:rq-0023 | hybrid | 4 | mem-000155 | replay remains |
| challenge:rq-0023 | hybrid | 6 | mem-000164 | replay remains |
| challenge:rq-0025 | semantic | 1 | mem-000172 | replay of cavalry burial |
| challenge:rq-0025 | hybrid | 1 | mem-000172 | replay remains rank 1 |

This is not future-chapter leakage: these memories are at or before the query cutoff. It is a **provenance/validity leak**.

The prior `future-leak-audit.json` reported PASS because the harness only checked:

- chapter > cutoff;
- stale/wrong embedding version.

It did not inspect grade -1 prohibited labels.

### Localization

The current evidence does **not yet prove** whether the correct fix belongs in:

1. benchmark seeding/canonicalization;
2. canonical Story Brain confirmation/provenance state;
3. semantic materialization eligibility;
4. retrieval-time provenance filtering.

Therefore no production architecture change is authorized yet.

Primary failure category:

`EVALUATION_HARNESS` — missing prohibited-label audit.

Secondary suspected category requiring a focused experiment:

`CANONICAL_DATA / TEMPORAL_FILTER(PROVENANCE)`.

## Manual generation review

The corrected harness properly preserved four outputs without self-scoring. Astra reviewed them against the exact query and retrieved memories.

### generation:core_gold:rq-0002 — PASS

The answer identifies the corrupted-root countermeasure prepared from the earlier extraction site and its brief effect on Alistair's vulnerable armor joint.

- factual consistency: PASS;
- context adherence: PASS;
- future leakage: none observed;
- unsupported facts: none material.

### generation:core_gold:rq-0007 — PASS

The answer uses the chapter-28 combat observation against Garen to demonstrate that the Thần Tinh anti-mana property is experimentally confirmed rather than merely asserted at the forge.

- factual consistency: PASS;
- context adherence: PASS;
- future leakage: none observed;
- unsupported facts: none material.

### generation:core_gold:rq-0010 — PARTIAL

The answer correctly identifies the joint victory and Valora's recognition of Oakhaven's battlefield value, but it says the victory “leads her to ... commit Demon Thần Tinh resources and forge access.”

The retrieved evidence shows the resource/forge commitment occurs in chapter 31, while the joint victory and explicit post-battle belief revision occur in chapter 33.

This is a small but real **causal/temporal inversion**.

- factual entities/events: mostly supported;
- relationship consistency: mostly supported;
- temporal reasoning: FAIL/PARTIAL;
- unsupported causal inference: YES;
- future leakage: none observed.

Failure category: `GENERATION`.

### generation:challenge:rq-0001 — PASS WITH ATTRIBUTION CAVEAT

The answer correctly presents the evidence as support for suspicion: Roland's statement, the destructive extraction device, and Elena's accusation.

It does not upgrade Alistair's intent into independently verified fact.

- factual consistency: PASS;
- attribution handling: PASS;
- future leakage: none observed;
- unsupported facts: none material.

### Generation pilot result

```text
clean cases: 3/4
partial temporal/causal error: 1/4
future leakage observed in outputs: 0
```

The four-case pilot is too small to characterize overall generation quality, but it is sufficient to demonstrate at least one reproducible temporal-reasoning weakness.

## Context-packing review

The corrected runner now uses real frozen-memory content and shows deterministic hashes for 6/6 cases.

However, the measured inputs use only approximately **1,971–2,248 estimated tokens** against a **12,000-token budget**. No semantic item is dropped.

Therefore EVAL-01 establishes:

- deterministic packing: PASS;
- real-memory payload path: PASS;
- no-drop behavior under light load: PASS.

It does **not** establish:

- prioritization under token pressure;
- retention when relevant and irrelevant artifacts compete;
- protected canonical entity/state/rule behavior.

Those remain `not_measured`.

## Latency

Measured:

- query embedding p50: ~1478 ms; p95: ~2618 ms;
- SQL retrieval p50: ~62.75 ms; p95: ~69.34 ms;
- hybrid rerank p50: ~16.67 ms; p95: ~78.05 ms;
- generation p50: ~1398 ms; p95: ~2280 ms.

Provider token/cost usage remains `not_measured`.

## EVAL-01 verdict

```text
runtime semantic reproduction       = PASS
core hybrid aggregate improvement   = PASS
Vietnamese hybrid diagnostic        = PASS
challenge hybrid behavior           = MIXED
chapter-cutoff future leakage       = PASS (0)
embedding-version freshness         = PASS (0 stale/wrong)
prohibited provenance/invalid leak  = FAIL
context determinism                 = PASS
context budget-pressure quality     = NOT_MEASURED
generation execution                = PASS
generation quality pilot            = PARTIAL (3 clean / 1 temporal-causal error)
raw ingestion/extraction            = NOT_MEASURED
production architecture defect      = NOT YET LOCALIZED
```

Overall:

**EVAL-01 = PARTIAL — follow-up provenance experiment required before acceptance.**

P8-05 destructive cleanup remains BLOCKED.

## Required next step

Do not tune hybrid weights or change the embedding model.

Run a focused follow-up that answers:

1. Why are replay/invalid grade -1 memories entering a production-like confirmed/materialized set?
2. At which canonical/provenance layer should they become ineligible?
3. Can the system exclude them without deleting source/audit history?
4. Does exclusion preserve the accepted core retrieval gains and temporal safety?

Only after this localization should an implementation slice be proposed.
