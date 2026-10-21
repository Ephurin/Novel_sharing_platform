# Contract & Architecture Synchronization — completion report

**Date:** 2026-10-21 (UTC+7). **Branch only:** `codex/ai-copilot-pipeline-test`.  
**Prior independent audit:** [AUDIT.md](AUDIT.md), reviewed source `c01c83d3b3db234da17beeb91841bbcadae4f72b`.  
**Work type:** **documentation only**. No product/runtime source, tests, fixtures, old run evidence, database, cloud provider, GitHub `main` or other branch modified. The branch contains documentation commits after the audit; no new implementation/test claims were generated.

## Authoritative decisions resolved

- **Behavioral contract updated to [WORKFLOW_CONTRACT.md v1.4](../../WORKFLOW_CONTRACT.md)** (2026-10-21). Owner-directed mandatory **P3 complete novel with 100,000–105,000 counted units** from canonical revision readback is the final acceptance gate, after P1 S01–S11, P2 setup/first chapter, and P3 functional probe.
- P3 under Human Entity Review is explicitly **`P3_HITL_CONTROLLER_100K`**. Pauses at `waiting_for_entity_review` with measured author decisions; it does **not** support zero-intervention/fully-unattended claims.
- `P3_UNATTENDED_AUTONOMOUS_100K` is a separate optional claim/run and **not** accepted as a bypass. No unattended entity/canon approval policy was invented or silently authorized.
- Historical 95,000–105,000-word assisted task/results remain unchanged **as historical criteria**. New P3 v1.4 run cannot pass with fewer than 100,000 counted words. Word-count convention (Unicode NFC + whitespace units) remains unchanged.

## Audit findings disposition

| Finding | Documentation disposition | Evidence / remaining action |
|---|---|---|
| CA-01 P3 terminal 100k not mandatory | **DOC_RESOLVED** | Contract v1.4; README/TASK/AGENT_GUIDE/EVALUATION; P3 protocol. Artifact remains NOT_RUN. |
| CA-02 HITL vs unattended contradiction | **DOC_RESOLVED** | Two modes, separate claims/policy, primary HITL run; auto-policy beyond HITL NOT_ACCEPTED. |
| CA-03 pipeline map outdated | **TRANSPARENTLY VERSIONED, NOT REGENERATED** | Old map tagged historical; [current delta](../../architecture/CURRENT_DELTA_2026-10-21.md). Requires fresh code+evidence review **after Wave 1D** to regenerate HTML/JSON/map/QA; no false status rewrite. |
| CA-04 obsolete present-tense architecture | **DOC_RESOLVED** | New [ARCHITECTURE.md](../../../ai-service/docs/ARCHITECTURE.md) code-derived with source SHA, old text preserved as `ARCHITECTURE_PROTOTYPE_LEGACY.md`. |
| CA-05 old UC flow missing entity gate | **DOC_RESOLVED** | `ai-service/docs/PIPELINE.md` adds v1.4 P1/P2/P3 diagrams; UC-01/02/03 diagrams marked historical. |
| CA-06 target API confused with current route | **DOC_RESOLVED AT ROUTE LEVEL** | [source-inspected API matrix](../../../ai-service/docs/CURRENT_API_IMPLEMENTATION_MATRIX.md), `API_CONTRACTS.md` warning; payload/runtime compatibility still requires E2E. |
| CA-07 assisted API hybrid vs UI acceptance | **DOC_RESOLVED** | `SHORT_LOOP_TEST.md`, `TASK.md`, `AGENT_GUIDE.md`, `API_ADAPTER.md`, `PROMPT_RUN_TEST.md`; API mutation never substitutes P1 UI. |
| CA-08 test gateway mistaken for architecture | **DOC_RESOLVED, TECH BLOCKED** | Current architecture and delta explicitly separate budget gateway/browser tools as test harness. Wave 1D still unverified. |
| CA-09 candidate → official memory blurred | **DOC_RESOLVED** | Current architecture separates hints, proposals, `entities_reviewed`, canon, planned future and retrieval; `NARRATIVE_MEMORY_AUDIT.md` v1.4 reference. |
| CA-10 P2 blueprint as default | **DOC_RESOLVED** | Current `PIPELINE.md` and contract clarify `mode=extract` vs `mode=blueprint`, M0 vs M-FIRST. |
| CA-11 recall, semantic and quality confused | **DOC_RESOLVED** | Separate evaluation/gates and P3 protocol; no unverified claim of provider/semantic E2E success. |
| CA-12 P3 code/probe vs 100k artifact | **DOC_RESOLVED** | Mandatory terminal gate and reproducible baseline/independent review in P3 protocol. Long-run NOT_RUN. |

## Files updated or added

1. **Behavioral/acceptance**: `WORKFLOW_CONTRACT.md`, `README.md`, `TASK.md`, `AGENT_GUIDE.md`, `SHORT_LOOP_TEST.md`, `EVALUATION.md`, `NARRATIVE_MEMORY_AUDIT.md`, `P3_100K_EVALUATION_PROTOCOL.md`, `PROMPT_RUN_TEST.md`, `PROMPT_REVIEW_PIPELINE.md`, `promt_.md`.
2. **Architecture and API**: `ai-service/docs/ARCHITECTURE.md`, `ARCHITECTURE_PROTOTYPE_LEGACY.md`, `PIPELINE.md`, `CURRENT_API_IMPLEMENTATION_MATRIX.md`, `API_CONTRACTS.md`, `ADRS.md`, `README.md`, `USE_CASES.md`; `docs/API/ai-copilot-api.md`.
3. **Pipeline map**: `architecture/AI_PIPELINE_MAP.md` disclaimer; `architecture/CURRENT_DELTA_2026-10-21.md`; `architecture/README.md`.
4. **Active handoff**: `ACTIVE_GEMINI_TASK.md` and `P1_WAVE_1D_INTEGRATION_REPAIR_TASK.md` now explicitly read **v1.4**; Wave 1D remains **OFFLINE ONLY**, original provider authorization has expired and is not renewed.

No locked gold, test run, historical evidence, generated HTML/JSON, implementation or branch merge changed.

## Static verification performed by reviewer

- Read/documented the source declarations in `backend/src/app.ts`, `ai-gateway.routes.ts`, `chapters.routes.ts`, `ai-service/api/narrative_routes.py`, `revision_analysis_service.py`, `bootstrap_service.py`, P3 controller, and test gateway/browser driver at reviewed baseline SHA.
- Verified all new relative Markdown links across **24 changed source/doc files (83 relative references)** against the repository tree at branch HEAD before final minor ADR/readme annotation. No missing references detected in those checks.
- Compared updated branch to original baseline `c01c83d`: **documentation-only** changes; `main` unchanged. No unit tests/build/real-provider requests run because this patch is document-only; E2E statuses remain unchanged.
- Historic `AI_PIPELINE_MAP.md` **not regenerated** because Wave 1D source/evidence review has not completed. Existing map status labels are historical; its JSON/HTML QA likewise remain historical.

## Open technical gates — intentionally not relabeled

- P1 S01 LIVE_UI NOT_VERIFIED (prior API import only); S02 real-provider failed before Wave 1B offline prompt fix; S03–S11 NOT_RUN. Next integration verification belongs to **Wave 1D**, offline-first.
- Global provider budget gateway (Gemini native SDK, ticket validation, embeddings/effective egress, cost liability), real browser action provenance, strict revision/hash/replay guards remain code/evidence work, **not fixed by documentation**.
- P2 idea flow, P3 controller and terminal 100k artifact are **NOT_RUN** in staged v1.4 acceptance. No live calls are authorized by this doc commit.

## Next actions

1. Gemini finishes Wave 1D **on this same branch**, with no paid provider calls. Reviewer audits code diff and actual fake-upstream/browser evidence.
2. Only after technical blockers are closed, request **fresh explicit user authorization** for bounded provider-backed P1 S01–S11, and later P2/P3.
3. When Wave 1D tested SHA and evidence are available, regenerate architecture map and QA as a **new dated snapshot**. Do not retroactively mark 2026-10-20 issues fixed.
4. Run P3 protocol only after functional gates, with declared intervention policy and honest experimental comparison.

**Overall document status:** `DOC_SYNC_COMPLETED_WITH_VERSIONED_SNAPSHOT_DEBT`. No claim that product acceptance was achieved by editing documents.
