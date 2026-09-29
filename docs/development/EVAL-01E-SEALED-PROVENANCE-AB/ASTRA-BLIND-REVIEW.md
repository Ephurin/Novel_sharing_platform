# ASTRA Blind Review — EVAL-01E Sealed Provenance A/B

**Review status:** COMPLETE — CONDITION MAPPING NOT REVEALED  
**Blind protocol:** PRESERVED  
**Reviewer:** Astra / ChatGPT  
**Reviewer-visible inputs used:**

- `reviewer-blind.json`
- `review-rubric.md`
- reviewer-safe capture metadata (`runtime-config.json`, `sealed-state.json`, `neutralization-audit.json`, `summary.md`)

**Not inspected before this review:**

- `condition-key.json`
- condition-labelled raw generations
- private state
- prompt/context hashes by condition
- latency by condition

The X/Y judgments below are frozen before reveal.

## Scoring convention

Overall:

- **PASS** — satisfies the case's required evidence handling with no material rubric violation.
- **PARTIAL** — broadly correct but omits a required distinction/history step or leaves an important ambiguity unresolved.
- **FAIL** — promotes prohibited evidence, introduces a material unsupported claim, breaks chronology/causality, or otherwise misses the required answer.

Across all reviewed outputs:

- future leakage: **NONE**
- material unsupported claim: **NONE observed**

## Frozen pair-level judgments

| Case | Repeat | X | Y | Blind reason |
|---|---:|---|---|---|
| core_gold:rq-0011 | 1 | PARTIAL | PARTIAL | Both describe the forging but neither identifies chapter 27 as the established origin or explicitly prevents the chapter-32 account from replacing it. X additionally localizes the forge in a way that does not resolve the conflicting origin accounts. |
| core_gold:rq-0011 | 2 | PARTIAL | PASS | X gives the forging facts but not the chapter-27/chapter-32 distinction. Y explicitly anchors chapter 27 as the first forging and treats chapter 32 as later evidence. |
| core_gold:rq-0011 | 3 | PARTIAL | PARTIAL | Both state the forging process but omit the required origin-vs-later-account distinction. |
| challenge:rq-0023 | 1 | PASS | PASS | Both preserve chapter 40 as the first specific No. 2 disablement in the chronology and retain chapter 42/45 as later conflicting destruction accounts. |
| challenge:rq-0023 | 2 | PASS | PASS | Both preserve the repeated/conflicting destruction history without forcing one reconciled timeline. |
| challenge:rq-0023 | 3 | PASS | PASS | Both preserve chapter order and explicitly keep the later destruction scenes separate. |
| challenge:rq-0025 | 1 | PASS | PASS | Both preserve chapter 45 burial, chapter 47 repeated burial/remnant state, and chapter 49 incompatible continuation. |
| challenge:rq-0025 | 2 | PASS | PASS | Both preserve the burial-before-later-intact-force contradiction without silently reconciling it. |
| challenge:rq-0025 | 3 | PASS | PARTIAL | X preserves chapter 45 → 47 → 49 chronology. Y correctly identifies incompatible fates but compresses the dated sequence and does not clearly anchor chapter 45 as the earliest burial. |
| challenge:rq-0020 | 1 | PASS | PASS | Both separate competing Garrick/Gargas/Valora claims from established historical fact and preserve uncertainty. |
| challenge:rq-0020 | 2 | PASS | PASS | Both avoid promoting either faction's accusation to canonical history. |
| challenge:rq-0020 | 3 | PASS | PASS | Both explicitly preserve conflicting testimony and unresolved responsibility. |
| challenge:rq-0032 | 1 | PASS | PASS | Both separate the earlier divine/break-the-enclosure interpretation from later established artificial-sky/ecological-crisis evidence and survival motive. |
| challenge:rq-0032 | 2 | PASS | PASS | Both correctly treat the earlier interpretation as superseded source-status evidence rather than canonical motive. |
| challenge:rq-0032 | 3 | PASS | PASS | Both preserve the earlier-report/later-established distinction and the utilitarian survival motive. |
| core_gold:rq-0038 | 1 | PASS | PASS | Both refuse to infer physical identity between the chapter-17 reserve seed cache and chapter-61 red-maple seeds. |
| core_gold:rq-0038 | 2 | PASS | PASS | Both preserve thematic/chronological continuity without inventing identity continuity. |
| core_gold:rq-0038 | 3 | PASS | PASS | Both explicitly state that identical physical provenance is not established. |
| core_gold:rq-0010 | 1 | PARTIAL | PARTIAL | Both preserve alliance-before-battle chronology and avoid the prior causal inversion, but omit the earlier rescue/contact/proof stages required by the rubric's broader trust-history criterion. |
| core_gold:rq-0010 | 2 | PARTIAL | PARTIAL | Both correctly order chapter 31 before chapter 33 but still compress trust formation to alliance + battlefield validation. |
| core_gold:rq-0010 | 3 | PARTIAL | PARTIAL | Both preserve chronology and avoid reverse causality, but do not cover the full rescue/contact → alliance → battlefield progression. |

## Aggregate blind result

```text
X:
PASS      15 / 21
PARTIAL    6 / 21
FAIL       0 / 21

Y:
PASS      15 / 21
PARTIAL    6 / 21
FAIL       0 / 21
```

Exact aggregate quality is therefore tied before condition reveal.

## Case-level pattern before reveal

### core_gold:rq-0011 — origin

```text
X  0 PASS / 3 PARTIAL
Y  1 PASS / 2 PARTIAL
```

The hard part is not remembering how the sword was forged. It is explicitly distinguishing the chapter-27 established origin from the chapter-32 competing first-forging account.

### challenge:rq-0023 — repeated Pillar destruction

```text
X  3 PASS
Y  3 PASS
```

Both labels consistently preserve the conflicting sequence instead of collapsing it.

### challenge:rq-0025 — cavalry force state

```text
X  3 PASS
Y  2 PASS / 1 PARTIAL
```

Both labels recognize the conflict. One Y output compresses the chronology enough to lose the rubric's earliest-burial anchor.

### challenge:rq-0020 — conflicting attributed history

```text
X  3 PASS
Y  3 PASS
```

Both labels reliably distinguish character claims from established history.

### challenge:rq-0032 — source-status supersession

```text
X  3 PASS
Y  3 PASS
```

Both labels reliably distinguish earlier interpretation from later established evidence.

### core_gold:rq-0038 — physical identity provenance

```text
X  3 PASS
Y  3 PASS
```

Both labels avoid inventing physical identity.

### core_gold:rq-0010 — negative control

```text
X  0 PASS / 3 PARTIAL
Y  0 PASS / 3 PARTIAL
```

Both labels fix the earlier chapter-31/chapter-33 causal inversion but still fail to reconstruct the broader trust-development chain required by the rubric.

## Blind conclusions

Before condition reveal, the evidence supports only these condition-agnostic conclusions:

1. The neutralized evidence view is still sufficient for the model to handle most explicit conflict/ambiguity cases well.
2. The hardest remaining provenance-sensitive case is `rq-0011`: many outputs know the forging facts but fail to state which competing origin account is established.
3. Conflict preservation (`rq-0023`, `rq-0025`, `rq-0020`) is generally stronger than canonical-origin selection.
4. Physical-identity restraint (`rq-0038`) is robust in both labels.
5. Source-status supersession (`rq-0032`) is robust in both labels.
6. The negative control confirms that provenance/context metadata alone is not enough to recover a missing broader causal-history chain: all six outputs remain PARTIAL.
7. No X/Y winner can be stated before reveal, and the aggregate blind result is exactly tied.

## Reveal gate

The blind review is now frozen.

Gemini may run the zero-provider-call reveal stage **only after this file is committed**:

`python scripts/run_eval_01e_sealed_provenance_ab.py --stage reveal`

Reveal must:

1. verify local private-state SHA256 against the public sealed commitment:
   `09aaa4415a6f717f49be5b67847f83b5d743aed36da3d690ecee4042100a4c7c`;
2. make zero provider calls;
3. commit the condition key and raw audit artifacts;
4. not modify this blind review.

After reveal, Astra will map these frozen X/Y judgments to pre/post provenance and issue the final EVAL-01E interpretation.
