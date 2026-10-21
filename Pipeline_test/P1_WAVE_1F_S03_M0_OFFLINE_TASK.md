# ACTIVE CODEX TASK — P1 Wave 1F: S03 Canon Activation / M0 and Functional Continuity (OFFLINE)

**Assigned:** 2026-10-21 (Asia/Bangkok). **Branch ONLY:** `codex/ai-copilot-pipeline-test`. **Reviewed documentation HEAD:** `0daf0483aa45a8d9064159e43f977583414c069d`. **Last source execution SHA:** `b5fa332e85dc328100fba93c5b696fac2e80dbee`; latest evidence/report SHA `4b607b5eb4246a51feadc016cc954efdfd02540d`.
**Executor:** Codex (or actual execution agent; identify truthfully). **Do not change provider billing code for its own sake.**

**Read FIRST:** `Pipeline_test/reviews/2026-10-21-p1-wave-1e/GPT6_INDEPENDENT_REVIEW.md` and `Pipeline_test/reviews/2026-10-21-p1-wave-1e/EXECUTOR_WAVE_1E_REPORT.md`; then `WORKFLOW_CONTRACT.md` v1.4, `SHORT_LOOP_TEST.md`, `NARRATIVE_MEMORY_AUDIT.md`, `AGENT_GUIDE.md`, `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`, `FREE_TIER_BUDGET_PRIORITY_DECISION_2026-10-21.md` and `CURRENT_API_IMPLEMENTATION_MATRIX.md` (in `../ai-service/docs/`).

**Target:** Fill the gap between `entities_reviewed` plus pending proposals (already demonstrated in Wave 1E) and an **actual official Story Brain that can pass M0**, then verify S04 reload and (if possible) S07/S08 incremental M-FIRST. No fake model-quality claim. **Wave 1F is not P1 live provider acceptance.**

## 0. Boundaries and authorization

1. Check `git status --porcelain`, branch, HEAD and untracked files before any edit; safely fast-forward only if it will not overwrite work. Commit/push only to `codex/ai-copilot-pipeline-test`. Do not merge, open PR, edit `main`, FE branches or unrelated product code.
2. **OFFLINE ONLY, 0 external AI provider calls.** Previous two-hour live authorization expired; no new approval has been given. The owner deferred **paid-tier USD hard cap engineering** for intended Free Tier use, **not** rate/quota, retry, provider-key isolation, budget ledger integrity or the permission gate for real API calls. Do not enable `offline_only=False` or connect any true API key.
3. Create a **NEW** named Compose project, database/volumes, novel, user, fake upstream ledger and `Pipeline_test/runs/<fresh-wave1f-run-id>/`. Do NOT resume/rewrite Wave 1E attempt-05, any historical real-run evidence or old Docker volumes. Do not delete/clean all Docker resources, drop shared DB or alter frozen gold/fixtures; record input hashes before/after. Local credentials stay outside Git. Real author writes **through Playwright UI only**; read-only API/SQL may verify state.
4. Existing historical Wave 1E S01 five chapters and chapter-1 HITL results already accepted within scope: **reuse scripts/patterns but not state**, and do not turn a narrower S03 result into full P1 PASS.
5. If a prerequisite UI action is unavailable, report exact `BLOCKED_UI_MISSING` with browser trace/selector/route; do not save author decisions/canon by direct test API then call it UI success. API-only diagnostic must have separate verdict `LIVE_API`/ `OFFLINE_API_DIAGNOSTIC`.

## 1. P0 — Full S03 human-review → canon → baseline on five-chapter import

**Previous evidence:** first chapter `waiting_entity_review → entities_reviewed → events/facts`, three *pending* entity/alias proposals, official memory unchanged; fake events/facts had empty payload. **None of that demonstrates S03 canon/memory or P1-M0.**

- Start from new 5-chapter canonical manuscript imported via real editor browser, using `markdown-h1-title-body-nfc-lf-v1`. Enforce exact title/body/revision SHA and owner for each source; check the source hash conversion in new manifest.
- Process the *actual five-chapter bootstrap job* in order: for each chapter with flag `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`, ensure it **stops** at `waiting_entity_review`; author can review keep/reject/correct/unresolved/hints where needed; save `entities_reviewed` then continue. Do not count skipped/unprocessed chapters as M0 coverage. Track analysis run ID, source revision/hash, candidate counts, author decisions and outbox/job transitions for each chapter. Rerun entity only if guidance/source truly changed; verify safe resume and no duplicate decisions/proposals.
- Implement a **small, transparent source-grounded fake provider script** returning **nonempty, valid event/fact/state proposals** with exact quotes/offsets/revision ID for a handful of *preselected* assertions in the frozen source, including one deliberate false/uncertain proposal to test author rejection. Keep this synthetic expected subset **separate** from the full C01–C15/35 narrative gold. Avoid injecting narrative “answers” as canonical facts into product storage or marking a scripted value as LLM recall.
- Use actual author UI to inspect proposals, **accept/edit/reject** the relevant canon proposals and activate P1 baseline, observing version/source guards, atomic proposal groups and no partial materialization. Before canon review, official memory must not change; after approved materialization, approved entities/event/facts and projections must appear with correct source revisions and without rejected/unsupported assertions. Planned/future objectives may not become occurred events.
- If full five-chapter review is blocked by UI/product issue, stop with precise S03 blocker and separate lower-bound functional evidence. Do **not** invent a successful baseline or switch to API mutation.
- Inspect bootstrap completion and `brain_version`/baseline activation as a **versioned readback**, not proof of semantic completeness or a substitute for source-grounded memory audit.

## 2. P0 — P1-M0 evidence and gold separation

Follow `NARRATIVE_MEMORY_AUDIT.md` exactly:

- Freeze the original 5-chapter source manifest, chapter cutoff and **expected atomic claims from C01–C15 / 35 narrative assertions** **before observing new model/fake results**. Each claim has a source excerpt, chapter/revision, temporal tag, entity identity, certainty and criticality. 35 narrative assertions are **NOT 35 entity identities/aliases**. Never modify existing gold to match output. If pre-registration for the *new run* cannot be proven, mark the results `POST_HOC_DIAGNOSTIC`, not pre-registered accuracy.
- Capture four distinct layers: (a) raw fake model output, (b) human-reviewed entity inventory, (c) author-approved canonical proposals + official materialized memory/projections, (d) actual `context_preview` and where supported **actual packed generation context** at correct revision cutoff. State which evidence is unavailable.
- Perform ≥5 supported memory probes in read-only mode, cite expected and observed source, offset and status; sample both seeded fact, present state, uncertain attribution, relationship/ownership and forbidden future-plan leakage.
- Report numerator/denominator for sample recall, precision, critical recall, source/provenance accuracy and context coverage. Do not call scripted fake output quality of Gemini or claim 90%/95% memory metrics pass for full manuscript merely because a tiny scripted subset passed. `SEMANTIC_QUALITY_NOT_TESTED` stays honest until real provider eval.
- Record timeline M0 **before** and **after** human approval, `no canon before accept`, immutable revision and source guard behavior, pending review queue, and correct materialization only after genuine UI action.

## 3. P1 — S04, then S07/S08 M-FIRST if UI supports

**S04:** reload Author IDE and Story Brain tabs, read back official entities, aliases, events/facts/state, compare UI items to approved canonical memory and active context. Verify rejected proposals are absent and hint-only candidates are not canon. Attach screenshot/DOM and read-only API comparison for each relevant tab.

**S07/S08 (high-value second slice):** create an additional short **source-grounded draft** through the regular editor UI on the new isolated novel; saved revision must automatically produce durable outbox/analysis with no manual snapshot/post workaround. Wait for human entity checkpoint (flag ON), review via UI, continue event/fact, accept canon, then audit M-FIRST after actual accepted source revision. Verify latest revision/hash, no stale results, actual context recency and zero planned-future facts materialized prematurely. Use only fake provider, mark extraction quality synthetic. If any normal-save trigger or review UI step is absent, report BLOCKED and preserve trace.

**S05–S06/S09–S11:** perform only if already accessible after above and safely bounded. Otherwise explicit `NOT_RUN`; avoid expanding this task into broad FE development.

## 4. Regression, evidence and troubleshooting

- Run existing targeted `Pipeline_test/tests` including the 101-pass baseline and scoped ai-service/backend suites; opt-in container skips must be reported. Add RED→GREEN tests for actual problems, including duplicate review/save, stale/foreign source revision, empty event/fact payload, invented identity, misleading M0 score and context leakage.
- Record exact source SHA, commands, exit statuses, used model (FAKE_UPSTREAM only), environment config **without secrets**, project/run IDs, used fixtures/source-body hashes, browser action timestamp and screenshot/trace; read-only server revision and approved memory snapshots, pending/accepted/rejected proposals, DB/schema migrations, network/ledger receipts, and negative 0 real external provider calls.
- Add new run-local `actions.jsonl`, `issues.csv`, `memory_items.csv`, `memory_checkpoints.csv`, `memory_probes.csv`, `revision_manifest.csv` plus `REPORT.md` in a new folder. Use `Pipeline_test/templates/MEMORY_AUDIT.md` as the audit layout. Keep old failed/review artifacts intact.
- Do not embed API keys/auth tokens in browser ZIP/DOM/git. Trace evidence checks are not cryptographic proof; scope claims to actual execution and readback. The `browser_human_entity_review.py` logic is a template, not proof the next UI steps exist.

## 5. Final deliverables and stop rule

Create `Pipeline_test/reviews/2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md`, with an exact table:

| Step | Browser action | Provider | Expected | Observed | Evidence path | Verdict |
|---|---|---|---|---|---|---|
| S01–S11 | | FAKE_UPSTREAM | | | | PASS / PARTIAL / BLOCKED / NOT_RUN |
| M0 / M-FIRST | | FAKE_UPSTREAM | | | | SPECIFIC_METRIC / NOT_ASSESSED |

Also record:
- Each chapter's review checkpoint/approval/analysis job and owner source hash.
- Materialized vs pending vs rejected canon, actual retrieval/context evidence and source provenance.
- Full test commands/results, new provider attempt count = **0**, fake ledger reconciliation, exact code SHA and changed paths.
- Defects classified **product bug** vs **test-harness bug** vs **missing UI**; minimal patch or blocker; nothing changed on main or previous resources.

**Verdict:** `P1_WAVE_1F_OFFLINE_READY_FOR_GPT6_REVIEW` only if claims are supported by actual browser/readback. Otherwise `P1_WAVE_1F_BLOCKED:<first_blocker>`. **Do not mark P1 full S01–S11 PASS**, even when mock S03 succeeds. Stop after commit/push on the allowed branch and return SHA/evidence to independent reviewer. No P2/P3/100k and no real API calls.

**Later live cutover (SEPARATE explicit owner approval):** verify the exact Google AI Studio key's project really uses Free Tier for chosen model and calls, use newly bounded attempts/TTL, stop on RPM/TPM/RPD/429, do not silently switch to paid tier or fallbacks; never reuse expired old authorization.
