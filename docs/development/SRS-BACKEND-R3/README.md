# Backend SRS fixes (PR #85): evidence round 3

Policy version: **D1–D7 of 2026-11-09** (first publish needs 2 valid chapters, synopsis ≥ 50 characters, chapter ≥ 500 characters to publish). R1 and R2 tested the previous contract (5 chapters, synopsis 500) and are kept unchanged.

Code under test: `08217a65`, which merges `main` `c47c87ac` (#116 reverted the unreviewed reader chapter tools). Later commits only add this folder and its workbook.

## Full suite at `08217a65` (`pr-head/`)

Each runner ran twice on its own `ephurin_test_*` databases, all dropped. Shared database fingerprint `686d5ca351f2c4b1` was the same before and after every runner.

| Step | Exit | Result |
|---|---|---|
| typecheck web, backend | 0, 0 | PASS |
| web tests | 0 | 26 + 4 + 2 pass |
| `npm run test:isolated` | 0 | 277 pass, 0 fail, 7 skip |
| refusal tests | 0 | 10 OK |
| SRS acceptance × 2 | 0, 0 | 71/71, 71/71, `policy_version` recorded |
| smoke × 2 | 1, 1 | 120/138, 120/138, same failing checks as `main` |
| social × 2, discovery × 2 | 1 | stop at reader login, same as `main` |

## CI gates run locally at `08217a65` (`ci-acceptance/`)

Both scripts ran from a clean checkout of the exact SHA (`cleanSource: true`), with disposable databases, the fake LLM provider and Microsoft Edge.

- `node scripts/run_pr86_review_acceptance.mjs` (Studio durability and patch placement): all 9 steps exit 0. Steps: typechecks, web build, AI cursor tests on SQLite and on a disposable PostgreSQL, accept-draft contract, create-genre, the Studio browser suite, main reader UI.
- `node scripts/run_reader_acceptance.mjs` (Reader acceptance): all 6 steps exit 0, `cleanupVerified: true`.

## Red CI gates on GitHub and their fixes

- **Studio:** `author-notes.browser.test.mjs` publishes a chapter whose fixture was about 60 characters. D1 keeps "Xác nhận gửi duyệt" disabled below 500 characters, so the fixture now has 500+ characters. D1 was not lowered, and the notes, undo and publication assertions are unchanged.
- **Reader:** `reader-home-personalization.browser.test.mjs` pressed Tab right after `page.goto`, before React had committed the home page, so focus sometimes missed the skip link.
  - Local runs of the original test: 14/15 on this branch and 10/10 on `main`. The single failure is kept in `ci-reader-skip-link/branch-original-test-run5-fail.log`.
  - This PR does not touch the reader home page; the race is in the test.
  - The test now waits for the skip link to exist and still asserts it is the first tab stop: 10/10.

## `main` `c47c87ac` baselines

- `main-baseline/`: the same SRS runner twice. 60/71 both times, failing exactly the 11 checks this branch fixes.
- `main-baseline-browser/`: smoke 120/138 with the same failing checks as both runs here. social and discovery stop at the same reader login step.

The reader-role browser failures come from the reader UI on `main`: readers land on `/` after login, the menu labels changed, and the like button has a new hook. The runners from #73 have not been updated for it.

## Workbook

`system-test-report.xlsx`: 133 test cases, 99 Pass, 17 Fail, 17 N/A. All 17 Fail rows also fail on `main` `c47c87ac` (each row says so). The 11 SRS checks pass here and fail on every `main` baseline run. Run_Info shows the policy version.

## Not covered

- P7/P8 and the two acceptance workflows on GitHub: they run after push.
- The new form hints were not checked by hand in a browser.
- The four manual E2E scripts that write to the shared database were not rerun.
- D6 still needs the #74 owner's technical sign-off.
