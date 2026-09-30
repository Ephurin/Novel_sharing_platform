# EVAL-01N — Relevance Density / Scope-First Diagnostic Runbook

## Purpose

EVAL-01N follows EVAL-01M's live finding that a larger retained context can improve evidence availability yet still reduce generation precision on at least one NORMAL case.

It tests whether **scoping entity/current-state breadth before increasing budget** can keep the same semantic/recent/rule evidence while reducing distracting Story Brain context.

Offline only.

Provider calls: `0`.

Production code changes: `none`.

## Input contract

Use the same seven fixed EVAL cases and source-grounded `source_1x` package shape used by EVAL-01M.

Before this diagnostic:
- remove EVAL-01G..L critical/gold-derived entity locks;
- retain source-derived world-rule locks;
- keep semantic top-8;
- keep recent limit=20;
- keep compact provenance.

Scope selection may use only:
- query-named entities;
- entities referenced by semantic top-8;
- for the balanced policy, participants from the newest five recent events.

Gold labels must not affect scope, routing, or budget-tier choice.

## Policies

### A — `broad_20k_current`

Current EVAL-01L source_1x route:

```text
broad package
budget = 20k
```

### B — `retrieval_scope_min_tier`

```text
entity/state scope =
  query-named
  + semantic-top8 entities

then select minimum full-fit tier from:
12k / 16k / 20k / 24k
```

### C — `balanced_scope_min_tier`

```text
entity/state scope =
  retrieval scope
  + participants from newest five recent events

then select minimum full-fit tier from:
12k / 16k / 20k / 24k
```

## Required checks

For both scope-first candidates, every source_1x case must satisfy:

```text
resolved within <=24k             true
deterministic                     true
protected overflow                false
semantic retained                 8 / 8
recent retained                  20 / 20
all source-derived rules          retained
required entity scope             retained
full scoped input                 fit
tokens used                       <= broad@20k
```

No ContextBudgetPacker modification is allowed.

## Special regression case

`challenge:rq-0025`

EVAL-01M live NORMAL result:

```text
adaptive broad@20k   0 wins
fixed broad@12k      3 wins
```

even though adaptive retained:

```text
semantic 8 / 8
recent  20 / 20
```

EVAL-01N must report for this case:
- selected tier;
- entities/states retained;
- Story Brain tokens used;
- semantic/recent/rule retention;
- percentage reduction versus broad@20k.

The purpose is to determine whether the same evidence can be presented at materially higher relevance density.

## Run

Windows PowerShell:

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01n_relevance_density.py
```

No API key is required.

## Evidence

Commit:

```text
docs/development/EVAL-01N-RELEVANCE-DENSITY/
  diagnostic.json
  summary.md
```

## Decision boundary

EVAL-01N does not authorize production changes.

If one density candidate:
- closes all seven source_1x cases;
- preserves semantic/recent/rules;
- retains required entity scope;
- materially reduces context versus broad@20k;
- and improves the known regression package density;

then Astra may design a small sealed live follow-up comparing that candidate against EVAL-01L adaptive routing.

P8-05 remains blocked.
