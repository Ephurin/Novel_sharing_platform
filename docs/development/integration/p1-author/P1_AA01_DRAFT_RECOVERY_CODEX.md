# P1-AA01-DRAFT-RECOVERY-01

**Current verdict: P1_AA01_READY_TO_MERGE** — database verification and real-backend browser gate passed on 2026-11-01. PR #84 remains Draft for independent GPT-6 review; no merge was performed. The initial mocked-only run below was `P1_AA01_HOTFIX_PARTIAL`; its environment limitation is superseded by the final gate section.

Base: `47c22371c322578664af9d779a3834a0ef431945`. Branch: `codex/p1-aa01-draft-recovery-01`. Date: 2026-11-01.

## Cause and scope

The acceptance report and sanitized AA-01 observations/job summary show a persisted completed/passed job whose draft disappeared from the UI after reopening. In `web/src/features/author-ide/AuthorWritingIde.tsx`, `currentJob` and `aiSuggestion` were only React state, cleared on chapter change, with no chapter-scoped job discovery on mount. `GET /ai/jobs/:jobId` required an ID the reopened UI no longer knew. Discard only cleared React state.

The patch adds a bounded, author-scoped SQL read of the existing authoritative `narrative.writing_generations` store, plus durable dismissal. It restores the draft and review controls without inserting text into the manuscript. It does not change Gemini, gateway quotas, Canon processing, SQL/JSON storage architecture or AA-02. No migration: existing status/stage columns are unconstrained strings, and the Python job status is a string.

Production files changed:

- Backend AI gateway controller/routes and new `writing-drafts.service.ts`.
- Frontend Copilot API and AuthorWritingIde.

Test files changed: new backend retrieval/review tests, existing Accept contract suite (dismissed-job regression), new mounted-browser test and small navigation/account helpers in the existing fixture.

## API and review semantics

- `GET /ai/writing/generations?novel_id=<uuid>&chapter_id=<uuid>` returns `{data:{job:null|job},meta:...}`. Existing authentication, active-account and AUTHOR/ADMIN middleware apply. Controller verifies chapter ownership and novel match; SQL additionally requires the authenticated actor and permitted tenant. At most the newest scoped job is returned; no older job is resurrected after acceptance/dismissal.
- DTO contains review fields only: identifiers, base revision/hash, operation, status/stage, completed/passed draft/patch, validation status and stale reason. Instructions, private notes, raw context and style are omitted. Response is `Cache-Control: no-store`.
- `POST /ai/writing/generations/:jobId/dismiss` with `novel_id` and `chapter_id` durably writes `dismissed`. It shares the existing chapter-writer admission lease with Accept, refuses accepted/in-progress jobs, and is idempotent for an already dismissed job. No manuscript/Canon write occurs.
- Accepted status continues to be determined by existing immutable revision provenance (`source_generation_id`); Accept continues using the unchanged backend `accept-draft` contract and its idempotency guard.
- Recovery checks latest revision, base hash, current Brain version and current saved manuscript content. Stale text stays readable, with Accept disabled and a clear explanation. Accept re-reads review status after autosave; backend revision/hash/Brain validation remains authoritative. No errors are bypassed.
- Scope/session tokens prevent responses from a previous chapter/account or generation from changing current UI. Recovered in-progress jobs are shown as incomplete without automatic polling/restarting; explicitly started generation polling is bounded to 60 reads.

## Validation and evidence

Before: use the existing [AA-01 UI observations](evidence-sanitized/aa01-ui-observations.md) together with [persisted job/manuscript evidence](evidence-sanitized/aa01-job-and-manuscript.md). The published screenshots alone are not treated as complete independent proof.

After: reproducible assertions in `web/tests/writing-recovery.browser.test.mjs` mount the production IDE in headless Edge with local HTTP mocks. The mock store survives page reload/new browser context and records review mutations. Backend service/controller tests mock storage; they do not prove real SQL execution. Raw logs remain local and are not uploaded.

| Test | Result / boundary |
|---|---|
| T01 reload recovery | PASS — real mounted UI, mocked HTTP; draft and both controls restored |
| T02 new browser session | PASS — fresh browser context/auth fixture restores pending draft; production login not retested |
| T03 chapter isolation | PASS — A → B hides A; return to A restores A |
| T04 cross-user isolation | PASS — controller ownership rejection before disclosure/mutation; SQL actor/tenant parameters asserted; full authenticated HTTP/real DB not run |
| T05 Accept | PASS UI contract mock — manuscript readback and no pending draft after reload, one Accept; real revision/outbox/idempotency regression NOT_RUN_ENVIRONMENT |
| T06 Reject | PASS mocked storage/controller + UI — durable dismissed state, manuscript unchanged, no pending draft after reload; service performs only job-status write, no Canon write |
| T07 stale revision | PASS mocked revision/hash/Brain/current-manuscript checks and disabled UI; existing backend safety checks unchanged; real DB regression NOT_RUN_ENVIRONMENT |
| T08 failed/in-progress | PASS — no usable draft/Accept; reopening in-progress job causes no continuing polling |
| T09 response race | PASS — delayed chapter A response cannot populate B; delayed old-author response cannot populate new-author state |
| T10 provider boundary | PASS — local mocks only, generation POST count 0, backend upstream fetch count 0 in review tests |

Executed checks:

- Backend retrieval/review tests: **8/8 PASS**.
- Existing AI gateway mock regressions: **10/10 PASS**; combined backend run **18/18 PASS**.
- Mounted Edge browser suite: **1/1 PASS**, covering the UI cases above (approximately 9 seconds).
- Backend `tsc --noEmit`: PASS. Web `tsc -b --noEmit`: PASS.
- `git diff --check`: PASS.

## Initial environment limitation (historical; resolved in final gate below)

Docker Engine was unavailable (`dockerDesktopLinuxEngine` named pipe not found). A hidden Docker Desktop startup attempt did not restore the Engine. Isolated test-container startup therefore failed before creating the test database. No QA data was reset or migrated. The shared QA stack was not restarted. Browser launch initially failed inside the sandbox; the same local mocked suite passed with permitted process access.

The existing `backend/src/modules/novels/accept-draft-contract.test.ts` needs isolated PostgreSQL/Mongo. Its added dismissed-job case checks rejection and unchanged revision/outbox rows, but has **not been executed**. Real SQL joins/dismiss persistence, lease concurrency and production session reload need verification when Docker is available. This is the remaining gate before claiming the hotfix fully accepted. The historical QA draft may correctly be stale after Canon edits; do not weaken guards to accept it.

Resume with Node/npm on PATH, installed package dependencies and an isolated test database initialized using existing migrations. Keep both live flags false and provider workers disabled. Do not point the mutation-enabled contract suite at the QA database.

```powershell
# backend — provide existing test-only DB/Mongo/JWT environment first
node --import ./node_modules/tsx/dist/loader.mjs --test src/modules/ai/writing-drafts.test.ts src/modules/ai/ai-gateway.test.ts
node --import ./node_modules/tsx/dist/loader.mjs --test src/modules/novels/accept-draft-contract.test.ts
node node_modules/typescript/bin/tsc --noEmit
# web
$env:RUN_DRAFT_BROWSER_TESTS='1'
node --test tests/writing-recovery.browser.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

The browser test uses installed `@playwright/test` by default; `PLAYWRIGHT_MODULE` can point to a compatible installed Playwright module. `PLAYWRIGHT_CHANNEL` defaults to `msedge`.

## Safety and handoff

**Real provider calls: 0.** Test configuration kept `LIVE_FREE_TIER_ENABLED=false` and `LIVE_UPSTREAM_FORWARDING=false`, contained no provider key, and used no running AI worker. Neither production runtime flags nor historical quota ledgers were changed. No claim is made that the unavailable gateway was health-checked in this task. Accept's existing analysis outbox behavior is unchanged and was not activated against live infrastructure.

No raw payloads, screenshots, credentials, runtime files or original evidence are included in this patch. Only source, tests and this report are submitted. Review the separate hotfix PR against `gemini/p1-live-free-tier-01`; do not merge PR #83 automatically. AA-02 remains backlog.

## P1-AA01-DB-ACCEPTANCE-02 — final database gate

Starting SHA: `fd7aec6d48e98703b3a8eaf62f3800c49816a3c7`. Verified source/tests SHA: `a719ac5c245d11b0e470678f2796574524ef3834`. Same branch and [Draft PR #84](https://github.com/Ephurin/Novel_sharing_platform/pull/84); the following documentation-only commit records this gate.

### Runtime and isolation

- Docker Engine **28.5.1** responded immediately; no Engine restart was needed this run. Compose **v2.40.2-desktop.1** works via the Docker Desktop binary; the `docker compose` CLI plugin was not on the current CLI search path.
- Separate PostgreSQL/Mongo containers and databases were created for AA-01. Only their loopback ports were published. No P1/QA database was used for mutation tests; no existing container or volume was deleted/reset.
- PostgreSQL **16.15**, pgvector **0.8.6**; backend **18 migrations**, through `017_transactional_moderation_evidence.sql`.
- Real AI-service Alembic migrations applied from the existing image to `0016_entity_profile_audit_timestamp`. MongoDB **7.0.39**.
- Initial test-only role/binding/fixture-default setup errors were corrected before acceptance. The internal Docker network alone did not publish host ports; a separate test network plus restart of only the new containers enabled their loopback bindings.
- Both live flags stayed **false**. No Gemini key (including Slot 4), AI generation worker, or gateway was used. The backend trusted AI read boundary was a fixture adapter reading real SQL rows; analysis attempts were answered locally with HTTP 503. No outbound Google request was made.

### Reproduced issue and minimal follow-up hotfix

**AA01-DB-01 — stale pointer mismatch:** create a completed job based on revision A, insert another revision B with an older timestamp, and point `chapters.latest_revision_id` at B. Before the follow-up fix, real recovery returned `stale_reason=null`, contrary to the authoritative pointer. The DB11 assertion reproduced this before the change.

Recovery now joins `chapters` and compares the job base against `latest_revision_id`, rather than selecting a revision by timestamp. Accept additionally checks that pointer under the existing row lock and transaction, rejecting mismatch or missing pointer with `STALE_BASE_REVISION`. Existing hash, Brain, timestamp, ownership and idempotency checks remain. No migration or provider/UI/AA-02 change was added. DB11 now verifies both recovery and Accept reject the mismatch without modifying manuscript/revisions/outbox.

### Real SQL and review results

Fixtures use actual migrated `narrative.writing_generations`, `chapter_revisions`, `chapters`, `narrative.story_brains` and Mongo draft documents. They follow the AI-service record shape and gateway actor assignment, including actor-scoped and system-tenant jobs. The trusted read adapter is explicitly not a test of the deployed AI-service HTTP authentication implementation.

| ID | Result | Evidence/assertion |
|---|---|---|
| DB01 | PASS | Completed/passed SQL job recovered with correct draft, JSONB Brain version and no private context |
| DB02 | PASS | Repeated SQL reads and browser reload preserve draft; recovery creates no revision/outbox |
| DB03 | PASS | Reject persists `status=dismissed` in the real job table |
| DB04 | PASS | Read again/browser reload returns no rejected pending draft |
| DB05 | PASS | Fresh base revision and Brain v2 fixture accepted; exactly one immutable revision and analysis outbox; Mongo manuscript matches patch |
| DB06 | PASS | Second Accept returns the same revision; no duplicate outbox/revision |
| DB07 | PASS | Accept of dismissed job rejected with `GENERATION_NOT_COMPLETED`; data unchanged |
| DB08 | PASS | Reject of accepted job rejected with `GENERATION_ALREADY_ACCEPTED`; data unchanged |
| DB09 | PASS | Chapter-scoped SQL recovery does not return another chapter's job |
| DB10 | PASS | Actor/tenant SQL filtering, controller ownership tests, and real HTTP 401 unauthenticated / 403 foreign-author read and dismiss |
| DB11 | PASS | Hash, Brain drift, timestamp-based existing regression and authoritative-pointer mismatch rejected without side effects; stale UI Accept disabled |
| DB12 | PASS | Four concurrent Accept/Reject pairs, alternating invocation order: exactly one operation succeeds per pair; state agrees with winner |

Additional SQL assertions verify newest-job ordering and no resurrection of older jobs after dismissal. Both supported tenant forms join to their own novel/tenant Brain. Recovery omits instruction/style/private context. Reject leaves Mongo text, revision rows, Brain versions and outbox rows unchanged. Accepted/rejected/obsolete jobs are distinguished without resetting job history or quota ledgers.

### Executed verification

- `writing-drafts.postgres.test.ts`: **7 subtests + parent PASS**, covering DB01–DB12 and SQL ordering/filtering.
- `accept-draft-contract.test.ts`: **15/15 PASS** on the real migrated PostgreSQL/Mongo databases, including dismissed-job regression.
- `writing-drafts.test.ts`: **8/8 PASS**. Combined backend invocation: **31/31 PASS**, 0 failed/skipped.
- `writing-recovery.real-db.browser.test.mjs`: **1/1 PASS**, production AuthorWritingIde + real authenticated Express backend + real PostgreSQL/Mongo; approximately 5.4 seconds. Recovery/reload, Reject/reload, second fixture Accept/reload, manuscript/revision/outbox readback, foreign-author authorization and stale disabled button verified. AI-service read boundary remains the SQL fixture adapter; no provider generation is involved.
- Existing mocked-browser suite: **MOCKED_BROWSER_PASS**, **1/1**; chapter/account race cases remain covered there.
- Backend and web TypeScript checks: PASS. `git diff --check`: PASS. Local credential exact-value/pattern and personal-path scan across the 7 changed/new files: PASS; no runtime files staged.
- Immediate outbox processing in the existing Accept contract is expected to hit the offline adapter/error response; the analysis pipeline is deliberately not executed. Persisted event counts, revision linkage and duplicate prevention are asserted, not successful AI analysis.

The initial browser assertion read DB state as soon as the Accept button changed to its loading label; it was corrected to wait until review controls disappear. No production change was needed for that test synchronization.

### Reproduction commands

Provision only isolated test PostgreSQL/Mongo databases, set the existing `DATABASE_URL`, `MONGODB_URI`, test JWT/service configuration and `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`; explicitly set both live flags false. Apply existing backend and Alembic migrations. The fixture refuses non-test database names through the existing isolation guard. Keep generation workers off.

```powershell
# backend
node --import ./node_modules/tsx/dist/loader.mjs src/core/database/migrate.ts
# ai-service, against the same isolated PostgreSQL database
alembic upgrade head
# backend
node --import ./node_modules/tsx/dist/loader.mjs --test src/modules/ai/writing-drafts.postgres.test.ts src/modules/novels/accept-draft-contract.test.ts src/modules/ai/writing-drafts.test.ts
node node_modules/typescript/bin/tsc --noEmit
# web, with the same isolated backend test environment inherited by the child
$env:RUN_DRAFT_BROWSER_TESTS='1'
node --test tests/writing-recovery.real-db.browser.test.mjs
node --test tests/writing-recovery.browser.test.mjs
node node_modules/typescript/bin/tsc -b --noEmit
```

No raw DB dumps, credentials or runtime logs are uploaded. Fixture teardown targets only its generated records. The two task-owned database containers are stopped after verification; data volumes are retained. Existing P1 containers remain stopped. **Real Gemini provider calls for this task: 0.** No quota reset, forwarding activation, fallback change, merge or new PR. No remaining AA-01 verification blocker; GPT-6 independent review and the merge decision remain pending.
