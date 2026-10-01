# EVAL-01 — FINAL CLOSURE REVIEW

## Status

**EVAL-01 CLOSED — NARROW ARCHITECTURE PROPOSAL JUSTIFIED**

This closes the current Aethelgard evidence-first evaluation sequence. It does not authorize production rollout. P8-05 remains `BLOCKED_PENDING_STABILITY`.

## Frozen production contract retained

```text
embedding       gemini-embedding-2
dimension       768
normalization   explicit L2
version         gemini-embedding-2-768-v1
distance        cosine <=>
temporal cutoff before ranking
hybrid          hybrid-v1
ANN             none
```

Hybrid-v1 weights remain `0.75/0.03/0.08/0.10/0.04`.

## Retrieval result

Corrected runtime @10:

```text
semantic  Recall .674717  MRR .902381  nDCG .709746
hybrid    Recall .738964  MRR .906349  nDCG .731047
```

Future candidates surviving final retrieval: `0`.

Stale/wrong-version embeddings surviving: `0`.

Conclusion: runtime retrieval reproduces the accepted benchmark direction and hybrid-v1 improves measured retrieval without weakening temporal safety.

## Failure localization

The dominant bottleneck is not the embedding model or pgvector.

Evidence localized it to:

```text
CONTEXT_PACKING / RELEVANCE DENSITY
broad entity/state breadth
-> semantic/recent evidence displaced at fixed 12k
-> broad 20k restores evidence but can dilute attention
-> scope-first packaging restores density
```

Repeated/conflicting chronology and source-status interpretation remain the hardest generation cases.

## Live adaptive result — EVAL-01M

```text
NORMAL: adaptive 9 / fixed12 3 / tie 9
STRESS: adaptive 12 / fixed12 0 / tie 3
```

Adaptive context clearly improves pressure cases, but broad@20k introduced a stable NORMAL regression on `rq-0025`.

## Scope-first result — EVAL-01N

```text
broad@20k mean used        16,242  entities 69.57
retrieval scope-first       8,826  entities 15.43  (-45.55%)
balanced scope-first        9,638  entities 21.29  (-40.66%)
```

Both scope-first policies fit all 7 source_1x rows at 12k while retaining semantic 8/8, recent 20/20, all rules, required scope, deterministic packing and zero protected overflow.

Balanced scope-first was selected for live validation because it preserves recent-participant state.

## Sealed live density result — EVAL-01O

Canonical frozen blind review:

`2e923e2cb89a8388ae98016befa8ac53df370c21`

Reveal evidence:

`e4c4ff6040228ece479efe08d2920a02877c472a`

Corrected final review:

`da275f8f49bef50d81f8e873b3651cbfaff68d4e`

Canonical mapped result:

```text
balanced scope-first  2
broad@20k             2
tie                   17
```

Primary regression `rq-0025`:

```text
candidate 2 / control 1
```

Thus candidate is not a general benchmark winner; it repairs the targeted dilution regression without a systematic regression elsewhere.

Efficiency:

```text
Story Brain estimate   -40.66%
prompt chars           -39.22%
entity/state breadth   -69.40%
candidate 12k fit       7/7
semantic/recent/rules   exact match
p50 latency             -8.3%
```

## Runbook closure answers

1. Runtime semantic direction reproduced? **YES.**
2. hybrid-v1 useful without temporal harm? **YES on evaluated corpus.**
3. Weakest archetypes? **Repeated/conflicting histories, source-status supersession, multi-memory chronology.**
4. Packing preserves important memory? **Not with universal broad@12k; yes with evaluated scope-first/tiered policy.**
5. Protected artifacts lost? **Not in final source_1x candidate; stress still needs tier escalation.**
6. Future leakage? **No confirmed final-path leakage.**
7. Latency/token/cost? **Prompt -39%, Story Brain -41%, p50 -8%; exact provider billing tokens/cost unavailable.**
8. Dominant bottleneck? **CONTEXT_PACKING / RELEVANCE DENSITY.**
9. Best evidence-to-complexity improvement? **Balanced relevance scope + minimum fitting tier.**
10. Architecture change justified? **YES, narrowly.**

## Authorized next proposal

```text
balanced relevance scope:
  query-named entities
  + semantic-top8 participants
  + newest-five recent-event participants

then minimum full-fit scoped tier:
  12k / 16k / 20k / 24k

if scoped >24k:
  explicit unresolved/compression-bound state
```

Not justified: embedding change, hybrid retuning on same corpus, ANN, specialized vector DB, unlimited context growth, gold-assisted routing, or P8-05 cleanup.

## Exit

```text
EVAL-01                         CLOSED
Evaluation/Pilot evidence gate  SATISFIED FOR THIS CHANGE
next work                       NARROW ARCHITECTURE PROPOSAL
production behavior             UNCHANGED
P8-05                           BLOCKED_PENDING_STABILITY
```
