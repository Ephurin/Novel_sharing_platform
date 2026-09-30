# EVAL-01N Relevance Density / Scope-First Diagnostic

Offline only. Provider calls: 0.

No production code or ContextBudgetPacker changes.

## Contract

- contract pass: PASS
- failures: 0

## Aggregate

- broad@20k mean tokens used: 16242.43
- broad@20k mean entities: 69.57

### retrieval_scope_min_tier

- resolved cases: 7 / 7
- mean tokens used: 8825.71
- mean entities: 15.43
- mean token reduction vs broad: 7416.71
- mean token reduction pct vs broad: 45.549%
- budget distribution: {'12000': 7, '16000': 0, '20000': 0, '24000': 0}

### balanced_scope_min_tier

- resolved cases: 7 / 7
- mean tokens used: 9637.86
- mean entities: 21.29
- mean token reduction vs broad: 6604.57
- mean token reduction pct vs broad: 40.657%
- budget distribution: {'12000': 7, '16000': 0, '20000': 0, '24000': 0}

## Known live regression case

Case: challenge:rq-0025

- broad_20k_current: budget=20000 used=16135 entities=68 semantic=8 recent=20
- retrieval_scope_min_tier: budget=12000 used=9308 entities=18 semantic=8 recent=20 reduction=42.312%
- balanced_scope_min_tier: budget=12000 used=9593 entities=20 semantic=8 recent=20 reduction=40.545%

No production policy change is authorized by this diagnostic.
