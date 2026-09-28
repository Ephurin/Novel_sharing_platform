# EVAL-01E — Sealed Provenance Generation A/B

Status: EXPERIMENT HARNESS
Production code change: NONE
Frozen corpus mutation: NONE
Live provider: Gemini
Review protocol: TWO-STAGE SEALED BLIND REVIEW

## Goal

Measure whether compact provenance metadata improves narrative reasoning when the memory text itself no longer contains evaluator-written replay/canonical judgments.

EVAL-01E removes the largest EVAL-01D confound by using a derived neutral context view.

The frozen benchmark files remain unchanged.

## Cases

- core_gold:rq-0011 — sword origin
- challenge:rq-0023 — repeated Pillar No. 2 destruction
- challenge:rq-0025 — repeated cavalry-state history
- challenge:rq-0020 — conflicting attributed battle history
- challenge:rq-0032 — earlier reported interpretation vs later established evidence
- core_gold:rq-0038 — physical seed identity provenance
- core_gold:rq-0010 — negative control for causal-history reasoning

Default live run:

- model: gemini-3.5-flash-lite
- temperature: 0.0
- repeats: 3
- conditions: pre_provenance / post_provenance
- calls: 42
- fixed key slot for whole run
- no key rotation
- no fallback model

## Derived neutral context view

Fixture:

benchmarks/eval01e_neutral_context.json

Rules:

1. Do not modify .data/Frozen_v1.
2. Preserve local event facts and speaker attribution.
3. Remove only evaluator-added cross-memory judgments such as:
   - again / yet again as replay labels;
   - even though this already happened;
   - this is not independently confirmed;
   - source does not explicitly identify X as Y;
   - narrator directly states/frames as an evaluator source-status cue.
4. A/B uses the same neutralized content in both conditions.
5. Only compact provenance metadata differs.

The harness emits a neutralization audit with original/neutral content hashes.

## A/B isolation

Both branches must keep identical:

- task prompt;
- chapter cutoff;
- accepted top-10 candidate IDs/order;
- neutralized memory content;
- component scores;
- context packer;
- production prompt renderer;
- model;
- temperature;
- constraints.

Only post_provenance adds:

- confirmation_status
- memory_id
- chapter_title
- tags
- status
- review_status
- supersedes_id when present

Dry-run fails if stripping those fields from post_provenance does not exactly reproduce pre_provenance context.

## Sealed two-stage protocol

### Stage 1 — capture

Run:

python scripts/run_eval_01e_sealed_provenance_ab.py --stage capture --key-slot 1

The harness writes reviewer-safe evidence only:

docs/development/EVAL-01E-SEALED-PROVENANCE-AB/
  runtime-config.json
  reviewer-blind.json
  review-rubric.md
  neutralization-audit.json
  sealed-state.json
  summary.md

Private state is written locally only:

.eval-private/eval01e-private.json

.gitignore excludes .eval-private/.

Private state contains:

- condition mapping;
- call order;
- raw condition-labelled generations;
- prompt/context hashes;
- latency by condition.

The public sealed-state.json contains SHA256(private_state).

Gemini commits only reviewer-safe evidence.

Gemini must not:

- open reviewer-blind.json to score it;
- reveal condition mapping;
- commit raw condition-labelled outputs;
- commit .eval-private;
- run stage reveal;
- declare a winner.

### Astra blind review

Astra may inspect only:

- reviewer-blind.json
- review-rubric.md

Astra must not inspect:

- .eval-private
- workflow logs containing private state
- condition mapping
- prompt hashes
- condition-labelled raw outputs

Astra commits the blind review before reveal.

### Stage 2 — reveal

Only after Astra blind review commit, Gemini runs on the same local workspace:

python scripts/run_eval_01e_sealed_provenance_ab.py --stage reveal

Reveal performs zero provider calls.

It first verifies:

SHA256(local private state) == sealed-state.json commitment

Then it writes:

- condition-key.json
- raw-generations.json
- prompt-diff-audit.json
- latency-cost.json
- reveal-verification.json

Gemini commits these reveal artifacts.

Astra then maps the frozen blind judgments to conditions.

## Decision boundary

Possible outcomes:

- repeatable post-provenance gain with no negative-control degradation:
  justify a narrower prompt/context experiment;
- no meaningful difference:
  provenance remains infrastructure but no new prompt policy;
- mixed:
  expand benchmark;
- worse:
  do not surface/use provenance automatically.

No result directly authorizes ranking changes or global filtering.

## Guardrails

Do not:

- mutate frozen gold;
- alter retrieval ordering;
- alter hybrid weights;
- change embedding model/version;
- add ANN;
- alter temporal cutoff;
- modify production prompt behavior during this experiment;
- rotate keys to bypass quota;
- reveal mapping before blind review.

P8-05 remains BLOCKED.
