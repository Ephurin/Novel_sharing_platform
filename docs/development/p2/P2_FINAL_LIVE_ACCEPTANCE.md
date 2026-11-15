# P2 final live acceptance (Gemini free tier, 4-key pool)

| Field | Value |
|---|---|
| Source | `integration/p2-planning-studio` @ `e874f26e` (PRs #152–#160 merged) |
| Date | 2026-11-15 |
| Model | `gemini-3.5-flash-lite` via the quota gateway, 4 owner-confirmed free-tier projects, no fallback |
| Manuscript | Fixture `PT-CV-001` "Thành phố giữ lại tiếng mưa", 5 chapters, 4,751 words (the only multi-chapter Vietnamese manuscript available; no longer manuscript was supplied) |
| Usage | 85 calls, $0.00, 0 local denials, 0 provider 429 |
| Verdict | **`P2_ACCEPTED_FOR_REAL_USE` for scenario B (existing manuscript) end to end in the UI**, with the quality limits listed below. Scenario A was not re-run in this round (see "Not covered") |

Fake-provider CI stays the gating evidence. This is a single live run (n=1). The "author" accepted the machine's suggestions and rejected candidates the machine left unresolved. The browser pane was hidden, so some buttons were triggered through the same DOM click handlers.

## Scenario B: existing manuscript, in the import page

| Step | Author action | Result |
|---|---|---|
| B1 | "Dán chữ", paste the manuscript, "Áp dụng & Phân tích", "Xác nhận nhập 5 chương" | 5 chapters with correct titles; job started (`f3711a43`) |
| B2 | Wait | Chapter 1 analysed, then the job paused: "Chương 1/5 đang chờ bạn duyệt" |
| B3 | In the page: "Chấp nhận mọi gợi ý của AI", reject unresolved candidates, freeze, "3. Tiếp tục" | Done for every chapter without opening the IDE |
| B4 | "Chấp nhận" the chapter's proposal group | The next chapter starts on its own |
| B5 | Last chapter | The page shows "Chương cuối đang chờ bạn xác nhận nhân vật"; activation stays disabled until done |
| B6 | "Kích hoạt Story Brain Baseline" | 200; status label "Hoàn tất"; brain active v6 |

Per chapter:

| Chapter | Suggestions accepted in one click | Unresolved, decided by the author | Short-name hints |
|---|---|---|---|
| 1 | 168 | 0 | Mai ↔ Mai Linh / Mai Lâm, Linh ↔ Mai Linh, Lâm ↔ Mai Lâm |
| 2 | 136 | 6 | — |
| 3 | 130 | 6 | — |
| 4 | 125 | 3 | Nguyễn ↔ Nguyễn Vũ, Vũ ↔ Nguyễn Vũ |
| 5 | 69 | 5 | — |

**Memory after activation:** 24 entities, 7 aliases (Bà Sâm, bà Yên, Ông Hòa, Ông tên Hòa, Chị Mai Linh, Chị Mai, Khi Linh), 10 events and 4 world rules:
- Duy's left ear cannot hear. This is a character trait, not a world rule.
- Each touch of the reading head loses more high-frequency material.
- Copper rings of the same diameter in the archive are not guaranteed to have the same tension.
- The survey permit forbids operating the water gate or entering the sealed hold without maintenance staff.

## Using the imported memory

| Check | Result |
|---|---|
| "Viết tiếp" at the end of chapter 5, cursor only | 202 → completed in 4 s, validation passed, continues the scene at trạm Bốn with Duy |
| Brainstorm "all" | 2 s: 2 new world rules, 1 new character ("Khang"), 1 event at chapter 6; nothing repeated approved canon |
| Consistency check, chapter 5 | `rule_check: checked`, 0 findings |
| Consistency check, test chapter (operates the water gate and enters the sealed hold alone) | 1 `WORLD_RULE_VIOLATION` citing the permit rule, with the violating sentence quoted |

## Quality limits (open, not blocking)

| ID | Finding |
|---|---|
| Q-1 | "Accept all" also accepts model mistakes: pronouns or titles as entities ("Anh", "Chị"), a lone surname ("Nguyễn"), a junk alias ("Khi Linh"), and "Bốn" next to "trạm Bốn". Candidate: drop single-word pronoun, kinship or title candidates before verification, and flag sentence-initial single words in the review |
| Q-2 | Short-name fragments stay separate entities by design ("Mai" / "Mai Linh" / "Mai Lâm", "Vũ" / "Nguyễn Vũ"). The page shows hints; merging is manual |
| Q-3 | One extracted "world rule" is a character trait; the author must reject it |
| Q-4 | The import page's proposal queue shows the raw type `world_rule`; it should get a Vietnamese label |
| Q-5 | Event recall and precision are not measured (Track B) |

## Not covered in this round

- **Scenario A (new story from an idea):** setup extract and blueprint, M0, plan, brainstorm and writing. Covered earlier: by `P2_FINAL_ACCEPTANCE.md` (fake provider, UI) and by the Phase 2 live checks of extract and blueprint (#144), brainstorm (#147) and memory-grounded writing (F-LIVE-09). It was not re-run end to end on `e874f26e`.
- **Longer manuscripts** (20+ chapters) and multi-author concurrency.
- **A blind multi-sample A/B of memory uplift** (Track B).
