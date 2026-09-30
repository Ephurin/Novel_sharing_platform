# EVAL-01I — Context Budget Scaling

Status: OFFLINE DIAGNOSTIC  
Provider calls: 0  
Production budget change: NONE  
Production scoping change: NONE  
ContextBudgetPacker change: NONE

## Question

Can the current broad entity/state input be preserved simply by increasing the Story Brain application budget, or is retrieval-scoped context still materially more efficient?

## Held constant

- semantic limit = 8;
- recent-event limit = 20;
- compact provenance;
- same seven EVAL-01H production-shaped cases;
- same current ContextBudgetPacker;
- same rules, constraints, retrieval order, and temporal cutoffs.

## Policies

### baseline_full_entities

Current broad source-grounded entity/state input from EVAL-01H.

### retrieval_scoped_entities

EVAL-01H retrieval scope:

- protected locked entities;
- entities explicitly named in the query;
- entities appearing in semantic top-8.

## Story Brain budget sweep

```text
12000
16000
20000
24000
32000
```

These values apply only to the application-level Story Brain package.

They do **not** include:

- outer system prompt;
- user instruction;
- selected manuscript text;
- response/output tokens.

## Measurements

For every case/policy/budget:

- estimated input size;
- tokens used;
- unused Story Brain headroom;
- selected entities/states/rules;
- selected recent events;
- selected semantic memories;
- positive/critical retention;
- protected retention;
- deterministic packing.

## Thresholds

Find the minimum tested budget where every one of the seven cases has:

1. all 8 semantic memories retained;
2. all 20 recent events retained;
3. all world rules retained;
4. all positive and critical semantic evidence retained.

This is `evidence_complete`.

Separately find the minimum budget where **all input artifacts** fit intact:

- entities;
- states;
- rules;
- recent events;
- semantic memories.

These thresholds intentionally answer different questions.

## Interpretation

Possible outcomes:

### Baseline complete at 16–20k

A larger Story Brain budget may be the simpler candidate. Do not implement scoping merely to solve capacity.

### Baseline needs 24–32k while scoped needs <=12k

Scoping has a strong efficiency advantage and may reduce input noise/cost.

### Both need large budgets

The issue is broader than entity breadth.

### Both fit easily at 12–16k

Prior pressure findings need re-examination.

## Guardrails

No production setting or code is changed by this diagnostic.

A budget winner cannot be selected from retention alone. A later live comparison would still need to measure:

- generation quality;
- latency;
- actual provider input tokens/cost;
- selected manuscript headroom.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01i_context_budget_scaling.py
```

Evidence:

```text
docs/development/EVAL-01I-CONTEXT-BUDGET-SCALING/
  diagnostic.json
  summary.md
```

Gemini/Antigravity commits evidence only.
