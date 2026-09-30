# EVAL-01K — Multi-Lane Growth Stress

Status: OFFLINE DIAGNOSTIC  
Provider calls: 0  
Production changes: NONE

## Goal

Stress the adaptive Story Brain policy with growth that is not limited to entity/state breadth.

Production item-count assumptions remain:

- semantic memories: 8;
- recent events: 20.

The experiment scales:

1. world-rule count;
2. semantic-memory payload size;
3. recent-event payload size;
4. combined pressure.

## Adaptive policy

Unchanged from EVAL-01J:

```text
broad estimate <=20k
  -> broad@20k

20k < broad estimate <=24k
  -> broad@24k

broad estimate >24k
  -> retrieval-scoped@12k
```

This experiment intentionally does not increase the scoped fallback budget.

If scoped@12k fails under multi-lane pressure, record the failure.

## Scenarios

```text
source_1x
  rules 1x
  semantic payload 1x
  recent payload 1x

rules_2x
  rules 2x
  semantic payload 1x
  recent payload 1x

evidence_payload_2x
  rules 1x
  semantic payload 2x
  recent payload 2x

combined_2x
  rules 2x
  semantic payload 2x
  recent payload 2x

combined_4x
  rules 4x
  semantic payload 4x
  recent payload 4x
```

## Synthetic stress contract

Rule growth:

- clones source-grounded rule records;
- clone IDs are synthetic;
- clones are unlocked;
- clones are noncanonical stress-only records.

Semantic/recent payload growth:

- repeats only the already-selected source-derived content/summary;
- adds no new fact;
- adds no new memory/event candidate;
- changes token load only.

Therefore this is a deterministic payload-pressure test, not a new story corpus.

## Two result layers

### Harness integrity

CI must fail if any of these fail:

- deterministic packing;
- required query/retrieval scope retained;
- locked entities retained;
- locked rules retained;
- author constraints retained;
- protected overflow = false.

### Adaptive policy result

Recorded separately:

- all semantic top-8 retained;
- all recent top-20 retained;
- all original source-grounded rules retained;
- all positive/critical semantic evidence retained.

An adaptive-policy FAIL is a valid experiment finding and does not fail CI by itself.

Also record:

- synthetic rule retention;
- all-rule-load retention;
- broad estimate;
- scoped estimate;
- adaptive branch;
- tokens used/headroom.

## Interpretation

Key question:

```text
Does >24k -> scoped@12k still work when the pressure remains
after entity scoping because rules/evidence payloads themselves grew?
```

If yes, EVAL-01J adaptive policy becomes substantially stronger.

If no, design a second-stage scoped budget tier from the measured failure frontier rather than hiding it in this experiment.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01k_multilane_growth_stress.py
```

Evidence:

```text
docs/development/EVAL-01K-MULTILANE-GROWTH-STRESS/
  diagnostic.json
  summary.md
```

Gemini/Antigravity commits evidence only.
