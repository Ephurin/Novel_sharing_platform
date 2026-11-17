# P2 live retest 6 on `main`, 2026-11-16

This is the sixth short live run, made after #175. It was meant to check S1 (a provider outage reported as a budget denial) and S2 (a new chapter re-proposing the previous chapter's last event). The provider was unstable during the run. It is an evaluation only.

| Field | Value |
|---|---|
| Code | `main` @ `29471f5f` (after #175). ai-service was rebuilt from it |
| Model | `gemini-3.5-flash-lite`, free tier, through the quota gateway |
| Model calls | **60** (gateway 1,512 → 1,572; gateway denials stayed at 16). The driver's cap of 25 covered its own steps only, and background analysis retries went past it. Live was turned off at the end |
| Novel | "Kiếm Ấn Lôi Sơn" (`e82e5640…`): ch. 9 written (1,592 words), not analysed |

Evidence: `evidence/retest6-2026-11-16/`.

## Results

| Item | Result | Verdict |
|---|---|---|
| S1: provider outage label | Gemini returned repeated transient failures from about 15:00 to 15:16. 3 of 7 generations failed, each now reported as `PROVIDER_UNAVAILABLE retry_after=60`, not `BUDGET_GUARD_DENIED`. The analysis outbox also recorded `PROVIDER_UNAVAILABLE` | OK |
| Ch. 9 writing | 4 accepted drafts (318, 336, 494, 442 words), all passed. The 3 failures were retried by the driver | OK |
| S2: repeated scene event | Not checked. The analysis of ch. 9's final revision failed after 5 of 5 retries (`PROVIDER_UNAVAILABLE`), so no events were extracted | Not covered |

## New findings

| # | Severity | Finding |
|---|---|---|
| T1 | **Major** | During a provider outage, background analysis keeps spending quota. Each outbox attempt runs the pipeline (several structured calls, each retried twice with 4 s and 10 s backoff), and the outbox retried 5 times about 2 minutes apart. About 36 of the 60 calls went to analysis attempts that could not succeed. There is no circuit breaker, and no longer backoff after `PROVIDER_UNAVAILABLE` |
| T2 | Medium | After the 5 retries the chapter's analysis is `FAILED` and stays so. The author has to notice and run "Phân tích lại chương đang mở" once the provider recovers; nothing retries later or tells them |
| T3 | Minor | The driver's `CALL_CAP` counts only its own generations, so background work can exceed a run's intended budget. This is evaluation tooling, not product code |

## Not covered

- S2. It needs a ch. 9 analysis while the provider is healthy. That can be run later with "Phân tích lại chương đang mở" (one analysis, about 6–10 calls).
- R4 against a real contradiction, Full auto, and Track B.
