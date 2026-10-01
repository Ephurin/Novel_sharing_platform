# ASTRA BLIND REVIEW — EVAL-01O Sealed Live Relevance-Density Micro-Validation

## Review state

**BLIND REVIEW COMPLETE — CONDITION REVEAL NOT INSPECTED.**

Reviewed only:

- `reviewer-blind.json`
- `review-rubric.md`
- public capture metadata needed to confirm protocol integrity

Not inspected:

- `.eval-private/eval01o-private.json`
- `condition-key.json`
- condition-labelled raw generations
- prompt/context hashes
- packing audit
- condition-labelled latency
- reveal artifacts

No attempt was made to infer which hidden label is `broad_20k_current` or `balanced_scope_first_min_tier`.

## Scoring notation

Tuple:

`C/T/A/F/U/K`

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

Blind preference is `X`, `Y`, or `TIE`. It is not a condition verdict until reveal.

## Frozen judgments — 21 pairs

```text
core_gold:rq-0011 r1
  X p/P/P/0/0/p
  Y P/P/P/0/0/P
  -> Y
  X states the correct forging facts but omits the required chapter-27 anchor
  and does not preserve the chapter-32 conflicting account.

core_gold:rq-0011 r2
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both establish chapter 27 and keep chapter 32 as later ambiguity.

core_gold:rq-0011 r3
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both satisfy the source-status requirement.

challenge:rq-0023 r1
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both preserve chapter 40 followed by conflicting chapter-42 and chapter-45 accounts.

challenge:rq-0023 r2
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both retain the required 40/42/45 sequence and do not reconcile it away.

challenge:rq-0023 r3
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both identify the repeated/conflicting destruction history.

challenge:rq-0025 r1
  X p/p/P/0/0/p
  Y p/p/P/0/0/p
  -> Y
  X omits the chapter-47 repeated burial entirely.
  Y at least preserves the presence of conflicting states around chapters 45, 47 and 49,
  although it does not cleanly state 45 as earliest and 47 as the repeat.

challenge:rq-0025 r2
  X p/p/P/0/0/p
  Y P/P/P/0/0/P
  -> Y
  X preserves chapter 45 and chapter 49 but drops chapter 47.
  Y explicitly preserves chapter 45 -> chapter 47 -> incompatible chapter 49 continuation.

challenge:rq-0025 r3
  X p/p/P/0/0/p
  Y p/p/P/0/0/p
  -> X
  Neither gives the required chapter numbers cleanly.
  X nevertheless preserves an earlier burial, a later narrow-valley burial,
  and continued deployment in a more ordered relationship; Y leaves exact timing more diffuse.

challenge:rq-0020 r1
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both keep responsibility as competing character claims rather than settled history.

challenge:rq-0020 r2
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both preserve the unresolved attribution boundary.

challenge:rq-0020 r3
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both distinguish grievances/claims from objective ground truth.

challenge:rq-0032 r1
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both separate the earlier divinity/break-enclosure interpretation
  from later artificial-sky/ecological-crisis and sacrifice evidence.

challenge:rq-0032 r2
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  No material rubric difference.

challenge:rq-0032 r3
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both preserve source-status supersession.

core_gold:rq-0038 r1
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both correctly refuse to infer physical seed-cache identity.

core_gold:rq-0038 r2
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  Both preserve the provenance gap.

core_gold:rq-0038 r3
  X P/P/P/0/0/P
  Y P/P/P/0/0/P
  -> TIE
  No material rubric difference.

core_gold:rq-0010 r1
  X P/P/P/0/0/p
  Y P/P/P/0/0/p
  -> TIE
  Both preserve chapter 31 before chapter 33 but omit the earlier rescue/contact stage.

core_gold:rq-0010 r2
  X P/P/P/0/0/p
  Y P/P/P/0/0/p
  -> TIE
  Same causal order and same completeness limitation.

core_gold:rq-0010 r3
  X P/P/P/0/0/p
  Y P/P/P/0/0/p
  -> TIE
  Same causal order and same omission of the earlier rescue/contact stage.
```

## Blind preference tally

```text
X       1
Y       3
TIE    17
TOTAL  21
```

## Primary regression case — rq-0025

Frozen blind result:

```text
X       1
Y       2
TIE     0
```

The important pre-reveal finding is not the hidden label count itself.

The substantive finding is:

- one side cleanly recovers the full 45 -> 47 -> 49 chronology in repeat 2;
- repeat 1 still leaves both outputs partial, but Y preserves more of the three-point history;
- repeat 3 remains partial on both sides, with X marginally better ordered;
- neither hidden condition produces a consistent 3/3 collapse like the broad@20k regression observed in EVAL-01M.

This suggests the prior failure may be reduced, but condition identity must remain sealed until reveal.

## Regression guard across other cases

Outside `rq-0025`:

```text
X preferences     0
Y preferences     1
TIE              17
```

The one non-tie is `rq-0011 r1`, where Y preserves the explicit chapter-27/source-status anchor and X omits it.

No broad pattern of new quality degradation is visible blind.

Stability cases remain stable:

```text
rq-0020 old-battle attribution    3 / 3 ties
rq-0032 Alistair supersession     3 / 3 ties
rq-0038 physical identity         3 / 3 ties
rq-0010 causal-history control    3 / 3 ties
```

No future leakage was observed.

No systematic unsupported-claim pattern was observed.

## Blind interpretation

Compared with EVAL-01M, EVAL-01O has substantially less X/Y quality separation.

That is expected under the stronger isolation contract:

```text
semantic IDs     identical
recent IDs       identical
world-rule IDs   identical
only entity/state breadth and budget differ
```

The dense-context hypothesis therefore reaches reveal with:

```text
known regression     no longer showing a blind 0-3 collapse
other cases          overwhelmingly stable
negative controls    stable
condition identity   still sealed
```

This is promising but not yet a condition-level conclusion.

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

After this file is committed to `main`, Gemini/Antigravity may run **reveal only** from the same local workspace containing:

`.eval-private/eval01o-private.json`

Reveal must:

1. make zero provider calls;
2. verify the private-state SHA256 against the public sealed commitment;
3. materialize `condition-key.json`, `raw-generations.json`, `prompt-diff-audit.json`, `latency-cost.json`, and `reveal-verification.json`;
4. commit those reveal artifacts and an execution-only handoff;
5. not declare a winner.

After reveal, Astra will map these frozen X/Y judgments to actual conditions and issue the final EVAL-01O interpretation.

Production policy remains unchanged.

P8-05 remains blocked.
