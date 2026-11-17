# P2 live retest 8 on `main`, 2026-11-17

This short live run came after #177. It re-analysed ch. 9, which had failed in retests 6 and 7. It checks A (skip verification for exact approved names), U1 (verification failing on ch. 9), U2 and S2. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `df326e26` (after #177). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **15** (gateway 1,577 → 1,592; denials stayed at 16). 10 calls succeeded and 5 were transient 503s that the retry recovered. Live was turned off at the end |
| Novel | "Kiếm Ấn Lôi Sơn" (`e82e5640…`), ch. 9, revision `2f5ab186` |

## Results

| Item | Result | Verdict |
|---|---|---|
| Ch. 9 analysis | Completed. The entity review was ready about 35 s after the request. The author review was accepted, which produced 9 proposals (4 facts, 2 state changes, 3 events). All were accepted; brain version 12 → 13 | OK |
| A: known names | `known_name_decisions: 42` of 53 occurrences. Only 11 went to the model, in **1 batch** (it was 3 batches in retest 7). Discovery found no new identities | OK |
| U1: ch. 9 verification | Not reproduced. The provider returned five 503s during the run, each with an empty body (logged as `503 none`), and every retry succeeded. The earlier repeated failure was therefore most likely the provider's 503s on a large request. The smaller batch from A avoids it, and the new logging shows the body when there is one | OK (cause still not shown by the provider) |
| U2: Vietnamese message | Not triggered in this run, because the request did not fail | Not covered live (unit-tested) |
| S2: repeated scene event | Ch. 9's first event ("Thượng cổ Lôi Long truyền tải những ký ức…") continues ch. 8's last event ("Một đạo hư ảnh của Thượng cổ Lôi Long xuất hiện…") and does not repeat it. No duplicate warnings appeared | OK |

## The real cost of one chapter

Retest 7 only counted the steps before the author review. ai-service logs (`structured_provider_response`) give the full count:

| Step | Successful calls |
|---|---|
| `entity_discovery` | 2 (one per text chunk) |
| `entity_candidate_verification` | 2 (1 batch plus 1 repair) |
| `hitl_event_extraction` | 1 |
| `prose_fact_extraction` | 1 |
| `world_rule_extraction` | 1 |
| `hitl_state_extraction` | 3 |
| **Total** | **10**, plus 5 transient 503 retries |

So one chapter costs about 10 calls even after A. Of those, 5 come after the review: facts, world rules and states. That is the largest remaining cost.

## New findings

| # | Severity | Finding |
|---|---|---|
| V1 | **Major** | The ch. 9 dragon "Lôi Long" is a new, central character, but all 4 of its occurrences were left `unresolved` with "Evidence quote is ambiguous; include more surrounding text". The model's quote occurs more than once in the chapter, and the single repair attempt did not fix it. The test driver marked unresolved names as `not_entity`, so the dragon is still not an entity (it appears only in event text). In the Author IDE the author would have to resolve 4 occurrences by hand |
| V2 | Medium | "làng Thạch Khê" was left unresolved with "Unknown or mismatched canonical identity". The model probably linked it to the approved place "Thạch Khê", but the surface includes the common word "làng", so the identity check rejected it. A known name with a common prefix ("làng", "núi", "thành") is not handled |
| V3 | Minor | One invalid item in a batch triggers a repair of the whole batch: here 1 extra call for 11 occurrences. It is cheaper than before A, but the repair could send only the invalid items |
| V4 | Note | 5 of the 15 calls were transient 503s, a third. The free-tier provider is unstable at this time of day; retries absorbed it |

## Not covered

- U2 in the live UI. It needs a request that fails.
- R4 against a real contradiction, Full auto, and Track B.
