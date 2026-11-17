# P2 backlog: issues the author can fix in review, 2026-11-17

These live-test findings are real, but the author can catch and fix each one quickly in the existing review screens. On 2026-11-17 the owner decided to skip them for now and focus on the demo flow before the defense. None of them corrupts canon by itself: every item still needs the author's approval.

| # | Source | Issue | How the author fixes it now | Possible later fix |
|---|---|---|---|---|
| AA1 | [Long run 5](P2_LIVE_LONGRUN5_2026-11-17.md) | Name drift: the writer called the approved skill "Huyết Nha Ma Công" "Hắc Nha Ma Công" from ch. 14, and analysis proposed a new entity | In the name review, link "Hắc Nha Ma Công" to the existing skill, or edit the chapter text | Warn when a new name is one syllable away from an approved name of the same type; remind the writer of approved skill names |
| AA2 | Long run 5 | The idiom "Quỷ Môn Quan" (brink of death) became a place | Reject it in the name review ("Không phải tên riêng") | Keep a list of common idioms that are not names |
| AA3 | Long run 5 | "Thiên nhãn" (the dragon's eye) became an item | Reject it in the name review | Tell verification that body parts are not items |
| BB1 | [R4 consistency](P2_LIVE_R4_CONSISTENCY_2026-11-17.md) | One contradiction is reported twice (against the last-seen place and against the location fact), so 3 findings show for 2 problems | Read both; they cite the same sentence | Merge findings with the same quote and subject |
| UI-10 | [UI walkthrough](P2_LIVE_UI_WALKTHROUGH_2026-11-17.md) | Facts repeat each chapter (Trần Vũ's hair colour again), and a passing pose became a fact | Reject the repeated or transient fact in the proposal group | Give fact extraction the approved facts; drop transient details such as posture |
| DD1 | [Demo walkthrough](P2_DEMO_WALKTHROUGH_2026-11-17.md) | Older facts of the test novel store English values from the model (`silver`, `in the chest of Trần Vũ`, `lost_memories`, ch. 9–16) | Edit or reject the fact in the Facts tab | Ask fact and state extraction for Vietnamese values, as event summaries already are |
| DD2 | Demo walkthrough | A vague place ("không gian bên trong") became Mạc Độc's current location | Correct the location fact | Do not take a location from a phrase that is not a named place |
| DD3 | Demo walkthrough | 17 test novels on the test account; chapters 1 and 18 of the test novel are titled "Bản thảo mới" | Rename the chapters; hide or archive test novels | Part of choosing the demo novel |
| — | Earlier retests | Typos in names, state-key spelling variants, near-name warnings (parked before) | Edit the name or key in review | Validators listed in the retest reports |

AA1–AA3 are already in the test novel's canon, because the long run used an auto-review that accepts everything. They can be cleaned up in the Story Brain if the test novel is used in the demo.
