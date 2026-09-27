# EVAL-01D — Provenance-Aware Generation A/B

Status: EXPERIMENT HARNESS  
Production code change: NONE  
Live provider required: Gemini  
Quality scoring: blind human review after evidence capture

## Question

Does the compact provenance metadata introduced by EVAL-01C-PROV help the generation model handle replay/origin/chronology cases more accurately when retrieval candidates are held fixed?

## Controlled A/B

Both conditions use the same:

- frozen query;
- chapter cutoff;
- accepted runtime top-10 hybrid candidates;
- candidate order;
- memory content;
- hybrid/semantic/component scores;
- 12k ContextBudgetPacker;
- production writing prompt renderer;
- model;
- temperature;
- constraints.

Only metadata differs.

### Condition A — pre_provenance

Metadata matches the projection available before EVAL-01C-PROV:

- event_type;
- chapter_number;
- source_type;
- importance_score.

### Condition B — post_provenance

Condition A plus compact provenance:

- confirmation_status;
- memory_id;
- chapter_title;
- tags;
- status;
- review_status;
- supersedes_id when present.

The harness fails before live calls if stripping the newly added provenance fields from B does not reproduce A exactly, or if packed candidate IDs/order differ.

## Cases

1. core_gold:rq-0011 — sword origin vs chapter-32 replay.
2. challenge:rq-0023 — first Pillar No. 2 destruction vs later replays.
3. challenge:rq-0025 — first three-thousand-cavalry burial vs later replay.
4. core_gold:rq-0036 — full sword lifecycle while excluding replay origin.
5. core_gold:rq-0010 — negative control for a non-provenance causal/temporal error.

Default live design:

- model: gemini-3.5-flash-lite;
- temperature: 0.0;
- repeats: 3 per condition/case;
- total calls: 30;
- one fixed local key slot for the entire run;
- same-key exponential backoff only;
- no key rotation;
- exact model REST call, no fallback model.

## Production renderer

Prompt construction uses:

core.llm_service.LLMService.generate_writing_draft

A capture subclass records the exact production system/user prompt without provider access.

The captured prompt is then sent through:

core.llm_client.LLMClient

This keeps the production prompt renderer while enforcing the exact requested live model and preventing silent provider/model fallback.

## Evidence

Live run writes:

docs/development/EVAL-01D-PROVENANCE-GENERATION-AB/
  runtime-config.json
  prompt-diff-audit.json
  raw-generations.json
  review-blind.json
  condition-key.json
  review-rubric.md
  latency-cost.json
  summary.md

## Blind-review protocol

Astra must review review-blind.json before opening condition-key.json.

For each X/Y output:

- canonical/earliest answer correct: PASS | PARTIAL | FAIL;
- replay/ambiguous handling: PASS | PARTIAL | FAIL;
- chronology/causality: PASS | PARTIAL | FAIL;
- future leakage: NONE | PRESENT;
- unsupported claim: NONE | PRESENT;
- completeness: PASS | PARTIAL | FAIL.

The harness must not self-score.

After blind review is committed/preserved, Astra may open condition-key.json and aggregate findings by condition.

## Decision rule

Do not implement a dual-lane prompt policy merely because provenance exists.

A production prompt/context change is justified only if the blinded live experiment shows a repeatable improvement on provenance-relevant cases without material degradation on the negative control.

Possible outcomes:

- post_provenance materially better -> propose narrow prompt/context experiment;
- no meaningful difference -> provenance may be redundant with enriched memory summaries;
- mixed -> expand evaluation before implementation;
- worse -> do not expose/use provenance automatically.

## Non-goals

Do not:

- change retrieval candidates or rank order;
- change hybrid weights;
- change embedding model/version;
- alter frozen labels;
- add new production prompt logic during this experiment;
- rotate API keys to bypass quota;
- self-score generation;
- claim broader generation quality from five cases.
