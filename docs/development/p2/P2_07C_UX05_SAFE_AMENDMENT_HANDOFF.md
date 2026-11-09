# P2-07C / UX-05 handoff

Issue #114 · branch `gemini/p2-07c-ux05-safe-setup-amendment` · target `integration/p2-planning-studio`.
Base fetched and inspected: `30dc39e1ee8c9f683f41301825ccc1294159375f` (PR #108). Includes PR102,105,106,108 and the UX audit; no prior merged work reset/replaced.

**Provisional verdict: CONTRACT_BLOCKED, pending final source CI/evidence packaging.** This is a Stage-0 contract/probe PR, not an implemented amendment feature. Request independent GPT-6 contract review before migration or production authority changes. No real LLM, quota/config/main/demo changes or merge.

[Contract truth table, source findings and smallest proposal](P2_07C_UX05_AMENDMENT_CONTRACT_PROPOSAL.md).

## Findings and scope

Existing fact version columns do not implement a safe correction workflow. Memory removes superseded/retired facts, while WritingService preview receives both old/new rules, including a retired locked parent. M0 before activation rejects even a fresh Brain token when the initial review audit is stale. Generic fact acceptance is not an author amendment path. This is more than a missing edit button; simply unlocking setup or updating accepted FactRecord would bypass authority.

No production Python/Node/React authority code changed. Added three explicitly labelled real-PG characterization probes (not desired future behavior), readonly assertions in the existing actual `/author/ide` browser test, and the module to P2's selected PG CI suite. Original setup lock and UX03 mixed-group review are preserved. Hypothetical chain fixtures are INSERT-only in a new disposable novel; no accepted fact UPDATE, fake chapter/event or provider call. A counter-only M0 probe checks denial leaves source/accepted facts/history/activation unchanged. Probes must be replaced by actual feature acceptance when the reviewed contract is implemented, not treated as a shipped feature gate.

## Verification (source/delivery receipt to be pinned)

| Check | Result |
|---|---|
| Real local PG16/pgvector probes | Initial3 PASS, confirming blockers; rerun after adding verified-M0 fixture assertion pending |
| Mounted actual Vite Author IDE, HTTP mocks | MOCKED_BROWSER_PASS: source rule/append controls stay disabled before/after M0; no amendment button/request; existing journey retained |
| Typecheck/build | Initial exit0; exact source CI pending |
| Existing owner-scoped Gateway + PG/Mongo/P1 regression | Exact source CI pending; these test baseline setup/M0/Writer, not nonexistent amendment APIs |
| Pending amendment → approve/reject → one effective rule, new API CAS/replay/privacy/503 UI | NOT_RUN_CONTRACT_BLOCKED; no amendment API/UI implemented |

Local dedicated DB `p207c_ux05`, localhost55447, new container `ephurin-p207c-ux05-pg`; existing Platform/Alembic migrations only. No QA or earlier p205 DB reuse. Providers fake; preview provider is None and actual f.llm call count0. Evidence identifies hypothetical fixture probes distinctly from supported API regression.

Commands (exit codes and exact source IDs filled after source freeze):

```text
# root
npm --prefix backend run db:migrate
npm --prefix web run typecheck
npm --prefix web run build
node --test web/tests/planning-studio.browser.test.mjs
# ai-service, TEST_DATABASE_URL points only to p207c_ux05
python -m pytest -o addopts= -vv -s tests/test_setup_amendment_contract_postgres.py --junitxml=../docs/development/p2/evidence/p2-07c-ux05/probes-local.xml
```

P2/P7/P8 CI keep all existing checks and exact-HEAD checkout pins. P2 additionally runs the probe module; PASS means the existing limitations were observed, not that safe amendment acceptance passed. Existing Gateway ownership/replay/negative tests and M0 first-save SQL/Mongo readbacks remain enabled. Browser evidence is mocked HTTP; PG probes are real SQL; do not combine into browser-to-DB E2E.

## Rollback / unsupported cases / next gate

There is no new endpoint, runtime write path, migration, data backfill or correction to roll back. Reverting this PR removes only diagnostics/docs/CI selection/assertions. Hypothetical rows live only in disposable fixtures. Existing accepted source remains read-only in production until a reviewed workflow exists.

Pre-M0 and post-M0 accepted-rule correction, new rules/entities after activation, lock changes, subject-bound rules and historical correction are not newly enabled. Minimum first slice proposed: single global accepted setup rule after verified M0/M-FIRST, append-only approved edge + shared effective-head resolver + audited owner/CAS/idempotency, preserving lock/source/history. Before-M0 amendments need a separate M0 consent/audit contract. No workaround based on fake chapters/events or direct fact updates.

Stop at independent GPT-6 contract review. Owner decides merge. No UX06…10 or P2-06 work.
