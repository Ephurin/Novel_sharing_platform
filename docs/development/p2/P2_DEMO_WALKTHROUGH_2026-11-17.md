# P2 demo walkthrough on main, 2026-11-17

I rebuilt the live stack (`ephurin-p2live`) from `main` at `f60ef875`, which includes #189–#193, with **live off**. Then I walked the demo flow in the browser as the test author:

1. Sign in.
2. Open the author dashboard.
3. Open the IDE on "Kiếm Ấn Lôi Sơn" (18 chapters).
4. In the Story Brain, open each tab: Chờ duyệt, Nhân vật, Quan hệ, Dữ kiện and Sự kiện.

No model calls were made.

## Fixed in this change

| # | Where | What the author saw | Fix |
|---|---|---|---|
| D1 | Sign-in | Enter in the password field did nothing; the browser also warned that the password field was not in a form | The fields are now a real form, so Enter signs in |
| D2 | Chờ duyệt → Tên cần chú ý | The placeholder showed a literal `Minh\nThái\nLâm Phong` | It now shows one name per line |
| D3 | Sự kiện | Event types the model wrote freely stayed in English or were misspelled: `warning`, `fight`, `revival`, `combat encounter`, `escape and pursuit`, `arrival or departure`, `entry forbidden zone`, `truch chay` | Translated these types. A phrase uses its first known word (for example "combat encounter" → Giao chiến). An unknown English or unaccented type reads "Sự kiện khác" |
| D4 | Sự kiện | "Nhân vật:" listed places, groups and items too (Thạch Khê, Hắc Nha giáo, Lôi Kiếm) | The label is now "Liên quan:" |
| D5 | Sự kiện → edit form | "(Transitions)" and "(Tạo proposal chờ duyệt)" | Changed to "Cập nhật trạng thái đi kèm" and "Gửi đề xuất chỉnh sửa để duyệt" |
| D6 | Dữ kiện | Status values showed as `Alive` / `Unconscious`, while the Characters tab says "Còn sống" | Status values now use the same Vietnamese labels |
| D7 | Quan hệ | Developer wording: "(Exact-ID Relationship Lock)", "Brain v22", "UUID", "Chủ thể (Subject)", "Relation Type", English example relations, raw UUIDs under every locked relation, a "Thiếu UUID" badge | Rewritten for the author: "Thực thể thứ nhất/thứ hai", "Bộ nhớ v22" and Vietnamese examples. The IDs stay in the data but are no longer shown |
| D8 | Bổ sung dữ liệu → Chương nguồn | `Chương 1: Chương 1: Bản thảo mới` | The number is no longer repeated when the title already starts with "Chương N" |

The relationship-lock picker labels fixed in #193 show correctly on live data, for example "Trần Vũ (Nhân vật)".

## Checks

| Check | Result |
|---|---|
| Web typecheck | Passed |
| Unit tests | 60/60, including new label cases |
| Mocked browser suites | All passed:<br>• p1-hitl-interactions 13/13<br>• entity-review-grouped 1/1<br>• p1-entity-checkpoint-ux 10/10<br>• entity-profile 17/17<br>• setup-foundation 8/8<br>• planning-studio 1/1<br>• ai-draft-panel 2/2<br>• story-bible 1/1 |
| Enter-to-sign-in | Rechecked on the rebuilt live web container |
| Story Brain panel on live data | Not rechecked after the fix: the browser pane was hidden, and the panel's open animation does not run in a hidden pane. Its new labels are covered by the mocked HITL suite and the unit tests |

## Data issues, not code (added to the author-fixable backlog)

| # | Issue |
|---|---|
| DD1 | Older facts of the test novel store English values from the model: `silver`, `in the chest of Trần Vũ`, `lost_memories` (chapters 9–16). Later chapters are Vietnamese. |
| DD2 | Vague locations became the current place: "không gian bên trong" for Mạc Độc. |
| DD3 | The test account has 17 test novels, and chapters 1 and 18 of the test novel are titled "Bản thảo mới". This is part of choosing or cleaning the demo novel. |

## Left as is (seen, lower priority)

- The manual "Bổ sung dữ liệu" form still names raw keys ("status, hearing, scan_count", "Alive / Dead / Unknown"). It is an advanced form that the demo does not need.
- The world-rule amendment screen still shows "Brain v" and "Mã Fact". Fixing it is a separate wording pass if the demo uses that screen.
- The tab name "Hồ sơ Codex" is kept: it is the product's name for entity profiles.
