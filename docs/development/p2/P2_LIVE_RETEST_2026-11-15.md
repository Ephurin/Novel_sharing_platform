# P2 live retest on `main`, 2026-11-15

This short live run checks the fixes merged after the cancelled long-run test (PRs #164–#169) against the real model. It is an evaluation only; fake-provider CI stays the gating evidence.

| Field | Value |
|---|---|
| Code | `main` @ `2d4070e5` (after #169). The stack `ephurin-p2live` was rebuilt from it (ai-service, backend, web) |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Novel | `e82e5640-e77c-4c19-8e4d-b02a8375100a`, "Kiếm Ấn Lôi Sơn — kiểm thử live 2026-11-15" (action fantasy) |
| Size | 3 chapters, 3,828 words |
| Model calls | **35 in total** (gateway total 1,358 → 1,393; denials stayed at 16). Live was turned off at the end |

## How it was run

- **Setup, in the Studio UI:** new novel → Planning → idea → brainstorm → 1 rule typed + 2 AI rules → 5 characters/locations typed → group review → activate → 5 chapter cards + AI events for chapter 1 → save plan.
- **Chapter 1, in the Studio UI:** a 55-word author opening, then two AI drafts from the panel ("Viết tiếp", then an instruction asking for 400 words), both accepted. The memory review was done in the Story Brain panel ("Chấp nhận mọi gợi ý của AI" → Freeze → continue → accept the proposal group).
- **Chapters 2–3, through the same API calls as the Studio:** five 500-word continue drafts per chapter, all accepted. The memory review accepted the machine's suggestions and rejected unresolved items. Driver: the earlier `longrun.mjs`, with the idle wait raised above the 120 s analysis quiet period.

Evidence: `evidence/retest-2026-11-15/` (`events.jsonl`, `state.json`, `brain-growth.jsonl`, `ch01–03.txt`).

## Results against the earlier findings

| Issue | Before (long-run test) | Now | Verdict |
|---|---|---|---|
| 4: analysis cost per chapter | 55–83 calls per ~2,000-word chapter | Ch. 1 (438 words): 5 calls in total. Ch. 2 (1,714 words): 11. Ch. 3 (1,676 words): 16. These counts include the 5 writing calls; the driver's extra "refresh" before review adds verification calls a UI author would not make. One analysis per chapter head | **Fixed** (#165) |
| 5–9: entity review items | 155–234 items per chapter; 7 of 19 memory entities were fragments | Ch. 1: 20 occurrences of 10 names (59 pruned: 33 nested fragments, 17 sentence-initial words, 7 lone surnames, 2 pronouns). Ch. 2: 62. Ch. 3: 68. Memory after 3 chapters: 10 entities, **no fragments, no common objects** | **Fixed** (#166) |
| 5: grouping | One card per mention | Ch. 2–3 have >30 occurrences, so they open grouped by name (checked in CI browser tests; not opened in the UI in this run) | Not re-checked live |
| 10: output language | Sometimes English | Brainstorm with an empty direction: Vietnamese. Rule suggestions with an **English** direction: Vietnamese. Event suggestions: Vietnamese | **Fixed** (#168), see new finding N1 |
| 13: glued drafts | "nhịp đồng hồ.Linh" | 12 accepted drafts; 0 places where a sentence end is followed by a capital with no space. The patch carries the leading space (" Cảm giác…") | **Fixed** (#168) |
| 15: draft lost when the panel closes | Draft lost | Clicked "Viết tiếp", closed the panel at once: the panel reopened by itself with the finished draft | **Fixed** (#168) |
| 14: panel closes after accept | Reported | The panel stayed open after both accepts | Not reproduced |
| 1, 17: pending count, toast | — | "Chờ duyệt (1)" counted the entity checkpoint; proposal badges read "Thực thể mới", "Sự kiện" | OK (#164, #169) |
| 18: reading time | "-1 phút" | "0 từ • chưa có chữ", "55 từ • dưới 1 phút" | **Fixed** (#169) |
| 20: raw M0 error | "M0_NOT_ACTIVE … 409" | Before activation, the World Rules panel explains that M0 must be activated first | **Fixed** (#169) |
| 16: locked group selects | Selects did not take a value | All 8 decision selects took "Duyệt"; the group saved and activated | OK |
| 11: draft length | 220–400 words for 600 asked | 400 asked → 294 (UI). 500 asked → 189–533, average 339 (68%) | **Still open** |

## New findings

| # | Severity | Finding |
|---|---|---|
| N1 | Minor | Brainstorm invents Western-style names ("Kaelen Vane", "Lyra Dawnseeker") for a Vietnamese story. Its descriptions are Vietnamese |
| N2 | Minor | Brainstorm before the setup is saved ignores the idea text typed in step 1 ("Tham chiếu: 0 quy tắc, 0 nhân vật"); it suggested floating islands for a sword-and-mountain story |
| N3 | Minor | The brainstorm dialog still shows raw entity IDs in "Người tham gia: bd0d944d-…" (#169 fixed only the plan editor) |
| N4 | Minor | Plan editor: right after activation, participants show "Nhân vật đã duyệt (chưa tải được tên)" until the page is reloaded; the approved names are loaded once, before activation (#169) |
| N5 | Minor | Setup group review: every character card needs "Danh tính thẻ N" set by hand although its only option is "Tạo danh tính mới" |
| N6 | Minor | "Thạch Khê" and "Làng Thạch Khê" became two location entities; location-head variants are not merged the way person honorifics are. "Thượng cổ Lôi Long" was typed PER |
| N7 | Note | Saving the idea alone does not extract anything; the World and Characters cards must be added by hand or from AI suggestions |

## Not covered

- The grouped review view was not opened live (it is covered by `entity-review-grouped.browser.test.mjs`).
- Track B (memory uplift, event recall/precision) is still unmeasured.
- Issues 3 and 12 were not exercised.
