# P123 job resume authorization — ASTRA execution evidence

Executor: **ASTRA**, acting on the current narrow Gemini handoff with explicit user authorization. Independent GPT-6 delta review is **PENDING**. **HOLD_FE_INTEGRATION_ONLY** remains. This report does not grant `P123_CORE_OFFLINE_READY_FOR_INTEGRATION_REVIEW` or full Core PASS.

## Source and preservation

- Fetched remote branch: `codex/ai-copilot-pipeline-test`; remote handoff HEAD was `f64f7b8b8a0009e77c17a1f14a784bb74aeee16a`.
- Fixed source/tests/probe commit: `7d1f1bed508480db84def77c75c99039a9bacd7e`. All final verification ran at this committed SHA with a clean working tree, before evidence files were assembled. Evidence is committed separately; its SHA is supplied in the final handoff (a commit cannot contain its own hash).
- Existing checkout `C:/Users/Laptop/OneDrive/Documents/testproject` was dirty with unrelated document work. No stash, reset, checkout, source write or branch movement was performed there. A detached worktree at `C:/tmp/novel-p123-authz-astra-20261022` preserves that work and carries commits directly descended from the permitted branch; no alternate named work branch or main write.
- New projects only: RED `p123-core-092cfc4a3d`, GREEN `p123-core-bce7da708c`. Each has independent PG/Mongo volumes, users, novel and job. No historical evidence, data or volumes were removed.
- RED was executed before the production edit. Its `source_dirty=true` records the then-untracked probe, not a production modification. `image-source-proof.json` compares normalized file hashes inside both runtime images against their exact baseline/fix commits for the controller, routes, gateway service, AI routes and bootstrap service. RED artifacts are retained as captured; the committed probe subsequently added Mongo/count snapshots and repeat checks for GREEN.

## Root cause and minimal repair

The authenticated AUTHOR role permitted any same-tenant author to reach `resumeJobController`, which forwarded a mutable POST using only a job UUID. The service-authenticated AI route had no user ownership gate, and a failed bootstrap job could be requeued. Adjacent GET checked ownership only when a truthy `novel_id` existed, allowing missing scope to bypass that check.

A single private `getAuthorizedJob` helper now loads trusted metadata via service-authenticated GET, requires a UUID-shaped string `novel_id`, and calls the existing PostgreSQL `assertNovelOwnership` policy before returning status or forwarding resume. Missing/invalid scope returns 403 `JOB_SCOPE_INVALID`; wrong author returns 403; missing job propagates 404; nonexistent/deleted novel follows the existing 404 policy. Owner resume retains 202. ADMIN follows the unchanged ownership policy but cannot bypass missing scope. Request-body scope is ignored. No AI service change, API payload redesign or frontend edit was needed.

## Runtime RED — security failure actually reproduced

Two newly registered accounts were granted AUTHOR through tightly constrained fixture-role SQL. All novel/chapter/revision/job business creation used authenticated supported HTTP APIs. Both requests passed through the same backend-configured tenant; the job tenant is recorded in `red/fixture.json`. SQL readback proves two distinct AUTHOR IDs and A's ownership.

A temporary outage of only the fresh fake budget gateway produced a durable failed A-owned bootstrap job. After restoring the gateway, B's POST returned **202**, the persisted job changed **failed → running**, and fake requests increased **0 → 3** at the captured after-snapshot. This is an observed mutation, not only a source finding or metadata disclosure. Subsequent readback also retains the eventually settled job. See `red/http-trace.jsonl`, before/after snapshots, access log and ownership readback. Probe exit 0 in RED mode means the expected insecure behavior was reproduced; it is not a security PASS.

## Runtime GREEN — same-tenant real HTTP + PostgreSQL + MongoDB

| Case | Result |
|---|---|
| Anonymous GET / POST resume | 401 / 401 |
| B GET A's job / resume A's job | 403 / 403 |
| A GET missing job / resume missing job | 404 / 404 |
| A resumes failed owned job | 202, reaches waiting_entity_review |
| A repeats resume sequentially | 202, same job/analysis, no new fake request |

B's denial leaves the complete persisted job row, returned job, PG analysis/proposal/outbox counts, Mongo collection counts, fake request list and gateway ledger unchanged. Fake calls remain zero. The AI access log contains exactly **two** mutable resume forwards for the known job, corresponding to the two owner calls; missing-job, anonymous and B requests caused none. Mocked controller tests independently assert zero mutable POST for every denial.

The owner reaches the entity-review gate without accepting canon or publishing. A subsequent sequential resume leaves the job response and analysis/proposal/outbox counts unchanged; fake calls stay **9 → 9**. This is bounded sequential idempotency evidence, not a concurrency guarantee. Full before/after and raw sanitized HTTP responses are under `green/`.

## Exact-source regression

Commands and exit codes: `commands.json`, `source-checks.json`, `regressions/validation.json`.

- Authorization controller tests: **35 TAP tests PASS** (34 scenario subtests plus parent), exit 0. Includes missing/invalid scope and malformed metadata for GET and resume, spoofed request body, owner bootstrap/writing jobs, ADMIN, deleted novel, missing job, and zero mutable forwarding on denial.
- Focused backend: **44 PASS**, exit 0.
- Focused AI: **166 PASS, 2 SKIP**, exit 0. The two SQL tenant-boundary tests remain skipped by the established marker. Local AI fixtures use SQLite with non-loopback DNS denied; the targeted HTTP test separately uses real PG/Mongo.
- Backend typecheck and build: exit 0.
- Runtime applications have empty real-provider keys and internal Docker networks; fake-only dispatch and ledger are recorded. Embeddings are disabled. Nine GREEN fake calls are not real provider usage or a cost-hardcap validation.

## Limits and next action

Missing/malformed scope and ADMIN are controller-unit cases, not claimed as runtime HTTP cases; no corrupt job business row was inserted. Distinct tenants and concurrent repeat were not tested. Mongo equality here means collection counts, not a universal proof that every document field is unchanged.

No P1/P2/P3 implementation or full E2E was rerun. The only production change is the two generic job controllers and their private helper; the existing ownership helper, P3 controllers, autonomous service and stop/skip fence are unchanged. P3 does not use these generic job controllers; focused autonomous regressions passed, so a new post-accept race replay was not justified. This HTTP run is lightweight bootstrap/resume sanity and does not reaccept the full P1/P2 pipelines.

`REAL_PROVIDER_NOT_TESTED`, `SEMANTIC_RAG_NOT_ASSESSED`, `LITERARY_QUALITY_NOT_ASSESSED`, `P3_HITL_CONTROLLER_100K_NOT_RUN` and `UI_BLOCKED_FE` remain. FE PRs #52/#54/#55 were not integrated, web was not edited, main was not written, and no chapter/canon was automatically approved or published.

**Stop here for GPT-6 independent delta review** of this source SHA and its separate evidence commit. The executor recommends reviewing the authorization blocker closure only; it does not upgrade acceptance or begin another phase.
