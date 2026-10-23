# Integration gate — P1 pipeline + Author Workspace

Status: BRANCH_BOOTSTRAPPED / COMPOSITE_RUNTIME_NOT_RUN / MERGE_TO_MAIN_NOT_AUTHORIZED
Date: 2026-10-23 (Asia/Bangkok)
Branch: integration/p1-author
Created from PR #54 head: 3100c46f46cd071467d762dff4ffa1fc4efe07f2 (already includes merged PR #55).
Source P1 branch at bootstrap: codex/ai-copilot-pipeline-test @ 2279b41d2dcd90fb47a2c4886379510c6564fee5.
Unchanged main at bootstrap: 390b09fd043ec29db84519a9d195b59b76eec003.

## Model selection policy (owner confirmation, 2026-10-23)
- Real text model for future approved acceptance: primary `gemini-3.5-flash-lite`; explicitly selectable fallback `gemini-3.1-flash-lite`; no Gemini 2.5 or silent legacy/cross-provider fallbacks.
- Text LLM provider and embedding provider are separate; real embedding remains `gemini-embedding-2` only if separately authorized.
- This PR remains OFFLINE ONLY with ZERO real provider calls. No new budget approval or API spend is implied by this model policy.
- The demo Compose override `docker-compose.flash-lite-demo.yml` already pins 3.5; always verify resolved `LLM_MODEL` and backend `AI_LLM_MODEL` prior to any eventual live run. Base Compose has a legacy `qwen3:8b` fallback and is not evidence of selected Gemini model.

## Intent
Use a disposable integration branch for the minimal compatible P1 Core ↔ FE implementation and tests. Do NOT merge either full source branch into the other, nor promote this integration branch directly to main. Main, feat/author-workspace, feat/ui-ephurin-theme, and codex/ai-copilot-pipeline-test remain unchanged.

This initial branch is a COPY OF THE AUTHOR WORKSPACE HEAD plus handoff documentation. It does **not** yet include the P1 pipeline Core deltas; that work requires local implementation and runtime verification.

## Why selective integration
Latest observed divergence: pipeline ahead of common main 183 commits, Author Workspace ahead 14, 300-file compare output cap. Integration preflight identifies noninterchangeable chapter writer and revision/outbox paths; blindly taking the Author backend chapter service would remove active-baseline automatic extraction. The pipeline has later scoped authorization repairs and P1/P2/P3 contracts. Exact source comparison and owner decisions are prerequisites.

Preflight source on pipeline:
- Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22/FE_BACKEND_DELTA_MATRIX.md
- .../MIGRATION_COLLISION_MATRIX.md
- .../P123_INTEGRATION_GATE_MATRIX.md
- Pipeline_test/WORKFLOW_CONTRACT.md (v1.4)
- Pipeline_test/reviews/2026-10-22-p1-wave-1g/FE_PATCH_HANDOFF.md
- Issue #56 (historical S09 RED on the old editor).

Historical reports are read-only evidence, not proof that the new integration passes.

## Nonnegotiable invariants
1. Frontend: account/chapter scoped draft buffer, 1200-ms debounce ABA revert, serial in-flight writer, versioned 409 recovery and safe navigation. Never accept a UI “saved” signal without server readback.
2. Backend: chapter-level ordered writer, snapshot+revision+outbox for every changed save **after** baseline activation; pre-baseline save remains draft only; accepted revision replay is idempotent and stale accept does not overwrite author content.
3. Authz: 401 anonymous, 403 foreign/non-active, owner/admin access only; P1 job-resume UUID/tenant scoping and P2/P3 HITL/intent fences preserved.
4. Migration: preserve both backend filenames 012_novel_engagement.sql and 012_reports_unique_open.sql; 013–017 incl transactional moderation evidence; separate AI Alembic 0013_objective_intent. Never silently rename migrations or rewrite already-applied SQL.
5. Isolation: NEW Postgres/Mongo schemas/volumes and docker project; no destructive cleanup of any pre-existing DB, volume or historical evidence; zero external provider calls.

## Gates (record PASS/FAIL/BLOCKED/NOT_RUN separately)
G0: source ancestry + contract and migration reconciliation with exact SHA and selected file paths.
G1: fresh isolated combined migrations, backend API DTO and 401/403/409/428 contracts; migrations replay; typecheck/build; no deletion.
G2: full mounted AuthorWritingIde browser S09 — Undo B→A→B before debounce, in-flight A→B, route/chapter/account switch and 409 — server draft/revision/outbox/active Story Brain provenance readback.
G3: S10 and S11 on the same newly integrated stack only after G2 PASS, with original contract step order and human review checkpoints.
G4: Reader/Author/Admin UI smoke; theme/mobile, auth sessions, VIP, media, comments, wallet, notifications, moderation and scheduling.
G5: independent source and evidence review. P1 offline fake-provider PASS must not be called live provider acceptance.

Artifacts to add under docs/development/integration/p1-author/evidence/:
- SOURCE_MATRIX.md, CONTRACT_DECISIONS.md, MIGRATION_RUN.md
- S09_S11_MATRIX.md and SMOKE_MATRIX.md
- commands-and-exits.json, test-summary.json, sanitized readback hashes and trace references
- FINAL_HANDOFF.md with exact tested commit SHA and explicit unresolved blockers.

No live Gemini/provider/embedding usage, publication, production migration, 100k story or merge to main is authorized by this task.
