# Backend SRS fixes (PR #85): evidence round 2

Round 2 answers the review of PR #85 at `14ccd617` (P1 archived chapters, P2 provider text and webhook limit) and merges `main` `7b2ad2e0` (#86, #87, #88). Code under test: `4534d507`. Round 1 (`../SRS-BACKEND-R1/`) is unchanged.

## Results at `4534d507`

Full suite (`pr-head/`). Each runner ran twice on its own `ephurin_test_*` databases, all dropped. Shared database fingerprint `686d5ca351f2c4b1` was the same before and after every runner.

| Step | Exit | Result |
|---|---|---|
| typecheck web, backend | 0, 0 | PASS |
| web tests | 0 | 26 + 4 + 2 pass |
| `npm run test:isolated` | 0 | 274 pass, 0 fail, 7 skip (281 tests, includes #86–#88) |
| refusal tests | 0 | 10 OK |
| SRS acceptance × 2 | 0, 0 | 71/71, 71/71 |
| social × 2 | 1, 1 | stops at reader login (expects `/reader`) |
| discovery × 2 | 1, 1 | stops at reader login (expects `/reader`) |
| smoke × 2 | 1, 1 | 119/138, 120/138; every failure is in the reader role |

## Browser runners fail on `main` too

The same three runners were run once on `main` `7b2ad2e0` (`main-baseline-browser/`):
- social and discovery stop at the same reader login step;
- smoke is 120/138 with the same 18 failing checks as this branch's second run.

The causes are #88's reader UI: readers now land on `/` after login, the reader menu has new labels, and the like button lost `data-testid="reader-like-btn"`. The runners from #73 have not been updated for it. This branch does not touch the reader UI.

The first smoke run here had one more failure: `1440-light reader/chapter-prose-dark`, a click target that was not ready. It passed in the second run and on `main`, so it is flaky.

## SRS baseline on `main`

`main-baseline/`: the SRS runner from this branch (LLM stub provider, removal readback) run twice on `main` `7b2ad2e0`. Both runs gave 60/71 with the same 11 failing checks this branch fixes; #86–#88 fixed none of them.

## Review P1: red, then green

- `p1-red.log`: the new P1 tests before the fix. Five archived chapters were admitted, and an archive racing the submission slipped through.
- `p1-green.log`: after `bc0cad6e`, both pass, along with the moderation lifecycle test.

## Workbook

`system-test-report.xlsx`: 133 test cases, 98 Pass, 18 Fail, 17 N/A. 17 Fail rows also fail on `main` (the reader runners above) and 1 is the flaky smoke check; each row's Evaluation cell says which. The 11 SRS checks pass here and fail on every `main` baseline run. Built with:

```
python scripts/build_system_test_report.py --manifest docs/development/SRS-BACKEND-R2/pr-head/manifest.json \
  --baseline docs/development/SRS-BACKEND-R2/main-baseline/srs-acceptance-run-1.json docs/development/SRS-BACKEND-R2/main-baseline/srs-acceptance-run-2.json \
  --browser-baseline docs/development/SRS-BACKEND-R2/main-baseline-browser --pr-label "PR #85" --out docs/development/SRS-BACKEND-R2/system-test-report.xlsx
```

## Not covered

- P7/P8 CI at the new head: shows on GitHub after push.
- The new web form hints were not opened in a browser by hand.
- The four manual E2E scripts that write to the shared database were not rerun.
