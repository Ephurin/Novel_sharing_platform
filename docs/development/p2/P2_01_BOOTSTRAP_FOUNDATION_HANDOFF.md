# P2-01 Bootstrap Foundation — handoff

Date: 2026-11-07 Asia/Saigon. Owner: Codex, sole backend/frontend implementer.
Verdict: **READY_FOR_SOURCE_REVIEW / ENV_BLOCKED_RUNTIME_ACCEPTANCE**. Draft only; GPT-6 independent review and owner merge decision required. Stop here; P2-02 not started.

## Exact provenance

- Target: `integration/p2-planning-studio`.
- Base and remote HEAD verified before work and before publication: `3adab5c73636bd4e7c3dbc6578d4ece0a54b5627`.
- P1 baseline: `21a73167f6877f0f3d178138f00b36ff393c461e`.
- Working branch: `codex/p2-01-bootstrap-foundation`.
- Tested final source: `4fdf44c25a5d8bae87ab9935c3d66918515a3e42`. Evidence commit adds documentation/logs only; exact delivery HEAD is recorded in Draft PR body and GitHub head metadata.
- PR72 inspected at `bb0ad38824c2d107929032ae10073d006a2b5851`, older main base `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`. Selected code/test delta applied three-way cleanly, then reviewed against integration additions (including entity profiles). No whole-branch merge, no prior evidence relabeled as this source.
- Read kickoff roadmap, gap audit, WORKFLOW_CONTRACT v1.4 at `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`, P1 memory/entity HITL, C-01 Canon, writer/revision/outbox contract decisions and FE contract alignment references. Stale Gemini ownership is superseded by current assignment.
- Work uses managed isolated worktree. Original dirty P1 checkout and P1 branches remain untouched. Initial pytest used repository default tracked `.pytest_tmp`; generated changes there were restored before source commit. Final evidence uses OS temp paths and source-integrity proves no tracked delta.

## Delivered behavior

Scoped PG admission protects active Brain before blueprint dispatch; manuscript preflight rejects active Brain before source access. Exact replay survives activation; changed keyed input conflicts. Advisory admission + Brain/job locks serialize initial insertion, distinct launches, worker admission, finalization and activation. Blueprint reservation precedes provider; token/version/active checks precede atomic run + proposal + job finalization. Required review membership must exist and be accepted/rejected before activation; queued/running/entity-review workers prevent activation races. New empty Brains are draft. JSON new bootstrap and legacy activation fail closed.

Additional hardening beyond PR72: nested preferences reject unknown fields; JSON activation cannot use old unsafe adapter path; tests cover in-memory concurrent duplicate/distinct requests, changed payload, provider failure replay and missing required activation member. No schema/migration changes; existing Brain/job/run/proposal storage reused. No future events written to event history, no fabricated revisions, no new Canon store or Writer.

API details and P2-02 separation brief: [P2_01_BOOTSTRAP_CONTRACT.md](P2_01_BOOTSTRAP_CONTRACT.md). Additive body `idempotency_key`; typed `mode`; missing mode retains blueprint compatibility; unknown idea/preference keys reject. New 409 lifecycle codes and JSON 503 are explicit. Activation request remains P1-compatible `job_id`; no new CAS field in this slice. Gateway already forwards body and enforces active author/admin + novel ownership; its production code is unchanged.

## Files changed

- `ai-service/api/{narrative_routes,schemas}.py`: DTO/error mappings.
- `ai-service/application/bootstrap_service.py`: scope/replay/reservation/finalization/worker flow.
- `ai-service/domain/{errors,repositories}.py`: lifecycle error/ports.
- `ai-service/infrastructure/{postgres,in_memory,json}_narrative_repository.py`: lifecycle implementations/capability boundary.
- `ai-service/tests/test_p2_{bootstrap_guard,bootstrap_postgres,json_bootstrap_compat}.py`: safety and compatibility coverage.
- `backend/src/modules/ai/p2-bootstrap-guard.live.test.ts`: opt-in disposable PG/Mongo composition regression; NOT_RUN here.
- Contract, this handoff, evidence runner and `p2-01-evidence/`: reproducible logs/JUnit/command records.

## Test matrix on exact final source

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| AI offline suite, P1 + bootstrap | All selected tests pass | 387 passed, 32 SQL-only skipped, 219 PG-marked deselected; exit 0 | PASS for executed tests only |
| JSON idea/manuscript × empty/seeded | 503, no disk/job/run changes, zero provider/source calls | Four HTTP cases with byte-hash readbacks; nested DTO + activation capability tests; 6 passed | PASS |
| Concurrent admission/replay, failed replay, missing reviews | One provider/result; conflict/missing review rejected | Included in AI suite | PASS in-memory, not PG concurrency proof |
| P1 manuscript interruption/resume/review/routes | Existing contracts preserved | Included in AI suite | PASS offline |
| Gateway fake forwarding/errors + P1 manuscript contract | Existing behavior maintained | 34 passed, 0 failed; exit 0 | PASS unit/contract only |
| Backend TypeScript | No errors | exit 0 | PASS |
| Python compile | No syntax errors | exit 0 | PASS |
| Base-to-source whitespace diff | Clean | exit 0 | PASS |
| Fresh PG lifecycle/concurrency + authoritative readbacks | Run test_p2_bootstrap_postgres.py and affected P1 PG checks | Docker daemon unavailable, no disposable PG provisioned | NOT_RUN_ENVIRONMENT |
| Gateway → Python → PG/Mongo, following changed-body P1 save/outbox | Real composition preserves Canon and writer path | Opt-in test ported; not executed | NOT_RUN_ENVIRONMENT |
| Mounted P1 browser regression / P2 UI | Real browser + application stack | Stack unavailable; no browser flow executed | NOT_RUN_ENVIRONMENT |
| P7/P8 CI on final delivery HEAD | Source checks | Not inspected at local handoff | NOT_RUN |
| Real Gemini / live forwarding | Must remain disabled | 0 real Gemini calls; no forwarding enabled | Compliant, no provider quality claim |

Commands, cwd, source SHA, exit codes: [p2-01-evidence/commands.json](p2-01-evidence/commands.json). Full AI JUnit and logs, JSON readbacks and dependency/typecheck output are beside it. Final before/after SHA match, tracked diff empty. Repeat from repository root with `python docs/development/p2/run_p2_01_offline_evidence.py` after installing the lockfile dependencies; local Node dependencies were reused read-only via worktree junction. Runner injects dummy localhost port-1 DB configuration for fake tests, not real credentials. It records Docker failure instead of disguising it as a test PASS.

Earlier attempts are preserved in `p2-01-evidence/initial-0fdacf39/`: AI 387 PASS at earlier source, but Gateway/typecheck runner failed because Windows command paths used forward slashes. Corrected runner uses absolute paths; final checks above supersede that attempt. Before recording evidence, a missing test filename, missing Node configuration/dependency resolution, and incidental UTF-8 comment conversion were corrected. No product failure is hidden or old-source result promoted. Final source schema diff is additive only.

## Limitations and review risks

**Backend-only intermediate PR.** Mounted AuthorMemoryPanel sends `mode=extract`, now explicitly 422 `EXTRACT_NOT_IMPLEMENTED`. This transitional setup action is unavailable on unreleased P2 branch, as kickoff roadmap permits; no UI workaround or extraction completion claim. Blueprint remains legacy creative proposal behavior, including existing preference/constraint mapping. Immutable setup snapshots, separate private settings/constraints, explicit extraction grounding/identity, source spans/readback and future-plan isolation enhancements belong to P2-02. M0/M-FIRST and Planning Studio acceptance remain NOT_VERIFIED.

Failed blueprint exact replay/resume returns saved failure; retry requires new operation. Process crash can strand running reservation without recovery lease. No provider exactly-once claim. JSON is not supported lifecycle storage. Tenant scope is configured single-tenant, not dynamic multitenancy. Existing activation DTO has no expected-version field; current safety is scoped transactional revalidation. SQL behavior is source-reviewed and covered by runnable tests but unexecuted here. P1 tests passing offline cannot replace mounted save/outbox or PG row-lock evidence. No DB/migration, QA data, quota ledger, production configuration or P1 demo changes.

## Required next work

1. GPT-6 review exact source and selective PR72 port; assess all lifecycle/auth/Canon boundaries.
2. On a fresh task-owned offline PG/pgvector + Mongo stack, run 13 A16 PG cases and affected P1 SQL checks, then opt-in Gateway composition test with database name `p2a`; preserve durable before/after readbacks and fake provider counts. Never point at P1 QA data. Bootstrap API test app needs service token/tenant and task-only database env.
3. Run mounted P1 manuscript/save regression and inspect exact-head CI. Keep runtime acceptance blocked until evidence exists.
4. Owner decides merge after independent review. No self-merge; only then begin P2-02. Later React work remains Codex-owned.
