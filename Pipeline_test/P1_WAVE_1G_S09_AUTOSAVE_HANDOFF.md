# ACTIVE CODEX TASK — Wave 1G: S09 autosave regression / FE patch coordination, then S10–S11 (OFFLINE)

**Date:** 2026-10-22 Asia/Bangkok. **Branch restriction:** `codex/ai-copilot-pipeline-test` only.  
**Baseline:** `8db9839b4f92ef219f324d93068b816df056e9ee` (Wave 1F evidence; refresh HEAD before starting).  
**Owner/source of FE fix:** [GitHub issue #56](https://github.com/Ephurin/Novel_sharing_platform/issues/56), discussed on [PR #55](https://github.com/Ephurin/Novel_sharing_platform/pull/55) (`feat/author-workflow-hardening` → `feat/author-workspace`).  
**Evidence:** `Pipeline_test/reviews/2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md`, `S09_DEFECT_PROOF.json`, `S09_PATCH_PROPOSAL.md`, `validation.json`, and the original immutable Wave 1F S09 readback.  
**Behavioral authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4, `SHORT_LOOP_TEST.md`, `NARRATIVE_MEMORY_AUDIT.md`.  
**Mission:** Produce an isolated reproducible RED regression for S09; coordinate, examine and safely integrate a **reviewed** FE fix; rerun S09 and then S10/S11 only if the prior gate passes. No need to rebuild the pipeline or spend Google quota.

## 0 — Branch, ownership and containment

- Check actual Git branch, HEAD, status and tracked/untracked files; fast-forward safely only if clean. Do **not** reset, stash, clean, rebase, force-push, delete data, touch `main`, commit into FE branches or auto-merge PR #55/#54. Only source/harness/test/evidence for the isolated pipeline branch after permitted patch.
- **Do not directly rewrite production FE autosave while the FE owner is working on PR #55.** PR #55 rewrote the editor's persistence contract via `web/src/features/author-ide/useDraftPersistence.ts`, replacing inline `triggerAutosave()`. The failing test branch still uses the older code. Determine which implementation will actually land. Do not cherry-pick obsolete function changes onto a hook without investigation. FE-owner patch + tests or explicit owner instruction precedes transplant/integration; if absent, report `BLOCKED_AWAITING_FE_PATCH`.
- Use **new test-owned** Compose project/volumes/author/novel/run IDs and a fake upstream; no reusing Wave 1F failed chapter/revision or prior data. All author mutations through real Playwright, verification read-only; do not repair data via direct DB, admin or author-write API.
- **OFFLINE ONLY / ZERO new Google Gemini/OpenAI/embedding provider calls**. Free Tier budget hard-cap math is deferred; maintain provider egress isolation, account/project verification gate for future real calls, retry/attempt limits and expired approval status. No P2/P3/100k or publish.
- Preserve all failed S09 traces, Wave 1F audit, 1,679 protected evidence/fixture files and former live ledger. If local environment is dirty or resources cannot be isolated, stop with a precise blocker.

## 1 — P0: S09 independent RED reproduction and regression specification

Real Wave 1F RED evidence: `WF1F-S09-001`. Current test branch `AuthorWritingIde.tsx:452–477`: checks `!hasChanged` before cancelling 1200ms timeout. Sequence saved B → temporary A → Undo to B after 0.263885s: editor B but server draft and immutable revision A.

Test both **old test-branch implementation** and the **current FE PR #55 hook** conceptually, without equating their implementations. PR #55 `useDraftPersistence::queue()` clears pending on revert, but prior timeout may still exist; checking code alone is not an E2E PASS. It additionally implements `expectedVersion`, recovery and queued `running` operations. Tests must assert actual network requests, final canonical readback and revision/outbox effects, not just UI text.

Required scenarios:
1. **B → A → B before debounce:** no network PATCH for A if never dispatched; final stored body B, no stale-A immutable revision or outbox; UI indicates saved accurately. Cover title/body/access/price independently where viable.
2. **A → C before debounce:** only C persists, revision/hash/readback C.
3. **A dispatched/in-flight → B:** final stored state must converge to B in correct order and remain B after all requests settle; no false 'saved' or irreversible stale materialization. Test explicit in-flight response reorder/409 and window after server acknowledgment. An intermediate stale A revision (if actually dispatched) is a separate risk: backend must reject stale canon and author UI indicate pending until B wins; don't claim zero intermediate revisions for already-dispatched A.
4. **Rapid chapter switch / account change / tab reload / navigation:** no X→Y source mixing, accurate local recovery, no silent writes to the previous chapter after user leaves unless explicitly bounded to that exact chapter and reconciled.
5. **Version conflict / concurrent tabs:** expectedVersion returns 409, no silent overwrite; pending buffer retains author text and UI surfaces recoverable conflict.
6. **Double quick save/idempotent replay:** no duplicate canonical writes when unchanged, retry cannot reapply old source after a newer save, and active outbox does not advance wrong revision.

Choose focused deterministic hook/unit tests **plus fresh real Playwright acceptance**. Record active FE branch commit hash/tested code SHA, exact merge/patch provenance, browser action IDs/timestamps, POST/PATCH receipt sequence, editor/draft/canonical revision hashes, outbox and failure traces. Do not remove historical RED evidence.

## 2 — Review FE source provenance and safe integration

- Compare `feat/author-workflow-hardening` current `useDraftPersistence.ts` and `AuthorWritingIde.tsx` against the test branch, and inspect PR #55 / issue #56. FE owner may deliver a fix + tests. Pull only **the smallest reviewed compatible patch** after explicit confirmation/authorization for product FE changes on the pipeline branch; never merge PR #55 wholesale as a workaround. If FE feature's new backend `expectedVersion` contract/migrations are required, report compatibility and migration blockers rather than transplant incomplete code.
- If no FE patch exists, **stop after reproduction and diagnosis**, commit only regression/evidence + a clear handoff and `P1_WAVE_1G_BLOCKED_AWAITING_FE_PATCH`. Don't run S10/S11 to pad progress.
- If FE patch exists and is safely integrated into branch with a preserved provenance history, run web typecheck/build and targeted backend tests in addition to browser tests, and scan for secret leaks.

## 3 — S09 GREEN then S10/S11 and final P1 offline check

**Only when S09 passes** in a fresh owned run:
- S10: add a planned contradiction through the UI, invoke product consistency checking, verify the source-grounded finding/fresh revision and correct via UI, without fake-provider semantics being misreported as real Gemini accuracy.
- S11: reload author tabs/Story Brain and continue writing; canonical version, official memory/context and draft must remain coherent; no accidental publication.
- Revisit outstanding contract gaps: S03 Continue replay idempotency through **actual UI** remained NOT_RUN, packed *actual generation prompt context* and semantic RAG still NOT_ASSESSED; if time-bound scope permits, run narrowly as distinct tests. Never mark them PASS merely from Wave 1F's 111 offline tool tests.
- Keep C01–C15/35 narrative assertions separate from entity occurrence gold; M0/M-FIRST are **functional/provenance** in fake runs, not real model-quality scores.

## 4 — Evidence & stop rule

Use a new folder `Pipeline_test/reviews/2026-10-22-p1-wave-1g/` with `EXECUTOR_WAVE_1G_REPORT.md`, reproduction logs, tests, read-only server hashes, browser trace/screenshot/DOM and a new owned run folder under `Pipeline_test/runs/`. Preserve 2026-10-21 failures/ledger intact. Per-step verdict table S01–S11 must retain separation of `OFFLINE_REAL_PLAYWRIGHT_FAKE_PROVIDER`, `LIVE_PROVIDER_UI`, and `NOT_RUN`.

Verdict:
- `P1_WAVE_1G_BLOCKED_AWAITING_FE_PATCH` if no reviewed compatible FE fix, with completed RED test/evidence and issue link;
- `P1_WAVE_1G_BLOCKED:<specific>` for any regression/compatibility failure;
- `P1_WAVE_1G_OFFLINE_READY_FOR_GPT6_REVIEW` only when S09 GREEN and due S10/S11 executed/reported faithfully.
- **NEVER `P1_PASS` from fake model outputs** or from a mere FE PR code inspection. Provider-backed evaluation requires new explicit approval, verified project Free Tier and quota control.

Return commits, affected paths, tested SHA, exact executed tests, negative/positive results, ownership evidence and 0 new real provider calls. No PR merge/force push; stop for independent review.
