# AX-00 / AX-01 handoff — 2026-10-26

## Source and branch provenance

- Base/main SHA: `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb`; base tree `ad0092004cfbd5d042b5c687fb31010e9638835b`.
- Tested code SHA: `c193dd1c84c17af367c8b384c9d151ae287cb805`; tested tree `c2f9cd5e2efb67f2e672fe7cea4b6a0e210dff53`.
- Code commit parent is exactly the base SHA. `git merge-base --is-ancestor <base> HEAD` exit0. No P2 rebase or PR72/73 cherry-pick.
- Working branch: `codex/p1-ax01-storybrain-core`, pushed. Dedicated task-owned clone and worktree, independent of original stale local checkout and Spin_reg workspace.
- GitHub main rechecked immediately before publication: still exact base. `integration/p1-demo-20261109` did not exist, then was created from that exact SHA following user instruction; readback confirmed equal to main/base. Main was not changed.
- Maintained workflow contract: v1.4 at `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`, blob `bde8936607bc45474b9895600782c41eeda02685`.
- Evidence is a separate follow-up commit; its commit/tree can be obtained with `git rev-parse HEAD 'HEAD^{tree}'`. It changes no production source/tests. Historical docs/development evidence has zero diff.

## Delivery verdict

| Area | Status | Evidence / limit |
| --- | --- | --- |
| AX-00 source audit + concrete contract | PASS for authored artifact; REVIEW_PENDING for approval | ../CONTRACT.md contains reuse map, before/after DTO, ownership, CAS, audit, context and errors, explicit ADR decisions. |
| AX-01 backend/domain/API | PASS, offline scope | Confirmed entities save/reload with UUID/tenant/novel scope, CAS/idempotency/audit, private notes separation and approved context integration. |
| PostgreSQL concurrency | PASS | Competing edits produce200+409; concurrent identical key produces one audit/mutation and exact response replay. |
| Migration | PASS, isolated databases | Fresh SQLite and PostgreSQL, actual0013-schema upgrade, downgrade/re-upgrade with UUID/description/lock retention; backup requirement documented. |
| P1 approval/correction/HITL regression | PASS, fake providers |88 PostgreSQL tests passed on code SHA; no version bypass or auto-approval. |
| Gateway | PASS, mounted HTTP with DB/upstream stubs | Real auth/active-account/role/ownership middleware and profile routes, trusted headers, missing key,409 propagation;19 tests passed. |
| Full Gateway -> running Python -> PostgreSQL combined E2E | NOT_RUN | Gateway stub tests and Python HTTP/real-PG integration are separate boundaries. No production/live claim. |
| AX-02, live provider/UI acceptance, deployment | NOT_RUN | Explicitly outside scope; no provider call or budget use. |
| Draft PR | BLOCKED on contract review | Integration base exists at locked SHA. User requires contract review before Draft PR. No PR created and no merge/deploy. |
| CI | NOT_RUN / no PR CI URL | GitHub commit workflow lookup returned no pull-request runs; tool filters to PR workflows, so this is not proof about all push workflows. |

## Source files

- ai-service/domain/entity_profile.py: strict partial patch intent, bounds and approved context allowlist.
- ai-service/domain/models.py: additive approved_profile on NarrativeEntity; never private notes.
- ai-service/infrastructure/orm_models.py: entity profile/note/version columns and private durable mutation ledger.
- ai-service/infrastructure/postgres_narrative_repository.py: read/update under existing Brain lock, both CAS guards, key replay and audit transaction; approved memory and scoped chapter/relevance context serialization.
- ai-service/migrations/versions/0014_entity_profiles.py: additive schema and documented destructive data rollback.
- ai-service/api/entity_hitl_routes.py: owner-Gateway-backed GET/PATCH, service/tenant/actor enforcement, private no-store responses, sanitized DB errors.
- backend/src/modules/ai/ai-gateway.controller.ts and .routes.ts: mounted profile endpoints with existing owner/account policy.
- ai-service/tests/test_entity_profiles.py and backend/src/modules/ai/entity-profile-gateway.test.ts: new focused tests.
- docs/author-experience/ax01/CONTRACT.md: AX-00 contract and review decisions.

No production FE file changed. ai-service/api/narrative_routes.py was audited; existing correction/proposal/writing endpoints remain authoritative and unchanged.

## DTO / storage / context

See ../CONTRACT.md for exact JSON and errors. Before: no direct profile API. After: owner GET/PATCH `/api/v1/ai/story-brains/:novelId/entities/:entityId/profile`; PATCH requires expected_version, expected_brain_version, stable Idempotency-Key; Canon fields require effective_from_chapter. Private response has profile, author_notes, profile version and Brain version. Existing approved entity response adds only allowlisted approved_profile. No rename, UUID/alias/lock/provenance edit or historical fact/event creation through this API.

Keep PostgreSQL; reuse EntityRecord and existing repository, projection/routing/packer. Canon profile JSONB is separate from private note TEXT and private audit snapshots. Every new mutation gets actor, server timestamp, before/after and input hash; exact retry adds nothing. Canon edit increments Brain version, note-only does not. AI proposal CAS remains enforced and AI materializers do not write dedicated profile columns.

Author edit -> durable EntityRecord -> approved memory -> selected eligible profile in structured context -> WritingService -> existing packer -> prompt. Unknown/earlier chapter and unrelated entities omit profile. Private notes never enter domain approved memory/export/prompt. No historical evidence is invented. Full current snapshot cutoff is conservative; earlier profile history is not reconstructed. Notes retained in private audit even after later editing/clearing require reviewed retention policy.

## Exact final checks

Working directory for Python: `<worktree>/ai-service`. Environment uses task-owned PostgreSQL container `ephurin-ax01-pg-01a178b1`,127.0.0.1:55439, databases ax01 and ax01_migrations. Local-only disposable credentials were configured; no real account/provider secrets are in evidence.

1. `python -m pytest tests/test_entity_profiles.py tests/test_migrations.py tests/test_narrative_repository_contract.py tests/test_context_budget.py -o addopts= --basetemp=.pytest_tmp_ax01_final -q --tb=short` with AX01_TEST_DATABASE_URL and separate AX01_MIGRATION_DATABASE_URL. **Exit0:82 passed,1 skipped**. The skip is the SQLite concurrency case, which executes on PostgreSQL. Log ax01-final.txt. This includes additive upgrade/downgrade/re-upgrade, audit failure rollback and real WritingService preview inclusion.
2. `python -m pytest tests/test_p1_contract_alignment.py tests/test_c01_canon_group.py tests/test_atomic_group_rejection.py tests/test_p1_memory_entity_hitl.py -m postgres_integration -q --tb=short` with TEST_DATABASE_URL pointing to ax01. **Exit0:88 passed,43 deselected** (non-PostgreSQL parameter cases excluded deliberately). Log p1-postgres-final.txt.
3. In backend, `npm ci --ignore-scripts --no-audit --no-fund`: **exit0**,148 packages installed from lockfile. `npm run typecheck`: **exit0**, backend-typecheck.txt.
4. `npx tsx --test src/modules/ai/entity-profile-gateway.test.ts src/modules/ai/ai-gateway.test.ts src/modules/ai/p1-closed-loop-gateway.test.ts` with dummy DATABASE_URL/MONGODB_URI/JWT test secrets: **exit0:19 passed**. Log backend-gateway.txt. No real upstream call; global fetch is stubbed only inside tests.
5. Fresh repository + WritingService readback: **exit0**, readback.json. Latest audit version1->2, Brain2->3, fresh reload version2, private fields absent from prompt; measured174 estimated tokens under4000 budget for sampled prompt. Whole-container event/fact counts0 reflect cleanup of P1 fixtures and profile tests creating no historical artifacts, not an assertion that P1 never materializes them.
6. `git diff --check`, `git diff --exit-code -- docs/development`: **exit0**. Source commit's parent and remote main/integration/source refs verified.

Required test mapping:1 save/reload/audit test;2 stale and real concurrent tests;3 missing precondition/invalid payload cases;4 Python service/tenant/novel/entity negatives + mounted Gateway wrong account;5 private serialization/context;6 note future plan creates no facts/events and typed future_plan rejected;7 sequential/concurrent exact replay and changed-key conflict;8 stale AI proposal rejection plus newly refreshed approval and legacy extraction preserve author profile;9 same-name UUIDs retain independent profiles;10 existing P1 edited-group/event-correction/C-01/atomic-rejection/HITL regression suite. These are offline code tests, not live/manual acceptance.

Development failures were corrected before final source: initial migration collided with ORM-backed foundation creating current columns (0014 now inspects existing columns/table and actual-old-schema upgrade is tested); negative service-token expectation corrected to existing403 policy; stale AI proposal was correctly rejected even with a newer request version, so the test now obtains a separate refreshed proposal instead of weakening its persisted version guard. Initial restricted-temp test failures were rerun with normal task-owned execution permissions. Git transport without TTY stalled and Windows path length errors required a separate partial clone and local core.longpaths=true. No historical evidence was edited to hide these attempts.

## Remaining review and integration

Review ADR decisions in CONTRACT.md: additive schema/private ledger retention and access, explicit two-version DTO, ADMIN policy, exact replay semantics, whole-profile chapter cutoff and additive approved DTO. Residual limits: semantic future content cannot be automatically proven absent from author prose; historical biography reconstruction is not implemented; backend trusted-service deployment boundary is inherited; no combined live stack or browser acceptance yet.

After contract approval, open a Draft PR from working branch to integration/p1-demo-20261109 and attach it to this chat. Suggested title: `P1 AX-00/AX-01: versioned Editable Codex entity profiles`. No merge/rebase/cherry-pick/deploy is authorized here. FE integration after review: web/src/features/ai-copilot/author-memory-api.ts and AuthorMemoryPanel.tsx, with UUID selection, explicit private note label/cutoff, stable retry key and409 reload/reconcile.
