# P2 live long run: ch. 13–17 on `main`, 2026-11-17

This was the first multi-chapter live run after the retest series. It wrote ch. 13–17 of "Kiếm Ấn Lôi Sơn" back to back, with the same API calls as the Author IDE. After each chapter it waited for background analysis, then auto-reviewed like an author who accepts the machine's suggestions:
- names left unresolved are rejected;
- every proposal group is accepted.

It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `af2e4700` (after #183 and #184) |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **66** for 5 chapters (gateway 1,643 → 1,709; denials stayed at 16; cap 70). Live was turned off at the end |
| Words | 8,395 (1,972 + 1,616 + 1,644 + 1,578 + 1,585) |
| Canon | Brain version 16 → 21. 43 proposals accepted: 16 events, 17 facts, 5 state changes, 4 entities, 1 alias. No review, continue or accept error, and no stuck proposal |

Evidence: `evidence/longrun5-2026-11-17/` (driver events, brain growth, the five chapters).

## Cost per chapter

| Chapter | Calls | Notes |
|---|---|---|
| 13 | 20 | One writing step failed with `PROVIDER_UNAVAILABLE` and was retried |
| 14 | 11 | |
| 15 | 11 | |
| 16 | 13 | Transient 503s were retried |
| 17 | 11 | |

A clean chapter costs 11 calls: about 5 for writing and 6 for analysis. The analysis steps over the 5 chapters: discovery 11, verification 6, events 5 (plus 1 quote repair), facts and rules 5, states 5. The provider returned 10 transient failures and 3 "unavailable" errors; all were absorbed by retries.

## Pipeline checks

| Item | Result | Verdict |
|---|---|---|
| Known names | 179 of 239 occurrences were decided without the model (ch. 13: 28/47, ch. 14: 30/32, ch. 15: 45/56, ch. 16: 36/39, ch. 17: 40/65) | OK |
| W1 (finally exercised) | In ch. 15 the short name "Lôi Long" was linked to the known "Thượng cổ Lôi Long", grounded by the full name in its context, with no repair. It became the alias "Lôi Long → Thượng cổ Lôi Long", not a second dragon | OK |
| Weak identities held | "nhuyễn kiếm" (a soft sword, 3 occurrences in ch. 17) was held for the author as a common object, as designed | OK |
| X1 / #181 | Every chapter got facts (3–5) and most got state changes, at 2 calls a chapter | OK |
| Stability | 5 chapters with no stuck analysis, no failed review, and nothing left in the queue | OK |

## Story continuity

**Good:**
- Lam Yên carries ch. 13–17, following her ch. 12 decision. She goes deeper into the Táng Lôi ruins, jumps into Thiên Lôi Uyên, kills a giant serpent, and receives ancient memories from a stone stele.
- Mạc Độc, beaten in ch. 11, recovers through dark arts and hunts Trần Vũ.
- In ch. 17 the three meet: Lam Yên and Mạc Độc fight, sense the dragon's pressure, and find Trần Vũ on an ancient altar. He brushes Mạc Độc aside.
- The memory-loss rule and the earlier events stay consistent.

**Weak:**
- Trần Vũ's ch. 14–15 events are filler ("di chuyển vô định… đôi mắt trống rỗng").
- Mạc Độc "sống lại từ cõi chết" / "quay trở lại từ Quỷ Môn Quan", although canon only has him beaten unconscious. That is dramatic overstatement, not a canon contradiction: no death was recorded, and the consistency check raised nothing.

## New findings

| # | Severity | Finding |
|---|---|---|
| AA1 | **Medium** | **Name drift.** Mạc Độc's technique was "Huyết Nha Ma Công" (ch. 4, 11; an approved SKILL). From ch. 14 the writer calls it "Hắc Nha Ma Công" (11 times in ch. 14–17), probably blending it with his sect "Hắc Nha giáo". Analysis then created a **new** SKILL entity "Hắc Nha Ma Công". Two gaps: the writer does not keep an approved name, and nothing warns that a new name is one syllable away from an approved one of the same type |
| AA2 | Medium | **Idiom taken as a place.** "kéo linh hồn hắn quay trở lại từ Quỷ Môn Quan" uses the Vietnamese idiom for the brink of death, but verification made "Quỷ Môn Quan" a new LOC entity |
| AA3 | Minor | "Thiên nhãn" (the dragon's heavenly eye) became a new ITEM. It is part of the dragon, not an item; a reviewing author would likely reject it |
| AA4 | Note | Trần Vũ's arc stalls in ch. 14–15 (wandering scenes), while Lam Yên's and Mạc Độc's advance. The absent-character reminder does not apply, because he is present. Pacing of the protagonist's arc is not tracked |

AA1–AA3 were accepted by the auto-review, which accepts everything. Canon now holds three questionable entities: "Hắc Nha Ma Công", "Quỷ Môn Quan" and "Thiên nhãn".

## Not covered

- U2 in the live UI, R4 against a real contradiction, Full auto, and Track B.
