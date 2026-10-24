# GPT-6 next acceptance gate — PR #57 (2026-10-23)

**Scope:** handoff to Gemini, not an acceptance verdict. **Owner:** Gemini on `integration/p1-author` only. **Pinned last reviewed source:** `135ee2878124297d96eab0a1a2b16b43e3dfec01`. Re-fetch HEAD before modifications. **No writes to main, Author Workspace or pipeline-test branches.** This document does not claim the implementation or any test is complete.

## Evidence already confirmed by GitHub (independent source + Actions log review)

- P7 workflow 39897641978: success.
- P8 workflow 39897641894: failure in job `root-compose-cutover-smoke`, `Run Gate AI-PIPE-01A Production Persistence Validation`.
- Actual root-compose AI-PIPE-01A checkpoints 01–06 PASS, checkpoint 07 (accept draft) FAIL: backend returned 404 `GENERATION_NOT_FOUND` and AI Service logged `GET /v1/writing-generations/<uuid> -> 404`.
- Backend `backend/src/modules/novels/chapter-revisions.service.ts:238` calls `GET {AI_SERVICE_URL}/v1/writing-generations/{generationId}`, but FastAPI `ai-service/api/narrative_routes.py:945` declares the authenticated **internal** `GET /internal/v1/writing/generations/{generation_id}`.
- Job DTO at `ai-service/api/narrative_routes.py:951` contains job_id/novel_id/chapter_id/revision_id/content_hash/status/patch/brain_version_used, but **omits** stored `WritingGenerationJob.idempotency_key`, `tenant_id`, and `actor_id` (model in `ai-service/domain/models.py`). The backend currently passes missing `idempotency_key ?? ''` to `assertControllerIntent`: for P3 keys this skips the controller attempt fence. The backend also trusts returned job fields without an explicit checked generation/novel/chapter/tenant/actor/status match in this code path. Correct verified tests/contract rather than trusting request-supplied client generation ID alone.
- Backend also calls `/v1/story-brains/{novelId}` for a conditional freshness check; registered routes include `/v1/story-brains/by-novel/{novelId}` and `/v1/story-brains/{brainId}/state`, **not necessarily that path**. Review and test rather than silently skipping unsuccessful requests.
- `web/tests/author-ide.browser.test.mjs` now mounts genuine `AuthorWritingIde` through a purpose-built fixture, tests typing, rendered S10 findings, remount and S11 draft saves. But it intercepts all `**/ai/story-brains/**` routes and returns deterministic `check_consistency` findings from text matching. Thus evidence is **MOUNTED_UI_MOCKED_AI_PASS**, not backend/Gateway/Story Brain/LLM integration.
- Full-editor rapid Undo B→A→B, delayed in-flight A→B, cross-account/chapter, 409 and active-baseline hashes remain exercised only by the separate hook-only draft fixture, not the new actual editor.
- Current `test-summary.json.baseCommitSha` and `commands-and-exits.json.testedCommitSha` still reference `157b71f` rather than the tested new source `c8bf45e`; historical `PR-54-55-REVIEW/draft-trace.zip` is overwritten by new evidence. Fix provenance; preserve old evidence where available.

## Workstream 1 — P0/P1 internal generation contract and full P8 CI

1. Write RED integration/contract tests first for **the registered private route**, verifying service-token auth, proper 401/403/404, that a legitimate completed generation is retrievable by its job ID, DTO structure (including immutable `idempotency_key`, tenant, actor), negative cross-novel/chapter/tenant/actor cases, non-completed/rejected generation, invalid or stale base hash, and valid P1 success.
2. Correct the backend URL to the existing authenticated `/internal/v1/writing/generations/{id}`, preserving request headers and fail-closed authentication; do not add public aliases or weaken checks.
3. Contract-match returned `job_id` to requested `generationId`, `novel_id/chapter_id` to server-verified ownership and chapter parent, tenant/actor scope to trusted identity, `status=completed`, `validation_status=passed`, usable patch, valid base revision belonging to this chapter/novel and hash. If legacy null actor support is necessary, document compatibility and explicit rule; never silently accept mismatch.
4. Add `idempotency_key` to the internal server-only DTO sourced from stored `WritingGenerationJob`. Validate **P3 controller key malformed/missing**, stale intent, stopped/cancelled run and superseded plan are rejected by `assertControllerIntent`; ordinary P1 and P2 accepted jobs remain compatible. The lookup is service-scoped; no direct client privilege escalation.
5. Correct/check Brain freshness path and semantics; no silent pass on arbitrary 404 if the source is required. Ensure snapshot accepted replay remains idempotent and revision/outbox/Mongo reconciliation unchanged.
6. Run all targeted tests, **the exact `.github/workflows` P8 root-compose AI-PIPE-01A command/script `scripts/run_ai_pipe_01a_production_persistence.py`**, and full P8 GitHub Actions. Do **not** declare P8 green from isolated `test_p8_json_postgres_cutover_integration.py` 15 PASS or standalone internal tests. Continue checkpoint 08 onward only if 07 succeeds.

## Workstream 2 — truthful S09→S11 acceptance

- In the real `AuthorWritingIde` Playwright suite, add rapid Undo **B→A→B** before debounce with zero unintended PATCH, in-flight A→B, route/chapter/account separation, version-0 initial, two-tab 409 recovery and *server authoritative* draft/version/revision/outbox hash readback on an active Story Brain. Preserve hook-only fixture as separate regression.
- S10 UI mock is useful but label `MOCKED_UI_PASS`. Add a distinct **unintercepted** offline fake-provider Gateway→AI Service→approved Story Brain consistency flow, with contradictory state and evidence, revision and actor scope; if fake provider cannot perform semantic contradiction detection, mark quality `NOT_ASSESSED` and test only supported contract/canned provider interactions.
- S11 test **real browser reload** (`page.reload()`), and separately route remount; verify restored editor, saved version, Story Brain readbacks and subsequent revision/outbox after edits. Browser-only Story Bible tab navigation is not memory correctness proof.
- G4 Reader/Author/Admin UI screens should be separately enumerated and only actual visited browser paths marked `BROWSER_PASS` — backend integration tests don't cover those screens.

## Evidence + stop gate

- Source and tests commit first, exact SHA. Evidence documents under `docs/development/integration/p1-author/evidence/2026-10-23-remediation/` only; **never overwrite older logs/traces**. Redacted HTTP/Python/Node logs, egress/provider calls=0 proof, exact commands/exit codes, actual CI run IDs, per gate PASS/FAIL/NOT_RUN, source readback hashes and Playwright traces.
- Updated `FINAL_HANDOFF.md`, `test-summary.json` and `commands-and-exits.json` must reference accurate **tested source commit**, not pre-fix `157b71f`. Report S09 full-editor, S10 mocked UI and actual Gateway acceptance separately.
- Keep all provider calls OFFLINE only (`LLM_PROVIDER=fake`, fake/none embedding). Future live text policy = `gemini-3.5-flash-lite` primary, explicit `gemini-3.1-flash-lite` fallback; **never** Gemini 2.5.
- No automatic PR merge, deploy, real provider use, destructive cleanup, or writes to Codex's `codex/ai-copilot-pipeline-test` branch. Keep PR #57 draft. Stop with exact fresh source+CI SHA and request GPT-6 independent review.
