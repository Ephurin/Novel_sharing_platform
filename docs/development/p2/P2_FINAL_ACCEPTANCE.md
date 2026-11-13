# P2 final acceptance (post P2-10 / SEC-01 merge)

| Field | Value |
|---|---|
| Tested source | `integration/p2-planning-studio` @ `d4854697` (merge of PR #140 on top of PR #139 `bdaebe5a`) |
| Report head | this branch = `d4854697` + this document only |
| Provider | fake (`LLM_PROVIDER=fake`, no keys, no network model calls) |
| Stack | fresh isolated local stack `docker-compose -p ephurin-p2final -f docker-compose.yml` (root compose, **no override**: verifies #132 default) |
| Verdict | **`P2_FINAL_ACCEPTANCE_PASS_WITH_FOLLOW_UP`**: every P2 scenario passes on the merged source; one P2 defect (F-FA-01) found here is fixed in PR #141, whose CI is fully green |

`READY_FOR_REVIEW` ≠ merged ≠ production ready. Live-model quality (Phase 2) is not part of this verdict.

## Why the merged source needed its own run

PR #139 (dependency updates) and PR #140 (P2-10 fixes) were each green on their own heads, but CI does not run on pushes to `integration/p2-planning-studio`, so the combined tree `d4854697` had not been tested as a whole. This report tests it locally and live in the UI. This docs-only PR triggers no workflow (path filters), so the integrated S1–S7 CI evidence comes from PR #141, whose head `14f35ffc` is `d4854697` plus the small F-FA-01 UI fix.

## Results

| Area | Check | Result |
|---|---|---|
| Build | `web`: `npm ci`, `tsc -b --noEmit`, `npm run build` | PASS |
| Security | `web`: `npm audit --omit=dev` | 0 vulnerabilities |
| ai-service | `pytest` (non-DB selection) | 478 passed, 42 skipped, 0 failed |
| Web regressions (Edge, mocked HTTP) | `p2-10-completion`, `p2-06b-bui-regressions`, `p2-06b-brainstorming`, `planning-studio`, `p2-07f-ux05-world-amendment`, `p2-07b-ux03-world-review`, `p2-07a-ux01-ux04-regression`, `api-client-security` | 8/8 suites pass |
| #132 | root compose, no override: `ai-service` env `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`; analysis runs use `entity-human-review-v1` | PASS |
| S1b (no setup), UI, novel A | ch.1 created and written in the Writer, autosave "Đã lưu" (server `word_count` 30); Planning Studio shows "Bắt đầu bộ nhớ từ chương đã lưu" | **only after a page reload → F-FA-01** |
| S1b (no setup), UI, novel B (live click-through) | CTA opens the Memory drawer on "Trích xuất" → extract → `waiting_review`, "Chờ duyệt (0)" → "Kích hoạt bộ nhớ sau duyệt" shows "Chưa thể kích hoạt bộ nhớ: còn chương đang chờ bạn xác nhận nhân vật…" → entity review completed (gateway, as in Phase 1 S4) → "Chờ duyệt (1)", activate button disabled → "Duyệt nguyên tử toàn bộ nhóm" → activate → Brain `active` v2 with baseline; editing ch.1 in the Writer → `AUTHOR_MANUAL` revision, outbox `COMPLETED`, `incremental_story_analysis` run | PASS |
| S1 (setup route), UI | idea + 1 world rule + 1 character → "Lưu và xử lý thiết lập" → group review (accept both, new server identity) → "Lưu quyết định toàn nhóm" → "Kích hoạt thiết lập để bắt đầu viết" → "Bộ nhớ truyện đang hoạt động"; amendment panel available | PASS |
| #134, UI | ch.1 written; outline step "AI gợi ý sự kiện tương lai" defaults "Chương mục tiêu" to 2, no warning | PASS |
| #137, UI | amendment panel shows Brain v3 → manual proposal created and approved in the Memory drawer (same window) → panel shows Brain v4 without reload → first "Gửi đề xuất sửa" creates a pending amendment (no 409) | PASS |
| #135, UI (two tabs, same browser profile) | tab 1 adds 5 outline cards (unsaved, backed up); tab 2 "Bỏ bản sửa dàn ý trên thiết bị" → tab 1 shows "Một tab khác vừa bỏ bản dự phòng trên thiết bị…" and the backup is written back (5 cards, new `savedAt`) | PASS |
| #136, UI (MongoDB container stopped, then started) | PATCH → 500, the next PATCH is sent with no keystroke; after MongoDB restarts the editor shows "Đã lưu" and the Mongo draft holds the new sentence | PASS (note: each attempt hangs ~30 s, so the author mostly sees "Đang lưu…"; the shorter client timeout suggested in #136 is not implemented) |
| S1b, gateway (same calls as the Memory panel) | manuscript snapshot → `from-manuscript` → `waiting_review`; activate → `409 BOOTSTRAP_ENTITY_REVIEW_PENDING`; entity review + continue → activate → `409 BASELINE_REVIEW_REQUIRED` (1 proposal); accept → `200 active`, baseline set; ch.2 save → revision, outbox `COMPLETED`, `incremental_story_analysis` run (`entity-human-review-v1`) | PASS |
| S1–S7 integrated (setup route, long plans 5/10/21, same-name identity, plan vs history, two tabs, isolation/temporal) | PR #141 CI on `14f35ffc` (= `d4854697` + F-FA-01 fix): `integrated-first-chapter` [run 43463437556](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/43463437556/job/132016146510); all 9 checks green | PASS |

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| F-FA-01 | P2 | The IDE read the chapter list once. Text written after the IDE loaded did not count as a written chapter in Planning (no "Bắt đầu bộ nhớ từ chương đã lưu", and #134's future-event default ignored it) until a full page reload. | Fix in PR #141 (`claude/p2-11-final-fixes`) (re-read the list when Planning opens and on "Đọc trạng thái mới"); regression `c133b` fails on `d4854697` and passes with the fix |

## Observed, already tracked

- Rule titles show `setup_rule_rule_<hex>`; low-contrast "Nội dung Canon đang hiệu lực" and before/after boxes in dark theme; IDE toolbar overlap at ~680 px (#138 / F-07, F-16).

## Not in scope

#138 (minor polish), zod 4 migration (owner: after P2), Phase 2 live-model evaluation and Track B uplift.
