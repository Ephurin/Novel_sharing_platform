# EVAL-01L — Secondary Scoped Budget Frontier

Status: OFFLINE DIAGNOSTIC  
Provider calls: 0  
Production changes: NONE

## Goal

Find the minimum retrieval-scoped Story Brain budget needed after broad context crosses the 24k tolerance ceiling, then validate the final two-stage adaptive policy offline.

## Part A — scoped sweep

For every EVAL-01K case/scenario, run the retrieval-scoped package at:

```text
12000
16000
20000
24000
```

Measure minimum budget for:

- all semantic top-8 retained;
- all recent top-20 retained;
- original source-grounded rules retained;
- all synthetic rule stress load retained;
- all positive/critical semantic evidence retained;
- full scoped input fit.

## Part B — candidate final policy

Routing uses estimated package size only.

```text
BROAD

broad <=20k
  -> broad@20k

20k < broad <=24k
  -> broad@24k

broad >24k
  -> retrieval scope


SCOPED

scoped <=12k
  -> scoped@12k

12k < scoped <=16k
  -> scoped@16k

16k < scoped <=20k
  -> scoped@20k

20k < scoped <=24k
  -> scoped@24k

scoped >24k
  -> unresolved
```

Gold positive/critical labels are evaluation-only and never used for routing.

## PASS contract

Harness integrity:

- deterministic packing;
- query/retrieval scope retained;
- locked entities retained;
- locked rules retained;
- constraints retained;
- protected overflow false.

Final policy PASS:

- no unresolved scoped package >24k;
- every routed trace retains complete core evidence:
  - semantic top-8;
  - recent top-20;
  - original source-grounded rules;
  - positive/critical semantic evidence.

The experiment also records whether the full scoped stress package fits intact.

## Interpretation

If PASS:

- the offline adaptive-budget architecture is complete enough to move to sealed live generation validation;
- no further offline budget architecture experiment is planned unless live validation exposes a new failure.

If unresolved scoped >24k appears:

- record it;
- do not silently create a larger tier in this experiment.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01l_secondary_scoped_frontier.py
```

Evidence:

```text
docs/development/EVAL-01L-SECONDARY-SCOPED-FRONTIER/
  diagnostic.json
  summary.md
```

Gemini/Antigravity commits evidence only.
