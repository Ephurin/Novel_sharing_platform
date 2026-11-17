# P2 live retest 5 on `main`, 2026-11-16

This is the fifth short live run, made after #174. It checks the fixes for Q1–Q3 from retest 4. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `ffc64b9a` (after #174). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **24** (gateway 1,488 → 1,512; gateway denials stayed at 16). Live was on only for ch. 8 and was turned off at the end |
| Novel | "Kiếm Ấn Lôi Sơn" (`e82e5640…`): ch. 8 written (1,447 words) |

Evidence: `evidence/retest5-2026-11-16/`.

## Checked offline in the Author IDE

| Fix | Result | Verdict |
|---|---|---|
| Q1: status labels | The memory panel shows "Còn sống · Lôi Sơn (xuất hiện gần nhất, chương 7)" instead of "Alive · …" | OK |
| Q2: mixed entity types | In "Gộp hai tên trùng", choosing "Lôi Sơn" (setup type `location`) offers the `LOC` places Thạch Khê, Bạch Vân and Táng Lôi as targets. No merge was made | OK |

## Checked live

| Item | Result |
|---|---|
| Q3: event extraction, ch. 8 | **5 events** (2 arrivals, 2 discoveries, 1 revelation), all with a place, all grounded (`dropped_events: 0`), all accepted. Chapters 5–7 had 1–2 events each with the old prompt |
| Ch. 8 writing | 3 accepted drafts (519, 464, 462 words for about 500 asked), all passed |

## New findings

| # | Severity | Finding |
|---|---|---|
| S1 | Minor | One generation failed with `BUDGET_GUARD_DENIED` after 3 calls and 23 s, but the gateway counted no denial. The driver's retry succeeded. The plain code is also used for provider timeouts and unavailability (`core/llm_service.py`), so the author sees a "budget" error for what was probably a transient provider failure. The logs were lost when the stack restarted, so the cause is not confirmed |
| S2 | Minor | Ch. 8's first event ("vượt qua ranh giới để bước vào cấm địa Táng Lôi") repeats ch. 7's last event, because ch. 8 opens by continuing that scene. The duplicate check only compares events within one chapter |
| S3 | Note | Ch. 8 used 24 calls (cap 25), against 16 for ch. 7: one failed generation (3 calls) plus slower drafts that used 3 calls each |

## Not covered

- R4 against a real contradiction.
- Full auto, which still needs a system-made active plan.
- Track B.
