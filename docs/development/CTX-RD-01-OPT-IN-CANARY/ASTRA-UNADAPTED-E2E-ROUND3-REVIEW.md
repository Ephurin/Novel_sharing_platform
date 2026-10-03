# Astra review — Unadapted Narrative E2E round 3 / PR #33

## Decision

**UNADAPTED TECHNICAL PATH DEMONSTRATED (QUALIFIED); FINAL ACCEPTANCE PARTIAL — SOURCE-STATUS/PROMPT GUARDRAIL AND REMAINING CI REQUIRED.**

PR: https://github.com/Ephurin/Novel_sharing_platform/pull/33
Branch reviewed: `astra/ctx-rd-01-unadapted-narrative-e2e`, head `c18e4c078c4742b140bfed0445f092455b971398`, seven commits ahead of `main` as reviewed.

- Code under live test: `9c0496492a9266a39738240c113c78104d0c451a`.
- Sanitized evidence commit: `f0db7e696dade7f50043e791e3db8e07344973c8`, direct child of tested code.
- Latest branch handoff: `c18e4c078c4742b140bfed0445f092455b971398`.
- PR #33 CI: P7 unit and PostgreSQL/pgvector integration jobs PASS (including dedicated unadapted unit/validator and PostgreSQL integration steps); Evaluation Pilot Harness PASS. P8 and Compose jobs were in progress at review time. CI does not perform genuine Gemini API calls; provider execution relies on separately recorded local live evidence.
- The branch no longer includes the previous full-draft files in its current diff. Old pushed history with earlier full drafts may remain accessible and must be handled according to repository privacy requirements.

## Source-correct facts and observed technical results

The runner uses production `PostgresNarrativeRepository.get_structured_context()` directly, production `SemanticRetrieverService` + pgvector/hybrid-v1, opt-in `WritingService`/balanced-scope packer and genuine Gemini generation. There is no fixture-injected `RepoAdapter`.

The new JSON reports 216 source chunks, 11 Gemini document-embedding adapter calls, 6 query-embedding calls, and 2/2 genuine `gemini-3.8-flash` completions in 2 model attempts (no failures in this small run).

| Case | Cutoff | Entity before→after | Token tier / used | Raw semantic | Final semantic | Overlap deduplicated to recent | Recent | Rules | Drops/overflow | Preview/job hash | Generation latency |
| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: |
| `core_gold:rq-0011` | 32 | 63→19 | 12k / 9,890 | 8 | 3 | 5 | 20/20 | 6/6 | 0/false | equal | 5,810.93 ms |
| `challenge:rq-0025` | 49 | 68→20 | 12k / 11,208 | 8 | 5 | 3 | 20/20 | 12/12 | 0/false | equal | 7,611.31 ms |

Actual source IDs for `rq-0025`: `mem-000164` Ch45 (semantic rank 3), `mem-000172` Ch47 (rank 1), `mem-000176` Ch49 (rank 2). They are ambiguous/contradictory source reports, retrieved by the semantic lane and retained in the **final recent-event lane after deduplication**. This is correctly represented as `retrieval_origin=semantic`, `prompt_retained_lanes=["recent"]`, `dedup_reason=overlap_with_recent`. The unrelated `mem-000167/174/177` are tagged world-rule source memories, separately traced as such. The new validator correctly checks the declared split. Runtime tier/token/drop/overflow fields are read from `preview.token_budget` with required-key guards rather than constants.

The updated six PostgreSQL tests include first-chapter filtering, cutoff/as-of state, event supersession, cross-tenant isolation, normalized latest-five participant IDs, and ambiguous source metadata preservation. The DB-required CI step has PASS rather than a skip, but the test's scope matters below.

## Remaining source-status problem — must resolve before merging/technical acceptance

The runner creates one `EventRecord` per canonical memory and sets `event_metadata.review_status`, `tags`, and `is_ambiguous`. However, it also writes:

```python
"source_status": str(mem.get("status") or "canonical")
confirmation_status="confirmed"
```

The corpus's conflicting cavalry memories use `review_status="ambiguous"`; their `status` can be absent. The runner can therefore mark an ambiguous report `source_status="canonical"` and `confirmation_status="confirmed"` while also retaining ambiguity flags. Production `PostgresNarrativeRepository` serializes `event_metadata` into recent events, and `ContextBudgetPacker.prompt_context()` passes that event payload to the LLM. This is a **conflicting source-status representation in the actual prompt**, not merely an evidence-label issue.

The new `test_ambiguous_source_status_preservation_in_recent_events_and_prompt` manually seeds `source_status="ambiguous"` and `is_ambiguous_ground_truth=True`, but the actual runner instead defaults `source_status="canonical"` and only writes `is_ambiguous`. The test then checks metadata in `repo.get_structured_context()`; it does **not** use runner-derived seed metadata or assert the actual packed `ContextBudgetPacker.prompt_context()` payload. Consequently it proves repository passthrough of already-correct artificial metadata, not correctness of the live runner's materialization-to-prompt path. A reported lexical chronology PASS and short draft snippet do not resolve this contradiction.

**Required focused repair:**

1. Define explicit `confirmed source report` versus `confirmed underlying event` semantics and derive `source_status` from the actual frozen `review_status`/tags, never default an ambiguous memory to `canonical`. Use a single consistently named ambiguity field through EventRecord and MemoryChunkRecord. Decide how `confirmation_status` should represent the report within supported production schema without erasing contradiction.
2. Add a **runner-derived** PostgreSQL test that seeds the Ch45/47/49 reports using exactly the same mapping function as live materialization. Verify `PostgresNarrativeRepository.get_structured_context()` and the final `ContextBudgetPacker.prompt_context(WritingService.preview_context(...))` preserve correct ambiguity and source-status fields and never present the three incompatible claims as undisputed canonical truths. Verify any deduplicated raw semantic report retains its source/ambiguity metadata after promotion to recent.
3. Add validator assertions for per-lane trace agreement with raw/retained ID arrays and for the actually retained report-status metadata, rather than checking only self-reported `is_ambiguous_ground_truth=True` flags. Retain fail-closed missing-field tests.
4. Commit implementation + tests, rerun PR CI; rerun one or two focused live cases **if the altered materialization affects prompt semantics**, then record sanitized evidence separately against the actual clean tested SHA. Do not mutate the existing measured JSON to simulate a new run.
5. Complete P7/P8/Compose checks. Full new-draft source audit remains separate: the current checklist reports lexical/structural PASS, while `future_leakage` and `unsupported_claim` remain NOT_ASSESSED.

### Scope of acceptance

```text
production narrative repository path         OBSERVED
real pgvector/hybrid + provider generation   OBSERVED
correct retrieval/dedup lane provenance      DEMONSTRATED IN RECORDED EVIDENCE
fail-closed routing measurements             IMPROVED / RECORDED
P7 unit + pgvector integration               PASS
Evaluation Pilot Harness                     PASS
P8 / Compose                                 IN PROGRESS AT REVIEW
ambiguous report-vs-fact prompt semantics    NEEDS FOCUSED REPAIR
full unadapted technical acceptance          PARTIAL
new-draft independent content audit          PENDING
bounded provider stability                    PENDING
production default                           legacy-v1 (unchanged)
global balanced activation                   NOT AUTHORIZED
P8-05                                        BLOCKED_PENDING_STABILITY
```

Do not reopen EVAL-01, retune hybrid/packer/embedding contracts, globally enable balanced scope or unblock P8-05 for this narrow repair.

## CI addendum — completed after the initial review

PR #33 GitHub Actions finished successfully on head `c18e4c078c4742b140bfed0445f092455b971398`:

- P7 Semantic Memory Foundation: run `37122744546` — **SUCCESS**, including unit, dedicated unadapted validator and PostgreSQL/pgvector integration (with the new dedicated PostgreSQL integration step), and Compose smoke.
- P8 Cutover and Migration: run `37122744719` — **SUCCESS**, including unit, PostgreSQL integration, frontend, rollback rehearsal, cleanup gate and Compose smoke.
- Evaluation Pilot Harness: run `37122744590` — **SUCCESS**.

A review comment has been posted on PR #33 requiring the source-status/materialization-to-prompt repair. The all-green CI removes the CI blocker for the **currently tested code** but does not resolve the semantic gap in the test or approve merging as-is. After the focused fix, rerun CI and a narrowly scoped live provider test if the generated prompt changes. Neither these CI runs nor the two local Gemini completions establish bounded provider stability or independent full-draft quality.
