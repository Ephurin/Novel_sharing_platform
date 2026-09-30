# EVAL-01F — Compact Provenance + Residual Semantic Budget

Status: OFFLINE DIAGNOSTIC
Provider calls: 0
Production code change: NONE
Frozen corpus mutation: NONE

## Questions

1. Can provenance be represented more compactly than the full EVAL-01E metadata while retaining the source-status signals that matter for generation?
2. Under deterministic semantic-memory budget pressure, does verbose provenance cause positive or contrast evidence to be dropped earlier than compact provenance?

## Conditions

### pre_provenance

Pre-EVAL-01C metadata projection:

- event_type
- chapter_number
- source_type
- importance_score

### full_provenance

The verbose EVAL-01E representation:

- confirmation_status
- memory_id
- chapter_title
- tags
- status
- review_status
- supersedes_id when present

in addition to the pre-provenance fields.

### compact_provenance

Pre-provenance fields plus one concise human-readable source-status string:

```text
provenance="status=<...>|review=<...>|tags=<...>|supersedes=<...>"
```

Compact deliberately omits:

- `confirmation_status`: retrieved generation evidence is already confirmed by the accepted lifecycle gate;
- `memory_id`: already present as top-level `memory_chunk_id`;
- `chapter_title`: useful display metadata but not required for source-status/replay reasoning.

This is an experimental representation only.

## Corpus / candidates

Uses the same seven EVAL-01E cases and the same derived neutral context fixture.

For token profiles:

- top 10 preserved hybrid candidates.

For pressure sweep:

- top 20 preserved hybrid candidates;
- same order for all conditions;
- same neutralized content for all conditions.

## Residual budget model

Production context budget remains 12,000 estimated tokens.

The diagnostic sweeps:

```text
12000
6000
5000
4500
4000
3500
3000
2750
2500
2250
2000
```

Reduced values are interpreted as **residual semantic-memory budget** after hypothetical higher-priority canonical context has consumed the rest of the package.

This is intentionally narrower than full-system pressure.

Do not report the reduced-budget sweep as reconstruction of real entity/state/rule pressure.

## Evidence retention

For each case and budget measure:

- selected semantic count;
- dropped semantic count;
- candidate positive-memory count;
- positive-memory retention;
- case-specific critical/contrast evidence retention;
- smallest residual budget that retains all positive evidence;
- smallest residual budget that retains all critical evidence.

Critical evidence includes both canonical/positive and contrast/replay memories where the reasoning task requires comparing them.

## Decision checks

Compact provenance should:

1. reduce mean added provenance overhead by at least 50% relative to full provenance;
2. never retain fewer total memories than full provenance at the same budget;
3. never retain fewer positive memories than full provenance at the same budget;
4. never retain fewer critical/contrast memories than full provenance at the same budget.

The dominance checks are deterministic packing checks, not generation-quality claims.

## Interpretation boundary

A PASS would justify a later sealed live generation experiment comparing:

```text
pre_provenance
full_provenance
compact_provenance
```

on a smaller provenance-sensitive set.

A PASS does not authorize production prompt changes.

A FAIL means the compact encoding or its semantics should be revised before any additional live calls.

## Run

```bash
python scripts/check_p8_cleanup_readiness.py
python scripts/check_p8_final_cleanup_gate.py --expect-blocked
python scripts/check_eval01_fixture_contract.py
python scripts/run_eval_01f_compact_provenance_budget.py
```

Evidence:

```text
docs/development/EVAL-01F-COMPACT-PROVENANCE-BUDGET/
  diagnostic.json
  summary.md
```

Gemini/Antigravity should commit evidence only. No API key is required.
