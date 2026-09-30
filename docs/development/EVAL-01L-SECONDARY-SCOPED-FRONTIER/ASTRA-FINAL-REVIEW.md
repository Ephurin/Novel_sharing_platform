# ASTRA FINAL REVIEW — EVAL-01L Secondary Scoped Budget Frontier

## Verdict

**VERIFIED / PASS as the final planned offline budget-architecture diagnostic.**

EVAL-01L closes the offline context-budget frontier that began with EVAL-01G. The official evidence on `main` matches the merged CI preview:

- tested commit: `ac186d686e352276f416fb8f7f797c6d0b886a3d`
- evidence commit: `b98c0a5e72b7a413f2192a3429db6c6f6a5b897b`
- provider calls: `0`
- integrity failures: `0`
- final-policy failures: `0`
- unresolved scoped packages above 24k: `0`
- protected overflow: `0`

This review authorizes the next **evaluation experiment** only. It does **not** authorize a production budget/scoping policy change.

## What the evidence establishes

The measured two-stage routing candidate is internally consistent over all 35 case×scenario traces:

```text
BROAD

broad estimated <= 20k
  -> broad@20k

20k < broad estimated <= 24k
  -> broad@24k

broad estimated > 24k
  -> retrieval scope


SCOPED

scoped estimated <= 12k
  -> scoped@12k

12k < scoped estimated <= 16k
  -> scoped@16k

16k < scoped estimated <= 20k
  -> scoped@20k

20k < scoped estimated <= 24k
  -> scoped@24k

scoped estimated > 24k
  -> unresolved / compression required
```

Routing uses estimated package size only. Gold positive/critical labels are used for evaluation, not routing.

Across the official run:

```text
broad@20k     24 traces
broad@24k      6 traces
scoped@20k     3 traces
scoped@24k     2 traces
unresolved     0 traces
```

Every final-policy trace retained complete core evidence. The `combined_4x` stress case that broke EVAL-01K's fixed `scoped@12k` fallback is fully recovered:

```text
core evidence complete   7 / 7
full input fit           7 / 7
semantic retained        8 / 8
recent retained         20 / 20
```

## Scoped frontier

Global minimum scoped budgets measured across all seven cases:

| Scenario | Core evidence complete | Full input fit | Semantic complete | Recent complete |
|---|---:|---:|---:|---:|
| source_1x | 12k | 12k | 12k | 12k |
| rules_2x | 16k | 16k | 12k | 16k |
| evidence_payload_2x | 12k | 12k | 12k | 12k |
| combined_2x | 16k | 16k | 12k | 16k |
| combined_4x | 24k | 24k | 16k | 24k |

This supports a variable scoped budget rather than the EVAL-01J/EVAL-01K fixed `scoped@12k` fallback.

## Interpretation across EVAL-01G → EVAL-01L

The experiment chain now supports the following diagnosis:

1. **EVAL-01G** showed that a production-shaped full package can starve semantic/recent evidence at 12k.
2. **EVAL-01H** localized entity/current-state breadth as a strong pressure source and showed retrieval scoping can recover evidence without rewriting `ContextBudgetPacker`.
3. **EVAL-01I** showed broad 12k is too small for the current fixture, while broad 20k and scoped 12k both close the measured source-grounded package.
4. **EVAL-01J** showed a broad→scoped adaptive concept survives entity/state breadth growth.
5. **EVAL-01K** found the clean failure mode: fixed `scoped@12k` breaks when pressure remains in world rules plus semantic/recent payloads.
6. **EVAL-01L** closes that failure by adding secondary scoped budget tiers up to 24k.

No additional offline budget-frontier experiment is justified from the current evidence.

## Important caveats

### 1. Application estimate, not exact provider tokenizer

The policy is keyed by `ContextBudgetPacker`'s deterministic estimated package size. EVAL-01L does not prove exact Gemini input-token usage or provider-side latency at each tier.

### 2. Story Brain only

These budgets cover Story Brain context. They do not include the complete outer prompt, selected manuscript text, style/instruction payload, tool framing, or output tokens.

### 3. Fixture scope

The evaluation remains a source-grounded, production-shaped Aethelgard fixture, not a literal live PostgreSQL runtime snapshot and not proof over every future novel shape.

### 4. Stress data is structural load

The multi-lane 2×/4× scenarios intentionally stress rule count and evidence payload size. Synthetic stress material is noncanonical load and must not be interpreted as new story truth.

### 5. `scoped@12k` and `scoped@16k` have zero natural final-route hits

Both tiers are independently exercised by the scoped sweep and have measured passing frontiers. However, none of the 35 final adaptive traces simultaneously had:

```text
broad > 24k
and
scoped <= 16k
```

Therefore their **budget behavior is tested**, but their **natural end-to-end routing branch coverage is zero** in this fixture. This is not a failure, but it should remain explicit.

### 6. >24k scoped remains a real unresolved state

EVAL-01L observed zero such cases. It does not prove they cannot occur in larger novels. The architecture correctly leaves that state unresolved and requiring compression or another bounded fallback rather than silently raising the ceiling forever.

## Production decision

```text
ContextBudgetPacker rewrite        NOT JUSTIFIED
fixed Story Brain 12k             NOT SUPPORTED AS UNIVERSAL POLICY
always-on 24k/32k                 NOT JUSTIFIED
two-stage adaptive candidate      SUPPORTED FOR LIVE VALIDATION
production budget change          NOT AUTHORIZED
production retrieval scoping      NOT AUTHORIZED
P8-05 destructive cleanup         BLOCKED
```

## Next gate

Proceed to **EVAL-01M — sealed live generation validation**.

EVAL-01M must answer a different question:

> Does the offline-supported adaptive context candidate improve actual LLM output quality enough to justify a production implementation slice?

The live experiment must be sealed/blind-reviewed before condition reveal and must separately report normal source-grounded behavior from synthetic stress resilience.

Recommended primary comparison:

```text
CONTROL
  current fixed broad@12k behavior

CANDIDATE
  EVAL-01L two-stage adaptive routing
```

Held constant:

```text
same query / cutoff
same source package
same retrieval order
same compact provenance
same model
same temperature
same prompt renderer
same author constraints
same output limit
```

Only the context-selection/budget policy may differ.

Success must be evaluated by blind output quality plus actual provider execution/latency evidence. Offline gold labels must never be used for adaptive routing.

## Final state

```text
EVAL-01L official evidence       VERIFIED
offline budget frontier          CLOSED
production policy                UNCHANGED
next experiment                  EVAL-01M
P8-05                            BLOCKED_PENDING_STABILITY
```
