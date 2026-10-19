# S03 memory repairs — 2026-10-18

Implementation/regression PASS; deployed to the isolated stack at http://localhost:18080.
Live UI and real-provider extraction after this patch: **NOT_RUN**. This report does
not replace the failed raw memory audit or mark S03 complete.

## Implemented

- Prose analysis now has a separate LLM fact pass, enabled for manuscript bootstrap
  and public revision-analysis requests. It covers pre-existing state, historical
  facts, quantities, limitations and observations directly from the original prose.
  Reported/hypothetical/proposed claims retain modality in the fact value and do not
  project onto confirmed entity state. Facts remain pending until author review.
- Entity extraction preserves initial life status. Non-Unknown extracted statuses
  require an exact supporting source quote. Existing entities can receive reviewed
  state updates through subject-bound facts; a duplicate entity proposal is not a
  replacement for a state correction.
- Entity mention matching uses Unicode word boundaries on original source offsets.
  Event/fact quotations must occur verbatim and uniquely in the revision. Event
  extraction no longer silently uses a whole-chapter evidence range. Exact quotes
  are displayed on new review proposals. State extraction also receives original
  event quotes, not only the event summary.
- Event prompt specifies list types, actual participants/location and uncertainty.
  Gemini receives JSON schemas for event and prose-fact output. SDK support checked
  locally. Invalid evidence remains an explicit failure rather than fabricated data.
- Editor review allows status edits even on old entity proposals, event location
  edits, readable structured relationship values and relationship/scalar state edits.
- Added an author repair form: select a saved source chapter, inspect its text,
  provide a unique exact quote and create a pending fact/entity/event proposal.
  Backend checks novel ownership and current source revision; AI checks source hash,
  quote, payload fields and brain version. The form never directly accepts canon.
  Fact subjects can reference approved entities; numeric values are supported.
  To repair an old bad evidence span, create an evidenced replacement and explicitly
  reject the old proposal. Existing accepted events use the existing correction flow.
- Added official Facts tab. Approved narrative/author facts are included in canonical
  writing context, with chapter filtering retained. Uncertain fact values are not
  enforced as hard world-rule violations by the deterministic prose validator.

## Verification

- Python default suite: **294 passed, 2 skipped, 42 deselected**. Excluded PostgreSQL
  suites are not counted as pass. New grounding/author-repair coverage includes
  memory, JSON and SQL repositories (SQL tests use SQLite), source forgery rejection,
  idempotency, pending-before-approval behavior, state projection and context inclusion.
- Selected backend suite: **26 passed**. Backend TypeScript build passed locally and
  again in the Docker build. Web production build passed locally and in Docker;
  existing Mantine directives/large bundle warnings remain.
- Live runtime verification: new author-proposals OpenAPI route and repair/facts UI
  markers present; critical image source hashes match workspace.
- Existing retest queue remains **26 accepted / 65 pending / 2 rejected**; zero running
  autonomous jobs. No DB reset, proposal decisions, manuscript edits or model calls
  were performed during this development rollout.

Evidence: `evidence/python-tests.txt`, `backend-tests.txt`, `web-build.txt`,
`rollout.txt`, `rollout-final-ai.txt`, `runtime.json`, `targeted-tests.txt`.

## Retest instructions

1. Reload http://localhost:18080 and sign in through UI. Keep the original run/project
   and frozen gold. Inspect live queue before acting.
2. Resume S03: for already approved characters, add subject-bound facts such as
   `status = Dead` using the correct saved chapter/quote. Supply missing hearing,
   counts and limits with their actual certainty. Review and accept explicitly.
3. For wrong entity/event anchors, use the replacement form and reject old proposals;
   inspect dependent proposals as well. Editing a summary alone does not repair its
   historical evidence. Verify facts, projected states and source quotes after reload.
4. To measure automatic extraction quality after this patch, create a separate UI
   probe project from the unchanged fixture. Completed old analyses are idempotent
   and are intentionally not overwritten/re-run by deployment. Compare new proposals
   against the same frozen gold; do not count author repair as extraction recall.
5. Finish S03/M0 and S04, then S05–S11. P2/P3 and 100k remain gated on short-loop PASS.

The patch provides a repair path and stronger extraction contracts. It does not prove
semantic correctness, alias resolution, full recall, real provider schema acceptance,
or long-run literary quality; those remain live retest obligations.
