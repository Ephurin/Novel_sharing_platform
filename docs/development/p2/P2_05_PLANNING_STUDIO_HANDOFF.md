# P2-05 — Unified Author Planning Studio handoff

Issue [#101](https://github.com/Ephurin/Novel_sharing_platform/issues/101) · Draft PR [#102](https://github.com/Ephurin/Novel_sharing_platform/pull/102).

**Verdict: READY_FOR_REVIEW for the verified source.** All 11 required source jobs passed; the final PR Conversation receipt pins the subsequent documentation/evidence delivery SHA and rerun results. No merge or deployment authorization. P2-06/07 not started. Real LLM/Gemini calls = 0.

## Revisions and evidence boundary

- Base: `integration/p2-planning-studio` @ `ac9d070b2b3e6b368e41e84735b8a3dde5740f99`.
- Branch: `codex/p2-05-planning-studio-ui`, reusing the clean existing checkout.
- Review source: `5f2a950298c22cf089819ae887055e6c88d6e715`.
- Delivery: the subsequent documentation/evidence commit; the final PR Conversation receipt pins its exact SHA and rerun URLs. A commit cannot contain its own hash. No application, test or workflow changes are intended after review source freeze.
- [Source CI receipt](evidence/p2-05/source-ci-receipt.json) records each actual checkout SHA. P2/P7/P8 now explicitly checkout `pull_request.head.sha || github.sha`, rather than a synthetic merge ref. Earlier runs and source356 receipts are retained separately in `history/`; their counts are not pooled into review-source acceptance.

Read references: roadmap, P2-02B review handoff, P2-03 review handoff, P2-04 M0 contract/handoff, and WORKFLOW_CONTRACT v1.4 at `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`. No historical P1/P2 report, migration, QA database or demo branch was modified.

## Actual author route and journeys

`/author/ide?novelId=...&chapterId=...` still mounts the existing `AuthorWritingIde` through AuthGate, RoleGuard and AuthorTheme. The unused `AuthorIdeShell` router import is removed; it is not a second user-reachable Planning experience. The Memory drawer links setup/plan actions back to this Studio while retaining P1 manuscript import, profiles, locks, entity review and Canon HITL.

Planning/Write mode exposes five native-button steps: **Idea → World rules → Characters/locations → Chapter board → Write**. Steps can be revisited. Both planning editors stay mounted while hidden, as does the original Writer. Entering Planning first flushes Writer and refuses the transition on save error; it does not discard an unflushed manuscript. Initial/scoped summary readback uses `aria-busy` and native `inert` for the planning cards so loading cannot move an actionable recovery button under a pointer. Navigation and Write remain available. Errors settle to an explicit unknown/error state, not success.

1. **No plan:** enter an idea and optional explicit cards, or go to Write immediately. Story Plan is not required. Before verified M0 or an existing P1 manuscript baseline, explain ordinary draft behavior without automatic analysis. Visiting a step creates no chapter. Explicit Create uses the existing Core chapter endpoint; selecting an existing chapter uses the current Writer.
2. **Existing outline:** paste the full future outline and explicitly split lines into editable cards, or edit cards manually. Neither import nor activation makes planned occurrences historical.
3. **Build in Studio:** edit stable declaration cards; submit structured setup; explicitly accept/reject/edit the whole dependency group and choose new/existing identities; explicitly activate M0 from real readiness; optionally edit/version a 0/5/10/15/20/25+ chapter plan; create/open a chapter and save through the existing Writer.

The overview reads actual setup review, M0 eligibility/activation/M-FIRST, Brain counts and chapter extraction status. It separates accepted World Setup, future intentions and historical events. The first real revision is shown as evidence in a disclosure, not a fabricated wizard completion. Chapter analysis awaiting entity/Canon review links to the existing Memory workflow. A bare active/null legacy Brain is not presented as verified M0.

## Backed UI actions and API contracts

| Surface | Real backing / behavior |
|---|---|
| Idea | Existing setup-v1 `outline` field, clearly labelled future direction. It is not extraction input or Canon history. |
| Rules and identities | setup-v1 structured declarations/rules, stable IDs before submit, source provenance and original/reviewed values, full-group review, explicit homonym identity choices and unresolved-condition labels. |
| Accepted data | Submitted source is read-only in production; pending content can be edited in the review group. Accepted character corrections use existing profiles/Memory authority. Accepted rules are explicitly read-only: no generic rule-correction API is advertised. |
| M0 | Existing typed readiness GET and explicit CAS activation POST; re-read actual state, preserve 409/error, no synthetic chapter/revision/event. |
| Chapter board | Existing plan-edit-v1 save/fork/activate/skip/delete; immutable history/effective archival state and server capability flags; source outline/private plan notes; title, explicit target, goal/outcome text, events, dependencies and typed hint-or-confirmed-ID participants. |
| Write | Existing Core create/PATCH, writer lease, Mongo expectedVersion, immutable revisions, outbox and P1 review. Stable `clientRequestId` survives uncertain create retry; scoped late success/error cannot redirect or notify the next session. |
| Model assistance | Disabled truthfully in the production Studio. Legacy isolated browser fixtures explicitly opt into an offline-only test prop; the mounted IDE cannot enable it through a URL or UI. No P2-06 stub completion claim. |

No new backend endpoint/DTO version, schema migration, Plan Store, Canon Store, Writing Engine or editor. Client changes only expose the existing optional Core `clientRequestId` and pass AbortSignal to existing clients. Goal/outcome use the current description field; unsupported fields are not silently written as ad-hoc metadata. Participants never bind by equal display name. Objective/event IDs, participants and dependencies survive reorder; reordering does not silently renumber an author's explicit target chapter.

## Local draft, CAS and privacy behavior

Device-local recovery is keyed by account + novel + lane (review additionally by snapshot), with immediate buffer persistence, dirty status, explicit server Save and a beforeunload warning. It is not an alternative authoritative server store. In-app unmount, reload, account changes and logout/login preserve the matching account's recoverable draft. On storage failure, show a warning and allow export; the memory fallback only survives the current tab.

A pending backup must be explicitly recovered or discarded before editing/saving/skipping/selecting another plan version, preventing new input from overwriting the older backup. Read server without replacing dirty text. A 409 keeps local content and captured setup/Brain/plan/intent versions. Explicit discard uses the server version; an explicit fork can preserve local content against the newly read head. No silent rebase, automatic retry, or POST on each keystroke. Idempotency keys persist before uncertain POSTs.

Planning requests synchronously abort on account retirement before Axios can attach a new account's token; late replies do not hydrate the next scope. Novel-keyed mounts isolate same-author novels. Local private notes are not dispatched without Save; server-side private plan/setup data retains the existing author-only and provider-exclusion contracts. Browser diagnostic probes record only scope/booleans, not private content; login fixture bodies are redacted from recorded requests.

## Proven blockers fixed within scope

### Earlier idea-only source blocked legitimate later M0

Real PostgreSQL reproduction on the base activation implementation plus the new test returned `M0_BOOTSTRAP_IN_PROGRESS`: an earlier saved idea with zero supported proposals cannot have a review group completed. A subsequent explicit setup could be fully reviewed/materialized and still never activate.

The small guard exception applies only to an **older**, same-author, setup-v1/extract source with exact empty manual setup, empty cards/required IDs and matching setup hash. It cannot activate that empty source itself. Latest-source selection, full review, materialized accepted artifacts, owner/tenant/provenance/CAS/history checks and locks remain required. Running, pending-card, foreign-author, altered-hash, nonempty-text and blueprint sources still block. The 33-case real PG M0 suite includes the positive journey and six new negative variants. [Original failure](evidence/p2-05/baseline-reproduction.json).

### Mobile recovery pointer lost during async layout change

The earlier [P2 run](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42508943110) failed despite the buffer remaining correct. Native trace showed pointerdown on Restore at scrollTop429 and pointerup at scrollTop471 after the late summary changed layout. The event did not reach Restore; this was not DB corruption or a reason to weaken CAS. Native inert/busy readback guards and synchronous navigation readiness prevent interaction while layout is settling. A deterministic response gate now holds summary readback, verifies the protected controls, then checks real click recovery and logout/login. [Preserved failure receipt](evidence/p2-05/mobile-recovery-reproduction.json).

### Backup prompt previously allowed replacement input

A new browser assertion fails against the source356 plan component (exit1) and passes after the fix (exit0): editable inputs/Save/Skip/version selection must stay disabled until the author chooses Recover or Discard. The original cached text and server version are retained. No backend contract changed to make this test pass. [Reproduction receipt](evidence/p2-05/backup-choice-reproduction.json).

## Validation — exact review source

Every required job succeeded on the exact review source; each checkout SHA was verified from its job log. See the receipt for job names and full counts.

| Workflow | Run | Required jobs |
|---|---|---|
| P2 Feature / Setup Provenance | [42512637762](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42512637762) | PASS 1/1 |
| P7 Semantic Memory | [42512637818](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42512637818) | PASS 3/3 |
| P8 Cutover and Migration | [42512637780](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42512637780) | PASS 7/7 |

Actual source results (exit0 for successful commands):

| Layer | Result |
|---|---|
| P2 parsing/P1 manuscript | 46 PASS |
| P2 real PG bootstrap/setup/review/plan/worker/M0 | 146 PASS,0 FAIL,0 SKIP; includes all33 M0 cases |
| Gateway contracts | 19 PASS |
| Live bootstrap/P1 save, setup owner, M0 first-save/HITL bridges | Three separate1-PASS suites, real PG/Mongo |
| Browser HTTP mocks | 8 standalone setup/plan/M0 +1 actual Vite route PASS (9 local together) |
| Mounted P1 Core Writer PG/Mongo browsers | 2 PASS |
| Web build + TypeScript | PASS (`tsc -b` included in build; dedicated local typecheck also exit0) |
| P8 full PostgreSQL | 344 PASS,8 SKIP,447 deselected |
| P8 full non-PostgreSQL | 415 PASS,32 SKIP,352 deselected,6 subtests PASS |
| P7/P8 other required jobs | Vector/retrieval, persistence, rollback restore/parity, frontend gateway boundary, controller and cleanup gates PASS |

P7 repeats some non-PG coverage; these counts are not summed as distinct tests. SKIP and deselected are not PASS. [Machine-readable test results](evidence/p2-05/source-test-results.json). [CI artifact](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42512637762/artifacts/13630182747), SHA-256 `56c4443898bf90f3889fb54c26108db9a65c29d3310b85d7d12740989de22ff0`, verifies source SHA/tree,146-case JUnit,33-case M0 subset,25 live SQL/Mongo states,14 idea/negative-source query snapshots and private-log scan.

Exact commands (exit codes are in the source receipt):

```powershell
# Repository root; PLAYWRIGHT_CHANNEL=msedge, P205_EVIDENCE_DIR points to this run's screenshot directory
npm --prefix web run build
npm --prefix web run typecheck
node --test web/tests/planning-studio.browser.test.mjs web/tests/setup-foundation.browser.test.mjs
```

CI uses installed Chromium and working directory `web` for the same two browser files, separately, plus:

```text
node --test tests/author-ide.browser.test.mjs tests/draft-persistence.browser.test.mjs
```

CI Python commands, working directory `ai-service` (pytest options/paths unchanged):

```text
pytest -q -o addopts= -p no:cacheprovider --basetemp="$RUNNER_TEMP/p2-focused" --junitxml="$RUNNER_TEMP/p202/focused.xml" tests/test_setup_v1.py tests/test_p2_bootstrap_guard.py tests/test_p2_bootstrap_pacing_compat.py tests/test_p2_json_bootstrap_compat.py tests/test_manuscript_bootstrap.py
pytest -o addopts= -vv -s -m postgres_integration --basetemp="$RUNNER_TEMP/p2-a16" --junitxml="$RUNNER_TEMP/p202/a16.xml" tests/test_p2_bootstrap_postgres.py tests/test_setup_v1_postgres.py tests/test_setup_author_scope_postgres.py tests/test_setup_review_postgres.py tests/test_plan_edit_postgres.py tests/test_plan_review_fixes_postgres.py tests/test_writing_plan_authority_postgres.py tests/test_setup_activation_postgres.py
```

The existing P2 job supplies `RUN_DRAFT_BROWSER_TESTS=1`, isolated PostgreSQL16/Mongo7, fake LLM/embedding providers, service authentication and fake-only JWT/service fixtures. Its exact Python command and all Gateway commands remain in [.github/workflows/p2-setup-provenance.yml](../../../.github/workflows/p2-setup-provenance.yml). Review-source real DB readbacks and JUnit counts are curated with source SHA and raw artifact hashes. Earlier local source356 runs (33 real PG M0, two real Core PG/Mongo browsers, build/typecheck) remain in `history/` and are not counted as a new-source PASS.

## Durable data evidence and screenshots

Local infrastructure: isolated `p205` PostgreSQL16.15 + pgvector0.8.7 (`127.0.0.1:55435`) and Mongo7.0.39 (`127.0.0.1:57275`), with existing migration head0017_plan_edit. P1 browser fixtures create/drop their own schema/database names; no P1 QA resource is used. CI independently provisions PG16/pgvector and Mongo7 and records service identities/migrations. No environment blocker is claimed.

[Source database readbacks](evidence/p2-05/source-db-readbacks.json) include before activation, M0/replay, empty draft, first real save/retry, before/after author Canon, rollback/reconciliation and concurrent CAS. Raw original CI artifact is linked and hashed. M0 has zero chapters/revisions/outbox/events/mentions/states; first meaningful save produces a real SQL revision/outbox and matching Mongo hash. Narrative events remain absent before author HITL; future-plan data is separate. The idea-only journey preserves the older source while materializing two entities/one world rule and zero history. Operational log scans assert private markers absent.

Browser evidence is **actual mounted Vite application + HTTP mocks**, not browser-to-real-database E2E. Separate real Gateway→Python→PG/Mongo and Core Writer browser evidence are labelled accordingly. Combined new-planning browser→real DB E2E is **NOT_RUN (no combined claim)**; no mock result is relabelled as real PostgreSQL PASS.

- [Wide author Studio](evidence/p2-05/browser/planning-wide.png),1280px.
- [Mobile Studio](evidence/p2-05/browser/planning-mobile.png),390px.
- [Mobile Chapter Board](evidence/p2-05/browser/planning-board-mobile.png),390px; the test also checks the actual scroll container for overflow.
- [Mounted request/response journey](evidence/p2-05/browser/mounted-readback.json), fake HTTP clearly labelled.
- [Manifest](evidence/p2-05/manifest.json): source tree, application/test/workflow hashes, artifact identity and evidence hashes.

## Changed files / independent review focus

- `AuthorWritingIde.tsx`, `PlanningStudio.tsx`, `AuthorMemoryPanel.tsx`, router: one real route/mode, preserved Writer, scoped creation, existing Memory links, actual status and busy layout.
- `planning-draft.ts`, `SetupFoundationPanel.tsx`, `StoryPlanEditor.tsx`, `setup-api.ts`, `novel-api.ts`: recoverable buffers, explicit choices, stable IDs, typed signals/create key, review/M0/plan API reuse.
- `setup_activation.py` and its PG tests: only the proven superseded-empty-idea blocker and negative guards; no migrations/materializer/Writer authority change.
- Browser acceptance/fixture files, three workflow checkout pins and P2 browser/build regression steps, this handoff and source-pinned evidence. No unrelated cleanup.

Remaining limitations: production model brainstorming intentionally unavailable; accepted-rule correction remains read-only/unsupported; no new role/relationship/profile DTO is invented (existing Memory profiles/relationships are reused); local recovery is device-local, not cross-device sync. 500-objective backend limit is retained transparently; 25+ is supported. No new full browser-to-DB combined E2E claim.

Next step: independent GPT-6 review of API authority, the narrow prior-source exception, recovery/privacy/CAS, CI source hashes and mounted UX; author decides merge. Keep PR Draft. Do not merge or start P2-06/07.
