# GPT-6 independent source/evidence review — P1 headless bounded slice

**Review date:** 2026-10-22 (Asia/Bangkok)
**Branch reviewed:** `codex/ai-copilot-pipeline-test`
**Tested source SHA asserted by executor:** `b5c9c8db6bfd976f37d8811c2db45ad40691fd99`
**Evidence HEAD before this review:** `64407f72a7d5182f2f850d386375c7ac709ddd3a`
**Acceptance level:** remote review of GitHub source + committed sanitized artifacts **ONLY**. The reviewer did **not** rerun Docker/pytest/Playwright and has not established independent runtime reproducibility.

## Verdict

**`P1_HEADLESS_BOUNDED_SOURCE_EVIDENCE_REVIEW_ACCEPTED_WITH_OPEN_GATES`**

Accept the bounded P1 core delivery as credible **executor-reported** evidence for supported-API → durable PostgreSQL/Mongo → fake-provider HTTP dataflow at the exact tested source SHA, sufficient to proceed with remaining P1 core guards and begin independent P2 core work. This is not `P1_CORE_OFFLINE_PASS`, not live-provider acceptance, not independent E2E rerun and not S01–S11 UI acceptance.

## Direct checks performed by reviewer

1. Compared branch to delivered source: `b5c9c8d..64407f7` is exactly one evidence-only commit (no backend/AI source changes after final reported run). The larger baseline `eca4a00..64407f7` has 8 commits, 235 changed files (223 evidence, 12 source/harness/test files), **no `web/` edits**. No FE PR was merged by this branch.
2. Inspected `ai-service/application/writing_service.py`:
   - nullable offsets filtered and defaulted before selection hash and bounds checks;
   - explicit idempotency keys use stable UUID and input-hash replay, while unkeyed calls create fresh UUID and durable `generated:<job_id>` key;
   - observed source tests in `ai-service/tests/test_entity_cutoff_provenance.py`.
3. Inspected `ai-service/infrastructure/postgres_narrative_repository.py`:
   - proposal group acceptance bulk-fetches revision provenance and derives minimum source `first_chapter`;
   - `get_structured_context(...chapter_number=...)` excludes entities with later cutoff and derives facts/events/states subject to cutoff.
   - **Limit:** entities with no usable source chapter (`first_chapter` absent/unknown, legacy or declared) are treated as globally available. No migration/backfill of legacy data; not a proof they can never leak in a historical context.
4. Inspected `Pipeline_test/tools/run_p123_headless.py`: authenticated backend HTTP creation of novel, five chapter revisions, API-mediated entity review and proposal approval, DB SELECT readback, process restart, active plan, two outbound fake captures, ordinary PATCH, outbox and M-FIRST checks. It does not directly insert canon/plan/proposals/revision business records into DB. SQL role promotion is confined to unique test-owned accounts.
5. Cross-checked `final-run-05/validation.json`, `final-readback-audit/validation.json`, `final-readback-audit/future-entity-cutoff.json`, `outbound-capture.json`, `EXECUTOR_REPORT.md` and `validation.json`. Reported 33/33 checks, five temporal cutoffs, 15 approved source identities and zero post-fix future-entity leaks; both frozen source and real outgoing provider-like prompt are represented in committed evidence. These are **executor artifacts**, not a new independent run.
6. Verified the fake scenario uses exact-value scripted reconciliation (`Pipeline_test/tools/fake_p123_scenario.py`). Machine quality, literary ability, semantic retrieval and independent model reasoning are not demonstrated. Human approval is `SIMULATED_HUMAN_VIA_API`, not a genuine UI author session.

## Findings and guardrails

| Area | Evidence-based disposition |
|---|---|
| Actual API/manuscript revision/canon/materialization/readback/outbound | Supported by linked source and artifacts; **bounded offline executor evidence accepted for next-stage work** |
| Canonical context → fake HTTP and stored hash | Supported, distinguish context SHA from full-prompt SHA |
| Temporal cutoff for newly sourced entities | Reproduced by executor on durable fixture; prior seven leaks and post-fix zero leak evidence preserved; legacy unknown-origin behavior unresolved |
| Wrong author, same novel | Backend HTTP 403 (authorization), **not** separate-tenant runtime test |
| Simulated approval / model output | Functional workflow only, no actual human/model quality inference |
| PATCH stale-write/two writers | **OPEN GAP:** current branch lacks `expectedVersion` in PATCH schema; identical save reuse is not optimistic locking. PR #55's contract must be reconciled before FE integration |
| Generated-draft accept API E2E | NOT_RUN, ordinary PATCH performed instead |
| DB failure injection / interrupted-worker resumption | NOT_RUN on real DB; mocked/unit coverage is narrower |
| Locked-rule pack/overflow over durable HTTP | NOT_RUN in bounded run; prior component tests do not substitute |
| Semantic RAG/embedding | DISABLED / NOT_ASSESSED, retrieval metadata observability remains gap |
| UI S09 stale autosave | Still historical RED / FE-owned; no browser validation |
| P2, P3 functional and 100k | NOT_RUN |
| Live provider, real spend, literary quality | NOT_TESTED; 63 calls and USD 3.307739 are fake-only accounting, actual provider cost zero per executor containment ledger |

## Risks to target in next source changes

- `first_chapter` uses provenance only when linked to a revision record. Do not silently set unknown/legacy or author-declared source to an arbitrary chapter, but add explicit policy/negative test and evidence marking for unknown temporal origin.
- API versioning must not be asserted by the existence of `draftVersion`. Detect/reject stale writers with a compatible optional/required optimistic contract at the correct persistence boundary, or mark blocking schema/design issue and coordinate with #55. No `web/` edits.
- Test an accepted generated draft and subsequent real readback/outbox/brain gate, distinct from ordinary author save.
- Fault inject after immutable revision/DB/outbox boundaries; demonstrate no canon advance or duplicate writes before retry. Report each red attempt and restored green.
- Repeat replay/cutoff/tenant and budget assertions through real isolated DB/HTTP; distinguish negative tests from happy-path count.

## Delivery and evidence integrity

Examined evidence (all at the HEAD above):
- `Pipeline_test/reviews/2026-10-22-p123-headless/EXECUTOR_REPORT.md`
- `.../validation.json`
- `.../final-run-05/{source-manifest,validation,outbound-capture,outbound-cutoff-1,ordinary-save,M-FIRST-outbox}.json`
- `.../final-readback-audit/{validation,future-entity-cutoff,cutoff-contexts}.json`
- `.../FE_BACKEND_CONTRACT_HANDOFF.md`
- `ai-service/tests/test_entity_cutoff_provenance.py`
- `ai-service/application/writing_service.py`
- `ai-service/infrastructure/postgres_narrative_repository.py`
- `Pipeline_test/tools/run_p123_headless.py`

**No code, tests or infrastructure executed during this GPT-6 remote review.** Exact source SHA and test exit codes above are independently read from the committed records, not independently reproduced.

**Next:** Complete P1 core safety/concurrency/accept-draft gaps on the pipeline branch where possible; start P2 headless on a new isolated dataset once relevant P1 guarantees are preserved. Maintain `HOLD_FE_INTEGRATION_ONLY`; no FE code/cherry-picks/merges, no provider calls, no P3 long-run shortcut.
