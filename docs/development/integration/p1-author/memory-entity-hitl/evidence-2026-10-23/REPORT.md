# P1 Memory & Entity HITL — executor handoff

Verdict: **P1_MEMORY_ENTITY_READY_FOR_GPT6_REVIEW**. This is a P1 executor result for independent delta review, not FE merge or production release approval.

## Immutable provenance

- Base: `7fd6f71b388320e00408b7ea47c0998708c70a2c` on `integration/p1-author`; verified unchanged again after acceptance.
- Exact final tested source: `8a1dab633e3eb47cc1b7e565b46d39187218b6d8`.
- Source sequence: `dd10afd3` implements P1; `7ac8b733` filters unconfirmed persisted rows; `8a1dab63` makes revision provenance part of atomic continuation and forces concurrency in its test.
- Pinned selective reference: `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`.
- Draft PR: https://github.com/Ephurin/Novel_sharing_platform/pull/63 → `integration/p1-author`.
- This directory is committed separately after source/testing. The evidence commit SHA is supplied in the final handoff and PR description; it cannot be embedded in its own contents.
- Five `test-accept-*-source.json` records and `final-source-seal.json` prove clean source before acceptance and before evidence generation. `source-blobs.json` pins every changed source/test/contract blob.

## Root cause and final behavior

Node's owner-guarded P1 routes had no matching Python memory/HITL implementation. Existing Alembic 0011/0012 columns were not mapped/wired into narrative repositories. A route-only port would also omit durable review/version/scope checks and expose mutable/unapproved data through naive brain serialization.

The integrated path is immutable revision → occurrence discovery/audit → human review → frozen inventory → continue → pending event/fact/state proposals → separate Canon approval. Memory serializes only confirmed materialized rows, filters active facts/events, replays active state without writing projections, and includes accepted-source provenance. It excludes pending/rejected proposals, unresolved audit candidates, guidance, plans and objectives. Shared brain locking makes a read consistent with concurrent Canon approval.

Checkpoint CAS binds configured repository tenant, novel, immutable chapter/revision/hash, guidance version, Canon version and review version. Identical review replay is idempotent; incompatible replay conflicts. Continue refuses unfinished, changed-source or stale checkpoints, skips entity LLM work after freeze, and atomically commits revision provenance, pending proposals and completion. Empty extraction is durable. Parallel continuation commits one set.

An overlapping-request development test exposed a PostgreSQL 23505 race when provenance was written before the completion transaction. The final fix moves provenance under the same brain lock/session as proposals and checkpoint completion. The concurrency test now uses a barrier to force overlap. The final committed source's 21 PostgreSQL HITL tests pass; the earlier failure is not represented as a final PASS.

`CONTRACT.md` one directory above contains the endpoint list, stable memory DTO, public novel/internal brain ID semantics, port provenance matrix, feature flag, errors and ownership boundaries. The legacy analysis path remains default OFF; ON is explicitly enabled in the new fixtures and real HTTP process.

## Acceptance matrix on final source

| Area | Result | Evidence |
| --- | --- | --- |
| AI non-PostgreSQL regression, including explicit ON in-memory fixtures | PASS: 270; SKIP: 4; deselected PostgreSQL: 63 | test-accept-unit.log / commands.json |
| Explicit ON PostgreSQL memory/HITL contracts | PASS: 21 | test-accept-hitl.log |
| Existing PostgreSQL narrative, semantic-memory and P8 cutover tests | PASS: 31 | test-accept-postgres.log |
| Backend Gateway, revision/CAS/persistence, extraction-only worker regressions | PASS: 74 | test-accept-backend.log |
| Backend TypeScript | PASS, exit 0 | test-accept-backend-typecheck.log |
| Real Node Gateway → Python → platform immutable revision HTTP | PASS: 1 test, 24 recorded requests, no skipped live test | test-accept-live.log; http-requests-responses.json |
| Real HTTP status coverage | PASS: 200/401/403/404/409/422 | http-requests-responses.json |
| Durable pending-vs-approved Canon and checkpoint/version readbacks | PASS: five stages | postgres-checkpoint-canon-readbacks.json |
| Source hash/identity, tenant/owner, wrong novel/run, stale version/guidance, missing/unresolved decisions | PASS | HITL suite and real HTTP negatives |
| Duplicate review/continue; interruption retry; forced parallel continue | PASS | HITL suite; raw HTTP |
| Active fact/state provenance and unconfirmed materialized rows | PASS | PostgreSQL HITL suite |
| Alembic upgrade + existing downgrade/re-upgrade compatibility | PASS | alembic-upgrade.log; existing migration regression |
| GitHub Actions P7, final source | PASS | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39970691589 |
| GitHub Actions P8, final source | PASS | https://github.com/Ephurin/Novel_sharing_platform/actions/runs/39970691632 |
| Real text/embedding provider quality or cost | NOT_RUN, fake providers required | provider configuration in provenance.json / acceptance_runner.py |
| Mounted full Author IDE / FE cutover approval | NOT_RUN, FE owner's separate acceptance | no web source changes |
| P3 waiting_for_entity_review controller or 100k generation | NOT_RUN, outside task | no P3 controller refactor |

The four unit skips are two pre-existing SQL-tenant checks on non-SQL adapters and two new PostgreSQL-only cases on the in-memory parameter. Their real PostgreSQL counterparts execute in the HITL suite. There are no final acceptance failures or essential P1 steps left blocked.

## Real HTTP and durable authority

`http-requests-responses.json` retains the actual method, path, actor category, body, status and response. JWTs are intentionally not logged. It is parsed from the unmodified raw TAP log; Node split a long diagnostic line, so parsing rejoins TAP continuation frames without changing JSON values.

The five SQL readback stages show:

1. Missing memory GET returns 404 with zero brain rows: read did not create a brain.
2. Discovery waits for entity review with zero proposals and Canon version 1.
3. Frozen review stores entities_reviewed, still zero proposals and Canon version 1.
4. Continue stores completed checkpoint plus pending entity/event/fact/state proposals, with no materialized facts and Canon version 1. Memory remains the original empty DTO.
5. Explicit existing Canon group approval materializes data and increments Canon to version 2. Fact source_revision_id and chapter_number match the immutable platform revision. Repeated memory reads are identical; revision content/hash and Mongo readbacks are unchanged.

Anonymous and invalid public JWT get 401; foreign author gets 403 before upstream access. Missing brain gets 404. Invalid review evidence gets 422; stale review/unfinished continue/newer chapter head get 409. Browser-supplied X-Tenant-Id is ignored by the Gateway and cannot select another repository scope. Python directly rejects cross-tenant scope with 403. Its established invalid-service-token response remains 403, while missing service token is 401; this preserves P7's existing internal-auth contract.

Path keys are platform novel UUIDs. The DTO exposes the separate internal brain UUID; using that internal UUID as a public novel key fails 404 rather than creating/resolving another brain.

## Commands, isolation and retention

All actual test/migration/provision commands, working directories, UTC timestamps, expected and actual exits are in `*-commands.json`. All final acceptance command exits are 0. Test entry points are committed; `acceptance_runner.py` preserves the exact local orchestration and fake-only environment setup. Its absolute ROOT/OUT paths identify this executor machine; copy/adapt them for a separate review machine and keep orchestration output outside the source checkout.

Acceptance resources are new `astra-p1-hitl-00e8eb6b-{pg,mongo}`, bound only to loopback, with a unique `ephurin_test_*` database. PostgreSQL image is pgvector/pgvector:pg16; Mongo is mongo:7. Inspect captures and retained-resources.json preserve image/container/mount provenance. No real text or embedding provider is used. Test fixture cleanup deletes only registered random fixture IDs.

The final SQL inventory reports Alembic `0013_objective_intent`, which already exists at the integration base; HITL uses the existing 0011/0012 columns and introduces no migration. Vector extension is 0.8.6. Public users/novels/chapters/revisions and Mongo drafts are zero after scoped cleanup. Existing PostgreSQL regression fixtures retain 27 narrative brains and 18 analysis runs in the task-owned database; this is not a claim that the entire test database is empty.

All six containers created during this task's development/acceptance were stopped after evidence capture; their volumes remain intact. No old Docker volume, historical pipeline evidence or fixture was removed. Pytest output for acceptance is redirected outside tracked .pytest_tmp. The original dirty checkout remains untouched; the feature uses the attached managed worktree.

## Limits and next owners

- New endpoints require PostgreSQL at Alembic head; JSON offline mode returns 503. In-memory is a test adapter. Dynamic per-request repository tenant selection is not introduced.
- The service credential is an internal trusted boundary; owner/latest-head checks are enforced at the authenticated Gateway. Python revalidates immutable identity/hash and repository/checkpoint scope.
- Parallel requests may repeat downstream extraction computation, while durable commit is idempotent. No provider exactly-once claim is made. A Canon/guidance change requires a new analysis request key.
- Model quality on real prose, alias ambiguity quality and real-provider structured-output compatibility remain unverified because this task uses fake providers only.
- GPT-6 owns independent delta acceptance. FE owns mounted IDE integration; Core retains writer/revision/outbox authority; schema owner owns rollout; product owner retains Canon semantics decisions.
- No merge, deployment, publication or production release is performed or authorized by this handoff.
