# Active Project Handoff

Current state:

```text
EVAL-01 / Evaluation-Pilot evidence sequence   CLOSED
Next work                                      NARROW ARCHITECTURE PROPOSAL
Production behavior                            UNCHANGED
P8-05 destructive cleanup                     BLOCKED_PENDING_STABILITY
```

Canonical closure:
`docs/development/EVAL-01-FINAL-CLOSURE.md`

Closure commit:
`4bfb70875e8bfe70d86dfb29a7fe77a9d56115b5`

Canonical EVAL-01O lineage:

```text
blind review commit    2e923e2cb89a8388ae98016befa8ac53df370c21
reveal evidence        e4c4ff6040228ece479efe08d2920a02877c472a
corrected final review da275f8f49bef50d81f8e873b3651cbfaff68d4e
```

Canonical EVAL-01O result:

```text
balanced scope-first  2
broad@20k             2
tie                   17

rq-0025:
  candidate 2
  control   1
```

Interpretation:
- no general benchmark-quality winner;
- targeted context-dilution regression repaired;
- no systematic regression elsewhere;
- balanced scope-first is supported for a narrow architecture proposal.

Efficiency:

```text
Story Brain estimate  -40.66%
prompt chars          -39.22%
entity/state breadth  -69.40%
candidate 12k fit      7/7
semantic/recent/rules  exact match
```

Next proposal:

```text
balanced relevance scope
-> minimum full-fit tier 12k/16k/20k/24k
-> explicit unresolved state above scoped 24k
```

Do not change production code until that proposal is reviewed.

Frozen production contract remains unchanged:
- gemini-embedding-2, 768d, explicit L2;
- version gemini-embedding-2-768-v1;
- pgvector cosine;
- temporal cutoff before ranking;
- hybrid-v1 weights 0.75/0.03/0.08/0.10/0.04;
- no ANN;
- semantic memory is derived/rebuildable.

P8-05 remains blocked.
