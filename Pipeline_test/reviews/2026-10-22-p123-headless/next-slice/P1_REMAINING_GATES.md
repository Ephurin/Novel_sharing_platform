# P1 remaining core gates — executor handoff, 2026-10-22

Tested source: `1dc7dfa38267c9eb176f56f070380930d1887d85` (production changes in parent `5c20d49`). Starting task HEAD: `d8e6b35`. Branch: `codex/ai-copilot-pipeline-test`. Executor: Codex. Evidence commit is the commit adding this report (`git log -1 --format=%H -- <this-path>`).

**P1_CORE_BOUNDED_OFFLINE_READY_FOR_GPT6_REVIEW.** These are real authenticated HTTP/backend/AI Service/PostgreSQL/Mongo tests with a deterministic HTTP fake provider. They do not grant full P1, UI or live-provider acceptance.

| Gate | Result | Evidence |
| --- | --- | --- |
| Original same-version stale overwrite | Expected RED, preserved | `concurrency-before/validation.json`, receipts; original image/source `d8e6b35` |
| Optional optimistic PATCH; both orderings, B–A–B | PASS, 9 checks | `final-concurrency/`; same prior version yields one 200 and one precise 409 `DRAFT_CONFLICT`; stale A rejected, identical B replay accepted, foreign owner 403, legacy unversioned request works |
| Simultaneous HTTP race | See `final-concurrent-barrier/validation.json` | Three barrier-started pairs; client HTTP time intervals overlap; one winner per pair |
| Existing baseline | PASS, first 33 of 46 checks | `final-p1/`; fresh five fixture chapters, extraction/HITL/approval, plan, real outbound context hash, cutoff, ordinary save/replay/outbox, durable M0/M-FIRST |
| Actual accept-generated-draft | PASS | Actual job `b682c15c-07cc-47e9-ab96-5a9b474f50db`; revision `18b33b94-374a-44f4-ba81-4799f02907f5`; source `AI_DRAFT_ACCEPT`; Mongo draft matches; one COMPLETED incremental outbox; API entity checkpoint then explicit canon review |
| Real DB failure/retry | PASS | `final-p1/DB-fault.json`, cleanup, trace: chapter-specific BEFORE INSERT outbox trigger raises after attempted revision INSERT; HTTP 500 rolls back both, leaves 1 original revision / 0 outbox, identical draft/canon. Trigger/function dropped in finally, zero remaining; same generation retry and replay produce one accepted revision |
| Stale PATCH after accept | PASS | 409 with unchanged revision/outbox counts and memory; no automatic publish; chapter remains DRAFT |
| Locked rule/pruning | PASS, context slice 8 checks | `final-edges/`; source-backed author proposal, explicit `is_locked=true` edit-and-accept persisted in PostgreSQL; genuine provider HTTP payload retains locked rule and drops oversized optional fact |
| Protected overflow | PASS, fail closed | Actual generation fails `CONTEXT_PROTECTED_BUDGET_EXCEEDED` with zero matching fake receipts; read-only preview in `final-edges-readback-02/overflow-budget-observation.json`: protected 16,192 > maximum 12,000; no truncation/provider dispatch |
| Retrieval disabled | PASS | Actual persisted generation summary has `semantic_retrieval_status=["disabled"]`, empty semantic/embedding IDs; no embeddings |
| Known temporal source | PASS within tested scope | Initial real chapter-1 outbound excludes Duy/Nguyễn Vũ/Vũ. After accepted chapter-1 rewrite, current-source audit verifies 60 accepted entity quote/hash proofs across cutoff 1–5, zero invalid evidence and zero leaks |
| Unknown temporal source | Explicit bounded policy | Author-declared entity retains absent `first_chapter`, globally available under `known-source-cutoff_unknown-global-v1`, ID explicitly listed in context summary. No invented chronological origin/backfill; unknown historical availability cannot be proved |

Fresh P1 project `p123-core-96e7f14d3d`, novel `1722f327-92d9-4ceb-ae1c-9d2cf7897f09`; context project `p123-core-246d87fb24` has separate DB/Mongo/ledger. All final harness starts report clean source at the exact SHA. API-mediated review is `SIMULATED_HUMAN_VIA_API`.

M0: 15 entities / 5 events / 6 facts. Ordinary-save M-FIRST: 15 / 5 / 7. After actual accept/review: 15 / 6 / 9. Accepted revision SHA256: `e3aec31df8749a61c33b4aca44a87fcbbdc251a253584ba99c51ac97a6f15932`. This fake generated patch inserts a prefix into chapter 1; it introduces an approved Duy occurrence there. It is a supported accept path, not a literary assessment.

The preserved `final-cutoff-audit` exits 1 because that historical helper compares frozen M0 origins to post-accept current canon: Duy moved from chapter 2 to a genuinely approved chapter-1 revision. `readback_current.py` resolves CURRENT accepted evidence through revision provenance and validates quote offsets/content hashes; `final-p1-readback/current-provenance-cutoff.json` passes. No failing artifact was overwritten.

Regression: 152 AI PASS / 2 SKIP (memory/JSON SQL-tenant tests intentionally skipped; SQL variant uses SQLite), backend focused 29 PASS, TypeScript typecheck PASS, Docker builds PASS. Commands and exits: `final-regressions/validation.json`, text logs and JUnit. A development `npm --prefix backend test` attempt exits 1 because unrelated PostgreSQL suites try localhost:5432 and sandbox returns EACCES; no database mutation occurred. This is not a full backend-suite PASS.

Other preserved development failures: preflight during initial subnet/DNS setup; harness response-wrapper mismatch; ambiguous repeated author quote rejected 422; combined development ledger admission denial after baseline/accept. Separate final fresh ledgers solve resource/run contention; no budget limits or historical ledgers were reset. Failed `readback_edges` inspected budget in a provider prompt that intentionally omits budget metadata; final read-only API preview is saved separately.

Safety and remaining bounds: no `web/` edits, PR cherry-pick/merge, publication, real keys/provider/embedding calls, or historical resource deletion. CAS guards optional draft content/title versions; unversioned writers and cross-store Mongo/PostgreSQL atomicity remain outside this guarantee. DB fault is transaction rollback before outbox insert/commit, not a process-kill/post-commit crash test. Review must retain these limits. UI_BLOCKED_FE; historical S09 RED remains. REAL_PROVIDER_NOT_TESTED; semantic/literary quality NOT_TESTED; P3/100k NOT_RUN.
