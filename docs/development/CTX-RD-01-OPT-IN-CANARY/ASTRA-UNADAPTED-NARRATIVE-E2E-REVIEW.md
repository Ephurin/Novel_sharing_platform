# ASTRA REVIEW — CTX-RD-01 Unadapted Narrative E2E (source audit)

## Verdict

**UNADAPTED_REPOSITORY_PATH_OBSERVED — ACCEPTANCE BLOCKED_PENDING_SOURCE_PROVENANCE, REAL_METRICS, CI AND PRIVACY_REPAIR**

Reviewed branch: `astra/ctx-rd-01-unadapted-narrative-e2e`, head `b5f3d4ef7967852f63e9ccdd578e47fc70770fee`; branch was three commits ahead and one behind `main` at this review. There is no PR or new branch CI at review time. The branch was based on `c8bb4721608a11650572ff3c074a9255513c1799` and did not incorporate the active Astra directive at `9c6c26d1bbc929469d9037001207fe951123f367`.

Implementation/test commit: `e57f40a0cc9c7c62500a127e03acc05ec36f5278`.
Direct-child evidence, source-review and drafts commit: `1a13e2b47ffb3fe492f0c25dcacf72cde30708b4`.
Execution-only handoff commit: `b5f3d4ef7967852f63e9ccdd578e47fc70770fee`.

The tested-code / evidence-child SHA relationship is coherent. A reported offline validator PASS is not independent source-fact verification.

## Narrow positive functional findings

The new runner directly constructs `WritingService(repository=PostgresNarrativeRepository(...))` and calls production `get_structured_context()` as well as the actual `SemanticRetrieverService` using the isolated source-derived PostgreSQL/pgvector setup. There is no runtime `RepoAdapter` and no `eval01g.build_package()` injection.

The evidence reports 11 Gemini document-adapter calls, six query-adapter calls, 216 chunks, and two completed real `gemini-3.8-flash` generation jobs. The model needed three attempts overall (two successes, one 503). Runtime endpoint is dynamically sanitized to `postgresql+psycopg://localhost:5433/ephurin`.

| Case | Reported tier* | Entities before/after | Raw vs packed semantic | Recent | Rules | Job/preview hash | Observed generation latency |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
| `core_gold:rq-0011`, cutoff 32 | 12k | 80 -> 18 | same eight IDs | 20/20 | 6/6 | equal | ~9.7s |
| `challenge:rq-0025`, cutoff 49 | 12k | 80 -> 20 | same eight IDs | 20/20 | 12/12 | equal | ~28.2s |

*The runner hardcodes tier 12k. Its zero-drop and no-overflow manifest fields are also constants, so these three values are **reported but not independently measured**; they cannot satisfy the packing acceptance checks until exported from `preview.token_budget`.

## BLOCKER A — Critical rq-0025 source-ID error, including prior Astra documents

The authoritative repository source `.data/Frozen_v1/memory_chunks_canonical.json` (and `memory_chunks.json`) provides:

| Historical point | Actual source ID | Actual chapter | Source status/tags |
| --- | --- | ---: | --- |
| First burial report / Ch45 repeat | `mem-000164` | 45 | `narrative_echo`, `temporal_reset`, `do_not_use_as_clean_ground_truth` |
| Second burial / Ch47 | `mem-000172` | 47 | `narrative_echo`, `temporal_reset`, `do_not_use_as_clean_ground_truth` |
| Ch49 cavalry continuation | `mem-000176` | 49 | `force_state_conflict`, `temporal_reset`, `do_not_use_as_clean_ground_truth` |

**Incorrect IDs used in the current runner, validator, trace, content review, branch handoff AND prior Astra reviews:** `mem-000167`, `mem-000174`, `mem-000177`. Those are different real `world_rule`-tagged memories: chapter 46 canyon environmental hazard, chapter 48 direct Earth Vein Core extraction evidence, and chapter 49 solar-artillery protection timing, respectively. They are not the Ch45/47/49 cavalry chronology.

This review is also an **explicit erratum to earlier Astra reviews and handoff** that repeated these wrong IDs. Preserve original historical evidence but correct the current canonical referents; do not silently rewrite raw measurements.

Crucially, the new run's **actual semantic top eight includes all three correct chronology memories**: `mem-000172` at rank 1, `mem-000176` at rank 2 and `mem-000164` at rank 3. The current report's assertion that none of the pivotal chronology memories were retrieved by semantic search is **false**. Rebuild the per-lane trace from the source-grounded correct IDs; do not mistakenly credit unrelated world rules for the narrative chronology.

The three source memories are marked ambiguous/contradictory. Their presence in retrieval does not make any of the incompatible assertions unconditionally canonical. Verify narrative conflict preservation and attribution, not forced reconciliation.

## BLOCKER B — Event and fact materialization does not preserve source meaning/status

The script converts every one of the 216 canonical memories to **two** `EventRecord` rows: a chunk-linked event and a second narrative-progression event with a shifted narrative order. Both are marked `confirmation_status="confirmed"`, including memories tagged `do_not_use_as_clean_ground_truth`, `narrative_echo`, `temporal_reset`, or other ambiguity flags. Memory summaries tagged `world_rule` are also duplicated as event summaries.

The script does select the source's `world_rule`-tagged memories when constructing `FactRecord`; this classification itself is narrow, but the content review then falsely attributes unrelated cavalry events to three world-rule facts. Preserve actual source fact categories and documented provenance. Do not duplicate all source memories as two indiscriminately confirmed story events just to satisfy retrieval. If a chunk requires an event reference for the production SQL join, use an explicitly documented linking mechanism without introducing the same fact twice into narrative history, and preserve source status separately.

The runner sets all 80 Batch_7 entities and their generic current states to `active` before the Ch32 and Ch49 cases. Batch_7 includes `first_chapter` up to Ch61, while production `get_structured_context()` fetches all confirmed entities without a native entity-first-appearance cutoff. This **poses a potential future-entity leakage risk** even when generation text happens not to mention future details. Test actual allowed/retained entities, temporal states, current-vs-as-of projection, chapter cutoffs and cross-tenant isolation instead of inferring safety from two outputs.

## BLOCKER C — Hardcoded measurement and tautological validator

The runner writes:
- `"selected_tier": 12000` (constant, not `preview.token_budget["routing_selected_tier"]`);
- `"dropped_artifacts": 0` (constant, not `preview.token_budget["dropped_artifact_count"]`);
- `"protected_overflow": False` (constant, not `preview.token_budget["protected_overflow"]`);
- `"routing_status": "routed"` (constant).

The validator subsequently requires these author-supplied values, so PASS cannot verify actual routing, drop, or overflow behavior. Export measured values from real preview/job trace and add failing self-tests for tampered or inconsistent measurements. Compare independently retrieved structured/rule/event IDs before vs after packing **by identity and multiplicity**, not only counts. Cross-check latest-five normalized participants against source EventParticipantRecord rows.

The seven existing unit tests do not constitute a real PostgreSQL integration suite for this new runner. Add source-grounded `postgres_integration` coverage of these invariants with the actual repository; obtain PR CI before accepting the implementation.

## BLOCKER D — Privacy of complete drafts and strength of content claims

The evidence commit includes `docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-drafts.json` containing the **complete generated drafts**, and `UNADAPTED-NARRATIVE-CONTENT-REVIEW.md` reproduces both drafts. This contradicts the active direction to keep full drafts in separately controlled local/CI artifacts rather than committing them by default. Avoid copying these files to `main`. Removing them from a future branch head does not erase already-pushed Git history; handle retained history according to repository privacy requirements.

The report's claims of `100% faithful`, `zero hallucinations`, `perfect temporal handling` and `no future leakage` overstate the available independent evidence. Automated lexical/structural checklist PASS and output snippets are not an independent manuscript-level source audit. Revise the review using actual canonical memory IDs and appropriate `PASS/PARTIAL/NOT_ASSESSED` for each narrow source assertion.

## Acceptance boundary and next action

1. Update the development branch from latest `main` and preserve a separate, clean code-before-evidence lineage. Correct the canonical source-ID mapping throughout runner, validator, documentation and historical errata; do **not** rewrite measured retrieval arrays to fit a preconceived rank.
2. Repair event/fact materialization and explicitly preserve `review_status`/ambiguity metadata. Run a chapter-cutoff/first-appearance/tenant/supersession integration test on the actual repository and verify latest-five participant identity.
3. Export true routing/tier/drop/overflow metrics from runtime, and capture independently queried pre-pack vs post-pack IDs for semantic, recent and rules, plus state identity where applicable. Fail closed when a required measured field is missing.
4. Keep full new drafts out of a new PR; store locally or in a controlled artifact and publish hashes, limited snippets and evidence-based content conclusions only.
5. Obtain CI for a PR with code and tests before rerunning **one or two** targeted live cases on a clean exact code SHA. Commit sanitized evidence separately; if provider quota is exhausted, report BLOCKED/PARTIAL.
6. Keep `CONTEXT_ROUTING_POLICY=legacy-v1`, opt-in balanced staging only, global activation unauthorized and P8-05 blocked. Do not reopen sealed EVAL-01 or change hybrid ranking/packer to make the benchmark pass.

```text
unadapted repository invocation       OBSERVED (limited smoke)
real pgvector / Gemini path           OBSERVED (limited smoke)
correct rq-0025 semantic retrieval    ALL THREE CORRECT IDs IN TOP THREE
source-fact/event-status integrity    NOT DEMONSTRATED
actual tier/drop/overflow evidence    NOT MEASURED BY THIS MANIFEST
temporal/tenant/supersession CI       NOT RUN FOR NEW IMPLEMENTATION
new-draft content audit              NEEDS CORRECTED SOURCE REFERENCES
new branch PR/CI                      NOT PRESENT AT REVIEW
full unadapted E2E acceptance         BLOCKED / PARTIAL
global default                        legacy-v1
P8-05                                 BLOCKED_PENDING_STABILITY
```
