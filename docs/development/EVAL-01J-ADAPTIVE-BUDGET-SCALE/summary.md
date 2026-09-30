# EVAL-01J Adaptive Story Brain Budget / Scale Stress

Offline only. Provider calls: 0.

Synthetic scale clones are stress-only and noncanonical.

## Adaptive policy

- broad <=20k -> broad@20k
- broad >20k and <=24k -> broad@24k
- broad >24k -> retrieval-scoped@12k

## Scale aggregate

### 1x

- mean broad estimated before: 16239.57
- mean broad input entities: 69.57
- adaptive branches: {'broad_20k': 7, 'broad_24k': 0, 'retrieval_scoped_12k': 0}
- cases evidence complete: 7 / 7
- protected overflow cases: 0
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20

### 2x

- mean broad estimated before: 24047.71
- mean broad input entities: 123.43
- adaptive branches: {'broad_20k': 0, 'broad_24k': 5, 'retrieval_scoped_12k': 2}
- cases evidence complete: 7 / 7
- protected overflow cases: 0
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20

### 4x

- mean broad estimated before: 39664.00
- mean broad input entities: 231.14
- adaptive branches: {'broad_20k': 0, 'broad_24k': 0, 'retrieval_scoped_12k': 7}
- cases evidence complete: 7 / 7
- protected overflow cases: 0
- mean semantic retained: 8.00 / 8
- mean recent retained: 20.00 / 20

## Contract

- contract pass: PASS
- failures: 0

No production adaptive policy is authorized by this diagnostic.
