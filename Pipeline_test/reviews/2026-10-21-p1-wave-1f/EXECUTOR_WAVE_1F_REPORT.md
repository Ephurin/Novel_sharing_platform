# Wave 1F — offline execution handoff

**Verdict: `P1_WAVE_1F_BLOCKED:WF1F-S09-001`.** Executor Codex; closeout 2026-10-22 Asia/Saigon. S01–S08 functional paths were exercised through real Playwright against an isolated fake upstream. S09 found a product autosave defect; S10/S11 were stopped. This is not full P1 acceptance or evidence of Gemini extraction accuracy.

Branch `codex/ai-copilot-pipeline-test` was safely fast-forwarded from `4b607b5` to baseline `52d7fb9f88365643e96f84dcc49ee2e5e0f4aab3`. S03 successful source is `c4b8f82` (full SHA in validation.json); fresh S08 and failed S09 tested `34fff042c3272e9661f7bf7163f290b4b5483568`. The evidence commit is the commit containing this report (`git log -1 --format=%H -- <report path>`); the final handoff gives its exact SHA. [Changed source paths](changed-source-paths.txt) are test harness/tests only. `.gitattributes` additionally preserves new captured bytes across checkouts. No FE/backend product fix was applied.

## Results and limits

See [step-matrix.csv](step-matrix.csv) and [validation.json](validation.json). All author mutations were real UI actions. Read-only HTTP/SQL observations narrowed provenance and outbox status; no writable API/snapshot/DB rescue was used to certify author features.

| Gate | Result | Observed behavior |
|---|---|---|
| S01/S02 | PASS offline | Five title/body-correct immutable source revisions, owned author/novel, source hashes checked |
| S03 | PASS functional offline | Five explicit entity checkpoints, Continue and bootstrap Resume; 52 source-backed proposals; real mixed canon reject/accept; baseline activated |
| M0 | PASS functional/provenance only | 35 expected narrative assertions frozen before fake calls; raw/human/official/context layers retained; real semantic quality NOT_ASSESSED |
| S04 | PASS offline | Real reload and inspection of tabs/context after baseline |
| S05/S06 | PASS functional offline | Two scripted suggestions, edit one/reject one; plan created/activated; future plan did not mutate historical canon |
| S07 | PASS offline | Ordinary chapter 6 editor/autosave produced immutable revision and incremental-analysis outbox |
| S08/M-FIRST | PASS functional offline | Fresh source entity review, canon approval, `micro_check_note` in official memory/context |
| S09 | FAIL | Undo to saved B leaves timer saving stale A; editor and persisted revision diverge |
| S10/S11/M-FINAL | NOT_RUN | Mandatory S09 failure; no downstream rescue |

S03 idempotent Continue replay was **NOT_RUN in browser**, so this additional acceptance criterion remains unproven by the UI journey. Existing deterministic tests do not replace that E2E gap. A stale review POST actually returned **409 STALE_PROPOSAL_EVIDENCE**; this is evidence the backend source guard worked. Packed generation input and semantic RAG quality were not exercised. P1 provider-backed remains NOT_ACCEPTED; P2/P3/100k NOT_RUN.

## Confirmed blocker

`AuthorWritingIde.tsx:461` returns when the editor matches the saved snapshot before clearing the prior timer at line 465. Two edits 0.263885 seconds apart (debounce 1.2 seconds) leave editor B while the server draft and latest immutable revision contain temporary A. Bad revision `737c2025-d940-44b7-b3d5-7ea31b112123`; hash `068989616d1748d0aa28e256bcac0af7563456edf36823e1a80a004735d94ecb`.

[S09 proof](S09_DEFECT_PROOF.json), [narrow patch proposal](S09_PATCH_PROPOSAL.md), and run `browser-incremental-resume-01/S09-debounce-readback.json` retain the real observation. The generic browser status enum says `BLOCKED_UI_MISSING_OR_INVALID_EVIDENCE`, but the reason is the specific product failure and all evidence bundle checks pass. The product was left unchanged as required by active task §0.5. Next work requires the separate product patch, S09 retest, then S10/S11.

## Evidence and narrative memory

Run: `../../runs/2026-10-21-p1-wave1f-workflow-01/`. Author `c029c248-f324-42bd-bd4c-11c2f3f99e77`; successful novel `5999e846-0165-4a10-92b4-c8d3f0b5ef4a`. The first incomplete novel and every failed attempt remain preserved.

`browser-attempt-02/five-chapter-checkpoint-matrix.json` contains all five chapter/revision/analysis IDs. Each raw/frozen/Continue/Resume observation is retained. All **52 proposal evidence spans** match the immutable source substring, offsets and full source text hash. Before canon decisions official memory was empty. After mixed canon review baseline brain `fb4bf1f9-8e19-4ed1-9afb-70e2ca0beeb7` had version6, baseline revision `102b427c-765e-464d-ae4b-9c681fb61a82`, 15 entities,1 alias,5 events,5 facts,0 relations/0 transitions, no pending proposals. One redundant scene fact was rejected, not silently accepted. These are scripted outputs, not model recall results.

The 35 frozen gold rows represent narrative assertions, not 35 entity mentions. All 35 excerpts link to actual imported source revisions; semantic accuracy numerator is N/A, denominator35. Five diagnostic context-preview probes cover age, reported/unverified voice, left-ear deafness, calibration-ring ownership and absent future workers. Two assertions are omitted by the intentionally limited fake response; no product extraction-loss conclusion follows. This preview is not packed writer input or semantic search. See run `MEMORY_AUDIT.md`, `memory_items.csv`, `memory_probes.csv`, `memory_checkpoints.csv`, `revision_manifest.csv`.

M-FIRST source `da241a91-e9aa-40bd-9c90-c9a1601b1aef` was created through the editor, followed by new entity review and real canon acceptance. Its body was fixed in committed harness source before writing, but no formal per-claim audit CSV was frozen beforehand: accuracy metrics are **POST_HOC_DIAGNOSTIC**, not preregistered quality results. Outbox COMPLETED means dispatch/analysis completed, not automatic canon acceptance.

Chronology caveat: the initial S03 driver inherited `final_post_run_readback` for an S02 seed snapshot. Its observation timestamp is truthful; it is not final canon readback. Later code labels it `seed_import_snapshot_before_workflow` and scopes explicitly to the original five IDs when chapter6 exists. Stage-specific memory snapshots provide actual canon timestamps; old captured artifacts were not rewritten.

## Failures, fixes and regression

Five attempts preserved: attempt01 (21 actions, missing harness bootstrap Resume); attempt02 (53, successful S03); continuation01 (9, wrong harness S05 response predicate); continuation02 (20, S04–S07 and real stale-card 409); incremental-resume01 (10, S08 success/S09 product failure). Harness fixes are `c4b8f82`, `ce34bed`, `34fff04`, respectively. Revision-specific DOM binding avoided reviewing an obsolete placeholder card. Resume verified owned novel/source/hash and did not create another chapter. All **113 recorded action bundles** revalidate against actual screenshots/DOM/Playwright traces; failed attempt outcomes remain failed. This is consistency validation, not cryptographic proof of authenticity. [Revalidation](browser-evidence-revalidation.json).

Tooling: **111 passed/4 skipped**, exit0 on `34fff04`; AI: **407 passed/2 skipped/42 deselected**, exit0; backend: **62 passed**, exit0 (AI/backend on `33a8163`, product source unchanged afterward). Full logs are in `offline-logs/`; initial tooling baseline101 and new fake-schema10 are also retained. Four tooling skips concern container-dependent tests, not successful F browser assertions. Fake schema/source tests use the real strict entity verifier; no verifier weakening.

## Isolation, accounting and preservation

Only new project `p1-wave1f-20261021-workflow-01` was used: seven services, isolated DB/volumes, internal worker/upstream networks, keys absent, mandatory gateway and no embedding/provider fallback. Runtime-safe metadata and immutable ledger/receipts are in run `runtime-final/` and `runtime-closeout/`. The preparation-only `offline-environment.json` deliberately predates startup; its `runtime_started:false` is not the closeout state.

Closeout: **76 fake receipts = 76 unique ledger tickets**, matched dispatch IDs, `live_authorized:false`, **zero external real provider calls**. Ledger simulated charges are not money spent; existing quota/retry/guard retained; paid-tier mathematical cap remains DEFERRED. No renewal/reset of the expired live window or ledger. [Audit results](audit-results.json).

**1,679 protected source/gold/historical evidence files** match the preregistered SHA256 baseline. Existing old DB/volumes/containers/ledgers were not reset/deleted. Existing tracked ai-service pytest-temp deletion/permission noise was not staged. No historical report/gold was rewritten. New run-private credentials and raw private browser material are excluded from commit; sanitized traces and screenshots are retained. Follow-up independent review must retain the S09 RED result and the browser-idempotency gap.
