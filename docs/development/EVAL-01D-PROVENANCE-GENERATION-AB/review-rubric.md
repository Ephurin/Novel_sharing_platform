# EVAL-01D Blind Review Rubric

Review review-blind.json before opening condition-key.json.

Do not score stylistic preference. Score narrative evidence handling.

For each X/Y output record:

- canonical/earliest answer correct: PASS | PARTIAL | FAIL;
- replay/ambiguous evidence handled correctly: PASS | PARTIAL | FAIL;
- chronology/causality correct: PASS | PARTIAL | FAIL;
- future leakage: NONE | PRESENT;
- unsupported claim: NONE | PRESENT;
- answer completeness: PASS | PARTIAL | FAIL.

Record a short evidence-based reason. Do not infer the hidden condition.

## Case criteria

### core_gold:rq-0011 - replay_origin

Must support:
- Treat chapter 27 / mem-000089 as the canonical sword origin.
- Treat chapter 32 / mem-000110 as a later replay, not a replacement origin.
- May use chapters 28-29 as corroborating later use of the already-forged sword.

Must avoid:
- Calling chapter 32 the canonical first forging.
- Collapsing the two first-forging scenes without qualification.

### challenge:rq-0023 - replay_first_occurrence

Must support:
- Treat chapter 40 / mem-000149 as the first on-page destruction of Pillar No. 2.
- Treat chapter 42 / mem-000155 and chapter 45 / mem-000164 as later replay matches.
- Preserve uncertainty or ambiguity where supported.

Must avoid:
- Promoting chapter 42 or 45 above chapter 40 as the first occurrence.

### challenge:rq-0025 - replay_first_occurrence

Must support:
- Treat chapter 45 / mem-000164 as the earliest on-page burial in this sequence.
- Treat chapter 47 / mem-000172 as a later replay.
- Do not let later revived-force references redefine the first burial.

Must avoid:
- Calling chapter 47 the first burial.

### core_gold:rq-0036 - lifecycle_with_replay

Must support:
- Start the personal sword lifecycle at chapter 27 / mem-000089.
- Exclude chapter 32 / mem-000110 as a replayed first-forging scene.
- Preserve later anti-mana and combat uses including the final duel.
- Recognize chapter 60 does not melt Alan's personal sword.
- End with retirement at Gregor's memorial in chapter 61 / mem-000229.

Must avoid:
- Starting the lifecycle at chapter 32.
- Claiming the personal sword is melted into farming tools.

### core_gold:rq-0010 - negative_control_non_provenance_causality

Must support:
- Explain trust formation across rescue, proof, negotiation and joint combat.
- Keep chronology intact: resource and forge commitment precedes the chapter-33 joint-victory belief update.

Must avoid:
- Claiming the chapter-33 joint victory caused an earlier chapter-31 commitment.

