# EVAL-01H — Production-Limit Context Scope Diagnostic

Status: OFFLINE DIAGNOSTIC
Provider calls: 0
Production code change: NONE
ContextBudgetPacker change: NONE

## Why this experiment exists

EVAL-01G used semantic top-20 as a stress fixture and found severe entity/state pressure. The production generation path normally uses:

- semantic limit = 8
- recent-event limit = 20

EVAL-01H repeats the full-package test at those production-shaped defaults and changes only entity/current-state input breadth.

## Policies

### baseline_prod8

- Full source-grounded entity/state input from EVAL-01G.
- Semantic top-8.
- Recent top-20.
- Compact provenance.
- Current ContextBudgetPacker unchanged.

### retrieval_scoped_entities

Keep only:

- stress-protected locked entities;
- entities explicitly named in the query using Batch_7 canonical names/aliases;
- entities appearing in the semantic top-8.

Current states are kept only for retained entities.

World rules, recent events, semantic candidates, constraints, budget, and packer remain unchanged.

### balanced_scoped_entities

retrieval_scoped_entities plus participants from the newest five recent events.

This tests whether a small recency-aware entity scope can preserve references needed by recent-event context while avoiding all-story entity breadth.

## No gold leakage

Positive/critical memory labels are used only for evaluation metrics.

They do not select query/retrieval-scoped entities.

The EVAL-01G locked-entity stress markers remain protected-contract scaffolding only and are not story facts.

## Budgets

- 12000 primary
- 10000 sensitivity
- 8000 sensitivity

## Measurements

For every case/policy/budget:

- input and selected entity/state counts;
- selected world rules;
- selected recent events;
- selected semantic memories;
- query/retrieval scope coverage;
- locked entity/rule/constraint retention;
- positive semantic retention;
- critical semantic retention;
- deterministic packing;
- protected overflow.

## PASS contract

For both scoped policies and every budget:

- deterministic packing;
- all required scope entities retained;
- all protected artifacts retained;
- protected overflow = false;
- positive-memory retained count >= baseline;
- critical-memory retained count >= baseline;
- recent-event retained count >= baseline;
- world-rule retained count >= baseline.

A PASS means input breadth is a justified next policy target.

A PASS does not authorize production context filtering.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01h_prod8_context_scope.py
```

Evidence:

```text
docs/development/EVAL-01H-PROD8-CONTEXT-SCOPE/
  diagnostic.json
  summary.md
```

Gemini commits evidence only.

Do not change ContextBudgetPacker or repository selection logic until Astra reviews this diagnostic.
