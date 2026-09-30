# EVAL-01J — Adaptive Story Brain Budget / Scale Stress

Status: OFFLINE DIAGNOSTIC  
Provider calls: 0  
Production changes: NONE

## Goal

Test whether an adaptive Story Brain budget policy remains safe when entity/state breadth grows beyond the current 61-chapter Aethelgard fixture.

## Candidate adaptive policy

```text
broad estimated package <= 20k
  -> broad mode, budget 20k

broad estimated package >20k and <=24k
  -> broad mode, tolerated budget 24k

broad estimated package >24k
  -> retrieval-scoped mode, budget 12k
```

Decision basis is the estimated broad Story Brain package before packing.

## Stress scales

```text
1x
2x
4x
```

1x is source-grounded.

2x/4x add deterministic structural clones of entity/current-state bundles that are:

- non-locked;
- outside the query/retrieval scope;
- noncanonical stress-only load;
- excluded from semantic/recent evidence;
- excluded from query scope and gold labels.

The stress fixture therefore measures **entity/state breadth growth only**.

It does not simulate additional chapters, world rules, semantic memories, relationships, or plot complexity.

## Held constant

- semantic limit = 8;
- recent-event limit = 20;
- compact provenance;
- same seven evaluation cases;
- same ContextBudgetPacker;
- same retrieval ordering and cutoff;
- same protected artifacts.

## Comparators

For every case/scale also record:

- fixed broad@20k;
- fixed broad@24k;
- fixed retrieval-scoped@12k.

These are diagnostic comparators only.

## PASS contract

Every adaptive trace must:

- be deterministic;
- retain required query/retrieval scope;
- retain locked entities;
- retain locked rules;
- retain author constraints;
- avoid protected overflow;
- retain all semantic top-8;
- retain all recent top-20;
- retain all positive/critical semantic evidence.

## Measurements

For every case/scale:

- broad pre-pack estimate;
- broad entity/state count;
- number of synthetic stress clones;
- adaptive branch chosen;
- adaptive budget;
- tokens used/headroom;
- semantic/recent/rule retention;
- scope/protected retention;
- comparator behavior.

Aggregate:

- branch counts at 1x/2x/4x;
- evidence-complete cases;
- protected-overflow cases;
- mean broad estimated size;
- mean broad entity count;
- mean adaptive tokens used.

## Interpretation boundary

PASS means this adaptive policy survives the tested **entity/state breadth stress**.

PASS does not prove safety for arbitrary huge novels because plot/memory/rule growth is not scaled here.

No production adaptive policy is authorized by this diagnostic.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01j_adaptive_budget_scale.py
```

Evidence:

```text
docs/development/EVAL-01J-ADAPTIVE-BUDGET-SCALE/
  diagnostic.json
  summary.md
```

Gemini/Antigravity commits evidence only.
