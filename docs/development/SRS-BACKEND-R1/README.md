# Backend SRS fixes: evidence round 1

Branch `fix/srs-backend-rules`, cut from `2d7152d` (the head of PR #73 that was approved). Code under test: `4d89f0a0`. Later commits only touch this folder, the disposition table and the workbook builder text.

- `pr-head/`: full evidence suite at `4d89f0a0` (`manifest.json`, `README.md`, `screenshots/`). Every step exit 0. Each browser/API runner ran twice on its own `ephurin_test_*` databases, all dropped. Shared database fingerprint `686d5ca351f2c4b1` before = after.
  - typecheck web and backend; web tests 26 + 4 + 2.
  - backend isolated suite 247 pass, 0 fail, 5 skip.
  - refusal tests 10 OK.
  - social 8/8 × 2, discovery 8/8 × 2, smoke 138/138 × 2, SRS acceptance 71/71 × 2.
- `main-baseline/`: the same SRS runner run twice on `main` `06ecfbbe`, 60/71 both times, failing the 11 checks this branch fixes. A first attempt stopped at stack start (web preview not ready), ran no checks, and is not included.
- `system-test-report.xlsx`: 133 test cases, 116 Pass, 0 Fail, 17 N/A. The Evaluation cell of each fixed check records that it failed on every `main` baseline run.

Disposition of the 11 checks and the policy decisions: `docs/testing/srs-disposition.md`.

Not covered: the new web form hints (synopsis counter, chapter publish checklist) were not opened in a browser; the smoke matrix only shows the author pages still render. The four manual E2E scripts that write to the shared database were updated but not rerun.
