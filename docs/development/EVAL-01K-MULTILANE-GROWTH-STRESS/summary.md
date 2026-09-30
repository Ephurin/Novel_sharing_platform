# EVAL-01K Multi-Lane Growth Stress

Offline only. Provider calls: 0.

The EVAL-01J adaptive policy is evaluated unchanged.

Policy failures are findings and do not invalidate the harness.

## Scenario aggregate

### source_1x

- mean broad estimated: 16239.57
- mean scoped estimated: 8862.29
- branches: {'broad_20k': 7, 'broad_24k': 0, 'retrieval_scoped_12k': 0}
- core evidence complete: 7 / 7
- all rule load retained: 7 / 7
- mean synthetic rule retention: 1.000
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20
- protected overflow cases: 0

### rules_2x

- mean broad estimated: 17687.29
- mean scoped estimated: 10310.00
- branches: {'broad_20k': 6, 'broad_24k': 1, 'retrieval_scoped_12k': 0}
- core evidence complete: 7 / 7
- all rule load retained: 7 / 7
- mean synthetic rule retention: 1.000
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20
- protected overflow cases: 0

### evidence_payload_2x

- mean broad estimated: 17931.43
- mean scoped estimated: 10554.29
- branches: {'broad_20k': 6, 'broad_24k': 1, 'retrieval_scoped_12k': 0}
- core evidence complete: 7 / 7
- all rule load retained: 7 / 7
- mean synthetic rule retention: 1.000
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20
- protected overflow cases: 0

### combined_2x

- mean broad estimated: 19379.29
- mean scoped estimated: 12002.00
- branches: {'broad_20k': 5, 'broad_24k': 2, 'retrieval_scoped_12k': 0}
- core evidence complete: 7 / 7
- all rule load retained: 7 / 7
- mean synthetic rule retention: 1.000
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20
- protected overflow cases: 0

### combined_4x

- mean broad estimated: 25658.43
- mean scoped estimated: 18281.14
- branches: {'broad_20k': 0, 'broad_24k': 2, 'retrieval_scoped_12k': 5}
- core evidence complete: 2 / 7
- all rule load retained: 6 / 7
- mean synthetic rule retention: 0.997
- mean semantic retained: 6.29 / 8
- mean recent retained: 7.57 / 20
- protected overflow cases: 0

## Result

- integrity pass: PASS
- integrity failures: 0
- adaptive policy pass: FAIL
- adaptive policy failures: 5

A policy FAIL is an experiment result, not a harness failure.
No production policy change is authorized by this diagnostic.
