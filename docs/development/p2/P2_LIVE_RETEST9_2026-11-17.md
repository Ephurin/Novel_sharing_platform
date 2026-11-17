# P2 live retest 9 on `main`, 2026-11-17

This short live run came after #178. It re-analysed ch. 9 again to check V1 (a repeated identity quote), V2 ("làng Thạch Khê") and V3 (repair only the invalid decisions). It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `5ae1004e` (after #178). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **14** (gateway 1,592 → 1,606; denials stayed at 16). 11 calls succeeded and 3 were transient 503s that the retry recovered. Live was turned off at the end |
| Run | ch. 9, revision `2f5ab186`, re-analysed after it had already been accepted in retest 8. **No proposal was accepted.** The 16 proposals were rejected afterwards as test data, and canon stayed at brain version 13 |

## Results

| Item | Result | Verdict |
|---|---|---|
| V1: repeated quote | One "Lôi Long" occurrence was linked to the known "Thượng cổ Lôi Long". Its quote occurs 5 times in the chapter, but was located inside that occurrence's context (`quote_start` 2986). The alias proposal was created without an error | OK, partly (see W1) |
| V2: "làng Thạch Khê" | Linked to "Thạch Khê", with no error. It went to the model rather than the automatic path, because "làng Thạch Khê" is already an approved alias and the automatic path deliberately sends aliases to the model | OK |
| V3: partial repair | `partial_repairs: kept 9, repaired 3`. Only the 3 invalid decisions went back to the model | OK |
| Known names (A) | 42 of 54 occurrences decided without the model, 1 verification batch plus 1 repair | OK |
| Repeated events | Re-analysing an accepted chapter proposed 4 events. 3 were flagged as duplicates of ch. 9 events. The 4th ("Thượng cổ Lôi Long mở ra một cánh cổng không gian…") is a new detail that was not recorded before | OK |

Calls by step (successful): discovery 2, verification 2, events 1, facts 1, world rules 1, states 4.

## New findings

| # | Severity | Finding |
|---|---|---|
| W1 | **Major** | One chapter gave the same surface two identities. The first attempt linked all 4 "Lôi Long" occurrences to "Thượng cổ Lôi Long". For 3 of them the quote ("uy áp Lôi Long") did not contain the full name, so they were sent back for repair. In the repair the model kept them as entities but dropped the link, which made a **new** entity "Lôi Long". This passes validation, because "Lôi Long" is not exactly a known name. The review would then propose a new entity "Lôi Long" next to the known dragon, plus an alias of the same surface to the known dragon. Nothing checks that one surface gets one identity within a chapter |
| W2 | Minor | An exact approved alias that belongs to a single entity ("làng Thạch Khê") still goes to the model. It is as safe as an exact canonical name and could be decided automatically |
| W3 | Note | 3 of 14 calls were transient 503s; retries absorbed them |

## Suggested fix for W1

- After verification, if one surface in a chapter is linked to a known entity at some occurrences and made a new entity at others, the new ones follow the known link. If the known link is not backed by evidence, they become `unresolved`.
- When the model links a short name to a known name that contains it ("Lôi Long" in "Thượng cổ Lôi Long"), the full name appears in the same context, and no other known name contains the short name, the context's full-name occurrence can serve as the identity quote. That avoids the repair.

## Not covered

- U2 in the live UI. It needs a request that fails.
- R4 against a real contradiction, Full auto, and Track B.
