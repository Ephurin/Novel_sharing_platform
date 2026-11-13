# P2 final acceptance (post P2-10 / SEC-01 merge)

| Field | Value |
|---|---|
| Tested source | `integration/p2-planning-studio` @ `d4854697` (merge of PR #140 on top of PR #139 `bdaebe5a`) |
| Report head | this branch = `d4854697` + this document only |
| Provider | fake (`LLM_PROVIDER=fake`, no keys, no network model calls) |
| Stack | fresh isolated local stack `docker-compose -p ephurin-p2final -f docker-compose.yml` (root compose, **no override**: verifies #132 default) |
| Verdict | **`P2_FINAL_ACCEPTANCE_PASS_WITH_FOLLOW_UP`** (pending this PR's CI run of the integrated S1–S7 suite). One P2 defect found and fixed in a separate PR; live-UI rechecks of drawer-based steps are still open (see below) |

`READY_FOR_REVIEW` ≠ merged ≠ production ready. Live-model quality (Phase 2) is not part of this verdict.

## Why the merged source needed its own run

PR #139 (dependency updates) and PR #140 (P2-10 fixes) were each green on their own heads, but CI does not run on pushes to `integration/p2-planning-studio`, so the combined tree `d4854697` had not been tested as a whole. This report tests it locally, and this PR's CI runs the integrated S1–S7 suite (`scripts/p2_07a_acceptance.py --suite p2-08b`) on it.

## Results

| Area | Check | Result |
|---|---|---|
| Build | `web`: `npm ci`, `tsc -b --noEmit`, `npm run build` | PASS |
| Security | `web`: `npm audit --omit=dev` | 0 vulnerabilities |
| ai-service | `pytest` (non-DB selection) | 478 passed, 42 skipped, 0 failed |
| Web regressions (Edge, mocked HTTP) | `p2-10-completion`, `p2-06b-bui-regressions`, `p2-06b-brainstorming`, `planning-studio`, `p2-07f-ux05-world-amendment`, `p2-07b-ux03-world-review`, `p2-07a-ux01-ux04-regression`, `api-client-security` | 8/8 suites pass |
| #132 | root compose, no override: `ai-service` env `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`; analysis runs use `entity-human-review-v1` | PASS |
| S1b (no setup), UI | novel without setup; ch.1 created and written in the Writer, autosave "Đã lưu" (server `word_count` 30); Planning Studio shows "Bắt đầu bộ nhớ từ chương đã lưu" | **PASS after reload only → F-FA-01** |
| S1b, gateway (same calls as the Memory panel) | manuscript snapshot → `from-manuscript` → `waiting_review`; activate → `409 BOOTSTRAP_ENTITY_REVIEW_PENDING`; entity review + continue → activate → `409 BASELINE_REVIEW_REQUIRED` (1 proposal); accept → `200 active`, baseline set; ch.2 save → revision, outbox `COMPLETED`, `incremental_story_analysis` run (`entity-human-review-v1`) | PASS |
| S1–S7 integrated (setup route, long plans 5/10/21, same-name identity, plan vs history, two tabs, isolation/temporal) | this PR's CI (`integrated-first-chapter`) on `d4854697` + docs | see PR checks |

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-FA-01 | P2 | The IDE read the chapter list once. Text written after the IDE loaded did not count as a written chapter in Planning (no "Bắt đầu bộ nhớ từ chương đã lưu", and #134's future-event default ignored it) until a full page reload. | Fix in PR #141 (`claude/p2-11-final-fixes`) (re-read the list when Planning opens and on "Đọc trạng thái mới"); regression `c133b` fails on `d4854697` and passes with the fix |

## Not re-verified live in this run

The Memory drawer did not open in the built-in browser pane because the pane was hidden (the drawer's open transition needs the page to paint). These steps are covered by regression tests that pass on `d4854697`, but they were not clicked through live in this run:

- S1b drawer click-through (CTA → extraction tab → extract → activate): `p2-10-completion` c133 (mocked); gateway path verified above.
- #135 two tabs: `p2-10-completion` c135.
- #136 save outage with auto-retry: `draft-persistence` #136 scenario (isolated PG/Mongo; run on PR #140).
- #137 amendment panel Brain version: `p2-07f-ux05-world-amendment` #137 scenario.

## Not in scope

#138 (minor polish), zod 4 migration (owner: after P2), Phase 2 live-model evaluation and Track B uplift.
