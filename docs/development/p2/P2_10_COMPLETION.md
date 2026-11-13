# P2-10 — P2 completion fixes (#132–#137)

| Field | Value |
|---|---|
| Base | `integration/p2-planning-studio` @ `00925084` |
| Branch | `claude/p2-10-p2-completion` |
| Source | P2-07 Phase 1 acceptance findings F-02, F-10, F-13, F-14, F-15 and the compose flag finding (issues #132–#137) |
| Owner decisions (2026-11-13) | #132 enable by default; #133 give no-setup novels an explicit route into memory |
| Status | `READY_FOR_REVIEW` (not merged, not deployed) |
| CI note | `p8-cutover.yml` root-compose smoke pins `ENTITY_CANDIDATE_VERIFICATION_ENABLED=false`: its AI-PIPE gates validate the legacy entity-v1 path; the entity-first path runs in the P2 integrated jobs. |

## Changes

| Issue | Change | Where |
|---|---|---|
| #132 | Root compose passes `ENTITY_CANDIDATE_VERIFICATION_ENABLED=${…:-true}` to `ai-service` (postgres repository). Code default in `ai-service/core/settings.py` stays `false` (JSON/unit modes unchanged); the flag can still be turned off per deployment. | `docker-compose.yml` |
| #133 | **Correction to F-02:** the route already exists. A novel without World Setup can enter the P1 loop through Memory → "Trích xuất dữ liệu tiểu thuyết từ các chương đã lưu" → review → "Kích hoạt bộ nhớ sau duyệt" (manuscript bootstrap, `MANUSCRIPT_BOOTSTRAP` revisions, author review before activation). Phase 1 missed it because nothing in Planning Studio pointed to it. Fix: Planning Studio shows "Bắt đầu bộ nhớ từ chương đã lưu" when memory is inactive and at least one chapter has text; it opens the Memory drawer on the extraction tab. The extraction tab text explains both routes. **No new activation contract (empty-M0) was added**, since it is not needed. **Gap found and fixed (with #132 on):** manuscript bootstrap chapters pause in `waiting_entity_review` and their proposals only appear after "continue", yet the job already reported `waiting_review` with no required proposals, so the baseline could be activated before any review. `ManuscriptBootstrapService.activate_baseline` now refuses with `409 BOOTSTRAP_ENTITY_REVIEW_PENDING` while an entity review of the job's analysis runs is open, and with `409 BASELINE_REVIEW_REQUIRED` while any proposal produced by those runs is pending. The Memory panel and the import page show a plain explanation. | `PlanningStudio.tsx`, `AuthorMemoryPanel.tsx` (`initialTab`), `AuthorWritingIde.tsx` |
| #134 | "Last written chapter" means the highest chapter number with `wordCount > 0`; empty chapter slots stay open for planning. The top-level "AI gợi ý sự kiện tương lai" defaults to the first plan card after it, or else to last written + 1. The modal warns when the target is a written chapter, and adopting a future event into a written chapter is refused with a reason (INV-02). Manual plan editing is unchanged. | `PlanningStudio.tsx`, `StoryPlanEditor.tsx`, `BrainstormingModal.tsx` |
| #135 | `usePlanningDraft` listens to `storage` events for its key. If another tab removes the shared backup while this tab has unsaved edits, this tab writes its copy back at once and shows a notice; if another tab overwrites it, this tab warns. Server CAS/readback is unchanged. | `planning-draft.ts`, `StoryPlanEditor.tsx`, `SetupFoundationPanel.tsx` |
| #136 | **Correction:** "Thử lưu lại" already existed. New: failed saves (except 409 conflicts) retry automatically with backoff (2 s, 4 s, 8 s … max 30 s) and right away on the browser `online` event; the message says when. "Thử lưu lại" is now the primary button. "Tải bản máy chủ" asks for confirmation while there are unsaved changes. | `useDraftPersistence.ts`, `AuthorWritingIde.tsx` |
| #137 | The amendment manager re-reads the Brain version (silently) after a same-window memory change (`ephurin:memory-changed`, sent by the Memory panel after every successful action), when the page becomes visible again, and when the author opens "Đề xuất sửa quy tắc". The existing one-click 409 rebase that keeps the draft is unchanged. | `memory-events.ts`, `AuthorMemoryPanel.tsx`, `WorldRuleAmendmentManager.tsx` |

## Evidence

| Check | Result |
|---|---|
| `web`: `npx tsc -b --noEmit` | exit 0 |
| #133 manual route on the isolated QA stack (`ephurin-p2qa`, fake provider, entity flag on): no-setup novel → manuscript snapshot → `from-manuscript` → `waiting_review` → activate | Brain `active` with baseline revision; ch.2 save created a revision; outbox `COMPLETED`; `analysis_runs`: `bootstrap_manuscript` + `incremental_story_analysis`, both `entity-human-review-v1` (`Pipeline_test/p2-07/s1b-manuscript-route.mjs` on `claude/p2-07-acceptance-plan`) |
| #133 activation gate on the QA stack (patched `bootstrap_service.py` copied into the QA ai-service; `s1b-manuscript-route.mjs gate`) | before entity review → `409 BOOTSTRAP_ENTITY_REVIEW_PENDING`; after entity review and continue → `409 BASELINE_REVIEW_REQUIRED` (1 proposal); after accepting it → `200 active`. The earlier probe (row above) had activated with 2 entity reviews still open, which is the gap. |
| `ai-service`: `pytest tests/test_manuscript_bootstrap.py tests/test_manuscript_bootstrap_routes.py tests/test_p2_bootstrap_guard.py tests/test_ai_pipe_01_p1_closed_loop.py` | 19 passed; new `test_baseline_waits_for_entity_review_and_its_later_proposals` **fails on the base service** |
| New `tests/p2-10-completion.browser.test.mjs` (c133, c134, c135) | pass; each scenario **fails on the unfixed UI** (base `00925084`) |
| `tests/p2-07f-ux05-world-amendment.browser.test.mjs` + new #137 scenario | pass; the #137 scenario **fails on the unfixed UI**. One later assertion now reads the current version instead of hard-coded `Brain v3`. |
| `tests/draft-persistence.browser.test.mjs` + new #136 scenario (isolated Postgres container and Mongo database, dropped afterwards) | pass; see the PR for the result against the unfixed hook |
| Other P2 browser regressions (`p2-06b-*`, `planning-studio`) | see PR |

CI: the new suite runs in `p2-setup-provenance.yml` next to the BUI regressions; the draft-persistence change runs in the existing "Mounted P1 Writer autosave recovery" step.

## Not covered / follow-ups

- #138 (minor P2/P3 polish) is out of scope.
- The Setup-step "all" brainstorm does not show the #134 warning (its modal has no plan context), but adoption into a written chapter is refused there too, with the same reason.
- Live-model behaviour (Phase 2) is not part of this change.
