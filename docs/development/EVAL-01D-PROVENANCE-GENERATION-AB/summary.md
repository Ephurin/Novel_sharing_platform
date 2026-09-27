# EVAL-01D Provenance-Aware Generation A/B

- Model: gemini-3.5-flash-lite
- Fixed key slot: slot-1
- Temperature: 0.0
- Repeats per condition/case: 3
- Planned calls: 30
- Successful calls: 30
- Prompt isolation: PASS
- Provider backoff events: 0

## Interpretation boundary

This harness does not score which condition is better.
Review review-blind.json using review-rubric.md before opening condition-key.json.
The A/B branches keep query, cutoff, top-10 candidate IDs/order/content, system prompt,
model, temperature and constraints identical. Post-provenance adds only the compact
metadata fields introduced by EVAL-01C-PROV.

## Out of scope

- No retrieval reranking.
- No hybrid-weight change.
- No embedding/model change.
- No frozen-label change.
- No automatic dual-lane prompt implementation.
- No self-awarded generation score.
