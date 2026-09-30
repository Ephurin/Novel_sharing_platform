# EVAL-01H Production-Limit Context Scope Diagnostic

Offline only. Provider calls: 0.

ContextBudgetPacker implementation is unchanged.

Semantic limit: 8
Recent-event limit: 20
Provenance: compact

## 12k aggregate

### baseline_prod8

- mean input entities: 69.57
- mean selected entities: 69.57
- mean selected rules: 8.29
- mean selected recent: 1.00
- mean selected semantic: 4.71
- mean positive retention: 0.571
- mean critical retention: 0.667
- cases all positives retained: 4 / 7
- cases all critical retained: 4 / 7
- zero-semantic cases: 2
- zero-recent cases: 4
- mean scope coverage: 1.000

### retrieval_scoped_entities

- mean input entities: 15.71
- mean selected entities: 15.71
- mean selected rules: 10.57
- mean selected recent: 20.00
- mean selected semantic: 8.00
- mean positive retention: 1.000
- mean critical retention: 1.000
- cases all positives retained: 7 / 7
- cases all critical retained: 7 / 7
- zero-semantic cases: 0
- zero-recent cases: 0
- mean scope coverage: 1.000

### balanced_scoped_entities

- mean input entities: 21.57
- mean selected entities: 21.57
- mean selected rules: 10.57
- mean selected recent: 20.00
- mean selected semantic: 8.00
- mean positive retention: 1.000
- mean critical retention: 1.000
- cases all positives retained: 7 / 7
- cases all critical retained: 7 / 7
- zero-semantic cases: 0
- zero-recent cases: 0
- mean scope coverage: 1.000

## Contract

- contract pass: PASS
- failures: 0

No production context-selection or packer change is authorized by this diagnostic.
