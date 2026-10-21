# GPT-6 independent review — Wave 1E offline functional validation

**Date:** 2026-10-21 (Asia/Bangkok)  
**Repo/branch:** `Ephurin/Novel_sharing_platform` / `codex/ai-copilot-pipeline-test`  
**Reviewed HEAD:** `4b607b5eb4246a51feadc016cc954efdfd02540d`  
**Tested source SHA reported by executor Codex:** `b5fa332e85dc328100fba93c5b696fac2e80dbee`  
**Behavioral contract:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4, `SHORT_LOOP_TEST.md`, `NARRATIVE_MEMORY_AUDIT.md`  
**Method:** Independent read of actual source, report and committed text artifacts through GitHub. I **did not independently execute Docker/Playwright/pytest or inspect every binary screenshot/trace payload**. Source/evidence reviewed, not a new direct E2E run.

## Verdict

**`WAVE_1E_OFFLINE_FUNCTIONAL_ACCEPTED_WITH_EXPLICIT_SCOPE`**, **`P1_FULL_ACCEPTANCE_BLOCKED`**.

Source/evidence substantiate **S01 OFFLINE_BROWSER_UI_SMOKE_PASS** for five manuscript chapters and **S02 + first-chapter mixed Human Entity Review OFFLINE_PASS**. **No Google provider-backed acceptance** can be inferred: Codex confirms **zero external AI provider calls**; synthetic fixture verdicts and empty event/fact fake responses are not model-quality tests. **S03 full canon/activation and S04–S11 are NOT_ACCEPTED**. P2/P3 and terminal 100k NOT_RUN.

### Verified from saved artifacts / source code

1. **S01 title/body provenance repaired:** `manuscript_fixture.py` implements versioned `markdown-h1-title-body-nfc-lf-v1`; `browser_author_driver.py` fills actual H1-derived chapter title and prose-only body, checking autosave via GET; `provenance.py` validates owner, chapter/revision IDs, canonical title/body/hashes. `browser-attempt-05/source-to-canonical-manifest.json` maps all five source-file SHA256 to **different** canonical BODY SHA256 and matching final readback revision IDs. This closes earlier Wave 1D raw-Markdown-body divergence for **new offline run**, not history.
2. **Actual browser actions evidence:** `browser-attempt-05/browser-result.json` reports 25 Playwright action bundles, coherent run/user/novel/session scope; `actions.jsonl`, screenshots, DOM and trace ZIP; `ACT-S01-FILL-{1..5}.immediate-draft.json` include observed real editor autosave; subsequent `final_post_run_readback` is honestly labeled, not alleged step-local readback.
3. **Human Entity Review positive/negative/uncertain:** saved chapter-1 S02 checkpoint reports **167 candidates**: 5 entity, 148 not_entity, 14 unresolved. `browser_human_entity_review.py` invokes browser controls for bulk, keep, reject, unresolved resolution, `CV-04 ORG → ITEM` correction, save/continue. `HITL-01`, `HITL-02` and `HITL-03` readbacks show initial `waiting_entity_review`, frozen `entities_reviewed` and then event/fact route dispatch. 2 source-supported alias decisions `Mai Linh`/`Linh` reported; review decisions are distinct from machine decisions.
4. **Proposal/official canon boundary maintained:** `HITL-03` shows 3 **pending** proposals (2 entities and one alias) tied to exact revision/hash/quotes, while official memory remained unchanged. This is **correct proposal-first behavior** but **does not prove canon approval/materialization/activation or a useful Story Brain**.
5. **Provider/evidence honesty:** `FUNCTIONAL_EVIDENCE_AUDIT_FINAL.json` reports 57 matched fake-upstream receipts vs ledger ticket IDs, zero unmetered dispatches, worker denied direct provider egress, 314 frozen/historical files preserved, no real-provider calls. These are **saved executor findings**, independently source/evidence-consistent, not re-executed by reviewer. Historic 8-call live ledger expiration persists.
6. **Tests:** executor's `offline-logs/tools-http-final.txt` reports **101 passed, 4 skipped**; `ai-regression.txt` **407 passed, 2 skipped, 42 deselected**; `backend-regression.txt` **62 passed**. Four opt-in Wave 1D container tests remain skipped in the standard tooling suite; executor ran separate owned Wave 1E Docker/Playwright integration/audit.

### Scope gaps that MUST remain visible

- **S03 is still only partial**: first-chapter entity checkpoint passed but rest of manuscript chapter analysis, canon proposal accept/edit/reject, baseline activation and **P1-M0** measured against C01–C15/35 narrative assertions are NOT_RUN.
- **Scripted semantic outputs cannot prove model quality:** fake provider deliberately returned 5/148/14 and **empty event/fact bodies**. Correct routing and checkpoint order do not demonstrate event/fact coverage, recall, precision, retrieval or continuity. It does not show correct real Gemini negative-verdict handling after Wave 1B prompt fix.
- **S04–S11 are NOT_RUN** as whole author journeys: tabs/reload, suggestions and planning, normal editor save→outbox incremental extraction, repeated saves/stale revision, contradictions/consistency, updated Story Brain/context and M-FIRST.
- **Free Tier / real-provider readiness separate:** owner deferred mathematical paid-tier USD hard-cap work, **not** worker isolation, quota-limit handling, secrets or authorization. The specific Google AI Studio project tier is UNVERIFIED and previous 2h approval expired; do not call live model under this review.
- **Replay recovery remains intentionally fail-closed:** duplicate CLI and ambiguous/partial state are blocked; automatic resume-in-place for partial UI import is NOT_IMPLEMENTED. This is an honest limitation, not evidence of unsafe duplicate writes.
- **Historical attempts:** attempt02 falsely returned a green string due to `failure=''` plus receipt leakage; executor retained it and added fail-closed regression/current-attempt receipt scoping. Do not present attempt02 as successful; only attempt05 is final bounded PASS.

## Next accepted work

Proceed to **Wave 1F** offline, **not another broad budget/adapter rewrite**:
- Exercise **full S03** on a new owned fake-upstream stack with real browser interaction, author review for remaining chapters, **source-grounded nonempty event/fact proposals**, actual canon approval and baseline activation; freeze M0 gold BEFORE viewing fake outputs; report raw-vs-reviewed-vs-official-vs-context evidence separately.
- Confirm **S04 reload and visible vs official-memory equivalence**, then advance towards S05–S11 by priority using supported UI actions. Declare missing UI as `BLOCKED_UI_MISSING` with trace rather than author-write API rescue. A bounded S07–S08 incremental saved revision path with M-FIRST is especially valuable.
- Use exact phase-scoped run IDs, action timestamp + source hashes, read-only API readback, tenant/revision version guards and no provider spend. Existing 35 narrative assertion gold is a task corpus, **not an entity recall label set**.
- Report a per-step S01–S11 table `PASS/FAIL/BLOCKED/NOT_RUN` with channels (OFFLINE_BROWSER_UI, FAKE_PROVIDER, SOURCE_ONLY) and preserve failed runs; don't claim P1 FULL PASS from this wave.

**Final review verdict:** `WAVE_1E_OFFLINE_FUNCTIONAL_ACCEPTED_WITH_EXPLICIT_SCOPE`; **P1 live PENDING**; pricing hard-cap for paid tier **DEFERRED_PER_OWNER**, operational quota and safeguards retained. No external provider calls or new live approval in this review.
