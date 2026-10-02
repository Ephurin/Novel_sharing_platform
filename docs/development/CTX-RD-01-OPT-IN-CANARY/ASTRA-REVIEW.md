# ASTRA REVIEW — CTX-RD-01 Bounded Opt-In Canary

## Verdict

**TECHNICAL_CANARY_PASS_ON_SOURCE_INSPIRED_FIXTURES — REAL_SOURCE_CANARY_PENDING**

The current report is suitable as evidence of functional routing/generation on an isolated PostgreSQL/pgvector staging environment using genuine Gemini embedding and generation providers. It does not fulfill the requested **real-novel/source-grounded canary**, does not establish generation-quality parity with legacy, and does not authorize a global default switch.

Evidence is currently on branch `astra/ctx-rd-01-opt-in-canary`, commit `53a5177cd00760a338db2094cef678a2548a2918`, one evidence commit ahead of the merged PR #30. Do not mistake the merged PR #30 code for merged evidence.

Code SHA: `5d3d5a29ac5b8dcb0b405af3f332701d09eca331`.

PR #30 merge SHA: `5c037242b93d359f072ec06b7d31ff28d983feb7`.

The tested and merged code have the same Git tree SHA `bd09f533961b91390a5282080d97e12a7fbe6519`. Evidence commit is a direct child of the tested SHA, so the code/evidence lineage is coherent.

CI on PR #30 head: P7 `36960837974` SUCCESS; P8 `36960837986` SUCCESS.

## Confirmed narrow functional results

The manifest reports genuine `gemini-embedding-2-768-v1`, 768d, L2-normalized, 4 document-adapter calls embedding 52 items and 9 query-adapter calls.

Three generation jobs completed with the effective model `models/gemini-3.8-flash` and local fallback disabled.

Actual per-case results from `canary-generation.json`:

```text
normal_scene_ch35                  tier 12k   entities 25 -> 4
repeated_history_rq0025_ch49       tier 12k   entities 25 -> 6
pressured_context_tier16k          tier 20k   entities  5 -> 5
```

Each case reports exactly preserved semantic IDs 8/8, recent IDs 20/20 and world-rule IDs 4/4, zero dropped artifacts, no protected overflow, and matching preview/job context hashes. The pressured case is explicitly deterministic and validates escalation to 20k, not 16k.

Recorded safety checks report zero future/superseded/cross-tenant participant leakage, fail-closed above 24k, semantic fallback and feature-flag rollback. This is evidence limited to the synthetic test corpus and existing automated integration coverage.

The recorded model attempt arrays are *cumulative* across the three cases because the same instrumented LLM instance is reused. The final array contains **8 attempts total: 3 successful, 5 failed** with 429/503 provider errors. The summary phrase `8 (all success)` is incorrect. Successful eventual generation is not proof of low-error/low-latency provider operation.

## Acceptance gaps

### 1. Corpus provenance is incorrectly labelled

The canary code `scripts/run_ctx_rd_01_opt_in_canary.py` does **not** read the actual Aethelgard manuscript, Frozen_v1 memories, Batch_7 entity records, or EVAL-01O source-grounded packages when constructing its normal/rq-0025 test database.

`setup_canary_dataset()` manually authors 25 character specifications, four world rules and 49 synthetic historical event summaries, plus additional fabricated future/superseded test rows.

The labels `real_novel_aethelgard` and `real_novel_aethelgard_rq0025` therefore overstate provenance. These cases are `source_inspired_synthetic_aethelgard` and `source_inspired_synthetic_rq0025`, even though the Gemini providers and PostgreSQL execution are genuine.

### 2. The rq-0025 case does not exercise the targeted regression

Its submitted instruction asks about the formation and initial 3,000-cavalry strength. It does not require the generator to retain the chapter-45 burial, chapter-47 repeated burial and chapter-49 incompatible continuation in the same answer. A completed job on this prompt cannot be interpreted as verification that the EVAL-01M/O chronology regression is absent on a source-grounded request.

### 3. Reporting and naming inconsistencies

- Pressure case is named `pressured_context_tier16k` but selected **20k**. Rename to a tier-neutral case label; do not change the measured tier.
- For rq-0025, the summary states 25 -> 5 entities, while the JSON source records **25 -> 6**.
- The summary calls all 8 model attempts successful; the manifest records 5 failed attempts and 3 successful attempts.
- The legacy control currently compares context preview only; no legacy-generation quality comparison is provided.
- The report lacks a source-grounded evaluation of the generated prose; nonempty output does not establish correct narrative chronology or source-status handling.

These corrections must preserve the recorded raw evidence, not alter measured values to match expectations.

## Decision

```text
synthetic provider-path functional canary    PASS
real-source Aethelgard canary                NOT DEMONSTRATED
legacy-vs-balanced generation quality        NOT DEMONSTRATED
20k deterministic tier escalation           OBSERVED
global balanced default switch              NOT AUTHORIZED
production default                          legacy-v1
P8-05                                       BLOCKED_PENDING_STABILITY
```

## Narrow next action

1. Correct the fixture-origin labels, pressure-case name and summary mismatches in a new evidence correction commit on the existing canary branch. Preserve the raw measurement arrays, hashes, tiers and failed-attempt records unchanged. Update the validator to distinguish actual source-grounded from source-inspired fixtures.
2. For the *real-source* requirement, reuse existing accepted data: `.data/Frozen_v1/memory_chunks_canonical.json`, `.data/Frozen_v1/retrieval_queries.json`, `.data/Batch_7/entities.json`, and the source_1x construction in `scripts/run_eval_01o_sealed_live_relevance_density.py` and `scripts/run_eval_01g_full_context_pressure.py`. Load provenance-grounded context into an isolated staging setup without editing the frozen corpus and without overwriting valuable novel data.
3. Run one or two targeted, opt-in production-path cases: a NORMAL case and the *actual* rq-0025 chronology prompt or equivalent source-grounded query requiring preservation of chapter 45 -> 47 -> incompatible chapter 49. Explicitly record provenance of original memory/entity/event IDs. Reuse existing materialized embeddings where versions and isolation allow; do not silently claim a synthetic adapter is a real provider.
4. Capture actual job route/hash, lanes, drops, overflow, effective model and per-case attempt deltas. Include a small source-grounded correctness checklist; where a legacy comparison is reported, distinguish legacy preview from actual legacy generation.
5. Run CI for any harness changes before adding corrected evidence. An additional sealed EVAL A/B is not required. If actual source-based execution is unavailable or quota-blocked, report `PARTIAL` rather than another synthetic `real_novel` PASS.

Do not activate balanced routing globally; opt-in staging remains authorized. Do not change P8-05.
