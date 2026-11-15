# Backend SRS fixes (PR #85): evidence round 5, legacy draft restore

Review R5 (2026-11-12, at `ddf184c0`) found one D6 gap. When a novel removed before sanctions existed is restored, the restore cleared `deletedAt` on every deleted Mongo draft of a restored chapter. That included a draft deleted before the removal, so restore brought back content the D6 contract says must stay deleted. R1–R4 are kept unchanged.

Code under test: `24717283`.
- `abc89fbb` adds the test.
- `24717283` is the fix.
- `main` is still `25fa0fd9`, so no merge was needed.
- Later commits only add this folder and docs.

## Fix

`restoreNovelAggregate` reads the novel's `deleted_at` (`FOR UPDATE`) before clearing it and returns it as the removal time. `restoreDraftChaptersByNovelId` brings a draft back only if:
- its chapter came back, and
- the draft was deleted at or after that removal time.

Without a removal time, nothing comes back.

Why the removal time identifies what the removal hid:
- The old removal (`markDraftChaptersDeletedByNovelId`) marked only drafts that were still live. It stamped them with its own time, after setting the novel's `deleted_at` in the same transaction.
- Nothing inside a removed novel can be deleted while it is removed.
- In git history, the only code that sets a draft's `deletedAt` is that removal and the sanction job. The sanction job always tags the draft with `adminSanctionId` and does not use this path.

Limit: the rule compares a Mongo time written by the API with a PostgreSQL time, so it assumes one demo instance where the API and the database share a clock.
- Measured before the runs: the database clock was within 0.4 s of the host clock.
- If the API clock is behind the database clock, drafts stay deleted. That is the safe direction.

## D6 focused tests: RED, then GREEN

`backend/src/modules/admin/novel-removal-d6.postgres.test.ts`:
- Pre-sanction restore test: adds a chapter that was live at removal but whose draft had been deleted earlier. The removal is simulated with the real legacy helper. Restore must bring the chapter back and leave that draft byte for byte (`deepEqual`).
- Sanction test: the same case is added to the "never touched" set. It passed before the fix, because the HIDE job only touches live drafts or drafts tagged by a sanction.

| Log | Code | Result |
|---|---|---|
| `d6-red.log` | `abc89fbb` (test only; backend as `ddf184c0`) | 23/24. The draft deleted on 2026-01-01 came back (`deletedAt: null`, `deletionReason: null`, `restoredAt` set) |
| `d6-green.log` | `24717283` | 24/24 (7 D6 + 17 SRS backend) |

## Full suite at `24717283` (`pr-head/`)

Each runner ran twice on its own `ephurin_test_*` databases, and all were dropped. The shared database fingerprint `c22bccf7d96a3ab6` was the same before and after every runner. It differs from R4's `686d5ca3…` because the shared dev database has since been migrated to `025` and used. No runner wrote to it.

| Step | Exit | Result |
|---|---|---|
| typecheck web, backend | 0, 0 | PASS |
| web tests | 0 | 51 + 4 + 2 pass |
| `npm run test:isolated` | 0 | 287 pass, 0 fail, 7 skip |
| refusal tests | 0 | 10 OK |
| SRS acceptance × 2 | 0, 0 | 71/71, 71/71 (policy D1-D7 2026-11-09) |
| smoke × 2 | 1, 1 | 102/138 twice. The 36 failing checks are identical to `main` `25fa0fd9` (`../SRS-BACKEND-R4/main-baseline-browser/smoke.json`) |
| social × 2, discovery × 2 | 1 | Stop at the same reader login step as `main` |

The first suite run at the same SHA had no `git` on `PATH`, so its manifest recorded no SHA. It was deleted and the whole suite was run again. Its counts were the same.

## CI gates run locally at `24717283` (`ci-acceptance/`)

Both scripts ran from a clean worktree of the exact SHA, with disposable databases, the fake LLM provider and Microsoft Edge:
- Studio acceptance (`scripts/run_pr86_review_acceptance.mjs`): 9/9 steps exit 0.
- Reader acceptance (`scripts/run_reader_acceptance.mjs`): 6/6 steps exit 0. The disposable database was confirmed dropped from both PostgreSQL and MongoDB.
  - An earlier attempt was cut off by a 10-minute limit on the local shell command, during the last browser file. Every test before the cut-off had passed.
  - That attempt left no databases or processes behind. The run recorded here is a complete re-run.

## Baselines

`main` has not moved since R4 (`25fa0fd9`), so the R4 baselines still apply:
- `../SRS-BACKEND-R4/main-baseline/`: SRS 60/71 twice.
- `../SRS-BACKEND-R4/main-baseline-browser/`: smoke, social and discovery.

## Workbook

`system-test-report.xlsx`: 133 test cases, 96 Pass, 20 Fail, 17 N/A. Every Fail also fails on `main` `25fa0fd9`, and each row says so.

## Not covered

- P7/P8 and the two acceptance workflows on GitHub run after push.
- The reader-role browser runners from #73 still need updating for the current reader UI. This is a separate task.
