# ASTRA BLIND REVIEW — EVAL-01M

## State

**BLIND REVIEW COMPLETE. CONDITION REVEAL NOT INSPECTED.**

Reviewed only:
- reviewer-blind.json
- review-rubric.md
- public execution metadata needed to confirm the sealed capture

Not inspected:
- .eval-private/eval01m-private.json
- condition-key.json
- condition-labelled raw generations
- prompt/context hashes
- packing audit
- condition-labelled latency
- reveal artifacts

No attempt was made to infer which hidden label is control or candidate.

## Compact scoring notation

Tuple order:

`C/T/A/F/U/K`

Where:
- C = canonical/source-status correctness
- T = chronology/causality
- A = ambiguity handling
- F = future leakage
- U = unsupported claim
- K = completeness

Codes:
- `P` = PASS
- `p` = PARTIAL
- `F` = FAIL
- leakage/unsupported: `0` = none, `1` = present

Each line freezes X score, Y score, blind preference, and the material reason.

## NORMAL — 21 pairs

```text
rq-0011 r1  X p/p/p/0/0/p  Y P/P/P/0/0/P  -> Y    X leaves ch27/ch32 origin unresolved
rq-0011 r2  X P/P/P/0/0/P  Y p/p/p/0/0/p  -> X    Y leaves exact origin unresolved
rq-0011 r3  X P/P/P/0/0/P  Y p/p/p/0/0/p  -> X    Y overstates chronological uncertainty

rq-0023 r1  X F/p/P/0/0/F  Y P/P/P/0/0/P  -> Y    X omits earliest ch40 destruction
rq-0023 r2  X F/p/P/0/0/F  Y P/p/P/0/0/P  -> Y    X omits ch40; Y has slight ch38 chronology noise
rq-0023 r3  X P/P/P/0/0/P  Y F/p/P/0/0/F  -> X    Y omits ch40

rq-0025 r1  X P/P/P/0/0/P  Y p/p/P/0/0/p  -> X    X preserves 45/47/49 structure more clearly
rq-0025 r2  X p/P/P/0/0/p  Y P/P/P/0/0/P  -> Y    Y explicitly preserves 45 -> 47 -> 49
rq-0025 r3  X P/P/P/0/0/P  Y p/p/P/0/0/p  -> X    Y does not clearly identify ch45 as earliest

rq-0020 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve competing claims
rq-0020 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material rubric difference
rq-0020 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material rubric difference

rq-0032 r1  X F/F/p/0/0/F  Y P/P/P/0/0/P  -> Y    X loses discovery/motive evidence
rq-0032 r2  X F/F/p/0/0/F  Y P/P/P/0/0/P  -> Y    X claims relevant evidence is absent
rq-0032 r3  X F/F/p/0/0/F  Y P/P/P/0/0/P  -> Y    X is vague and misses supersession

rq-0038 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve missing physical identity
rq-0038 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material difference
rq-0038 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material difference

rq-0010 r1  X P/P/P/0/0/p  Y P/P/P/0/0/p  -> TIE  both preserve 31-before-33; both omit early rescue/contact
rq-0010 r2  X P/P/P/0/0/p  Y P/P/P/0/0/p  -> TIE  same causal ordering and same completeness gap
rq-0010 r3  X P/P/P/0/0/p  Y P/P/P/0/0/p  -> TIE  same causal ordering and same completeness gap
```

NORMAL blind preference tally:

```text
X    5
Y    7
TIE  9
```

Blind interpretation:
- many normal pairs are ties or modest differences;
- strong differences concentrate in known chronology/source-status cases;
- negative control shows no meaningful X/Y split;
- no future leakage observed;
- no clear unsupported-claim pattern observed.

## STRESS_RESILIENCE — 15 pairs

```text
rq-0023 r1  X P/P/P/0/0/P  Y F/F/F/0/1/F  -> X    Y substitutes incompatible ch34 and drops 40/42/45
rq-0023 r2  X P/P/P/0/0/P  Y F/F/F/0/1/F  -> X    same severe chronology/evidence loss
rq-0023 r3  X F/F/F/0/1/F  Y P/P/P/0/0/P  -> Y    severe failure swaps blind label

rq-0025 r1  X P/P/P/0/0/P  Y F/F/P/0/0/F  -> X    Y loses specific 45/47/49 history
rq-0025 r2  X P/P/P/0/0/P  Y F/F/P/0/0/F  -> X    Y collapses to generic uncertainty
rq-0025 r3  X P/P/P/0/0/P  Y F/F/P/0/0/F  -> X    Y again drops burial/repeat evidence

rq-0020 r1  X P/P/P/0/0/P  Y P/P/P/0/0/p  -> X    X retains concrete competing claims
rq-0020 r2  X p/P/P/0/1/F  Y P/P/P/0/0/P  -> Y    X drifts to unrelated memory details
rq-0020 r3  X P/P/P/0/0/p  Y P/P/P/0/0/P  -> Y    Y retains concrete claims; X too generic

rq-0032 r1  X F/F/p/0/0/F  Y P/P/P/0/0/P  -> Y    X loses discovery/motive evidence
rq-0032 r2  X F/F/p/0/0/F  Y P/P/P/0/1/P  -> Y    Y is substantively correct but adds unsupported 'malice'
rq-0032 r3  X P/P/P/0/0/P  Y F/F/p/0/0/F  -> X    severe evidence-loss failure swaps blind label

rq-0038 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  physical-identity boundary preserved
rq-0038 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material difference
rq-0038 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  no material difference
```

STRESS_RESILIENCE blind preference tally:

```text
X    7
Y    5
TIE  3
```

Blind interpretation:
- stress produces much larger within-pair quality separation than NORMAL;
- failures are evidence-retention failures, not stylistic preferences;
- missing evidence includes the Pillar 40/42/45 history, cavalry 45/47/49 history, Alistair discovery/motive, and concrete old-battle claims;
- severe failure is not permanently attached to X or Y because hidden assignment changes per row/repeat;
- seed physical-identity negative case remains stable;
- no future leakage observed.

## Frozen blind result

Across all 36 blind pairs:

```text
X preferences    12
Y preferences    12
TIE              12
```

The 12/12/12 balance is **not** a condition result because X/Y is randomized per row/repeat.

The substantive blind finding is:

```text
NORMAL
  mostly preservation/ties with discriminating chronology/source-status cases

STRESS_RESILIENCE
  large evidence-retention failures on one side of many pairs
  failure label alternates under sealed random assignment
  physical-identity negative case remains stable
```

## Integrity statement

At freeze time:

```text
condition mapping inspected             NO
private state inspected                 NO
condition-labelled raw output inspected NO
packing audit inspected                 NO
condition-labelled latency inspected    NO
condition identity inferred             NO
```

## Reveal authorization

After this review is committed to main, Gemini/Antigravity may run **reveal only** from the same local workspace containing:

`.eval-private/eval01m-private.json`

Reveal must:
1. make zero provider calls;
2. verify the private-state SHA256 against the public sealed commitment;
3. materialize condition-key.json, raw-generations.json, prompt-diff-audit.json, latency-cost.json, reveal-verification.json;
4. commit those reveal artifacts and a concise handoff;
5. not declare a winner.

After reveal, Astra maps these frozen X/Y judgments to real conditions and performs the final EVAL-01M interpretation.

Production policy remains unchanged.
P8-05 remains blocked.
