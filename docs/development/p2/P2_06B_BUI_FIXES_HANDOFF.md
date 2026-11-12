# P2-06B — BUI-01..04 fixes handoff

| Field | Value |
|---|---|
| Work branch | `claude/p2-06b-bui-fixes` |
| Base | `gemini/p2-06b-ai-brainstorming-ui` @ `637e21cb73c53fce73154541cfaf8981209a4d93` |
| Integration baseline | `integration/p2-planning-studio` @ `f1ed34cd76582e8a1d641ef54fe57f28523e2114` |
| HEAD | see `git log -1` on the work branch (this document ships in that commit) |
| Provider | fake / HTTP mocks only. No live LLM, no API key, no budget used |
| Verdict | `READY_FOR_REVIEW` (local evidence only; CI on the exact HEAD not run yet) |

`READY_FOR_REVIEW != MERGED != PRODUCTION_READY`. The original Gemini handoff
`P2_06B_AI_BRAINSTORMING_UI_HANDOFF.md` is left unchanged as history.

## Findings and resolution

| ID | Was | Fix | Invariants |
|---|---|---|---|
| BUI-01 (P1) | `StoryPlanEditor` sent `expected_plan_version = head` (local draft's `head_version`). Backend `_get_active_plan_info` compares with the **active** plan's `plan_version` and 409s when there is no active plan, so new novels (head 0) and novels with a newer inactive draft could not brainstorm. | Send the active plan's `plan_version` from the server readback; omit the field only when the readback names no active plan (nothing to compare). CAS is not removed. | INV-07, INV-08 |
| BUI-02 (P1) | Setup `all` rendered Future Event cards with a live "Chọn dùng" button but no handler (no-op). | Planning Studio registers the mounted Story Plan editor as the event adopter; Setup forwards adopted events there. The event lands in the **local plan draft** (creating a chapter card if needed, also when no plan exists). Modal only offers scopes whose handlers exist and hides adopt buttons without a handler (E1: plan editor no longer offers rules/characters). Handlers return a reason instead of silently failing (read-only plan, pending recovery, not loaded). | INV-02, INV-01 |
| BUI-03 (P1) | Edited character `description`/`role` (and archetype, aliases) were dropped on adopt. setup-v1 `Declaration` is `extra='forbid'` with only `declaration_id/entity_type/display_name/aliases`. | Owner decision (2026-11-12): **device-local draft + warning**. The reviewed text goes into a per-declaration note in `localStorage` (`ephurin-planning:<actor>:<novel>:character-notes`), editable in the character card, with a visible warning that it is not sent to the server, Canon or AI. setup-v1 payload is unchanged. No contract change. | INV-09, INV-06 |
| BUI-04 (P2) | Safe Retry replayed `lastRequestRef` with the old key even after the author changed the form; it was also offered for 409. | Retry is offered only for retryable statuses (network/429/502/503/504) and only while the current form builds the byte-identical request (incl. expected versions); otherwise it is disabled with a warning and "Tạo gợi ý AI" sends a new request with a new key. 409 shows "Đọc lại trạng thái máy chủ" (host reload) instead of retry. | INV-07 |

Additional hardening in the same paths:
- Adopted rules/characters get a fresh setup-v1 label every time (re-adopting a replayed suggestion can no longer create duplicate `declaration_id`s → 422).
- Adopted plan events get a fresh `event_id`; the event title is kept in the event text (`title: summary`) instead of being dropped.
- An event whose chapter was changed in the card goes to the matching chapter, not to the card the modal was opened from.

## Not changed / capability gaps

- Post-M0: Setup brainstorm buttons stay disabled once the source is locked. Adding **new** rules/characters from AI after M0 has no contract; it is a capability gap, not bypassed in the frontend. Rule edits after M0 still go through UX-05 amendments.
- Character notes are device-local by decision; carrying role/description to the server needs a setup-v1 contract change + ADR.
- E3 (not verified): whether `POST .../brainstorm` returns 404 `BRAIN_NOT_FOUND` before a Story Brain exists for a brand-new idea-first novel. Needs a real-gateway check in P2-07.
- Mocks are HTTP-level; real Gateway + PostgreSQL/MongoDB acceptance belongs to P2-07.

## Evidence

New suite `web/tests/p2-06b-bui-regressions.browser.test.mjs` uses mocks that enforce the
backend contracts (active-plan CAS exactly as `_get_active_plan_info`, brain CAS,
idempotency key/payload conflict, strict setup-v1 declarations).
`P206B_BUI_ONLY=<id>` runs one scenario.

RED on the unfixed UI (`637e21cb`, same test file, one scenario at a time):

| Scenario | Result on 637e21cb | Failing expectation |
|---|---|---|
| bui01a no plan | FAIL | event card never shown (409 PLAN_VERSION_CONFLICT) |
| bui01b active v1 + inactive v2 | FAIL | event card never shown (409) |
| bui02 setup `all` | FAIL | `event-adopted-badge-0` never shown (no-op button) |
| bui03 character notes | FAIL | note with edited description missing |
| bui04 retry | FAIL | stale-payload warning missing (old payload replayed) |

GREEN results on the fix: see "Local test run" below.

## Local test run

Windows 11, Node + Playwright (Edge channel), fake/mocked HTTP, 2026-11-12.

| Command | Exit | Result |
|---|---|---|
| `npx tsc -b` | 0 | PASS |
| `npm run build` | 0 | PASS (chunk-size warning only) |
| `node --test tests/p2-06b-bui-regressions.browser.test.mjs` | 0 | PASS (5 scenarios) |
| `node --test tests/p2-06b-brainstorming.browser.test.mjs` (Gemini suite, `P206B_EVIDENCE_DIR` redirected to temp so tracked evidence PNG is not overwritten) | 0 | PASS |
| `node --test tests/planning-studio.browser.test.mjs` | 0 | PASS |
| `node --test tests/p2-07a-ux01-ux04-regression.browser.test.mjs` | 0 | PASS |
| `node --test tests/p2-07b-ux03-world-review.browser.test.mjs` | 0 | PASS |
| `node --test tests/p2-07f-ux05-world-amendment.browser.test.mjs` | 0 | PASS |
| `tests/author-ide.browser.test.mjs`, `tests/draft-persistence.browser.test.mjs` | 0 | `NOT_RUN` — skipped without `RUN_DRAFT_BROWSER_TESTS=1` + isolated PG/Mongo (runs in CI) |
| ai-service / backend tests | — | `NOT_RUN` — no backend files changed |
| GitHub Actions P2/P7/P8 on exact HEAD | — | `NOT_RUN` — needs push + Draft PR |

## Commands

```bash
cd web && npm ci
npm run build
npm run test:p2-06b
node --test tests/planning-studio.browser.test.mjs tests/p2-07a-ux01-ux04-regression.browser.test.mjs tests/p2-07b-ux03-world-review.browser.test.mjs tests/p2-07f-ux05-world-amendment.browser.test.mjs
node --test tests/author-ide.browser.test.mjs tests/draft-persistence.browser.test.mjs
```

CI: `.github/workflows/p2-setup-provenance.yml` now runs both P2-06B browser suites
(Chromium) on PRs into `integration/p2-planning-studio`.
