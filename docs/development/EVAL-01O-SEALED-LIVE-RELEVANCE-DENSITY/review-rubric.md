# EVAL-01O Blind Review Rubric

Review reviewer-blind.json only.
Do not inspect condition mapping, private state, prompt hashes, packing audit, or latency before the blind review is committed.

Primary question:
Does the denser scope-first condition repair the known NORMAL cavalry regression without creating new regressions?

For each X/Y output score:
- canonical/source-status correctness: PASS | PARTIAL | FAIL
- chronology/causality: PASS | PARTIAL | FAIL
- ambiguity handling: PASS | PARTIAL | FAIL
- future leakage: NONE | PRESENT
- unsupported claim: NONE | PRESENT
- completeness: PASS | PARTIAL | FAIL

Do not reward verbosity or guess which hidden condition has more context.

Special attention: challenge:rq-0025 is the prior broad@20k regression case.

## Case criteria

### core_gold:rq-0011 - origin_without_query_leak

Must support:
- Chapter 27 is the established origin of Alan's personal Than Tinh sword.
- The chapter-32 first-forging account must not replace the chapter-27 origin.

Must avoid:
- Choosing chapter 32 as the canonical origin.
- Silently merging the two first-forging accounts as one event.

### challenge:rq-0023 - repeated_event_history

Must support:
- Chapter 40 is the earliest on-page destruction of Pressure Pillar No. 2.
- Chapters 42 and 45 are later conflicting/repeated destruction accounts.

Must avoid:
- Treating chapter 42 or 45 as the first destruction.
- Pretending the repeated destructions are a clean single chronology.

### challenge:rq-0025 - repeated_force_state

Must support:
- Chapter 45 is the earliest on-page burial of the three-thousand cavalry in this sequence.
- Chapter 47 repeats the burial and later memories show incompatible force-state continuation.

Must avoid:
- Calling chapter 47 the first burial.
- Silently treating all cavalry-state memories as a clean progression.

### challenge:rq-0020 - conflicting_attributed_history

Must support:
- The source contains competing character accounts of the old battle.
- Responsibility is not established as one uncontested canonical fact by the supplied evidence.

Must avoid:
- Promoting either side's accusation to settled history.

### challenge:rq-0032 - source_status_supersession

Must support:
- Later evidence establishes the artificial sky/ecological crisis.
- Later evidence establishes Alistair's extreme utilitarian sacrifice motive.
- The earlier divine-ascent interpretation remains an earlier reported interpretation, not a later confirmed fact.

Must avoid:
- Promoting becoming-divine language to canonical motive.

### core_gold:rq-0038 - physical_identity_provenance

Must support:
- The evidence does not establish that the chapter-17 reserve seeds and later red-maple seeds are the same physical cache.
- Thematic continuity may be noted without inventing physical identity.

Must avoid:
- Claiming the later seeds are definitely the same physical seeds evacuated in chapter 17.

### core_gold:rq-0010 - negative_control_causal_history

Must support:
- Trust develops across rescue/contact, alliance formation, and later battlefield cooperation.
- The chapter-31 alliance/commitment precedes the chapter-33 battlefield payoff.

Must avoid:
- Claiming the chapter-33 victory caused an already-earlier chapter-31 commitment.

