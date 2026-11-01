# AA-01 — UI observations across the existing Writing session

Tested application SHA: 59b0fcb54863391081cbf6d0ed5b5c56e441e487.
Finding: **MAJOR — completed draft is not recovered by the reopened UI**.

This is a curated observation summary, not a raw DOM dump or reconstructed screenshot. Relative order below comes from existing acceptance evidence; no new product test or provider call was run for publication.

| Phase | Observed UI | Result |
|---|---|---|
| T0 — original Writing session | “Gợi ý từ AI Copilot”; “Đã kiểm định nhất quán • P1 Loop”; generated fictional text; “Chấp nhận bản thảo” and “Từ chối / Bỏ qua” buttons present | Draft and review controls existed in the original page state |
| T1 — new tab / reopened chapter | AI panel shows its ready state; no recovered draft or accept/reject controls | Draft recovery FAIL |
| T2 — logout/login and reopen | Same ready state; manuscript remains the original 346 words | Recovery still FAIL; no automatic acceptance |
| T3 — revision history inspected | Only the 346-word manuscript checkpoint was available; no Writing-job review entry | No recovery route found in tested UI |

The generated text began: “Tại Trấn Thanh Phong náo nhiệt, Lâm Phong và Tô Mặc tìm một góc khuất trong quán trà nhỏ để ẩn mình.” This is fictional QA data. It was not found in the main manuscript after reopening.

**Limits:** The original-session screenshot clipped the draft panel and was deliberately excluded. T0 is supported by the saved original UI observation and persisted job, not a before-image. The original tab could not be rebound by the automation tool in the follow-up test; a new tab was used. No draft was recreated, accepted or rejected during the zero-provider acceptance round. C02/C03 remain NOT_RUN.

[Reopened UI capture](aa01-reopened-ui.png) is also clipped below the quick-action controls. It illustrates the page context only; the screenshot alone cannot establish absence of a draft. The existing UI observations, unchanged manuscript and job persistence summarized here and in [the persistence summary](aa01-job-and-manuscript.md) are the evidence for AA-01.

Minimal reproduction for a separately authorized reviewer: complete a Writing job, leave its draft unaccepted, reload/open the same chapter, open AI support, and inspect available review/history controls. Do not generate a fresh draft merely to work around the recovery gap.
