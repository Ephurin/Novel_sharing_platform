# Phase 8.10 — Author Premium Chapter Controls

## 1. Goal

Allow authors to mark chapters as Premium/VIP from the Author IDE before publication, using the existing mock wallet unlock flow.

## 2. Business Rules

- A chapter is free when `is_vip = false` and `price_coins = 0`.
- A chapter is premium when `is_vip = true` and `price_coins > 0`.
- Authors may edit premium settings while a chapter is editable and also after it is `PUBLISHED`.
- Published content changes still follow a later revision/moderation workflow; only monetization settings can change directly after publication.
- Reader unlock ownership remains per user/chapter in `chapter_unlocks`; unlocking does not change `chapters.is_vip`.
- Existing unlocks remain valid if a chapter changes price or becomes free later.

## 3. Backend Tasks

- [x] Validate `isVip` and `priceCoins` as a pair on chapter create/update.
- [x] Reject `isVip = false` with `priceCoins > 0`.
- [x] Reject `isVip = true` with `priceCoins <= 0`.
- [x] Allow published monetization-only updates without changing published content.

## 4. Frontend Tasks

- [x] Add Author IDE premium switch.
- [x] Add Author IDE coin price input.
- [x] Sync premium fields from the selected chapter.
- [x] Send `isVip` and `priceCoins` when saving a draft.
- [x] Default newly created chapters to free.

## 5. Review Steps

1. Open Author IDE and select a draft/rejected/pending/published chapter.
2. Enable `Premium chapter`.
3. Enter a positive coin price, for example `10`.
4. Save draft/settings and confirm the chapter list/detail shows VIP pricing.
5. Disable premium and confirm price returns to `0`.
6. Try invalid payloads in Postman:
   - `isVip = true`, `priceCoins = 0` should fail.
   - `isVip = false`, `priceCoins = 10` should fail.

## 6. Deferred

- Published chapter content revision workflow.
- Tiered pricing or limited-time discounts.
- Revenue analytics per premium chapter.
