# Astra — PR #33 Round 4: source-status repair and unadapted E2E audit

## Decision (2026-10-03)

**SOURCE-STATUS/PROMPT PROPAGATION REPAIR ACCEPTED; UNADAPTED TECHNICAL E2E DEMONSTRATED WITH QUALIFICATION. PR ACCEPTANCE PENDING EVIDENCE-REPORT CORRECTION. NARRATIVE CONTENT AND PROVIDER STABILITY NOT ACCEPTED.**

Reviewed PR [#33](https://github.com/Ephurin/Novel_sharing_platform/pull/33), branch head `b20900378a229583458aa2b89c6b3ce9c6a88790`. This review does not authorize a global default change or P8-05 destructive cleanup. Historical round-1/2/3 raw evidence is preserved; do not overwrite earlier measurements.

### Verified provenance and CI

- Current implementation/real-provider tested SHA: `e9e7def3fcc826a1b543b9c3a0af8c89add9ff3a`.
- **Actual** sanitized JSON evidence commit: `3645dda04d5bfdb624a781dacbd3776f418d3977`. GitHub confirms it is a **direct child** of the tested SHA and modifies only `docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-narrative-e2e.json`.
- Handoff head: `b20900378a229583458aa2b89c6b3ce9c6a88790`.
- **Erratum:** branch `promt.md` lists evidence SHA `3645ddaba0f295e8486940c6600554d6fc487e41`, which does not exist. Replace it with the actual `3645dda04d5bfdb624a781dacbd3776f418d3977`; do not fabricate lineage.
- P7 [run 37136379648](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37136379648): SUCCESS, including unit/validator, the dedicated unadapted PostgreSQL integration step, pgvector and Compose smoke.
- P8 [run 37136379640](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37136379640): SUCCESS, including unit, PostgreSQL, rollback, frontend, cleanup safety gate and Compose smoke.
- Evaluation Pilot Harness [run 37136379629](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37136379629): SUCCESS.
- CI does **not** independently call Gemini. Gemini API execution is evidenced by the local live-run manifest and instrumented adapter/attempt records.

### Accepted narrowly: source-status materialization to prompt

The runner now defines `derive_memory_source_and_ambiguity_status()` and `build_event_record_from_memory()`, shared with the actual PostgreSQL integration test. For contradictory Ch45/47/49 reports (`mem-000164/172/176`) the runner persists `source_status=ambiguous`, `review_status=ambiguous`, `is_ambiguous=true`, `is_ambiguous_ground_truth=true`, and `report_semantics=confirmed_source_report`. Here `confirmation_status=confirmed` attests the authorial source **report** exists; it must not be interpreted as an undisputed truth of the reported event.

The integration test now seeds using the runner's real mapping, reads from `PostgresNarrativeRepository.get_structured_context()`, calls `WritingService.preview_context()` with opt-in balanced scope, serializes `ContextBudgetPacker.prompt_context(preview)`, and asserts these flags exist in the final recent-event payload. This **proves metadata propagation on the tested path**, not that every LLM generation will respect the metadata. The live-run source trace also correctly separates `retrieval_origin=semantic` and `prompt_retained_lanes=[recent]` for those three memories after overlap deduplication.

### Recorded live results

| Case | Cutoff | Tier / used | Entities | Raw semantic → final semantic + dedup into recent | Recent | World rules | Drops/overflow | Hash | Generation latency |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | ---: |
| `core_gold:rq-0011` | 32 | 12k / 10,496 | 63→19 | 8 → 3 + 5 | 20/20 | 6/6 | 0/false | equal | 88,727 ms |
| `challenge:rq-0025` | 49 | 12k / 11,863 | 68→20 | 8 → 5 + 3 | 20/20 | 12/12 | 0/false | equal | 33,492 ms |

The manifest reports 216 source memories, 11 genuine Gemini document-embedding adapter calls and six query-embedding calls. It records **10 LLM attempts: 2 successes and 8 failures (503 ServerError)**. Both jobs eventually completed, but this sample exhibits substantial provider availability/latency risk and is **not** a stability PASS. Counts reflect recorded model attempts and adapter calls, not an independently verified HTTP/billing ledger.

Actual Ch45/47/49 source IDs are `mem-000164/172/176`, retrieved at semantic ranks 3/1/2 and retained in the recent-event lane. Unrelated `mem-000167/174/177` are source-tagged world rules. The test and trace no longer conflate these identities or lanes.

### Remaining reporting error: automatic checklist is NOT entirely PASS

The evidence manifest for **`rq-0011`** declares `checklist.chronology_causality="PARTIAL"`, although `checklist.canonical_source_status_correctness="PASS"`. For `rq-0025`, the recorded lexical/structural criteria are PASS. Nonetheless, the manifest's `summary.checklist_verdict` and the branch `promt.md` claim aggregate PASS / all checklist assertions PASS. The runner computes the summary using **only** `canonical_source_status_correctness`, ignoring the chronology PARTIAL.

This is **not evidence** of a failed production execution, but it is an inaccurate content-acceptance claim. Fix the report/summary logic to distinguish:
1. `technical_execution`: provider, PostgreSQL, provenance, measured routing, hash and generation contract.
2. `automated_content_check`: partial if any required checklist criterion (such as chronology) is PARTIAL.
3. `independent_full_draft_review`: NOT_ASSESSED unless complete drafts were actually compared against Frozen_v1.
4. `provider_stability`: NOT_ACCEPTED/INSUFFICIENT due the recorded 8/10 failed attempts and narrow sample.

Do not change the old raw measured case results or imply `rq-0011` chronology PASS without independently justified new evidence. Either add an explicit, versioned evidence erratum and correct the branch handoff (without rewriting history), or update only report/validator logic in a new code commit with corresponding unit tests and record the original tested SHA faithfully. If you change the execution/prompt path, retest it from a clean SHA with new separate evidence. Do not rerun all 216 embeddings merely to correct reporting.

### PR acceptance and next gates

- **Source-status propagation blocker:** closed for the tested narrow path.
- **Unadapted production technical E2E:** demonstrated, accepted with qualification for the two source-grounded cases.
- **PR #33 merge:** HOLD pending correction of the nonexistent evidence SHA and misleading aggregate checklist PASS. Once fixed, verify the resulting branch CI and lineage before merge; do not import historical full-draft files.
- **Narrative-content acceptance:** PENDING; `rq-0011` chronology PARTIAL in the actual manifest, future-information leakage and unsupported generation NOT_ASSESSED; full current drafts have not been independently reviewed.
- **Operational stability:** NOT ACCEPTED; 8/10 model attempts failed 503, including an ~89s job. Run a bounded opt-in availability/latency canary only after technical and reporting cleanup.
- **Governance:** production `CONTEXT_ROUTING_POLICY=legacy-v1`; `balanced-scope-v1` opt-in staging only, global activation NOT AUTHORIZED; P8-05 `BLOCKED_PENDING_STABILITY`. Do not reopen sealed EVAL-01 or retune ranking/packing to pass this narrow gate.
