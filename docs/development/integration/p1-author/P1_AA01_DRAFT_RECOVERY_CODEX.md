# P1-AA01-DRAFT-RECOVERY-01

**Verdict: P1_AA01_HOTFIX_PARTIAL** — implemented and covered by mocked backend/browser tests; database-backed Accept regression remains environment-blocked. No full acceptance claim.

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

## Environment limitation and next verification

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
