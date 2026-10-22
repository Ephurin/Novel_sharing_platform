# ACTIVE CODEX TASK — P1/P2/P3 headless core delivery (FE integration on hold)

**Date:** 2026-10-22 (Asia/Bangkok)
**Branch:** `codex/ai-copilot-pipeline-test` only.
**Owner decision:** `HOLD_FE_INTEGRATION_ONLY`. Codex may advance core P1 → P2 → P3 immediately, without waiting for FE PR #52/#54/#55 review. **No production frontend modifications or FE merges**.
**Authority:** `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4; `SHORT_LOOP_TEST.md`; `NARRATIVE_MEMORY_AUDIT.md`; current `promt.md` §0.

## Outcome and acceptance labels

Goal: make the real production backend + AI-service + persistent Story Brain workflows function end-to-end through supported HTTP APIs and database readbacks, in an isolated offline environment. Build a **headless E2E runner**, not a parallel fake business implementation or new Story Brain.

- `P1_CORE_OFFLINE_PASS` — supported API flows and durable state verified; **not** `P1_UI_PASS` or provider-backed P1 acceptance.
- `P2_CORE_OFFLINE_PASS` — idea/setup entry and first-chapter cycle proven, distinct from manuscript import; **not** UI acceptance.
- `P3_CORE_OFFLINE_PASS` — bounded controller/resume/HITL behavior proven, not literary quality, unattended autonomy or 100k completion.
- `P1_UI_BLOCKED_FE`, `P2_UI_BLOCKED_FE`, `P3_UI_BLOCKED_FE` — explicit separate downstream integration gates.
- `REAL_PROVIDER_NOT_TESTED`, `SEMANTIC_RAG_NOT_ASSESSED`, `P3_100K_NOT_RUN` until they are separately authorized and actually tested.

**Do not relax v1.4:** Final P3 target is a complete 100,000–105,000-word canonical novel, properly reviewed. Core headless progress does not waive this terminal gate.

## Ownership and boundaries

Codex owns backend, ai-service, schema/API contracts, DB migrations (test-owned DB only), headless runner, deterministic tests, supported API workflow execution, and evidence. Codex **does not** own FE React work, the Author IDE autosave hook, visual UX, or PR #52/#54/#55 integration; FE developer retains those. GPT-6 independently reviews each evidence handoff.

No cherry-pick/merge of FE PRs, no code edits under `web/`, no edits to FE-owned feature branches, no changes to `main`, no publication. Do not bypass backend APIs with direct database inserts for author/canon actions. DB read-only queries for verification are allowed; documented test-owned infrastructure fixture setup is allowed if distinct from author business actions. Keep API compatibility inventory including `expectedVersion`, `draftVersion`, 409, UI review status and request/response schemas **without** implementing a competing FE-specific protocol speculatively.

**Zero actual provider egress**: fake HTTP upstream only, empty real keys, verified gateway containment, no Gemini/OpenAI/embedding API calls. Previous provider budget window expired; API Free Tier availability is not authorization. No paid spending. Do not alter historical Wave 1F/1G/1H evidence, gold, run DB/volumes or existing user data; create unique test-owned PostgreSQL/Mongo volumes, author, tenant, novel, run, browserless agent identity and fake ledger. Fail closed if isolation cannot be proven.

## P0 — Verify P1 CORE, then repair targeted core gaps

1. Inspect latest HEAD, branch status, diff from `main`, relevant source and Wave 1F/1G/1H findings. Build an evidence-based `P123_CORE_MATRIX.md` enumerating real API endpoints vs contract stages and missing coverage, before changing implementation.
2. Run fresh 5-chapter **source-grounded** manuscript bootstrap through supported author-facing backend/AI endpoints (not direct `repo._brains` writes). Freeze immutable chapter/revision IDs + source hashes and use a new test-owned project. Human entity decisions may be scripted **through the same supported API contracts** as the UI, with explicit `SIMULATED_HUMAN_VIA_API` provenance; raw machine proposals, author decisions, official canon approval and M0 all separately captured.
3. Continue entity-before-event/fact workflow and materialize approved canon. Verify durable PostgreSQL readback after service/process restart; correct tenant/novel ownership, canonical version and immutable revision linkage. Do not label a synthetic in-memory object as persisted official canon.
4. Perform generation via real WritingService→LLMService→gateway→fake upstream on the approved Story Brain; capture exact sanitized outgoing request, persisted context hash, included/omitted memory IDs, cutoff, plan state and effective routing. Address Wave 1H review gaps: same-novel ID under wrong tenant/auth context must fail; future entity actually seeded and excluded by chapter cutoff; future Story Plan actually attached and excluded from past events; retrieval status and overflow tested. Report if the contract/runtime prevents constructing any case without unsafe shortcuts.
5. Accept or save continuation by real supported core endpoints, verify ordinary draft/revision→outbox→incremental analysis→entity checkpoint→event/fact review→official memory update, plus idempotency/retry and after-restart readback. Test backend version/409 conflict, stale revision, two concurrent writers, replay and no duplicate materialization where supported. **Do not claim the browser S09 B→A→B autosave defect is fixed** or substitute direct API save for UI S07–S09 PASS.
6. Run targeted backend and ai-service unit/integration suites, migrations on a fresh DB, and fail-injection tests; document exact tested source SHA, commands, exit codes and skips. If you reproduce a core defect, implement the smallest compatible backend/ai-service fix and rerun.

## P1 — Verify P2 CORE (separate project)

1. Start from an idea/setup input, not an existing manuscript. Exercise explicit-entity extraction and author review; distinguish `mode=extract` from creative `mode=blueprint`, do not silently promote model-proposed lore.
2. Create and read back approved baseline, M0, a versioned future Story Plan, then produce/accept the first chapter through supported core APIs; verify entity checkpoint, approved event/fact memory, M-FIRST.
3. Show that the resulting novel enters the same underlying P1 writing loop; prove `FUTURE PLAN != HISTORICAL CANON`. Capture persisted plan/brain/revision IDs and negative tests.
4. Mark FE-specific setup/plan/editor affordances untested even if HTTP APIs work.

## P2 — Verify P3 functional CORE (separate project)

1. Use real controller service/API: baseline approved, start with existing plan; separately start without plan and verify whether automatic plan creation actually succeeds across backend ↔ ai-service (do not infer from one layer alone).
2. Exercise bounded multi-objective generate→validate→accept **draft**→analysis and versioned canon, with entity verification enabled. Must halt at human entity-review checkpoint and resume only after supported API-mediated human decision/continue; do not silently auto-approve or label `UNATTENDED`.
3. Inject retries/failures including stale brain/plan version, interrupted job, duplicate resume, memory materialization failure; prove fail-closed and no objective advance / no duplicate revisions until conditions are satisfied. Confirm no publish action occurs.
4. Verify explicit terminal condition for a bounded run, distinguish functional proof from completed-novel quality. Plan the later 100k run but **do not start live generation** without explicit authorization and earlier readiness gates.

## Headless E2E harness design

- Use production endpoints and schemas via the existing gateway/auth path where possible; authenticate test-owned accounts. No mocks at application/repository business layer in the E2E run; mocking only **external provider** is permitted. Distinguish unit-level fake repository tests separately.
- Script human entity/canon decisions through supported API with accurate audit records. This proves API workflow, **not** human UI usability.
- Maintain deterministic source fixture hashes, fresh isolation and read-only DB assertions. No GOLD prompts sent into fake provider; do not pre-bake desired answers into model calls or hardcode verdicts. If provider fake response is scripted for functional path, label output-quality assertions `NOT_TESTED`.
- Measure HTTP request/response sequence, revision IDs, source hashes, entity gate states, materialization, outbox completion, context source/provenance and terminal status. Trace failures. Keep development implementation separate from final independent acceptance.

## Immediate slice / deliverables

**First deliverable:** P1 core gap matrix + new durable supported-API five-chapter run, Wave 1H provenance closure attempt, verified source→canon→outbound prompt and first ordinary revision/outbox loop; no FE work. Do this before investing in P2/P3 tests. Then advance P2 and P3 on independent test-owned projects if core gates permit.

Create `Pipeline_test/reviews/2026-10-22-p123-headless/` containing:
- `P123_CORE_MATRIX.md`: P1/P2/P3 ordered contract stages, current availability, channel, evidence links, PASS/FAIL/BLOCKED/NOT_RUN, with UI/provider/100k separate.
- `EXECUTOR_REPORT.md`, machine-readable `validation.json`, sanitized trace/requests, read-only DB/revision/outbox hashes and gateway fake-only/egress audit.
- Test additions under `Pipeline_test/tests/` or an existing appropriate test suite, plus a reproducible headless runner under `Pipeline_test/tools/` if needed.
- `FE_BACKEND_CONTRACT_HANDOFF.md`: frozen current API response/version/409/error/DTO contract, discrepancies with PR #55, targeted integration needs; **not** a command to edit FE.

Commit tested backend/AI/runner code first, test that SHA, then commit sanitized evidence, push to the pipeline branch. Do not merge or automatically modify FE PRs. Stop at concrete technical blockers or a documented bounded deliverable for independent GPT-6 review; continue other independent core tasks when possible.

**No claiming UI S01–S11 or live P1/P2/P3 PASS from headless tests.**
