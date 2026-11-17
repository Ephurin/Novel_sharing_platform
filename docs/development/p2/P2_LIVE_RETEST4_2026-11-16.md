# P2 live retest 4 on `main`, 2026-11-16

This is the fourth short live run, made after #172 and #173. It checks the fixes for P1–P5, N8 and N9 from retest 3. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `df639e1e` (after #173). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **18** (gateway 1,470 → 1,488; denials stayed at 16). Live was on only for ch. 7 and the consistency check, and was turned off at the end |
| Novel | "Kiếm Ấn Lôi Sơn" (`e82e5640…`): ch. 2 published, ch. 7 written (1,507 words) |

Evidence: `evidence/retest4-2026-11-16/`, from the API driver for ch. 7.

## Checked offline, with no model calls, in the Author IDE

| Fix | Result | Verdict |
|---|---|---|
| P1: publish re-analysis | Ch. 2, whose head was an accepted AI draft, was published from the dialog. It still has 6 revisions and no analysis outbox event | OK |
| P2: stuck duplicate proposals | The two ch. 1 proposals left from retest 3 showed "Trùng sự kiện đã duyệt" and the notice "2/2 đề xuất lặp lại sự kiện đã duyệt ở chương 1". The accept button was disabled. Both were detected, even though one quote differs from the approved event's quote. "Loại toàn bộ nhóm" cleared the queue to 0 | OK |
| P3: Full auto gate | The button is disabled with the reason "Truyện chưa có dàn ý đang dùng…". The novel's only plan is an author draft | OK |
| P4: reader page | A published chapter of the private novel shows "Không tìm thấy chương… hoặc truyện chưa được công khai" | OK |
| P5: publish dialog | The button reads "Xuất bản chương" and the scan notice is accurate. The dialog warns "Truyện đang ở trạng thái bản nháp, nên độc giả chưa đọc được chương này…". The toast after publishing says readers can read it only after the novel is public | OK |
| N8: entity places | Memory shows "Trần Vũ · Lôi Sơn (xuất hiện gần nhất, chương 6)", and the same for Lam Yên, Mạc Độc, Hắc Nha giáo and Lôi Kiếm | OK |
| N9: duplicate place | "Gộp hai tên trùng" lists places and offers only same-type pairs. "Làng Thạch Khê" was merged into "Thạch Khê", and the old name was kept as an alias | OK |

## Checked live

| Item | Result |
|---|---|
| Ch. 7 writing (N8 in the writing context) | 4 drafts (329–408 words for about 500 asked), all passed, 0 failures. The chapter opens in Lôi Sơn, the characters' last-seen place. After the chapter, memory moved Trần Vũ and Lam Yên to "Lôi Sơn (chương 7)" |
| Ch. 7 extraction | 51 candidates, 1 event proposal (accepted), `dropped_events: 0` |
| R4: consistency check on ch. 7 | HTTP 200, `rule_check: checked`, no findings for a consistent chapter, so no false positive from the new last-seen facts. It used 2 calls |

## New findings

| # | Severity | Finding |
|---|---|---|
| Q1 | Minor | Entity status is shown raw in English ("Alive") in the memory panel |
| Q2 | Minor | Entity types are mixed: setup creates `character` / `location`, while extraction creates `PER` / `LOC`. For example, "Lôi Sơn" is `location` but "Thạch Khê" is `LOC`, so the merge control (same type only) cannot merge them. Place detection handles both |
| Q3 | Minor | Extraction still finds few events: 1 event for a 1,507-word chapter |

## Not covered

- R4 against a real contradiction. The run had no chapter that contradicts a last-seen place, and making one would have meant editing the novel and re-running analysis.
- Full auto itself, which still needs a system-made active plan.
- Track B.
