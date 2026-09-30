# EVAL-01O — Sealed Live Relevance-Density Micro-Validation

## Purpose

EVAL-01O tests the quality effect of higher relevance density after EVAL-01N showed that balanced scope-first packages preserve all semantic/recent/rule evidence while reducing Story Brain context by about 41% versus broad@20k.

No production behavior changes.

## Conditions

CONTROL:

```text
broad_20k_current
source_1x broad entity/state package
budget = 20k
```

CANDIDATE:

```text
balanced_scope_first_min_tier
entity/state scope =
  query-named entities
  + entities from semantic top-8
  + participants from newest five recent events

budget =
  minimum full-fit tier from 12k / 16k / 20k / 24k
```

## Isolation contract

Both conditions must use the exact same:

```text
query
chapter cutoff
base source package
semantic memory IDs and order
recent event IDs and order
world-rule IDs and order
author constraints
model
temperature
prompt renderer
task instruction
output max tokens
```

Only entity/current-state breadth and the resulting context budget may differ.

Gold labels may not influence scope, tier selection, X/Y mapping, or call order.

EVAL-01G..L experimental gold-derived entity locks remain removed.

## Live set

All seven source_1x cases.

```text
7 rows
2 conditions
3 repeats
42 planned calls
```

Primary regression case:

`challenge:rq-0025`

## Default runtime

```text
model               gemini-3.5-flash-lite
temperature         0.0
max output tokens   512
repeats             3
fixed key slot      one slot for whole capture
fallback model      none
inter-call delay    5 seconds
```

## Sealed protocol

### 1. Dry-run

Zero provider calls.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01o_sealed_live_relevance_density.py --stage dry-run
```

Required dry-run checks:

```text
row count                         7
planned calls                    42
routing uses gold             false
query gold used for scope     false
exact semantic IDs             true
exact recent IDs               true
exact rule IDs                 true
same system prompt             true
candidate entities subset      true
protected overflow            false
```

Expected current candidate tier distribution:

```text
12k   7
```

Any drift is a stop condition.

### 2. Capture

Run from latest merged main.

```powershell
.\.venv\Scripts\python.exe scripts/run_eval_01o_sealed_live_relevance_density.py --stage capture --key-slot 1
```

One fixed key slot for all 42 calls.

No rotation.

Public reviewer-safe evidence:

```text
docs/development/EVAL-01O-SEALED-LIVE-RELEVANCE-DENSITY/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  capture-contract.json
  sealed-state.json
  summary.md
```

Private until blind review:

```text
.eval-private/eval01o-private.json
```

Do not commit condition mapping or labelled raw outputs before Astra blind review.

### 3. Astra blind review

Astra reviews only:

```text
reviewer-blind.json
review-rubric.md
```

Primary question:

> Does one hidden condition repair the known rq-0025 chronology regression without causing new regressions elsewhere?

Freeze judgments in:

`ASTRA-BLIND-REVIEW.md`

before reveal.

### 4. Reveal

Same local workspace must still contain:

`.eval-private/eval01o-private.json`

Run:

```powershell
.\.venv\Scripts\python.exe scripts/run_eval_01o_sealed_live_relevance_density.py --stage reveal
```

Reveal must make zero provider calls and verify the sealed SHA256.

Reveal artifacts:

```text
condition-key.json
raw-generations.json
prompt-diff-audit.json
latency-cost.json
reveal-verification.json
```

### 5. Final interpretation

After reveal, Astra maps frozen blind judgments to real conditions.

Primary gate:

```text
rq-0025
  candidate should improve or eliminate the prior broad@20k 0-3 regression
```

Regression guard:

```text
other source_1x cases
  no new systematic quality regression
```

Secondary evidence:

- Story Brain estimated size;
- entity/state count;
- selected tier;
- prompt-character proxy;
- latency;
- backoff events.

Exact provider token usage/cost remains unmeasured unless exposed by the client.

## Production boundary

EVAL-01O never auto-promotes the candidate.

Production budget/routing/scoping remain unchanged.

P8-05 remains blocked.
