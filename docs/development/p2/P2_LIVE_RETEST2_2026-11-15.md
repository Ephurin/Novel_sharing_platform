# P2 live retest 2 on `main`, 2026-11-15 (bug hunt)

This is the second short live run, made after #170. It checks the #170 fixes and exercises flows the first retest did not cover. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `b0a32112` (after #170). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **59** (gateway 1,393 → 1,452; denials stayed at 16). Live was turned off at the end |
| Novels | "Kiếm Ấn Lôi Sơn" (`e82e5640…`): chapters 4–5 added, 3,325 words. "Hạm Đội Sao Băng" (`1ca03b3e…`, sci-fi): setup only |

Evidence: `evidence/retest2-2026-11-15/`, from the API driver for chapters 4–5.

## #170 fixes, checked live

| Fix | Live result | Verdict |
|---|---|---|
| N1: Vietnamese names | A new ship doctor was named "Lê Văn Tùng", from an English direction; the alien was "A-rít" | OK |
| N2: brainstorm uses the unsaved idea | Suggestions followed the idea typed in step 1 (five jumps, trạm Hoàng Sa 7, Kha Lạc, Lý Minh Khôi) | OK |
| N3: names in the brainstorm dialog | "Người tham gia: Lê Văn Tùng, A-rít" | OK |
| N4: plan names right after activation | Names shown in the same page session, without a reload | OK |
| N5: identity default | "Danh tính thẻ N" was prefilled with "Tạo danh tính mới"; the save button was enabled | OK |
| N6: location variants | Ch. 4: "làng Thạch Khê" was linked to the known "Thạch Khê". Ch. 5: the model left it `unresolved`, so the merge did not apply | Partly |
| 11: draft length | 500 asked: 411, 482, **9**, 329, 367 (ch. 4); 448, 372, 301, 280, 322 (ch. 5). Average without the 9-word draft: 368 (74%; it was 68% before) | **Still open** |

## Other flows exercised

| Flow | Result |
|---|---|
| Grouped entity review (#167) with real data | Ch. 4: 54 occurrences open as 17 name cards. The noise words ("Tốc", "Rầm", "Hảo", "Đồ") were already `not_entity`. "Chấp nhận mọi gợi ý" plus one group action resolved everything. The confirmation before replacing a different identity appeared ("1/1 vị trí “Lôi Long” đang gán cho danh tính khác") |
| Story Brain badge and "Chờ duyệt (N)" (#164) | The badge showed "2" for two pending checkpoints |
| Issue 3: canon change makes later checkpoints stale | After ch. 4 was reviewed, ch. 5 showed "Bộ nhớ đã thay đổi sau lần phân tích này" and "Phân tích lại chương này". The button worked, but re-analysing ch. 5 cost **7 calls** |
| One analysis per chapter head (#165) | A manual edit followed by an AI rewrite within the quiet period gave one analysis of the final head (7 calls) |
| Issue 12: consistency check | The rule contradiction (three sword uses, no memory lost) **was caught**, with a Vietnamese explanation and the exact quote. The place contradiction (hometown "làng Tây Giang dưới chân núi Bạch Vân" against the known Thạch Khê under Lôi Sơn) **was not flagged** |
| Rewrite ("Gọt giũa văn phong") on a selection | It replaced exactly the selected sentence, with correct spacing |

## New findings

| # | Severity | Finding |
|---|---|---|
| R1 | **Major** | A 9-word draft (one line of dialogue) passed validation and was accepted although 500 words were asked. There is no minimum-length check |
| R2 | **Major** | Ch. 4 lost all its events: "Dropped event with an ungrounded quote: Evidence quote is not present in the source revision". The author is not told, and the chapter's events are missing from Story Brain |
| R3 | Medium | In the grouped review, "Cả nhóm là thực thể Canon đã có" can link a short name ("Lôi Long") to a known entity ("Thượng cổ Lôi Long"). Freeze then fails with the raw English message "INVALID_EVIDENCE: Alias identity requires an exact source quote", and the group card has no field for a quote |
| R4 | Medium | The consistency check only compares against world rules. A contradicted fact (hometown, home mountain) is not flagged (issue 12) |
| R5 | Minor | The rewrite of a sentence dropped the place name "làng Tây Giang" (content change, not only style), and the result was still labelled "Đã kiểm định nhất quán" |
| R6 | Minor | The draft length is still about 74% of the request (issue 11). The explicit length line from #170 helped only slightly |
| R7 | Note | Each review of an earlier chapter forces a full re-analysis of every later pending chapter (7 calls for a ~1,700-word chapter) |

## Not covered

Full auto mode, the reader side, publishing, and Track B (memory uplift).
