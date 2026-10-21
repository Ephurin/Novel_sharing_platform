# Reanalysis recovery repairs

Implemented 2026-10-19; UI continuation resumed 2026-10-20 (Asia/Saigon).

## Changes

- **AI-GATEWAY-422:** the UI creates a fresh Idempotency-Key for each author
  reanalysis action. The controller validates it, scopes and hashes it with the
  author/novel/revision, and forwards it through the gateway to FastAPI. A retry
  retains its request key; a later author action can reanalyse unchanged prose
  against a changed canon. The bounded hash fits the database key field.
- **EXTRACT-RECONCILE-COLLISION-001:** multiple proposals may explicitly reuse one
  unchanged canonical artifact. Each retains its own evidence and review decision;
  repository materialization does not insert another artifact. Replace/replace,
  reuse/replace, foreign-kind, invalid-target and retirement conflicts remain
  invalid. Invalid structured comparisons receive at most two repair calls after
  the first attempt, with validation feedback. Exhaustion returns actionable
  `422 CANON_RECONCILIATION_UNRESOLVED`, not an unhandled 500. No conversion of a
  conflicting target to `new` is performed by the validator.
- **EXTRACT-GROUNDING-AMBIGUOUS-001:** whitespace-tolerant quote grounding requires
  one match, rather than selecting the first of several. A repeated quote must be
  expanded to a unique, exact source span through the bounded repair path. If no
  repair succeeds, analysis fails explicitly with
  `422 EXTRACTION_GROUNDING_UNRESOLVED`. No partial proposal batch is persisted.

## Verification

- Python default suite: **347 passed, 2 skipped, 42 deselected**.
  See `evidence/python-tests.txt`. Excluded PostgreSQL integration cases are not
  counted as pass. Repository contract tests cover memory, JSON and SQLite-backed
  SQL adapters; excluded suites remain separate from that count.
- Selected backend suite: **30 passed**. See `evidence/backend-tests.txt`.
- **5 real PostgreSQL recovery regressions passed** in the explicitly isolated
  `ephurin_report_e2e_canon_20261019` database. They cover shared reuse targets,
  three conflicting claim combinations followed by repair, and bounded failure.
  LLM outputs are stubs; this is not Gemini E2E. See
  `evidence/postgres-recovery-tests.txt`.
- Docker builds for backend, AI service and web passed; all three services were
  updated in the isolated `ephurin-ui-retest` project. The final controller hash
  was included by `evidence/rollout-backend-final.txt`.
- Runtime/source hashes matched before the overnight interruption; migration was
  `0010_fact_supersession`. See the UI run's `evidence/runtime.json`.
- New tests exercise shared reuse targets, conflicting mutations followed by
  successful repair, bounded exhaustion, repeated/whitespace quote ambiguity,
  original Unicode offsets, no partial persistence, structured 422 responses and
  request-key forwarding/retry behavior.

## Live status

The separate UI run is `../2026-10-19-recovery-ui-01/`. Five saved drafts match the
fixture exactly (4,747 words). S02 initially encountered Docker startup/runtime
failure. Follow that run's checkpoint and report for live verdicts. Tests above
alone do not establish Gemini semantic correctness or P1 readiness.

An initial sandboxed targeted test attempt failed on temporary-directory access;
the later supported run produced the final suite result above. A targeted run also
identified an existing error-message assertion; wording was made compatible before
the full suite passed. Initial logs remain separate from final verification.
