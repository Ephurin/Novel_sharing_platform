# P2 live check R4: consistency check against real contradictions, 2026-11-17

R4 is the Author IDE's "Kiểm tra mâu thuẫn" (`check_consistency`). One model call compares the saved chapter with:
- the approved world rules;
- approved story facts: places and last-seen places of characters, narrative facts and recent events.

It then returns only grounded findings, each citing a rule or fact ID and an exact quote from the chapter. Until now it had never been tested against a real contradiction. This check ran it on a clean chapter and on one with planted contradictions. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` after #185 (no code change since #183) |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **4** (gateway 1,709 → 1,713): 2 checks, plus 2 for ch. 18's background analysis up to the entity review. Live was turned off at the end |
| Call path | The same request the Author IDE sends (`POST /ai/story-brains/{novel}/author-operation`, `operation: check_consistency`) |

## Test text

Ch. 18 was written by hand (not by the model) and saved as an author snapshot. It has three paragraphs:

1. **Breaks a world rule.** Trần Vũ uses the sword seal's power nine times, and "ký ức của cậu không hề mất đi một mảnh nào". The approved rule says: "Mỗi lần dùng sức mạnh của kiếm ấn sấm sét, người cầm kiếm vĩnh viễn mất đi một ký ức."
2. **Contradicts an approved fact.** "Lam Yên vẫn đang ngồi bên bếp lửa … ở làng Thạch Khê, chưa từng một lần rời khỏi làng kể từ đầu mùa đông." Canon has her in Thiên Lôi Uyên in ch. 13–17.
3. **Control.** Mạc Độc gets up after the blow on the altar and withdraws into the floating valley. This is consistent with ch. 17.

## Results

| Case | Result | Verdict |
|---|---|---|
| Ch. 17, no planted contradiction | `rule_check: checked`, **0 findings** | OK: no false positive |
| Paragraph 1: world rule | `WORLD_RULE_VIOLATION`. It cites the memory-loss rule and quotes "Kỳ lạ thay, sau chín lần dùng sức mạnh kiếm ấn, ký ức của cậu không hề mất đi một mảnh nào", with a Vietnamese explanation | OK |
| Paragraph 2: story fact | `CANON_FACT_CONFLICT` against "Lam Yên xuất hiện gần nhất ở Thiên Lôi Uyên (chương 17)" (`last_seen`). It quotes the sentence about her sitting by the fire in Thạch Khê | OK |
| Paragraph 3: control | Not flagged | OK |
| Grounding | Every finding has an exact quote found in the chapter and a supplied rule or fact ID | OK |

The check finds both kinds of contradiction, raises no false alarm on 1,585 words of real generated prose, and costs 1 call.

## Findings

| # | Severity | Finding |
|---|---|---|
| BB1 | Minor | The Lam Yên contradiction is reported twice: once against her last-seen place, and once against the narrative fact "Lam Yên: location = Thiên Lôi Uyên". The quote and the meaning are the same. The author sees 3 findings for 2 problems. Findings with the same quote and the same subject could be merged |
| BB2 | Note | Afterwards the test ch. 18 was archived and deleted, with the owner's approval. The novel has 17 chapters again and canon is unchanged (brain version 21) |
| BB3 | Medium | **Deleting a chapter leaves its analysis behind.** After the delete, ch. 18's entity review (`55cd297f`) is still `waiting_entity_review` and still appears among the author's pending reviews. Nothing tells the AI service that the chapter is gone. An author, or an automated run, could still continue it and propose canon from a deleted chapter. **Fixed in #187.** Archiving or deleting a chapter now discards its open reviews and rejects its pending proposals, and the outbox skips such chapters. After deploying #187 to the live stack, the leftover review was closed through the new endpoint (`discarded_runs: [55cd297f…]`). No review is pending now, and canon is still at brain version 21 |
| BB4 | Note (eval tooling) | The headless test ingress (`Pipeline_test/tools/headless_http_ingress.py`) forwards only GET, POST and PATCH, so `DELETE /chapters/{id}` returned 501 through it. Through the web origin, which the real UI uses, the delete returned 200. This is not a product bug |

## Not covered

- The check runs only when the author clicks it, not in background analysis (by design: it reports to the author and never edits canon).
- Contradictions with a dead character were not tried, because no character in this novel has died.
