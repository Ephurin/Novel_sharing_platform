# Active Project Handoff — CTX-RD-01

## Current canonical state

```text
EVAL-01                            CLOSED
CTX-RD-01 implementation           MERGED
Real-provider staging              ACCEPTED
Synthetic provider-path canary     FUNCTIONAL PASS
Frozen-source replay               ACCEPTED WITH QUALIFICATION
Real-source pgvector semantic path OBSERVED / EVIDENCE PARTIAL
Unadapted full production E2E      NOT YET DEMONSTRATED
Opt-in balanced-v1 staging         AUTHORIZED
Production default                 legacy-v1 (UNCHANGED)
Global balanced-v1 activation      NOT AUTHORIZED
P8-05 destructive cleanup          BLOCKED_PENDING_STABILITY
NEXT                               E2E EVIDENCE/CI REPAIR
```

## Latest Astra review — full-source E2E branch

**Read this review first:**
`docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FULL-SOURCE-E2E-REVIEW.md`.

Review commit: `4760194f6b7f29bdf1710d598615914be3a70cc5`.

Development branch: `astra/ctx-rd-01-full-source-e2e`, reported head `7a777b77bfb397f198d7c89ec568f6d9fdb961ce`.

Implementation code SHA: `6e6f26e7b308241f40eba953496c849778301ef4`.
Evidence child commit: `6fe4a6a9e8c67fb7480ac3fc9aa78ba2dd2f3734`.
Evidence: `docs/development/CTX-RD-01-OPT-IN-CANARY/full-source-e2e.json` (on development branch, **not yet merged**).
Targeted content review: `docs/development/CTX-RD-01-OPT-IN-CANARY/TARGETED-CONTENT-REVIEW.md` (reviews earlier replay; not independent full-text audit of new E2E jobs).

**Verdict:** `REAL PGVECTOR + GEMINI SEMANTIC PATH OBSERVED; MIXED-PROVENANCE E2E PARTIAL — ACCEPTANCE BLOCKED PENDING EVIDENCE AND CI REPAIR`.

The live run populated frozen source-derived 216 memory chunks and generated genuine Gemini 768d L2 document embeddings stored in staging pgvector; it queried through production `SemanticRetrieverService` + `HybridRanker`, routed via opt-in `WritingService` and completed two real `gemini-3.8-flash` generations. This is a meaningful improvement over preselected-match replay.

Recorded results:

```text
rq-0011  tier 12k  entities 63 -> 15; mem-000089, mem-000110 top 1/2
rq-0025 tier 12k  entities 68 -> 18; Ch45/47/49 pivotal memories absent from semantic top 8
both     8 semantic, 20 recent, all rules retained; 0 drops; no protected overflow
both     preview/job context hash match; 2 successful generation jobs
model attempts 10 total: 2 success, 8 failed (429/503)
```

The critical rq-0025 memory IDs `mem-000167` (Ch45), `mem-000174` (Ch47), `mem-000177` (Ch49) were preserved in **preassembled world rules** rather than retrieved as semantic top 8. A chronology-correct draft does not prove those memories were recovered by the semantic lane.

### Evidence/implementation blockers

1. `embedding.document_calls` and `embedding.query_calls` are both **0** in the committed JSON because the runner reads nonexistent attributes. The actual instrumented provider exposes `document_provider_calls` and `query_provider_calls`. Repair exporter and validator. Distinguish wrapper invocations from HTTP retries.
2. The runner's `--dry-run` uses fake embedding/LLM but still writes `FULL_SOURCE_E2E_DEMONSTRATED`, sets mock generation completed and fabricates a model success. The new unit test even asserts this false live verdict; it also runs DB-dependent operations without a PostgreSQL service in the P7 unit job. Dry-run must never be accepted as live evidence, and tests must not depend on an unprovisioned DB.
3. The **semantic lane** uses real pgvector, but structured entities/events/world rules come from `eval01g.build_package()` through inline `RepoAdapter`. The test has not exercised production `PostgresNarrativeRepository.get_structured_context()` for the source corpus. Describe this as a **mixed-provenance source E2E milestone** until the real structured-context repository lane is tested.
4. The recorded `retrieved_semantic_ids` are taken from packed preview and copied as `semantic_retained_ids`; raw pre-pack retrieval identity is not independently captured in this run. Record both independently.
5. The new E2E content-checklist PASS is a lexical heuristic; the source-grounded targeted review refers to earlier replay output, not the current two full E2E drafts. `future_leakage` and `unsupported_claim` are `NOT_ASSESSED`. The 8/10 failed provider attempts and ~112-second normal case require a bounded stability review before default activation.
6. There was **no PR and no CI on the four new branch commits** at the time of review. Do not merge existing branch changes without fixing the dry-run false-positive and test behavior.

### NEXT — Gemini / Antigravity, focused repair

Work on a focused PR branch based on the latest `main`; cherry-pick only the relevant E2E changes, **not** outdated handoff text. Commit fixes before running a new smoke:

- Correct embedding call-count export and add nonzero live-provider call validations.
- Make `--dry-run` explicitly `DRY_RUN_ONLY`, with no invented successful real model calls; move DB-backed tests to the integration job or mock their dependencies for unit tests.
- Decide scope of the next acceptance: if claiming *full* production E2E, persist and load world rules/events/entities via production `PostgresNarrativeRepository.get_structured_context()`, with chapter cutoff, supersession, tenant and normalized participant metadata. Otherwise explicitly report partial mixed provenance.
- Capture raw retrieval IDs before packing and distinguish semantic vs rule-lane origin for rq-0025. Preserve source IDs/cutoffs and confirm no drops/overflow.
- Review actual new full E2E generation drafts against frozen canonical facts if making a quality claim. Mark unreviewed aspects `NOT_ASSESSED`; do not reopen EVAL-01O.
- Obtain CI via PR; rerun **one targeted live smoke** on a clean exact SHA (or report BLOCKED on quota), commit sanitized evidence separately and append a concise execution report to this handoff.

Preserve production default `CONTEXT_ROUTING_POLICY=legacy-v1`, opt-in staging only, current model/hybrid contracts and P8-05 `BLOCKED_PENDING_STABILITY`. No global activation is authorized.

## Historical canonical references

- `docs/development/EVAL-01-FINAL-CLOSURE.md`
- `docs/development/ARCH-CTX-RD-01-RELEVANCE-DENSITY-PROPOSAL.md`
- `docs/development/CTX-RD-01-IMPLEMENTATION-REVIEW.md`
- `docs/development/CTX-RD-01-REAL-PROVIDER-STAGING/ASTRA-REMEDIATION-FINAL-REVIEW.md`
- `docs/development/CTX-RD-01-OPT-IN-CANARY/ASTRA-FROZEN-SOURCE-REPAIR-FINAL-REVIEW.md`

Earlier PRs #27–#31 have been merged; historical evidence and its original measured metrics remain in their respective canonical documents.
