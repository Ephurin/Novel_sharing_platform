# CTX-RD-01 — Astra Frozen-Source Repair Review

## Verdict

**FROZEN_SOURCE_REPLAY_EVIDENCE_ACCEPTED_WITH_QUALIFICATION — FULL_SOURCE_PROVIDER_RETRIEVAL_AND_CONTENT_REVIEW_PENDING**

This review accepts the corrected **frozen-source replay** as functional evidence for scoped packing and real Gemini generation on source-derived context. It does **not** establish live PostgreSQL/pgvector semantic retrieval over the same frozen corpus, complete narrative-quality acceptance or readiness to switch the global production default.

## Source of truth and commit lineage

- Code-before-evidence commit: `2dabf3e4d921ccbc6538720bb8997d0bf585357a`.
- Corrected evidence commit: `f18c561a05af14c407da0b4044f0d5e39360319f` (direct child of the tested code commit).
- CI/summary correction PR: [#31](https://github.com/Ephurin/Novel_sharing_platform/pull/31).
- Merge commit: `406ab3fe5f2a18dae90a9a5dd652cd83df191b36`.
- P7 CI run: `36989210006` — PASS on unit/non-Postgres regressions, evidence validator and its self-test, source-replay runner syntax, live PostgreSQL/pgvector integrations and Compose smoke. CI does not call Gemini APIs.

Evidence:
- `docs/development/CTX-RD-01-OPT-IN-CANARY/real-source-canary.json`
- `docs/development/CTX-RD-01-OPT-IN-CANARY/canary-generation.json`
- `docs/development/CTX-RD-01-OPT-IN-CANARY/summary.md`

## Validated replay facts

| Case | Routing tier | Entities before/after | Semantic | Recent | Rules | Drops | Overflow | Hash parity | Checklist |
| --- | ---: | ---: | --- | --- | --- | ---: | --- | --- | --- |
| `core_gold:rq-0011` | 12k | 63 -> 21 | 8/8 | 20/20 | 6/6 | 0 | false | true | PARTIAL (chronology/causality) |
| `challenge:rq-0025` | 12k | 68 -> 20 | 8/8 | 20/20 | 12/12 | 0 | false | true | PASS by automated lexical checks |

World rules are retained by identity and count; the packer may reorder locked rules before unlocked rules.

The corrected replay evidence records seven Gemini model attempts: two succeeded and five failed (429/503), with completed generation jobs and effective `models/gemini-3.8-flash`. These are adapter-level records, not an independent provider billing log.

Source-derived inputs were loaded from `Frozen_v1`, `Batch_7`, the accepted runtime retrieval baseline and the EVAL-01 package builder. However, the runner passes the selected package and ranked matches through `SourceRepoAdapter` and `SourceRetrieverAdapter`; `source_grounded_live_vector_query` is explicitly `NOT_DEMONSTRATED`. The separate previously accepted real-provider staging and synthetic canary exercised real embedding/provider and PostgreSQL functionality, **not** their complete joint path over this original corpus.

## Corrections now accepted

- Exact tested code commit precedes evidence commit, with clean-tree preflight enabled by default.
- Evidence explicitly labels methodology `frozen_source_replay_with_retrieval_adapter`.
- The aggregate checklist verdict correctly reports `PARTIAL` because `rq-0011` chronology/causality remains PARTIAL.
- The `rq-0025` automated check requires chapter 45/47/49 mentions in order and conflict wording.
- Future-leak and unsupported-claim judgments are `NOT_ASSESSED`, rather than unconditional PASS/NONE.
- Synthetic pressure case reports actual 20k tier and preserves all original measurement and failure records.
- Validator passes on the committed evidence, but tests consistency of recorded assertions, not independent source-fact correctness.

## Remaining gate

1. Independently review the full `rq-0011` draft against the canonical frozen source. Do not promote lexical mentions to proof of correct causality. Record PASS/PARTIAL with concrete source references and reasoning. Review the `rq-0025` chapter 45/47/49 relationship against canonical facts beyond lexical presence if seeking a source-status/chronology quality claim.
2. For a **full source-grounded end-to-end** claim, use a disposable isolated staging PostgreSQL/pgvector database populated with the source-derived memories, genuine version-matched `gemini-embedding-2-768-v1` document and query embeddings, real `SemanticRetrieverService` + `hybrid-v1`, production `WritingService` + `balanced-scope-v1` and real provider generation. Explicitly compare actual retrieved IDs and scope/packing outcomes; do not hardcode baseline matches.
3. Preserve chapter cutoff, supersession, tenant isolation, explicit above-24k unresolved/fail-closed and immediate legacy rollback. Capture provider 429/503 attempts separately from completed generation count.
4. Keep opt-in staging only until full-source end-to-end and a bounded stability/quality review are complete.

No new sealed blind EVAL experiment is required solely for this gate.

```text
frozen-source replay             ACCEPTED WITH QUALIFICATION
full source-provider end-to-end  NOT YET DEMONSTRATED
rq-0011 chronology review       PARTIAL / MANUAL REVIEW REQUIRED
opt-in balanced staging         AUTHORIZED
global balanced default         NOT AUTHORIZED
production default              legacy-v1
P8-05                           BLOCKED_PENDING_STABILITY
```
