# EVAL-01G — Full 12k Context Pressure Reconstruction

Status: OFFLINE DIAGNOSTIC
Provider calls: 0
Production code change: NONE
Frozen corpus mutation: NONE

## Goal

Measure provenance behavior inside a production-shaped 12k WritingContextPackage where all ContextBudgetPacker layers compete together:

- locked world rules;
- author constraints;
- entities;
- current states;
- recent events;
- semantic memories.

This closes the largest limitation left by EVAL-01F.

## Fixture claim

The fixture is:

SOURCE-GROUNDED + PRODUCTION-SHAPED

It is not claimed to be a literal PostgreSQL runtime snapshot.

### Entities

Source:

.data/Batch_7/entities.json

Use all entities whose first_chapter is at or before the query cutoff.

Output fields mirror PostgresNarrativeRepository:

- entity_id
- name
- entity_type
- status
- location
- is_locked

status/location are structural Unknown placeholders because Batch_7 does not contain canonical current-state columns in the same shape.

### Current states

For each included entity, use a compact pointer to the latest canonical Frozen_v1 memory containing that entity at or before cutoff:

- source_memory_id
- chapter_number
- memory_type
- review_status
- tags

This is a source-grounded context-state proxy, not a claim that the memory summary is a complete canonical CurrentEntityStateRecord.

### World rules

Source:

Frozen_v1 canonical memories tagged world_rule.

Stress lock policy:

high_confidence + importance >= 0.95 -> is_locked=true

This lock marker is an experimental packer policy, not story truth.

### Locked entities

Entities referenced by the case-specific critical memories are marked is_locked=true.

Again, this is a stress-policy marker only.

### Recent events

Use the latest 20 canonical event_summary memories at or before cutoff, excluding the preserved semantic top-20 candidate IDs.

This avoids artificial duplicate evidence across recent-event and semantic lanes.

### Semantic memories

Use the accepted EVAL-01 preserved hybrid top-20 with the EVAL-01E neutralized content view.

Conditions:

- pre_provenance
- full_provenance
- compact_provenance

### Author constraints

Fixed evaluation constraints:

- use only supplied story evidence;
- preserve chronology and unresolved uncertainty;
- do not invent identity, causality, or source status.

These are evaluation constraints, not story facts.

## Budgets

Primary:

12000

Sensitivity:

10000
8000

The 12k result is the main production-shaped pressure result.

## Required measurements

For every case / condition / budget:

- tokens before pack;
- tokens used;
- budget overflow;
- protected overflow;
- deterministic packed hash;
- input/selected counts by layer;
- dropped counts by layer;
- locked entity retention;
- locked entity-state retention;
- locked rule retention;
- author constraint retention;
- semantic positive retention;
- semantic critical/contrast retention.

## Contract

PASS requires:

1. deterministic packing for every run;
2. all locked entities retained;
3. all locked entity states retained;
4. all locked rules retained;
5. author constraints retained;
6. no protected overflow;
7. at 12k compact selected semantic count >= full;
8. at 12k compact positive retention >= full;
9. at 12k compact critical retention >= full.

A PASS does not authorize a production prompt change.

## Run

No API key required.

```powershell
git switch main
git pull origin main

.\.venv\Scripts\python.exe scripts/check_p8_cleanup_readiness.py
.\.venv\Scripts\python.exe scripts/check_p8_final_cleanup_gate.py --expect-blocked
.\.venv\Scripts\python.exe scripts/check_eval01_fixture_contract.py
.\.venv\Scripts\python.exe scripts/run_eval_01g_full_context_pressure.py
```

Evidence:

```text
docs/development/EVAL-01G-FULL-CONTEXT-PRESSURE/
  diagnostic.json
  summary.md
```

Gemini/Antigravity commits evidence only.

Do not start a live compact-provenance generation run until Astra reviews EVAL-01G.
