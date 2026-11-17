# P2 live retest 3 on `main`, 2026-11-15 (bug hunt)

This is the third short live run, made after #171. It checks R1–R4 and exercises publishing, the reader side and Full auto. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `268093ed` (after #171). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **18** (gateway 1,452 → 1,470; denials stayed at 16). Live was turned off at the end |
| Novel | "Kiếm Ấn Lôi Sơn" (`e82e5640…`): ch. 5 reviewed in the UI, ch. 6 written (1,541 words), ch. 1 published |

Evidence: `evidence/retest3-2026-11-15/`, from the API driver for ch. 6.

## #171 fixes, checked live

| Fix | Live result | Verdict |
|---|---|---|
| R1: too-short drafts | Ch. 6 drafts for 500 asked: 467, 521, 551 words. None was short enough to trigger the check | Not triggered; length looks better |
| R2: dropped events | Ch. 5 and ch. 6 extraction: `dropped_events: 0`. Every event quote grounded directly, so no repair was needed | OK in this run |
| R3: grouped alias link | "làng Thạch Khê" linked to the known "Thạch Khê" with the group select; Freeze succeeded (63/63) | OK |
| R4: facts in the consistency check | One call. The rule violation was found again. The moved home was **not** flagged, because no approved fact states Vũ's home: every entity has location "Unknown", and the earlier AI rewrite had removed "làng Tây Giang" | Works, but has little data; see N8 |

## Other flows exercised

| Flow | Result |
|---|---|
| Header reading time | "1,792 từ • khoảng 5 phút" |
| Publishing ch. 1 | The pre-publish checklist was all green. "Xác nhận gửi duyệt" set the chapter to PUBLISHED immediately |
| Reader page for that chapter | "Something went wrong — CONTENT_001: Content not found" (the novel is still a private draft) |
| Full auto | The "Bật full auto" button is disabled on both novels and the tab gives no reason |

## New findings

| # | Severity | Finding |
|---|---|---|
| P1 | **Major** | Publishing ch. 1 created a new revision (`d81a96cd`, the same length as the previous head). That revision triggered a full re-analysis of an already reviewed chapter: extra calls, and the chapter's two approved events came back as new proposals |
| P2 | **Major** | Those duplicate proposals cannot be accepted. Accepting the group returns `BRAIN_VERSION_CONFLICT` ("AI Service returned status 409"), even with the current brain version. They stay in "Chờ duyệt" until rejected; the driver's accept failed three times |
| P3 | **Major** | Full auto cannot be started for a story that began from an idea. The web button requires `brain.baseline_revision_id`, which only manuscript import sets; activating the setup leaves it null. The server itself only needs an active plan. The UI shows no reason |
| P4 | Medium | The reader page shows a raw English error ("Something went wrong / CONTENT_001: Content not found") for a published chapter of an unpublished novel. The author sees "Đã đăng" with no hint that readers cannot open it yet |
| P5 | Minor | The publish dialog says "Xác nhận gửi duyệt" and mentions moderation before public reading, but the chapter becomes PUBLISHED at once |
| N8 | Medium | Entity locations are never filled in Story Brain (all "Unknown"), so the R4 fact check and the "Địa danh" views have little to work with |
| N9 | Minor | The memory still holds both "Thạch Khê" and "Làng Thạch Khê", created in ch. 1 before #170. There is no merge tool for existing duplicates |

## Not covered

- Full auto was not run (see P3; its default of 100 iterations is also a quota risk).
- Track B (memory uplift).
