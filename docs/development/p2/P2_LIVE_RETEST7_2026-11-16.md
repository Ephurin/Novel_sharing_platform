# P2 live retest 7 on `main`, 2026-11-16 (measurement)

This short live run came after #176. It had two goals: re-analyse ch. 9, to check S2 (the previous chapter's last event repeated) and #176 in the real stack, and measure how many calls each analysis step uses. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `e37ea1f1` (after #176). The stack was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **5** (gateway 1,572 → 1,577; denials stayed at 16). Live was turned off at the end |

## What happened

"Phân tích lại chương" for ch. 9 (revision `2f5ab186`) made 5 calls:
- 2 × `entity_discovery`, both successful.
- 3 × `entity_candidate_verification`. The first returned HTTP 503 after about 25 s; the two retries returned 503 after about 2 s each.

The request returned HTTP 502 (`AI_SERVICE_502`, `PROVIDER_UNAVAILABLE`), so S2 still could not be checked.

## Measurement: what one chapter's analysis costs

The code path is `entity_hitl.analyze` → `EntityPipeline.run_verified` → `verify_entities`, then `continue_review`.

| Step | Calls | Notes |
|---|---|---|
| Entity discovery | 1 per text chunk (2 for a chapter of about 1,500 words) | LLM name discovery that complements the rule-based candidates. It was missing from the earlier flow diagram |
| Entity verification | 1 per 24 candidate occurrences | ch. 7: 51 occurrences → 3; ch. 8: 37 → 2; ch. 9: 53 → 3 |
| Event extraction | 1 | Plus at most 1 quote repair |
| **Total** | **about 5–7 per chapter** | Plus retries and failures |

Rule-based candidate occurrences, counted offline on ch. 7–9 with no model call:

| Chapter | Occurrences | Exact approved names among them | Other |
|---|---|---|---|
| 7 | 51 (12 surfaces) | 46: Trần Vũ ×14, Lam Yên ×10, Mạc Độc ×6, Lôi Sơn, Lôi Kiếm, Hắc Nha giáo, Táng Lôi | 5 one-off words: Huynh, Chẳng, Chi, Hàng, Đột |
| 8 | 37 (9 surfaces) | 35 | 2 (Quy, Đột) |
| 9 | 53 (13 surfaces) | 45 | 8 (Đạo, Gã, Trưởng, Cứ, …) |

About 85–95% of what verification sends is names the author already approved. Skipping those (option A) would cut verification to one batch per chapter or less. The entity review would then show only genuinely new or doubtful names.

The gateway ledger keeps only part of the history (452 of 1,577 calls) and labels every call `gemini_generate_content`, so it cannot split calls by step. Its recent records show many failed calls among those kept: 2/5 for ch. 7, 3/6 for ch. 8 and 9/15 for ch. 9. Failed calls still count against the quota.

## New findings

| # | Severity | Finding |
|---|---|---|
| U1 | **Major** | Ch. 9's entity verification fails every time: about 9 attempts on 2026-11-16 15:00–15:16 and 3 today, while discovery, writing and other chapters work. This looks like a failure specific to that request, not a provider outage. The cause is unknown because the provider's error body is not logged. Since #176, such a failure is treated as an outage and retried for up to 24 hours. A chapter whose verification always fails cannot be analysed at all |
| U2 | Minor | The synchronous "Phân tích lại chương" request returns `AI_SERVICE_502` with `PROVIDER_UNAVAILABLE`; the web shows the raw code rather than the Vietnamese provider message |
| U3 | Note | The gateway ledger cannot attribute calls to operations, and the client's operation name is not forwarded. Per-step cost has to be read from ai-service logs (`structured_provider_response`) |

## Not covered

- S2. It still needs a successful ch. 9 (or new chapter) event extraction.
