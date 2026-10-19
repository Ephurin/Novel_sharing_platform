# Canon / critical facts / context repairs — 2026-10-19

**Code/regression verified and deployed to http://localhost:18080.**
Gemini semantic reconciliation, fresh-fixture extraction recall and LIVE_UI retest
are **NOT_RUN** in this development task. Existing test verdicts are not upgraded.

## Changes

- Chapter revision analysis compares newly extracted event/fact propositions with
  active canon for the same source chapter. An LLM emits explicit `new`, `reuse` or
  `replace` decisions, using source evidence and narrative occurrence rather than
  only summary text, action labels or participant lists. Output must cover every
  candidate once and cannot claim missing, foreign-kind or multiply used targets.
- Reuse keeps the original canonical artifact ID. New review decisions and current
  revision evidence remain in proposal history; unchanged events/facts are not
  inserted again. Actual repeated actions can be new occurrences.
- Replacement and source removal produce reviewable versions/tombstones, retaining
  old artifacts. Facts gain `supersedes_id` / `is_retired` through migration
  **0010_fact_supersession**. Projection, context and official fact views exclude
  superseded/retired values. Event replacement retains original narrative position.
  Retiring an explicit status fact cannot reactivate an obsolete entity default.
- Repositories validate the canon base under their transaction/brain lock before
  group materialization. A changed canon base requires reanalysis. Gateway source
  checks still apply to AI replacements; only explicit historical author correction
  groups can retain old evidence. No generic `supersedes_id` exemption remains.
- UI explains reuse, replacement and retirement, hides retired historical events
  from the current event list, and provides “Phân tích lại chương đang mở” for
  recovery. Reanalysis checks ownership/current source and uses server-owned hash.
- Prose fact extraction explicitly covers object identity/physical attributes and
  epistemic limits. A bounded extra coverage review searches the original prose for
  missing facts; it does not receive test gold. Both passes preserve modality and
  require grounded source evidence. Real-provider recall remains to be measured.
- Context packer v2 ranks by requested character/query and selects whole artifacts
  across fact/event/entity/retrieval lanes. Entities cannot greedily consume the
  whole budget first. Locked artifacts/author constraints remain protected; overflow
  is explicit. No fixed 30% quotas. Selected/dropped IDs, drop reasons, policy and
  token-estimator version are observable. Facts retain their subject identity.
- Regression exposed an existing false-quota classification: a random trace UUID
  containing `429` could cause a truncated structured response to attempt fallback.
  Quota checks now distinguish structured failures and standalone HTTP status codes.
  The failing initial test used synthetic text; no project fixture/generation was
  sent by this development task. Final provider tests use stubs.

## Verification

- Python default suite: **328 passed, 2 skipped, 42 deselected**. Excluded suites
  are not counted as pass. New cases exercise memory/JSON/SQL repositories.
- Selected backend suite: **29 passed**, including historical correction versus
  AI-replacement source-check boundaries.
- **8 real PostgreSQL repository regressions passed** in isolated DB
  `ephurin_report_e2e_canon_20261019`, with complete migrations and pgvector.
  They cover reuse, fact/event changes, true repeated actions, invalid targets,
  retirement, stale canon-base rejection, chronology and obsolete status defaults.
  LLM comparison outputs are stubbed in these tests; this is not Gemini E2E.
- Backend and frontend builds passed; normal large-bundle/Mantine warnings remain.
- Read-only context preview on the preserved independent project, same cutoff 5
  and character Linh: 4k selected **7 events / 8 facts / 7 entities** (estimated
  3,996 tokens); 8k selected **15 events / 16 facts / 16 entities** (estimated
  8,175 tokens). This demonstrates removal of complete event/fact starvation, not
  proof that every frozen-gold query or actual generation context passes.
- Runtime fingerprints, migration and observations: `evidence/runtime.json`.
  Builds: `rollout.txt`, `rollout-final.txt`, `rollout-final-ai.txt`.
  Tests: `python-tests.txt`, `backend-tests.txt`, `postgres-tests.txt`.

## Preserved data and limitations

The independent project remains 152 accepted / 26 pending / 1 rejected proposals;
reader03 remains 27 accepted / 65 pending / 2 rejected at this task's preflight.
Old duplicates and decisions are intentionally not retroactively rewritten. The
migration adds version fields; it does not clean historical artifacts or approve
pending queues. No autonomous runs were running at rollout preflight.

Old analysis proposals lacking reconciliation metadata may require rejecting and
reanalyzing the saved source before approval. Do not use the preserved old queue
as fresh post-fix evidence. Test the new behavior in a new UI project.

Classification is an LLM decision, not a guarantee of semantic identity. Human
review remains required in ordinary mode. Full-auto behavior and all long-run
quality/memory gates still need live testing. Canon retirement without usable
original evidence fails explicitly. A pipeline state marked completed does not
establish recall, certainty, alias resolution or literary quality.

## Gemini handoff

Use [GEMINI_RETEST_CANON_CONTEXT.md](../../GEMINI_RETEST_CANON_CONTEXT.md).
Run fresh P1 short loop plus REG-01–REG-06, original gold, M0/M-FIRST/final audit and
actual context probes. Preserve old run files and queues. Keep the three issues OPEN
until their real UI/provider regression evidence satisfies the acceptance criteria.
