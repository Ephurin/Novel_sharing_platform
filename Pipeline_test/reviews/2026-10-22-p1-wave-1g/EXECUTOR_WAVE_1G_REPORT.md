# Wave1G — S09 regression and FE review handoff

**Verdict: `P1_WAVE_1G_BLOCKED_AWAITING_FE_PATCH`.** Executor Codex, 2026-10-22. No reviewed compatible FE patch was available. Independent source regressions and a fresh real Playwright RED are complete; production FE is unchanged and S10/S11 were not run.

## Source and review provenance

Clean branch `codex/ai-copilot-pipeline-test` safely fast-forwarded from `8db9839` to `a54115efbfe227c934d1f5c1e21d1a3e0647678c`. Harness/browser source: `91a352db65e8605dd8e062feb687a778fc7f3b00`; extended source regression tested at `62fc3a1ac9809986034b389e168f6f406f7a99ec`. Evidence SHA is the commit containing this report; final response gives the exact pushed SHA. Changed paths are in `changed-paths.txt`.

Inspected [PR55](https://github.com/Ephurin/Novel_sharing_platform/pull/55) head `0c0b903f4cc86b7f469399ab6e616ffdba7e703b`, branch `feat/author-workflow-hardening` targeting `feat/author-workspace`. It is OPEN/unmerged, with **zero review submissions**. [Issue56](https://github.com/Ephurin/Novel_sharing_platform/issues/56) is OPEN and has no replies/designated fix commit. Initial snapshots and `github-closeout.json` preserve the actual observations. No merge, cherry-pick, production FE edit, issue closure or external message was performed.

The old inline callback and new hook are different implementations. Old code checks `!hasChanged` before canceling the timeout. In the PR hook, reverting to saved B clears `slot.pending`, so an existing timer reaches an empty drain. That behavior passes the focused pre-debounce source tests; it is not a reviewed patch or browser acceptance. The hook also relies on `expectedVersion`, returned draft versions, optimistic concurrency and 409 recovery. PR backend enforces version presence and atomic draft version matching; the pipeline backend currently does not implement that request contract. Workflow/migration dependencies015/016 make a blind hook/full-PR transplant inappropriate. Source snapshots under `sources/` match Git bytes at the inspected SHA.

## Regression results

`node --test Pipeline_test/tests/wave1g_autosave.test.mjs` at `62fc3a1`: **17 tests,12 PASS/5 FAIL,0 SKIP, exit1**. This expected RED remains RED; it is not a green release suite. The earlier15-test result is retained separately. The harness transpiles the actual callback/hook and replaces clock, API and React primitives; this is a source-level diagnostic, not real React/router/server acceptance.

| Contract scenario | Actual coverage/result |
|---|---|
| B→A→B before debounce | Old source FAIL independently for title/body/VIP/price (4 RED); PR hook PASS for all4; real old-editor browser FAIL for body |
| A→C before debounce | Old callback and PR hook PASS in deterministic source tests; browser NOT_RUN |
| A in-flight→B, timer while A unresolved | Hook serial convergence/version/status PASS with deferred fake API; real network reorder/backend stale canon NOT_RUN |
| B restore after A acknowledgment | Hook sends expectedVersion1 then2 and endsB; source PASS, browser NOT_RUN |
| Chapter/account/navigation/reload | Hook chapter-ID routing and unmount cancel/local backup PASS; same hook instance account change FAIL; actual router/remount/account/reload behavior NOT_RUN |
| Version conflict/concurrent tabs | Injected409 retains buffer and blocks automatic retry: source PASS; actual backend/two-tab409 NOT_RUN |
| Double unchanged flush/retry/outbox | Hook unchanged double flush produces no request: source PASS; full active-brain replay/outbox semantics NOT_RUN |

PR hook subtotal11 PASS/1 FAIL; old callback1 PASS/4 FAIL. The account diagnostic reuses the same hook instance as another user and returns prior pending text because slots are keyed only by chapter. This needs FE verification of real account-transition remounting; **no browser exploit, cross-account network write or security impact was established**. Full details and next requirements: [FE_PATCH_HANDOFF.md](FE_PATCH_HANDOFF.md).

Existing Python tooling suite: **111 PASS/4 SKIP, exit0**, tested against `91a352d`; `offline-logs/tools-regression.txt`. Skips are inherited container-dependent tooling cases. The new real Docker/browser diagnostic is separate evidence. Compose build/start succeeded; the production web Docker build includes its normal TypeScript/build step. No PR-hook integrated typecheck/backend retest was claimed because no product patch was integrated. Historical AI/backend Wave1F results were not relabeled as new tests.

## Fresh real browser RED and exact limits

New project `p1-wave1g-20261022-s09-red-01`, new DB/volumes/run, author `80d9c691-842b-4b47-a3cc-752abc71e9f9`, novel `9f22ab2b-fdfe-4e14-9b19-9e4c56af0f49`, browser session `44c8163a-854e-41fa-a26d-75f52a17fa70`. No Wave1F failed chapter/revision was reused.

Run `../../runs/2026-10-22-p1-wave1g-s09-red-01/`: five source chapters were imported through actual editor UI, source/canonical hash mapping verified, and the initial entity gate observed. The diagnostic then closed the drawer and edited chapter `ed22724c-a6b9-432a-a08a-f3d4236f4074`. B→temporaryA→B took **0.391 seconds**, under1200ms debounce. Exactly **one actual PATCH200** carried A. Editor remained B, while immediate and later read-only server draft showed A. The saved indicator/DOM and real screenshot/trace are preserved, not inferred from a synthetic manifest.

**Important boundary:** this diagnostic ran before baseline activation; Story Brain was importing. `snapshotSavedChapter()` skips immutable revision/outbox creation unless the brain is active. Latest immutable revision therefore remained B, new revision IDs were empty and SQL found **zero outbox events**. These are actual observations, not an active-brain outbox PASS. Fresh stale network/draft RED is established; the historical Wave1F stale immutable revision remains the separate active-brain RED evidence. No claim of current S03–S08 completion, S09 GREEN or full source/outbox acceptance follows.

`browser-red-01/S09-independent-red.json` preserves before/after bodies, hashes, immutable revisions, PATCH payload/status/timestamp and edit timing. `read-only-final.json` confirms the stale draft remained after all recorded requests settled. `read-only-outbox.json` is SELECT-only, scoped to the owned novel. All author data mutations were real Playwright actions; account seed is separate insert-only infrastructure setup. No direct author-write API/snapshot/DB rescue.

All **18 action bundles** validate against real Playwright trace, screenshots, DOM, run/user/session and readback hashes (`browser-evidence-revalidation.json`). The generic driver enum `BLOCKED_UI_MISSING_OR_INVALID_EVIDENCE` reflects its legacy failure classification; the exact reason is `PRODUCT_S09_STALE_DEBOUNCE_SAVE_AFTER_UNDO`, with valid evidence. Seed readbacks are explicitly labeled before-workflow; action-local S09 readbacks carry their own timestamps. Validation is consistency checking, not cryptographic proof of browser authenticity.

## Per-step status for this run

| Step | Current Wave1G status/channel |
|---|---|
| S01 | PASS — fresh 5-chapter UI import, OFFLINE_REAL_PLAYWRIGHT_FAKE_PROVIDER |
| S02 | PASS — initial entity gate observed, same offline channel |
| S03–S08 | NOT_RUN in current run; historical Wave1F bounded results remain historical |
| S09 | FAIL — independent pre-activation body diagnostic, not ordered post-S08 acceptance |
| S10/S11 | NOT_RUN — no reviewed FE patch and no S09 GREEN |

See `step-matrix.csv` and `scenario-matrix.csv` for explicit LIVE_PROVIDER_UI NOT_RUN. S03 UI Continue replay, actual generation prompt context and semantic RAG remain outstanding, not inferred from unit tests. No M0/M-FIRST quality result is claimed. Current final memory is empty, no canon approval performed; source assertions/gold were not changed. M-FINAL stop-state is the read-only final snapshot, not long-form memory acceptance. P2/P3/100k and publication NOT_RUN.

## Containment and preservation

Seven new containers with internal worker/upstream networks, empty real provider keys and fake-only gateway were verified before browser writes. Existing fake scenario reused unchanged; GOLD/35 narrative assertions never supplied to the fake upstream. Runtime-before recorded0 calls; runtime-final recorded **9 fake receipts =9 unique ledger tickets**, reconciled dispatch IDs, `live_authorized:false`. **0 external real AI provider calls**. Ledger charge figures are simulated fake accounting, not money spent. No USD-hardcap engineering was done; existing quota/security/retry boundary retained, no approval renewal/reset.

All **2,335 tracked protected source/gold/historical evidence files** match their before-run SHA256 baseline, including the1,679 protected set from Wave1F. No historical evidence/DB/volume was repaired/reset/deleted and no old stack was restarted by this task. Read-only gateway status additionally confirms all76 historical Wave1F call-history rows remain identical to its closeout snapshot (`historical-ledger-readonly-check.json`). File hash checks do not claim a bitwise audit of live historical databases. Existing inaccessible ai-service pytest-temp deletion noise was not staged. All resource names remain owned and preserved.

Environment failures retained: initial `docker compose` discovery returned125 before initialization; the installed Docker Desktop `docker-compose.exe` then initialized exactly once and started the new project successfully. Anonymous GitHub REST returned404 for the private repo; authenticated connector supplied the review snapshots. Invalid null probe outputs were discarded before evidence capture. No secret-bearing login trace or raw private trace is committed; sanitized artifacts are scanned, including ZIP contents.

**Stop:** awaiting FE owner's identified reviewed compatible patch. Integrate only that scope after compatibility review, then new active-brain real-browser S09 acceptance and due S10/S11. This report does not authorize real Gemini calls or full-PR merge. Evidence and RED tests are committed for independent GPT-6 review.
