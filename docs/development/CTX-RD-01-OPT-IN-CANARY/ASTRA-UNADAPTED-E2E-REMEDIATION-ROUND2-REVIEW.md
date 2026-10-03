# ASTRA REVIEW — CTX-RD-01 Unadapted Narrative E2E Remediation Round 2

## Decision

**UNADAPTED_FUNCTIONAL_SMOKE_OBSERVED — TECHNICAL_ACCEPTANCE_PARTIAL; PR CI AND SOURCE-STATUS / DEDUP EVIDENCE PENDING**

Reviewed branch: `astra/ctx-rd-01-unadapted-narrative-e2e`, head `31d8ba49166c746f53120325f0d8bcddf7b368a2`; it is four commits ahead of `main` without an open PR at review time. This review does not authorize merging the branch unchanged, activating `balanced-scope-v1` globally, or P8-05 cleanup.

### Correct code/evidence lineage

- Implementation/tests commit `de43c54f57c72c79841be913a985c60689edcfcd`, based on the previous Astra review commit `ff1c17f61008a471f5c80535b499873a51cdda6b`.
- Focused runner correction and **actual tested code SHA** `dae7bcb9c7a19fe4ae5b90315397006a44562a2b`.
- **Actual evidence commit** `27e774e7016492752e2026eea6015b28a6abbf18`, direct child of `dae7bcb9...`. It changes only `docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-narrative-e2e.json`.
- Execution handoff `31d8ba49166c746f53120325f0d8bcddf7b368a2`, direct child of evidence commit.

**Erratum:** The branch `promt.md` records the evidence SHA as `27e774eb055df2dfb1a37c94b7c61fef1bcfe488`. This is not the actual GitHub commit and cannot be resolved. Correct the handoff to `27e774e7016492752e2026eea6015b28a6abbf18`; preserve the raw evidence JSON unchanged.

The offline validator is reported as PASS (0 errors) and local execution reports 7/7 unit and 5/5 PostgreSQL integration tests. **No PR or GitHub Actions workflow is recorded for these new commits**. The workflow adds the tests, but its existence is not evidence of execution. CI passing on the old PR #32 does not test the new repository modifications.

## Meaningful fixes confirmed

- `WritingService` receives the actual `PostgresNarrativeRepository`, with genuine `get_structured_context()`; no runtime `RepoAdapter` or `eval01g.build_package()` injection.
- Event materialization now constructs **one** EventRecord per canonical memory, preserving original `review_status`, ambiguity tags and source evidence in event/chunk metadata. `FactRecord` uses genuine `world_rule`-tagged memories, without reclassifying the cavalry-history memories as world rules.
- Entity `first_chapter` is populated in `static_attributes` and `get_structured_context()` filters known later-introduced entities when a chapter cutoff is provided. Reported raw entity counts are 63 at Ch32 and 68 at Ch49, instead of all 80. New PostgreSQL tests cover known cutoff, as-of projection, supersession, cross-tenant isolation, and latest-five normalized participants (reported local PASS; awaiting CI).
- Runtime endpoint is redacted and reports the actual staging port 5433.
- Both genuine LLM generation jobs are reported complete with matched preview/job hashes. Reported embedding adapter calls: 11 document batches covering 216 chunks and 6 query calls. Four LLM attempts: two successful, two failed 503.
- The code reads routing tier, tokens used, drops and overflow from `preview.token_budget` instead of assigning constant tier/zero. Evidence values: Ch32 12k, 9,890 tokens, 63→19 entities; Ch49 12k, 11,208 tokens, 68→20 entities; both 20 recent events, all 6/12 rules, zero reported drops/overflow.
- New branch diff contains the sanitized manifest rather than the formerly committed complete draft files. The old pushed commit containing drafts may remain addressable through Git history; if confidentiality requires erasure, handle according to repository retention rules.

## Source-correct retrieval and context deduplication

Authoritative frozen-source cavalry-history IDs are `mem-000164` (Ch45), `mem-000172` (Ch47) and `mem-000176` (Ch49), **not** `mem-000167/174/177`. They are explicitly ambiguous/conflicting source reports, not authoritative reconciled military states.

In the new Ch49 run, the raw semantic retriever returned all three correctly: Ch47 `mem-000172` at rank 1, Ch49 `mem-000176` at rank 2, Ch45 `mem-000164` at rank 3. All three IDs are also present in the 20 recent events.

The packer deduplicated these three overlapping semantic entries **because their corresponding event summaries already occupy the recent-event lane**. Actual semantic slots are 8 raw → 5 retained + 3 deduplicated for Ch49; Ch32 is 8 raw → 3 retained + 5 deduplicated. Thus `raw_semantic_ids == semantic_retained_ids` is neither expected nor necessary. Verify instead that `raw = retained semantic ⊎ correctly mapped recent dedup`, with no content/status loss.

**Remaining provenance defect:** The manifest marks `actual_preserved_lane="semantic"` for `mem-000164/172/176` solely because they were found in raw semantic retrieval, even though they are **not present in final `preview.semantic_memories`** and are present in final recent events. Separate:
- `retrieval_origin=semantic` and rank;
- `prompt_retained_lanes=[recent]` (plus semantic only if actually present);
- `dedup_reason=overlap_with_recent`;
- preservation of source status/ambiguity and summary content after promotion.

The validator currently demands semantic-lane attribution for these IDs, which is contrary to actual packed placement and must be corrected without falsifying the raw retrieval result.

## Acceptance blockers and test hardening

1. **Source-status semantics.** The runner labels all event rows `confirmation_status="confirmed"`, even when `event_metadata.review_status="ambiguous"` and `is_ambiguous=true`. This can describe a confirmed *report* but not necessarily a confirmed *underlying event*. Demonstrate with an integration/preview-to-prompt assertion that the ambiguous-source flags are preserved and not rendered as clean canonical ground truth; otherwise introduce an explicit report-vs-fact representation. Do not discard the contradictory Ch45/47/49 reports simply to make tests pass.
2. **Fail-closed measurements.** The runner still uses `get("dropped_artifact_count", 0)`, `get("protected_overflow", False)`, and `get("budget_overflow", False)`, plus fallback `["routed"]`/ `["balanced-scope-v1"]` when routing status/version is absent. Absent fields can therefore become a false PASS. Require the actual keys and types; assert valid `0 < tokens_used <= selected_tier` for this no-overflow test. The offline validator currently checks values but cannot establish their independent origin; add explicit absent-field negative tests.
3. **Identity/temporal tests.** The validator checks presence of entity/state arrays but does not check that retained IDs are an allowed subset of raw IDs and that states align with retained entities. Verify future-entity exclusion on both independently queried and packed contexts, participant identity from EventParticipantRecord (not just participant counts), and superseded-event exclusion. When `first_chapter` is missing/malformed, document the repository's current unknown-cutoff behavior rather than claiming universal future-entity safety.
4. **CI.** Open a PR and require P7/P8, including the five actual PostgreSQL integration tests. In CI, database-unavailable tests must not silently SKIP while the aggregate job reports SUCCESS.
5. **Content review.** The new branch contains only hashes and limited draft snippets, not a new independently auditable full-draft source review. Automated lexical PASS should remain separate from `future_leakage` and `unsupported_claim` (NOT_ASSESSED). Review the controlled local full drafts for any claim of narrative-quality acceptance.

Fix code/tests **before** a fresh narrowly targeted live run on a clean SHA; commit sanitized new evidence as a separate child. If a change is test/manifest-only and does not affect provider execution, state that exact scope and avoid needlessly re-embedding all 216 chunks, but do not relabel historical evidence to imply unexecuted behavior.

```text
unadapted production repository path    OBSERVED (qualified)
real source pgvector + Gemini path      OBSERVED (qualified)
correct rq-0025 semantic top-three      OBSERVED
correct prompt-lane attribution         NEEDS REPAIR
source-status / ambiguity safeguards    PARTIAL
measured runtime metrics                IMPROVED / FAIL-CLOSED GUARDS NEEDED
tested-code → evidence lineage          VALID, HANDOFF SHA TYPO
new implementation PR/CI                NOT YET RUN
full unadapted E2E gate                 PARTIAL / NOT CLOSED
default routing                         legacy-v1 (unchanged)
global balanced activation              NOT AUTHORIZED
P8-05                                    BLOCKED_PENDING_STABILITY
```
