# PR #86 review fixes and acceptance

## Regression reproduction

Commit `0bc87b44a8a22322e7d49a1be15dd6e3ed93712b` adds the failing regressions against the reviewed implementation (`09878ff5`). Both failures are intentional at that reproduction commit:

- `python -m pytest tests/test_writing_cursor_persistence.py -q` in `ai-service`: rejects neither the wrong rewrite insertion nor replacement patches for insertion operations. Result: 5 failures (including subtests), 7 passes, 13 passing subtests.
- `node --test tests/rich-manuscript-serialization.browser.test.mjs` in `web`: `<div>a</div><div><br></div>` produces `a\n\n` instead of `a\n`. Exit 1.

Captured outputs: [AI red run](pr86-review/red-ai.log), [rich editor red run](pr86-review/red-rich.log). These logs contain synthetic fixtures only; workstation paths are normalized.

## P1: operation-aware patch placement

| Operation | Allowed patch bounds | Selected text |
| --- | --- | --- |
| `rewrite` | Exactly `[selection.start, selection.end)` | Replaced |
| `continue`, `describe`, `dialogue` | Exactly `[cursor, cursor)` | Context only; never deleted |
| Historical P3 `continuation` | Exactly `[cursor, cursor)` | Alias of `continue`; context is never deleted |
| Unknown operation | Validation fails | Not accepted |

The policy runs both when generation completes and when a completed job is read. Legacy completed rows retain their original stored history, but mismatched suggestions are returned as failed and must be regenerated. Regression cases use a selected range `[2,8)` and cursor `8`, and reload jobs through the actual SQLAlchemy repository. The same cases run on SQLite and opt-in real PostgreSQL in a newly created disposable database.

The Backend accept-contract suite checks that a rejected rewrite does not change the draft, latest revision, revision rows, or outbox event identities. No real provider is called.

### P3 compatibility follow-up

The re-review of `b102053feb4fce77c1e1f0890db01a041d4bae5a` caught the existing P3 controller's `continuation` alias being rejected by the new allowlist. P8 run `41990297129` reproduced the production-path failure at checkpoint 08; the specialized Studio acceptance workflow did not cover it.

The controller now sends the canonical operation `continue`. Persisted `continuation` jobs remain readable and processable: their provider call uses `continue`, and their patches must still match the persisted cursor exactly. Stored operation and idempotency hashes are preserved. No arbitrary operation aliases are admitted.

The shared SQLite/PostgreSQL regression matrix now covers the historical alias, invalid range replacements, unknown operations, and legacy queued/completed jobs. Before the fix, these additions produce 3 failures, 9 passes and 22 passing subtests ([red log](pr86-review/red-p3-alias.log)). After the fix, the cursor and golden validation suites pass, including rejection of rewrite `[8,8)` for selection `[2,8)`.

The production P3 runner additionally asserts canonical operation and validation status, insertion bounds, and a completed transactional outbox for the accepted immutable revision. Its existing crash/resume, rejected-generation, retry and controller-intent protections remain required. Run the entire P8 workflow after pushing the new commit; the earlier Studio acceptance result alone does not close this integration gate.

## P1: rich editor newline and composition durability

- A terminal browser `BR` is a caret placeholder, not a second paragraph break. Empty blocks remain distinguishable, including consecutive blank lines.
- Source rendering represents real line breaks explicitly and uses a separate terminal placeholder. This also prevents a trailing blank line from disappearing when typing after Undo/Redo or reload.
- DOM offsets include empty editing lines and author-note atomic spans. Formatting and author-note source tokens roundtrip without changing source bytes.
- Composition input does not update the canonical buffer/autosave until commit. Chromium IME protocol tests commit Vietnamese text; they do not claim physical OS-IME coverage.
- The source-mode fallback remains visible and remembers the selection when switching in either direction. The floating selection toolbar avoids covering the mode buttons near the top of the manuscript.

## P2: exact-source evidence

Run from a clean checkout with Node dependencies installed in `web` and `backend`, Python dependencies from `ai-service/requirements.txt` plus pytest, Chrome/Chromium, PostgreSQL with pgvector, and MongoDB:

```powershell
$env:PYTHON = '<path-to-python-with-ai-service-dependencies>'
$env:PLAYWRIGHT_CHANNEL = 'chrome'
node scripts/run_pr86_review_acceptance.mjs
```

The runner records the exact tested commit and tree, clean-source status, commands, exit codes, durations, logs and tool versions in an external evidence directory. It uses only fake providers, disposable PostgreSQL databases, and fresh MongoDB databases. Both successful and failing fixtures clean up their own databases. `ADMIN_TEST_POSTGRES_URL` and `CURSOR_POSTGRES_CONTROL_URL` target the `postgres` control database to create test databases; they must never target demo/application databases.

The **Studio durability and patch placement acceptance** workflow explicitly checks out the PR's head SHA, runs the same runner, and uploads `pr86-review-<head SHA>` with screenshots and sanitized traces. Raw private traces are excluded even if sanitization fails. Download the artifact from that exact workflow run; existing P7/P8 results alone are not browser acceptance evidence.

Coverage includes:

- Actual `AuthorWritingIde` with real isolated Backend/PostgreSQL/MongoDB: Enter, consecutive Enter, Undo/Redo, caret after reload, visual/source switching, Vietnamese composition, plain-text paste, chapter/account changes, private-note isolation, preview/export and two actual tabs producing a 409 without losing local recovery.
- 1440px light/dark, 375px and 390px layouts, with normal and reduced motion.
- Public author notes, atomic references, publication visibility, reader popovers, preview and export: real production router/rendering with synthetic API fixtures. This is a frontend publication-boundary test, not a claim of live moderation/provider acceptance.
- Responsive notes geometry, typography/symbols, AI insertion caret contract and reader UI regressions.

## PR #85 integration boundary

PR #85 is still open against `main` at the time of this fix. This branch does not merge that unapproved PR or claim combined compatibility from separate CI results. The genre-creation regression synopsis now exceeds 500 characters, including its authenticated POST fixture. If #85 merges first, update this branch from the resulting `main` and rerun the exact-head acceptance workflow before merging #86.
