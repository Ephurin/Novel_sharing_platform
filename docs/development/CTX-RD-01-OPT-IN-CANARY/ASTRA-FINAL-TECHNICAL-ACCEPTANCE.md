# CTX-RD-01 — Astra Final Technical Acceptance (Qualified) / PR #33

## Decision

**UNADAPTED_PRODUCTION_NARRATIVE_TECHNICAL_E2E_ACCEPTED_WITH_QUALIFICATION — PR #33 MERGED.**

This decision accepts the tested, source-grounded technical pipeline for the two bounded Frozen_v1 canary cases; it does **not** claim successful independent manuscript-quality review, real Flash-Lite provider execution, bounded provider stability, or production default activation.

PR: https://github.com/Ephurin/Novel_sharing_platform/pull/33  
Merge SHA: `30b0b0e816bdbab147b9d8ba954a831561ba3ec4`  
Reviewed PR head: `47d404072ec69196695b49b49e3c8d3c801ee49c`  
New run's tested **3.8 Flash** implementation SHA: `e9e7def3fcc826a1b543b9c3a0af8c89add9ff3a`  
Original direct-child live evidence: `3645dda04d5bfdb624a781dacbd3776f418d3977`  
Subsequent versioned summary-only erratum: `06fa4d8fa0b30cd215cdaf2f85fd09e685af83ad`

### CI acceptance

All CI on PR head `47d4040` completed successfully:
- P7 Semantic Memory Foundation: [37141776894](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37141776894), including new unadapted PostgreSQL tests, validator/unit, pgvector and Compose checks.
- P8 Cutover and Migration: [37141776919](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37141776919), all jobs PASS.
- Evaluation Pilot Harness: [37141776874](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/37141776874), PASS.

GitHub Actions does **not** call the external Gemini generation/embedding API. Authentic provider calls are evidenced only by the separately recorded local live-run manifest.

### Technical scope that passed

- Direct production `PostgresNarrativeRepository.get_structured_context()` without `RepoAdapter`/fixture-injected results.
- Persisted source-derived entities/states/events/participants/world-rule facts and actual Gemini `gemini-embedding-2-768-v1` vectors queried through PostgreSQL/pgvector/hybrid-v1.
- Chapter-first-appearance cutoff, temporal/as-of state, event supersession, tenant isolation and normalized recent participants covered by PostgreSQL tests.
- Shared source-status materialization and runner-derived integration test prove that `mem-000164` (Ch45), `mem-000172` (Ch47) and `mem-000176` (Ch49) remain `source_status=ambiguous` with explicit report-vs-underlying-event semantics all the way through `WritingService.preview_context()` and `ContextBudgetPacker.prompt_context()`. This tests metadata preservation, not universal compliance of future LLM output.
- The three critical Ch45/47/49 memories are raw semantic ranks 3/1/2, but are kept in the **final recent-event lane** after semantic/recent deduplication. Distinct `mem-000167/174/177` remain world-rule-tagged source facts.
- Measured tiers/budgets, raw/retained identities, zero drops and protected overflow, matched preview/job context hashes and two nonempty real Gemini generations were recorded.

### Immutable raw measurements, corrected report interpretation

| Case | Token tier/used | Entities | Semantic raw → retained + recent dedup | Recent | World rules | Context hash | Generation latency |
| --- | --- | --- | --- | --- | --- | --- | ---: |
| `core_gold:rq-0011`, Ch32 | 12k / 10,496 | 63→19 | 8→3+5 | 20/20 | 6/6 | equal | ~88.7s |
| `challenge:rq-0025`, Ch49 | 12k / 11,863 | 68→20 | 8→5+3 | 20/20 | 12/12 | equal | ~33.5s |

The two completed `gemini-3.8-flash` generation jobs required **10 model attempts: 2 successes and 8 failed 503 attempts**. These are descriptive results from a tiny sample, **not** a population-level reliability estimate or accepted provider stability.

Original measured case values and draft hashes remain unchanged. The evidence's explicit `erratum_v1` records an amended *summary* due to `rq-0011.checklist.chronology_causality=PARTIAL`:

```text
technical_execution           PASS (qualified)
automated_content_check       PARTIAL
checklist_verdict             PARTIAL
independent_full_draft_review NOT_ASSESSED
provider_stability            NOT_ACCEPTED
```

A validator PASS indicates structural/self-consistency checks of the recorded manifest; it does not independently audit live HTTP provider events, story facts or complete manuscript drafts.

### Model change merged, live verification pending

The canary runners now default to `gemini-3.5-flash-lite`, allow opt-in `gemini-3.1-flash-lite` (`CTX_RD_GENERATION_MODEL` or the unadapted runner's `--generation-model`), and do **not** silently fall back to scarce `gemini-3.8-flash`. Model selection and no-3.8-fallback unit tests are green. **No actual Flash-Lite generation has been attested** by the above historical evidence. `gemini-embedding-2` / 768d/L2 remains unchanged, as do production generation configuration and global context-routing default.

### Immediate follow-on gates

1. **One narrowly scoped live Flash-Lite smoke** from a clean merged SHA, with actual requested/effective model and per-attempt provider log, on isolated PostgreSQL/pgvector staging. Use `gemini-3.5-flash-lite` by default; select `gemini-3.1-flash-lite` only explicitly. Keep previous 3.8 evidence immutable and commit new sanitized Lite evidence separately; do not claim success from CI alone.
2. **Independent full-draft Frozen_v1 audit**, especially Ch27 vs Ch32 of `rq-0011` (currently chronology PARTIAL), and contradictory Ch45/47/49 reports of `rq-0025`. Score future leakage and unsupported claims only after examining complete new outputs; store full drafts in controlled artifacts, not automatically in GitHub.
3. **Bounded opt-in provider stability/availability check** with attempted calls, retries, 429/503 errors, recovery and latency. No automatic change of production defaults or rollout from two demonstrations.
4. After separate technical Lite smoke, content and stability review, decide whether proposing a larger canary or global activation is justified. Until then, `CONTEXT_ROUTING_POLICY=legacy-v1` remains production default; `balanced-scope-v1` opt-in staging only, global activation NOT AUTHORIZED; P8-05 remains `BLOCKED_PENDING_STABILITY`.

Do not reopen closed EVAL-01, alter hybrid/embedding/packer contracts or perform destructive cleanup as part of these narrow gates.
