# Backend SRS fixes (PR #85): evidence round 4, D6 technical closure

Policy: D1–D7 of 2026-11-09. D6 was signed off by the project owner on 2026-11-10. R1–R3 are kept unchanged.

Code under test: `0c235df8`. It contains the D6 fixes (`1fdf0a44`), their tests (`fb7dc274`), the D6 docs (`36b48a95`) and the merge of `main` `25fa0fd9` (#118 chapter reader and comments). Later commits only add this folder.

## D6 focused tests: RED, then GREEN

`backend/src/modules/admin/novel-removal-d6.postgres.test.ts` injects real MongoDB write failures with a collection validator on `draft_chapters`.

- `d6-red-1.log`: the first run against `704afd09`. It found the first gap (see below). Two tests in this run were themselves wrong: one asserted the wrong pending count, and one left the fault on. Both were corrected before `d6-red-2.log`.
- `d6-red-2.log`: the corrected tests against `704afd09`. 4 pass, 3 fail, one failure per data-safety gap:
  1. The HIDE sync tagged the draft of a chapter the author had deleted before HIDE.
  2. A stale restore job of an earlier sanction un-hid drafts of a novel that had been hidden again.
  3. Restoring a removal made before sanctions existed resurrected chapters the author had deleted earlier.
- `d6-green.log`: after `1fdf0a44`. All 7 D6 tests and the 17 SRS backend tests pass (24/24). The same 24/24 at `0c235df8` after merging #118.

## Full suite at `0c235df8` (`pr-head/`)

Each runner ran twice on its own `ephurin_test_*` databases, all dropped. Shared database fingerprint `686d5ca351f2c4b1` was the same before and after every runner.

| Step | Exit | Result |
|---|---|---|
| typecheck web, backend | 0, 0 | PASS |
| web tests | 0 | 51 + 4 + 2 pass |
| `npm run test:isolated` | 0 | 287 pass, 0 fail, 7 skip |
| refusal tests | 0 | 10 OK |
| SRS acceptance × 2 | 0, 0 | 71/71, 71/71 (policy D1-D7 2026-11-09) |
| smoke × 2 | 1, 1 | 102/138, 102/138, same failing checks as `main` |
| social × 2, discovery × 2 | 1 | stop at reader login, same as `main` |

## CI gates run locally at `0c235df8` (`ci-acceptance/`)

Both scripts ran from a clean checkout of the exact SHA with disposable databases, the fake LLM provider and Microsoft Edge:
- Studio acceptance (`scripts/run_pr86_review_acceptance.mjs`): 9/9 steps exit 0.
- Reader acceptance (`scripts/run_reader_acceptance.mjs`): 6/6 steps exit 0, `cleanupVerified: true`.

## `main` `25fa0fd9` baselines

- `main-baseline/`: SRS 60/71 twice, failing exactly the 11 checks this PR fixes.
- `main-baseline-browser/`:
  - smoke 102/138, with the same failing checks as both runs here;
  - social and discovery stop at the same reader login step.

## Workbook

`system-test-report.xlsx`: 133 test cases, 96 Pass, 20 Fail, 17 N/A. Every Fail also fails on `main` `25fa0fd9`, and each row says so.

## Environment note

These runners used a Python 3.12 virtual environment. A fresh `uv` cache build of Python 3.15 was blocked by Windows Application Control (`_ssl` DLL), so the first attempt at `36b48a95` produced no runner evidence and is not included.

## Not covered

- P7/P8 and the two acceptance workflows on GitHub run after push.
- The reader-role browser runners from #73 still need updating for the current reader UI. This is a separate task, not part of this PR.
