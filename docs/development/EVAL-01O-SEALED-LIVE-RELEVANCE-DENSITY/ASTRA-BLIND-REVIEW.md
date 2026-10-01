# ASTRA BLIND REVIEW — EVAL-01O

## State

**BLIND REVIEW COMPLETE. CONDITION REVEAL NOT INSPECTED.**

Reviewed only:
- reviewer-blind.json
- review-rubric.md
- public execution metadata needed to confirm the sealed capture

Not inspected:
- .eval-private/eval01o-private.json
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

## LIVE SET — 21 pairs (7 cases x 3 repeats)

```text
rq-0011 r1  X p/p/p/0/0/p  Y P/P/P/0/0/P  -> Y    X omits ch27 anchor and ch32 ambiguity resolution
rq-0011 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve ch27 origin and address ch32 ambiguity cleanly
rq-0011 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve ch27 origin and address ch32 ambiguity cleanly

rq-0023 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve 40 -> 42 -> 45 sequence without merging
rq-0023 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve 40 -> 42 -> 45 sequence without merging
rq-0023 r3  X P/P/P/0/0/P  Y P/P/P/0/0/p  -> X    Y compresses ch42 and ch45 into generic summary; X preserves full detail

rq-0025 r1  X P/p/P/0/0/p  Y P/P/P/0/0/P  -> Y    Y captures 45, 47, and 49 conflict triad; X omits ch47 burial
rq-0025 r2  X P/p/P/0/0/p  Y P/P/P/0/0/P  -> Y    Y explicitly preserves 45 -> 47 -> 49 chronology; X omits ch47
rq-0025 r3  X P/P/P/0/0/P  Y P/p/P/0/0/p  -> X    X preserves relative chronological ordering between the two burials; Y is unanchored

rq-0020 r1  X P/P/P/0/0/P  Y p/P/P/0/1/p  -> X    Y conflates Garrick with Gargas; X attributes factions correctly
rq-0020 r2  X p/P/P/0/1/p  Y P/P/P/0/0/P  -> Y    X conflates Garrick with Gargas; Y attributes factions correctly
rq-0020 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both correctly attribute factions and separate claims from facts

rq-0032 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both capture supersession and ecological collapse/sacrifice motive
rq-0032 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both capture supersession and ecological collapse/sacrifice motive
rq-0032 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both capture supersession and ecological collapse/sacrifice motive

rq-0038 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve lack of physical identity link between seed caches
rq-0038 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve lack of physical identity link between seed caches
rq-0038 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve lack of physical identity link between seed caches

rq-0010 r1  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve ch31 alliance strictly before ch33 battlefield victory
rq-0010 r2  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve ch31 alliance strictly before ch33 battlefield victory
rq-0010 r3  X P/P/P/0/0/P  Y P/P/P/0/0/P  -> TIE  both preserve ch31 alliance strictly before ch33 battlefield victory
```

## Blind preference tally

```text
X    3
Y    4
TIE 14
TOTAL 21
```

## Substantive blind findings

1. **High baseline stability (14/21 TIEs)**:
   - Negative control (`core_gold:rq-0010`) is 3/3 clean ties, preserving the strict 31-before-33 causal ordering across all repeats.
   - Negative identity control (`core_gold:rq-0038`) is 3/3 clean ties, strictly maintaining that physical identity between evacuated seeds and red-maple seeds is unestablished.
   - Source-status supersession (`challenge:rq-0032`) is 3/3 clean ties, preserving the transition from early reported divinity interpretations to later established ecological sacrifice motive.

2. **Primary regression focus (`challenge:rq-0025`)**:
   - In all 3 repeats, one side demonstrates clear superiority over the other in preserving the conflicting multi-chapter cavalry sequence (ch45 landslide burial vs ch47 rock-collapse burial vs ch49 deployment).
   - In r1 and r2, Output Y is preferred because Output X drops the chapter-47 repeat burial. Repeat 2 Output Y is a flawless preservation of the 45 -> 47 -> 49 sequence.
   - In r3, Output X is preferred because it maintains relative chronological ordering between the two burial events while Output Y presents an unanchored list.

3. **Faction attribution symmetry (`challenge:rq-0020`)**:
   - In r1, Output Y conflates Garrick with Gargas (attributing the accusation of abandoning Demon cavalry to Garrick).
   - In r2, Output X exhibits the exact reciprocal conflation error.
   - This symmetry directly confirms that attribution errors alternate across the sealed randomized assignment rather than being fixed to label X or Y.

4. **Safety and integrity**:
   - Zero future chapter leakage across all 42 outputs (F = 0 for 42/42).
   - No systematic unsupported claims beyond the symmetric character-claim conflation in rq-0020.

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

After this review is committed, Gemini/Antigravity may run **reveal only** from the same local workspace containing:

`.eval-private/eval01o-private.json`

Reveal must:
1. Make zero provider calls.
2. Verify the private-state SHA256 against the public sealed commitment (`e6a5e847a5a80b63f785125d46886a63c303877f69d02547ba8a24bc772e986b`).
3. Materialize `condition-key.json`, `raw-generations.json`, `prompt-diff-audit.json`, `latency-cost.json`, and `reveal-verification.json` under `docs/development/EVAL-01O-SEALED-LIVE-RELEVANCE-DENSITY/`.
4. Commit those reveal artifacts and update `promt.md`.
5. Not declare control/candidate winner.

After reveal, Astra maps these frozen X/Y judgments to actual conditions for the final EVAL-01O interpretation.

Production policy remains unchanged.
P8-05 remains BLOCKED.
