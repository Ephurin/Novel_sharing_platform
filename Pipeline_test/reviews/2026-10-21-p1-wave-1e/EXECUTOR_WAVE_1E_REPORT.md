# Wave 1E — executed functional validation and Human Entity Review

Executor: **Codex**. Date: 2026-10-21. Branch: `codex/ai-copilot-pipeline-test` only.
**Verdict: P1_WAVE_1E_READY_FOR_INDEPENDENT_REVIEW.** This is offline functional evidence, not P1 acceptance or live authorization.

## Tested source and scope

Safely fast-forwarded from `dea20421c612a79aa0534e74341c311ef60de772` to requested baseline `f4e5fd71490d90516d18aa54b261d47430e04b4f`. Initial pre-existing inaccessible pytest-cache entries were understood and never staged/restored/deleted. No main/FE branch changes, PR, merge, clean/reset/stash, volume deletion or historical database writes.

Final tested source commit: **`b5fa332e85dc328100fba93c5b696fac2e80dbee`**. Full tooling suite and final browser attempt05 executed on this commit. The final evidence/report commit adds artifacts and scoped Git checkout attributes only; application/harness code remains at that tested source. Earlier AI/backend regressions ran on source `9668e9d88a23260af9d94ac9faaf6a882d38eebc`; those application files are unchanged across the later harness/HTTP fixes. Hashes: `tested-source-manifest.json`; exact source path list: `changed-source-files.txt`.

A final Git index audit found autocrlf normalization changing staged DOM/session bytes and breaking new evidence hashes. Scoped `.gitattributes` preserves only new Wave1E run/log bytes. Git blobs of all new run artifacts are checked against captured bytes. Frozen input files and historical evidence are not renormalized: their existing source-file checksum/checkout portability conventions are a pre-existing limitation, while this run preserves their original bytes and versioned NFC/LF body mapping. A byte-exact copy of the 10 original input files and manifest is retained under the new run `source-input/`, protected by the new evidence attributes. Independent reviewers can recompute the original raw source hashes and parser output from that snapshot on any platform, without modifying historical fixtures.

Source repairs are confined to test tooling: strict parser edge cases, explicit mixed-verdict fake scenario, real-browser review workflow, chronological readback, replay denial, fail-closed browser verdict and bounded HTTP denial transport. **No product AI-service/backend/FE source was changed in this wave.** Budget rates, ceilings, admission/settlement logic and paid-tier design were not refactored.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| A1 mapping/partial replay/evidence regressions | PASS | Baseline 52 passed; new edge cases RED then GREEN; final suite 101 passed, 4 opt-in container tests skipped. |
| A2 five chapter title/body/hash | PASS | Original H1 -> title; prose-only NFC/LF body; original file SHA differs from canonical body SHA; exact canonical GET content/IDs/owner/order checked. |
| A3 S01 real browser | **OFFLINE_BROWSER_UI_SMOKE_PASS** | New isolated project/user/novel, actual editor controls and autosave; five immediate draft observations and final five canonical revisions. |
| B S02 mixed entity review | PASS, bounded chapter-1 probe | 5 entity, 148 not_entity, 14 unresolved; 2 supported alias decisions. Actual keep/reject/type-correct/save/continue UI actions. |
| B checkpoint ordering | PASS | Zero event/fact calls before author review or before Continue; visible entities_reviewed checkpoint and frozen reviewed decisions precede downstream fake receipt timestamps. |
| B official canon separation | PASS | Two entity proposals plus one alias proposal remain pending, source spans/revisions/body hashes match. Official memory unchanged throughout; no canon accept/activation. |
| C chronology/recovery | PASS in tested scope | Immediate draft and phase readbacks have observation timestamps; copied final snapshots explicitly final_post_run_readback, observed after the final action. Duplicate CLI rejected before browser/author writes. Partial/corrupt/stale/ambiguous recovery cases fail closed in deterministic tests. |
| Preservation / isolation | PASS | 314 frozen files unchanged; actual Wave1D ledger/receipt counts still 200/224 and 30/30. New workers have no real provider keys and cannot connect directly to public TCP/fake upstream. |

## Real UI execution

New project: `p1-wave1e-20261021-functional-01`; run `2026-10-21-p1-wave1e-functional-01`. Independent Postgres/Mongo volumes, ledger, fake upstream and ignored local secrets. Existing Wave1D projects never restarted or modified. Only the **new** Wave1E gateway was restarted to load the bounded HTTP fix, with its ledger/history retained.

Final browser evidence: `../../runs/2026-10-21-p1-wave1e-functional-01/browser-attempt-05/`.

- Browser session: `4d69ecda-c51c-4952-8750-d5a48a68ce2d`; novel `7192eef7-8fbb-404d-9a2a-02bc9e386a35`; author `f133cd92-4aa2-4010-b39a-3575432836dd`.
- **25 real actions**: login excluded from trace for credentials; New Project, five editor entries, hints, extraction, checkpoint, review bulk/keep/reject/unresolved resolution/type correction/save/continue.
- Artifacts: `browser.trace.zip`, `actions.jsonl`, actual `ACT-*.png` and `.dom.txt`, scoped action manifests, `source-to-canonical-manifest.json`, canonical `.readback.json`, five `.immediate-draft.json` and three `HITL-*.json` phase observations.
- Action timestamps are UTC. Draft readbacks occur inside their autosave actions. Phase snapshots record started/finished observation times and the preceding action ID. Final canonical GET occurs **after** HITL Continue; file packaging time is recorded separately. Earlier actions reference final readback honestly, never pretend those chapters existed at creation time.
- The evidence validator checks consistency; it does **not** establish cryptographic browser authenticity. Real execution and exported Playwright trace support this run.

### S01 canonical revisions

Parser: `markdown-h1-title-body-nfc-lf-v1`. Frozen input unchanged. UTF-8 without BOM; CRLF -> LF and NFC; leading chapter H1 removed with its separator; prose otherwise preserved. Reject blank label, duplicate leading chapter heading and unknown declared conversion version. Later prose H1 remains allowed.

| Chapter | Saved title | Canonical revision | Canonical BODY SHA256 |
|---|---|---|---|
| 1 | Chương 1 — Bến trở về | `6425e6b5-87f1-43d9-bfcc-692cfea50ccb` | `ae780e1ba2fb095acd71def5fc6dd74d851fc07fa23492ef39ee3b75e8570cf5` |
| 2 | Chương 2 — Lần đọc thứ nhất | `8a777107-8130-4c8a-8403-f30854f8923a` | `48ea6a60c4e604370efc18db1b7baeebd48f93109d2d14fb19c9f4f8dcc2b404` |
| 3 | Chương 3 — Hai nơi treo một quả chuông | `3267d11e-c885-4ac4-9f86-e72b150f9263` | `5d866c2959a38c410d47c05c79ce0da0952cc2b3f2bd5b202122703d008345ac` |
| 4 | Chương 4 — Bản đồ không có tiếng nước | `988fe394-e83d-42d8-b1b3-f3a6fe42f761` | `19539200da6e5b436e3b042a12f806bbbb7f6efcec4466a308969badeaa0932b` |
| 5 | Chương 5 — Ba tiếng gõ | `b9f60e14-2be6-4072-9fbc-959e685dec90` | `6549fdfb9c1ff5a5cca74b8b77f09adff8ea67699944ade84c0de788c8a4c0c5` |

Full source-file/body hash pairs, chapter IDs and revision IDs: `canonical-revision-hashes.csv` and final source-to-canonical manifest. These are derived bodies; old Wave1D whole-Markdown-body evidence is preserved and **not relabelled contract-compliant S01 PASS**.

### S02 machine vs author vs canon

The explicit fake scenario returns schema-valid, candidate-ID-bound mixed decisions from the source contexts. No invented entity name or occurrence is inserted. `Mai Linh` is PER; supported `Linh` alias quotes are retained. `An`/other ambiguous Linh occurrences deliberately exercise unresolved; author rejects these in the synthetic branch. `Chiếc` exercises the negative path. Fake CV-04 type ORG is a deliberately injected classification mistake; author corrects it to source-supported ITEM through the UI.

Raw fake responses are retained separately in runtime receipt logs; machine `decisions` and author `reviewed_decisions` remain separate in phase readback. The freeze checkpoint has no unresolved decisions. Proposals carry correct revision IDs/hash/quotes; all three remain pending. UI does support the required keep/reject/correct/continue operations, so **no BLOCKED_UI_MISSING and no writable API rescue** occurred.

The probe reviews chapter 1 only. Continue invokes event/fact extraction and advances the manuscript workflow; later chapter checkpoints are left for later work. This touches the entity-review part of S03 diagnostically; it does not complete all of S03 or activate a baseline. Empty scripted event/fact outputs prove routing/order, not narrative extraction quality. **Gemini recognition accuracy, 35-gold recall and nonempty event/fact semantic correctness are NOT_TESTED.**

## Actual commands and outcomes

Commands ran offline. Local env values were loaded without printing/staging them; `<env>`/`<temp>` below are placeholders for the new owned paths.

| Command | Exit | Result / log under offline-logs |
|---|---:|---|
| `python -m pytest -q Pipeline_test/tests/test_manuscript_fixture_mapping.py Pipeline_test/tests/test_partial_import_idempotency.py Pipeline_test/tests/test_ui_evidence_authenticity.py -p no:cacheprovider -o addopts='' --basetemp=<new temp>` | 0 | 52 passed; `a1-regression.txt`. |
| `python -m pytest -q Pipeline_test/tests/test_wave1e_functional.py ...` before edge fixes | 1 | 3 failed, 2 passed; `edge-red.txt`. |
| Same edge tests plus the A1 files after fixes | 0 | 57 passed; `edge-green.txt`. |
| `python -m pytest -q Pipeline_test/tests -p no:cacheprovider -o addopts='' --basetemp=<new temp>` at b5fa332 | 0 | **101 passed, 4 skipped**, `tools-http-final.txt`. Opt-in Wave1D boundary-container suite deliberately NOT_RUN; quota was not reset. Actual Wave1E browser/app integration and worker probes run separately. |
| Ticket/auth subset after HTTP transport fix | 0 | 7 passed, 34 deselected; `ticket-transport-green.txt`. |
| `python -m pytest -q -p no:cacheprovider --basetemp=<new temp>` in ai-service, LLM_ENABLED=false/LLM_PROVIDER=none/EMBEDDING_PROVIDER=none | 0 | **407 passed, 2 skipped, 42 deselected**; `ai-regression.txt`, deprecation warnings. |
| `npx tsx --test src/modules/ai/*.test.ts src/modules/ai-copilot/llm-provider.test.ts src/jobs/outbox-processor.test.ts` in backend | 0 | **62 passed**; `backend-regression.txt`. |
| Prepare new run/env; `docker-compose --env-file <env> -f Pipeline_test/tools/compose.wave1e-offline.yml --profile initialize run --rm budget-init`; `up -d --build` | 0 | `prepare.txt`, `ledger-init.txt`, `compose-up.txt`; initialized once. |
| `docker-compose ... exec -T backend node /wave-tools/seed_wave1d_author.mjs` | 0 | Insert-only author in new DB; `author-setup.txt`. |
| `python -m Pipeline_test.tools.browser_author_driver --run-id 2026-10-21-p1-wave1e-functional-01 --evidence-dir <new run>/browser-attempt-05 --base-url http://127.0.0.1:33459 --human-review --project p1-wave1e-20261021-functional-01` | 0 | S01 + mixed HITL PASS; `browser-attempt-05.txt`. |
| Repeat CLI with an existing evidence directory | 1 (expected) | `EXISTING_EVIDENCE_REPLAY_FORBIDDEN`, before browser/author writes; `duplicate-replay-rejected.txt`. No recovery POST. |
| Runtime capture + `python Pipeline_test/reviews/2026-10-21-p1-wave-1e/VERIFY_WAVE1E_EVIDENCE.py` | 0 | `runtime-post-http.txt`, `evidence-audit-final.txt`, `FUNCTIONAL_EVIDENCE_AUDIT_FINAL.json`. Checks schema, exact source spans, source/revision hashes, ordering, memory/proposal separation, ledger/receipt IDs and actual worker egress denial. |

No product source changed, so production rebuild/typecheck beyond the actual Compose build was not repeated unnecessarily. Additional successful/failed intermediate test outputs are retained.

## Failures retained and repaired

1. New parser negatives reproduced blank chapter title labels, repeated leading chapter H1 and unknown normalization accepted. Fixed in parser/provenance, without altering source fixture/assertions.
2. Browser attempt02 exposed **receipt scope leakage** from an earlier novel in the same new stack. Its assertion had an empty message; old result code incorrectly treated `failure=''` as success. That recorded attempt02 result is **INVALID for HITL acceptance** even though its JSON says OFFLINE_BROWSER_UI_SMOKE. It is retained unchanged as failure evidence. Fix: capture pre-attempt receipt offset, explicit current-attempt scope, fail on any non-None error, and require a positive human-review result file when requested. Regression covers empty error and absent/blocked HITL result. Attempts03–05 genuinely execute the full bounded HITL path.
3. Full regression at ba9245d hit Windows localhost `WinError 10053` on ticket denials (one failure, then two on confirmation). Gateway replied early with unread POST bytes, which can reset TCP before the HTTP denial is received. Fixed bounded body draining with a read timeout before denial, without changing quota/auth/admission/settlement. Existing assertions retained; affected 7 tests and the full 101-test suite passed after the fix. Logs `tools-chronology-final.txt` and `tools-confirm.txt` remain RED evidence, not overwritten.

## Preservation and remaining blockers

`protected-after.json` verifies all **314 historical/source fixture files unchanged**. `historical-runtime-audit.json` verifies frozen Wave1D runtime ledgers/receipts unchanged. Old P1 real ledger remains 8 attempts / estimated USD 0.007379 / expired approval. No reset, old outbox/DB/volume changes or historical report correction. New containers, DBs, ledgers, attempts and failed artifacts remain available for review.

Paid-tier cost proof: **BUDGET_COST_HARD_CAP_UNPROVEN_FOR_PAID_TIER — DEFERRED per owner priority**, not a failure of this offline wave. Specific API project's Free Tier status remains unverified; no real provider/billing check or live call was made. Operational quotas/retry bounds/key isolation/network protection retained. **New external AI provider calls = 0.**

No remaining blocker to independent review of this scoped offline wave. What still blocks **full P1 S01–S11 acceptance**: fresh explicitly authorized and project-tier-verified real-provider evaluation; actual extraction quality/35-gold audit; remaining manuscript entity checkpoints and canon/baseline approval; S04–S11 writing/context/incremental memory/consistency/reload evidence. These are unexecuted acceptance gates, not claims that this fake test resolves model quality. Resume-in-place after partial UI import is not implemented by this harness: ambiguous/partial replay is deliberately blocked, and recovery requires inspection rather than creating duplicate records.

P2, P3 and the 100,000-word journey are **NOT_RUN**. Stop for independent GPT-6 review; no new live window is authorized by this report.
