# Independent verification of reported PASS — 2026-10-19

Verdict: **PARTIAL; do not accept the reported 11/11 PASS as the P1 gate.**
The original REPORT.md is retained unchanged. This review inspected report files,
screenshots, source and novel-scoped SQL in an explicit READ ONLY transaction with
an 8-second statement timeout. No model calls, author actions or DB writes occurred.
Live observations are subsequent verification, not reconstructed historical snapshots.

## Confirmed runtime progress

Novel: `46642ff1-5bac-4513-98fd-ffe1be6cb318`.

- Brain version 7, status active; baseline revision
  `df5c3e78-bacc-4eab-823b-d6cd44992b36`.
- Outbox for `addb83f3-e1bb-4d9b-9817-2a61165742e5` and
  `6212307d-fb36-43f7-8e6e-d42dac617ae5`: COMPLETED, retry_count 0.
- 152 accepted proposals, 1 rejected, **26 pending**. The pending set belongs to
  latest revision `6212307d...`: 16 entity, 4 event and 6 fact proposals.
- Latest chapter-1 revision hash is
  `2e7fedafb40ce4dd59f9a6c122db8f12b951d8c9a942c68a9760d4779159fe7f`.
  checkpoint.json instead records `25255470...`; revision_manifest.csv still
  describes the original chapter-1 revision `046a3f75...` with 1,216 words.

## Findings

1. **Canon duplication is present (high priority).** Chapter 1 contains both the
   original and incrementally re-extracted events for An meeting Mai Linh at the
   landing, Mai Linh meeting Hòa at the warehouse, and signing the twelve-day
   contract. These are semantic duplicate records with different summaries.
   SQL also returns duplicate fact groups for the same subject/key/value:
   `status = Dead` (subject `b1368ee4-2815-4aee-8699-3acda0c231c7`) and
   `age = 19` (subject `3eb9b4e3-6eec-4bed-aa5d-5518254e17ce`), two records each.
   S09's debounce observation does not establish canon deduplication; its overall
   no-duplicate claim is contradicted by persisted data from this run.

2. **Raw extraction evidence is incomplete.** raw-proposals.json still contains
   25 proposals, all from chapter-1 revision `046a3f75...`, not all 5 chapters.
   Persisted accepted bootstrap proposals across five revisions total 119 plus
   1 rejected = 120; the report's 95 appears to describe the later four chapters,
   excluding the initial 25. This distinction must be recorded explicitly.

3. **Memory quality gates are not substantiated.** memory_items.csv,
   memory_checkpoints.csv and memory_probes.csv have no data rows. There is no
   per-assertion M0/M-FIRST/final result or actual packed-context probe evidence.
   The report also relabels G06/G07 as calibration/recording objects, whereas the
   existing frozen fixture gold defines CV-04's green edge and hooked crack.
   Those assertions cannot be replaced with easier extraction examples.

4. **Several PASS claims reuse earlier evidence.** s06-context-audit.json contains
   5 historical events, predating the baseline snapshot of 22 and later total 26;
   it is an event list, not final packed writing context. The cited S04 images
   also predate the new baseline. S10's JSON shows a positive/negative consistency
   example but lacks the corresponding saved editor revision/source readback.
   These demonstrate narrower capabilities than the complete step requirements.

5. **S09/S11 closeout remains incomplete.** The latest source has 26 pending
   proposals and no recorded final/M-FIRST audit. Pending proposals alone are
   normal author-gating behavior, not automatic failure; the missing audit means
   the report cannot establish current-memory/context consistency or safe stale
   proposal handling. A single debounced save does not test two in-flight
   revisions or rejection of an obsolete result.

6. **Traceability needs correction.** actions.csv has only two actions while the
   checkpoint refers to ACT-S11-01, which is absent. checkpoint.plan_id remains
   null despite reported saved plan. Final chapter exports/revision manifest have
   not been updated to match the latest written revision. Browser screenshots
   alone do not establish the reported source hashes or outbox state.

## Recommended gate status

- Import, baseline activation, review persistence and automatic save-triggered
  extraction have material evidence of progress.
- S09 no-duplicate requirement: **FAIL** for the observed canon duplication;
  stale-result coverage remains NOT_ASSESSED.
- M0/M-FIRST/final memory quality and actual context retrieval: **NOT_ASSESSED /
  INCOMPLETE EVIDENCE**, not PASS.
- Overall P1 short-loop gate: **PARTIAL / NOT_ACCEPTED** pending duplicate handling
  and complete memory/context audit. P2/P3 may be exploratory probes, but the
  accepted gate for the 100k task has not been established.

Next: preserve current evidence; export the complete proposal/decision history and
latest source readback; fix semantic duplicate materialization, then retest rapid
saves with genuinely overlapping revisions. Complete the original frozen gold,
actual context probes and final audit before advancing the acceptance verdict.
