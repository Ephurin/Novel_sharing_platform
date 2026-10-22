# ACTIVE DELIVERY TASK — Finish P1, P2 and P3 as usable author journeys

**Decision date:** 2026-10-22 (Asia/Bangkok)
**Execution branch:** `codex/ai-copilot-pipeline-test` only
**Primary executor:** Codex, end-to-end owner of the three authoring use cases (AI service, backend, minimal necessary frontend, E2E harness and evidence)
**Independent reviewer:** GPT-6 (remote source/evidence, contract and acceptance review)
**FE team:** Optional contributor/review input, **not a dependency or stop condition**
**Authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4; `SHORT_LOOP_TEST.md`; `NARRATIVE_MEMORY_AUDIT.md`

## Outcome first — priorities

**P0: P1 — Continue from an existing manuscript.**
Five-chapter import to durable canonical revisions and entity review, event/fact proposals, official canon, M0 activation, ordinary writing and saving, versioned subsequent extraction, author approval and M-FIRST continuity. Complete the *real UI* S01–S11 short loop as far as allowed by offline fake-provider mode. Inspect the already known S09 stale-save bug and solve it **on this pipeline branch** instead of waiting for FE Issue #56. Validate rapidly reverted edits, in-flight saves, versions/conflicts, account/chapter transitions, immutable revisions and outbox provenance. Coordinate code/API contract: PR #55 hook requires expectedVersion, 409 behavior and migrations; **never blindly transplant or merge the full PR**. Own and implement a minimal compatible full-stack patch if needed, with genuine browser, backend and regression evidence. Do not bypass author actions using writable API/SQL to fabricate a UI PASS.

**P1: P2 — Start from an idea/setup.**
Separate explicit setup extraction (identities actually present) from optional creative blueprint/model_proposed content. Approve setup entities into durable baseline, audit M0, create/review a future Story Plan without treating it as occurred history, generate/accept or author-save the first chapter, pass the entity/revision/canon gates, audit M-FIRST, and demonstrate the same continuing P1 loop. Test UI and persistent readback. Do not substitute manuscript import for this entry path.

**P2: P3 — Controlled multi-chapter writing.**
From approved P1/P2 baseline, handle both active-plan and no-plan starts; choose objectives, pack official context, generate/validate, accept **draft only**, analyze immutable revisions, stop for mandatory human entity review when flag ON, resume idempotently, advance only after necessary canon/materialization gates, and terminate on explicit story-completion criteria. No automatic publication. First prove bounded multi-objective functional behavior (including crashes/conflicts/retry). Then prepare the **mandatory** `P3_HITL_CONTROLLER_100K` terminal acceptance: a separate actual canonical manuscript of 100,000–105,000 NFC/whitespace-counted words with complete ending, payoff, provenance and review. Do not claim P3 terminal PASS from a probe, draft word count, or 95k historical criterion.

**Product milestone:** P1 short usable journey → P2 idea-to-first-chapter journey → P3 functional controller → P3 100k terminal run. Do not divert into broad architecture redesign, speculative RAG optimization, Wallet/VIP/Reader work, benchmark expansion or documentation-only waves unless a concrete blocker directly impacts these gates. A blocking step in one use case must be recorded, while independent implementation for the next may proceed; never promote a blocked step to PASS.

## Role and ownership update

- **Codex:** Integrator and implementer across FE + backend + AI + tests **on the pipeline branch**. May fix S09 itself, including production-path frontend code staged on this branch, and may create minimal UI affordances required by P1/P2/P3. Preserve interface design and compatibility; avoid unrelated redesign. PR #55/Issue #56 are reference material and cross-checks, not permission to merge those branches or block execution.
- **GPT-6:** Independent gatekeeper: inspect exact source SHA, real evidence, regressions, source→canon→prompt provenance; mark PASS/BLOCKED narrowly; issue next tasks. Does not declare local tests performed merely from a report.
- **Gemini/other agents:** Optional delegated implementation/tests on separately scoped files, only with clear ownership and a non-conflicting branch/worktree. Historical Wallet/VIP assignment is lower priority for this product objective.
- **FE developer:** May deliver a compatible patch separately. Codex need not wait; check new FE changes before integration to avoid duplicating or conflicting work. Never push to the FE team's branch or merge without review.

## Mandatory technical acceptance and remediation

1. **Reconcile the branch against current main/source** and read the behavioral contract before edits. Historical main `P1_OVERALL_SYSTEM_PASS` reflects a prior release/contract; it does not override the new P1 S09 RED or v1.4 entity-review acceptance. Inventory true gaps vs already implemented features.
2. **Close Wave 1H provenance gaps as part of P1**, not as endless stand-alone prompt testing: a source-grounded five-chapter immutable revision manifest (IDs/hashes), supported author entity/canon approval and PostgreSQL durable readback; approved memory IDs/version → packed context → actual fake upstream outbound HTTP fragment. Test wrong tenant for the SAME novel ID, genuinely seeded future entity, attached future Story Plan and explicit routing overflow/retriever status. Synthetic in-memory 17/17 tests remain valid diagnostics, not proof of durable acceptance.
3. **Complete S01–S11 via UI** with a fresh isolated test-owned stack and fake provider. Read-only DB/API can verify; all author writes through browser. S09 must reach GREEN (including source/outbox correctness) before claiming S10/S11 sequence PASS. Do not treat the historical Wave 1F RED or Wave 1G run as new green evidence.
4. **P2 E2E** with distinct project/run and setup input. Verify proposal/raw/author decisions, official canon and first accepted chapter, then normal continuation; event plans remain future until actual source proves occurred.
5. **P3 functional** with both plan/no-plan, entity-review pause/resume, failure injection, resume deduplication, objective and termination guards, M0/M-FIRST. Label human involvement `P3_HITL_CONTROLLER`, never `UNATTENDED`.
6. **Long P3 acceptance** is a separate final gate, only after the preceding gates and appropriate real-provider approval/capacity. Preserve required audits at chapters 10/20/50 and final, real canonical word count and literary review; report any unavailable live quota/approval rather than producing fake PASS.

## Execution safety — unchanged

- **Zero real external Gemini/OpenAI/embedding calls now.** Previous 200 calls / USD 5 / two-hour approval has expired; Free Tier or deferred USD hard-cap implementation does not renew authorization. Fake provider and isolated gateway only until new explicit live permission and verified quota/egress boundaries. No paid charges.
- Use new **test-owned** DB, Mongo/PG volumes, authors/novels, Compose project, browser session and run IDs; do not touch historical projects/ledgers/gold/snapshots or production data. No wide cleanup, migrations on unowned DB, secrets in evidence or force push.
- Work only on `codex/ai-copilot-pipeline-test`; no direct main/FE branch writes, PR merge or publish. Commit code first, test the exact SHA, then append evidence commit. Reject incompatible FE API changes and ensure typecheck, backend tests, migrations on new DB and real browser routes.
- Distinguish `SOURCE_CODE`, `OFFLINE_REAL_BROWSER_FAKE_PROVIDER`, `OFFLINE_API_DIAGNOSTIC`, `LIVE_PROVIDER_UI`, `LITERARY_QUALITY`, `NOT_RUN`. Offline success is not live provider acceptance.
- Avoid hardcoding pass flags, narrative gold, model answers or artificial fixtures in production. Failure cases must fail visibly, with source/provenance.

## Immediate assignment — first slice

1. Fresh HEAD + `main` comparison, status of PR #55 and Issue #56, and current P1 short-loop S01–S11 matrix. Cite source/evidence, not old report conclusions.
2. Pick the **smallest critical path** to P1 UI usability: S09 autosave compatibly fixed on test branch; official canon durable provenance and S03 Continue/normal S07/S08 lifecycle verified. If FE patch is absent, implement test-branch fix yourself.
3. Run focused source+backend+web tests and a fresh isolated Playwright B→A→B RED→GREEN, then full bounded P1 offline S01–S11 if gates clear.
4. Deliver P1 blocker-to-fix/evidence matrix and the next exact P2/P3 steps, rather than another broad architecture memorandum.

## Deliverables / stop

- Keep a current `P123_ACCEPTANCE_MATRIX.md` under `Pipeline_test/reviews/2026-10-22-p123-delivery/` with each use case, ordered steps, expected/actual results, channel, tested SHA, run ID, evidence and status.
- Save sanitized browser trace/screenshot/readback/revision/outbox/ledger results and deterministic test logs with exact commands/exits. Preserve old RED evidence and Wave 1H independent review.
- On completion of **each** bounded slice, push code and evidence to the pipeline branch for GPT-6 independent review. Continue permitted independent work; do not stop only because FE developer hasn't replied.
- Stop only for a genuine technical/safety blocker, missing permission for live calls, or a completed handoff. Clearly distinguish `P1_OFFLINE_FUNCTIONAL`, `P2_OFFLINE_FUNCTIONAL`, `P3_OFFLINE_FUNCTIONAL`, `P3_100K_NOT_RUN` from fully accepted provider-backed results.
