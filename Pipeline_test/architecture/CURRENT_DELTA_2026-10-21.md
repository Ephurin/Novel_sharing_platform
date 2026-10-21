# AI pipeline — current architecture delta vs 2026-10-20 source snapshot

**Created:** 2026-10-21 (UTC+7).  
**Old generated map:** `AI_PIPELINE_MAP.md` (snapshot at `94d5072 + working tree`). Retained unchanged for provenance; status labels are **frozen historical findings**.  
**New docs-only baseline:** `c01c83d3b3db234da17beeb91841bbcadae4f72b`, reviewed for Wave 1D assignment. This delta reflects source review at that SHA, not code produced by Wave 1D.  
**Accepted behavior:** [WORKFLOW_CONTRACT.md v1.4](../WORKFLOW_CONTRACT.md).  
**Current code-layer architecture:** [ai-service/docs/ARCHITECTURE.md](../../ai-service/docs/ARCHITECTURE.md).  
**API source matrix:** [CURRENT_API_IMPLEMENTATION_MATRIX.md](../../ai-service/docs/CURRENT_API_IMPLEMENTATION_MATRIX.md).  
**Reviewer finding:** [2026-10-21 Contract & Architecture Audit](../reviews/2026-10-21-contract-architecture-gpt6/AUDIT.md).

## 1. Delta: what changed in understanding since snapshot

| Map node/area | Historical map or earlier state | 2026-10-21 status/evidence | Required before LIVE PASS |
|---|---|---|---|
| **X03** LLM entity verification | opt-in implementation and offline negatives; no real provider evidence | P1 S02 real Flash-Lite failed `ENTITY_VERIFICATION_UNRESOLVED` because prompt told model to fill canonical name for negatives; Wave 1B patched verdict-specific prompt and strict repair; offline regressions reported 76 PASS | Retest with genuinely guarded real provider after separately approved budget window, inspect raw negative decisions, not only schema PASS |
| **X09/X04** entity review/freeze | code exists, expects `waiting_entity_review` then `entities_reviewed` | No source-grounded full S01–S11 LIVE_UI success; historical API S01 incorrectly labeled LIVE_UI then corrected | Browser clicks + honest action provenance, source/hash/decision inventory, event/fact only after freeze |
| **A01–A04** import | older reports include API-driven imports and UI issues | 2026-10-21 run S01 had API chapter/revision readback, no author-browser trace. Wave 1C replay tests are deterministic only | Real browser author path and read-only server content/readback proof |
| **J02–J05** LLM/provider/budget | provider traces/retries from 2026-10-19, some unknown spend | New test-only `budget_gateway.py`, Compose, ledger. Wave 1C 8 offline tests reported PASS, but Gemini Native direct SDK path/gateway stub, untrusted `X-Budget-Ticket`, embedding and money hard cap coverage remain unverified | Wave 1D genuine app container → guarded gateway → separate fake upstream proof; negative bypass tests; conservative hard USD cost and total attempts enforcement; fresh live authorization |
| **H01–H05** acceptance | historical S01–S11 partial, 100k NOT_RUN | Accepted contract v1.4 now requires **P3 terminal 100.000–105.000 words** on distinct run, whereas older task allowed assisted 95–105k | P1 functional PASS → P2 PASS → P3 controller probe PASS → P3 mandatory long run and independent full-book review |
| **G01–G09** controller | source-coded, P3 long-run untested | Contract distinguishes P3_HITL_CONTROLLER_100K (author gate) from not-yet-approved P3_UNATTENDED_AUTONOMOUS_100K; no zero-intervention evidence | Observe stopped objective at `waiting_for_entity_review`; later resume, no duplicate revision; eventual ending and complete memory audits |
| **E02–E07** semantic memory/context | derived embedding/ranker and packed context implemented, semantic LIVE status untested | ADR-012 / P7-03 / P7-04 / P7-05 remain accepted bounded contracts. Wave 1D must cover/disable embedding provider egress and confirm actual prompt context source | Separate structured versus semantic gates; embedding backfill/retrieval/rank traces under temporal cutoff, report disabled lanes NOT_ASSESSED |
| **F03–F09** writing and memory | mixed code/evidence, partially recovered older run | UI controlled author write and new saved revision must trigger analysis; synthetic screenshot/manifest in Wave 1C is not an actual UI session | Real browser trace and source version/readback, correct extraction and memory before next objective |

## 2. State-machine invariants carried into the map

```text
Source revision (immutable/hash)
   -> candidate discovery/LLM verdicts
   -> waiting_entity_review (flag ON)
   -> author keep/reject/edit, version/offset/hash guarded
   -> entities_reviewed (inventory freeze, NOT official canon)
   -> event/fact/state proposals (only reviewed entities)
   -> canon review/materialization
   -> current state/relationship projection
   -> structured + derived semantic retrieval
   -> actual packed generation context
   -> generation/accept into saved draft revision
   -> outbox/analysis (loop)
```

`P3 waiting_for_entity_review` is controller-level suspension, not synonym of per-analysis `waiting_entity_review`. `outbox COMPLETED` or `brain_version` growth is not a semantic completeness or story-completion verdict. Planned objectives are not occurred history.

## 3. Evidence discipline

- `SOURCE_CODE`, `AUTOMATED_TEST`, `LIVE_API`, `LIVE_UI`, `INDEPENDENT_REVIEW` are **distinct**; model/fallback/API budget traces need effective provider evidence.
- Narrative gold `35` assertions is not entity inventory gold. Raw entity/fact output before correction and revised official memory after review require separate metrics and source citations.
- Wave 1B offline regressions and Wave 1C mock gateway/recorded screenshot tests are real unit-test results **within limited scope**. They do not close P1 live UI or full guarded provider gaps.
- As of writing Wave 1D has only been assigned. **Do not convert proposed changes to PASS** until their changes and evidence arrive at a new tested SHA.

## 4. Regeneration policy

`build_pipeline_map.py` is a manually curated map generator, **not an automatic truth detector**. Do **not** regenerate and overwrite issue statuses solely to follow newer code SHA. Once Wave 1D has an independently reviewed code diff + evidence, create the next source-specific snapshot with:
1. exact tested SHA, dirty-worktree status, migration/config/model versions;
2. source paths and independent evidence references for each touched node;
3. separate flags for implementation, offline regression, actual browser UI, real-provider and P3-long artifact;
4. preserved original 2026-10-20 map and issue IDs, without falsifying earlier results;
5. regenerated JSON, Markdown and HTML/QA previews verified together.

Until that happens, this document and the current architecture/API matrix are the **bounded current overlay**, not a new claim that all 87 map nodes have been reverified.
