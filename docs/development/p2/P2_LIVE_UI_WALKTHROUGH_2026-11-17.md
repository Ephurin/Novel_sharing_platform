# P2 live UI walkthrough of the Author IDE, 2026-11-17

This run went through the Author IDE demo flow in the real web app (`127.0.0.1:18180`, the built-in browser), with the test author on "Kiếm Ấn Lôi Sơn". Its purpose is to prepare the project defense: find what an examiner would see as broken, confusing or untranslated. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `b542253c` (after #187) |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **9** (gateway 1,713 → 1,722): 1 writing, 1 consistency check, 4 background analysis to the entity review, 3 after it. Live was paused while waiting for the user, and turned off at the end |
| Canon | Brain version 21 → 22 (one group of 4 proposals accepted through the UI) |

## Flow and result

| Step | Result |
|---|---|
| Sign in | Works; lands on "Tác phẩm" |
| Projects page | Works; card shows "Ch. 17 · Sửa 2 giờ trước" |
| "Viết tiếp" on the project card | Opens the IDE, but on **ch. 2** (see UI-3) |
| "Thêm chương mới" | Creates the chapter titled "Chương 18: Bản thảo mới", but numbered **19** (see UI-1) |
| AI panel → "Viết tiếp" → "Chấp nhận bản thảo" | Draft continues ch. 17 coherently (Mạc Độc on the altar, Lam Yên behind Trần Vũ); accepted and saved |
| "Kiểm tra nhất quán chương đang mở" | "Không tìm thấy mâu thuẫn trong lần kiểm tra này." (1 call) |
| Story Brain button | Shows "1 mục chờ bạn duyệt" once the background analysis reaches the entity review |
| Entity review | "Chấp nhận mọi gợi ý của AI (8)" → 8/8 decided → "Đóng băng danh sách entity (Freeze)" → "3. Tiếp tục trích xuất event/fact": 1 group of 4 proposals |
| Proposal group | "Duyệt nguyên tử toàn bộ nhóm (4 đề xuất)" → "Đã duyệt nhóm đề xuất gồm 4 phần tử vào Canon thành công." Memory v22, nothing pending |
| Characters tab | Status and last-seen place in Vietnamese ("Còn sống · Thiên Lôi Uyên (xuất hiện gần nhất, chương 17)") |

The core loop works end to end through the UI: write with AI, check consistency, review names, accept proposals.

## Findings, by impact on the demo

| # | Impact | Finding | Cause |
|---|---|---|---|
| UI-1 | **High** | After a chapter is deleted, the next chapter skips its number. The new chapter is titled "Chương 18" but shown as "CHƯƠNG 19" in the list and "Chương số 19" in the editor | A soft-deleted chapter keeps its `chapter_number`, and new chapters take max + 1 |
| UI-2 | **High** | The analysis area still shows "Chương 9 — Dịch vụ AI không phản hồi quá lâu nên phân tích đã dừng…", although ch. 9 was re-analysed successfully in retest 8 | `extraction-status` reports the failed outbox row for that revision. A later successful re-analysis of the same revision does not clear it |
| UI-3 | Medium | "Viết tiếp" on the project card opens the last chapter remembered in this browser (here ch. 2), not the latest chapter | `openIde` passes only `novelId`. The IDE then uses the saved chapter or the first one |
| UI-4 | Medium | The login page is in English: "Email or username", "Password", "Login", "Switch to register", "Browse public library as guest" | Untranslated strings |
| UI-5 | Medium | The review screens use developer language: "checkpoint", "Freeze", "event/fact", "Canon", "Provisional Groups", "Khóa kỹ thuật ASCII", "Làm mới (Refresh)", "CHỜ DUYỆT ENTITY", "ENTITY [PER]", character offsets "[95, 102)", "Duyệt nguyên tử", raw field names "(fact_key)", "(subject_entity_id)", "(fact_value)", entity types "[character]" next to "[LOC]", full UUIDs, an English event type "SUPPRESSION", and participants as a comma-separated list of UUIDs | Labels written for developers |
| UI-6 | Minor | The AI panel shows "Đã kiểm định nhất quán • P1 Loop" and "Context-Aware LLM & Story Bible". It keeps showing "AI đang suy nghĩ và tổng hợp Story Bible…" under a finished draft | Internal names; a stale loading line |
| UI-7 | Minor | The projects page counts "Chương đã xuất bản: 98" although every novel is a draft | The card shows `totalChapters` (all chapters), not published ones |
| UI-8 | Minor | The browser console fills with 404s: the IDE polls `/ai/autonomous/by-novel/{id}/active`, which answers 404 when no Full auto run exists | 404 is used for "none" |
| UI-9 | Note | The memory header says "Bộ nhớ chính thức v22 · active" | Untranslated status |
| UI-10 | Note | Facts repeat each chapter (Trần Vũ `hair_color = bạc trắng` again), and a passing pose became a fact (`posture = quỳ một gối xuống phiến đá`) | Fact extraction has no "already known" input and keeps transient details |

## Suggested fix order before the defense

1. UI-1 and UI-2: they look like data errors on screen.
2. UI-3 and UI-4: first impressions (the login page and "Viết tiếp").
3. UI-5 and UI-6: a wording pass on the review and AI panels. Show names instead of UUIDs, Vietnamese labels instead of field names and internal terms.
4. UI-7 and UI-8.

## Recheck after #189

UI-1 to UI-8 were fixed in #189. The live stack was rebuilt from `main` @ `094c4fb5` with the live model **off** (no model calls), and the demo flow was checked again in the browser.

| # | Result |
|---|---|
| UI-1 | OK. The test novel's existing chapter 19 was renumbered to 18 by hand (the fix applies to chapters created after it): the chapter row, and the 1 event, 3 facts and 1 provenance row in canon that recorded 19. The deleted chapter's row moved to -1. The IDE shows "Chương số 18" |
| UI-2 | OK. Ch. 9's old failed background row predates the fix, so it was closed by hand with the same rule (ch. 9's author re-analyses had completed twice). The banner is gone |
| UI-3 | OK. "Viết tiếp" opens ch. 18, the chapter edited last |
| UI-4 | OK. The login page is in Vietnamese, with no prefilled password |
| UI-5, UI-9 | OK on the review and memory screens: "Bộ nhớ truyện phiên bản 22 · đang dùng", no UUIDs, no Freeze, "Duyệt nguyên tử", `fact_key` or "Brain v". Three leftovers were found and fixed in #190: world-rule keys shown as `setup rule rule <hash>`, location states shown as UUIDs, and "(Event Correction Proposal)" |
| UI-6 | OK. No "P1 Loop" or "Context-Aware LLM" |
| UI-7 | OK. "Chương đã xuất bản" shows 2 (it showed 98) |
| UI-8 | OK. With the panel open, no request to `/autonomous/.../active` in 10 s. Other panel data still refreshes every ~3 s |

Issues the author can fix in review (AA1–AA3, BB1, UI-10) are listed in [P2_AUTHOR_FIXABLE_BACKLOG.md](P2_AUTHOR_FIXABLE_BACKLOG.md) and skipped for now.
