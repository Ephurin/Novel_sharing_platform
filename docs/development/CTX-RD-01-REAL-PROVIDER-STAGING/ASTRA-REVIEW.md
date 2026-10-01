# ASTRA REVIEW — CTX-RD-01 Real-Provider Staging

## Verdict

**PARTIAL — REAL PROVIDER PATH OBSERVED; ACTIVATION BLOCKED PENDING EVIDENCE/LINEAGE REPAIR.**

Evidence commit: `2a54cfb27eb24cfcb77de4a1b38e9b0c980307a1`.

Reported tested commit: `9e0f1e88a9a10b924ab0c4636268de84e9faf270`.

Scope of review: `promt.md`, all five staging artifacts, evidence commit diff, the committed staging harness and the production `LLMService` and `WritingService` paths. The evidence validator reports PASS on a **self-reported manifest contract**; it does not independently verify API history or the underlying input/output comparisons.

## Evidence supported

- The staging harness uses `GeminiEmbeddingProvider` for document and query embeddings; records 3 document-wrapper and 2 query-wrapper calls, production embedding version `gemini-embedding-2-768-v1`, and hybrid-v1 retrieval status `ok`.
- The harness invokes generation with `LLM_LOCAL_FALLBACK=false`; a generation job completed with nonempty draft and effective model recorded as `models/gemini-3.7-flash`.
- A balanced preview produced 25 -> 4 entities and selected 12k with 8 semantic, 20 recent and 4 rule objects.
- Deterministic stress fixture selected 16k.
- Rollback, fail-closed and safety booleans were recorded as passing.
- The default setting remained `legacy-v1`; P8-05 remained blocked.

These are encouraging functional results, but the following issues prevent an activation verdict.

## Blocker 1 — tested code SHA does not reproduce the recorded effective model

Evidence declares `9e0f1e8...` as tested SHA, but the evidence commit `2a54cfb...` simultaneously modifies `ai-service/core/llm_service.py`:

- adds `models/gemini-3.8-flash`, `models/gemini-3.7-flash`, and `models/gemini-2.5-flash` to the fallback candidate list;
- begins silently trying another model on `503`, `unavailable`, or `high demand`.

The declared tested commit **did not contain** `gemini-3.7-flash` in its candidate list. In the committed implementation of `LLMService._call_gemini`, successful model selection sets `self.model` to the selected candidate. Consequently, the reported effective `models/gemini-3.7-flash` cannot be reproduced from the exact declared clean commit. The working tree must have differed, or the report's lineage is wrong.

The fallback change is a production behavior change, not a harmless evidence artifact: a transient 503 can silently switch model, with possible cost, capability, reproducibility and output differences. No post-change CI run was attached to the evidence commit when reviewed.

**Required:** review the LLM fallback change separately (prefer restoring the original production policy for this gate), commit all harness/code changes before testing, require a clean working tree, and record the exact resulting tested SHA. To test `gemini-3.7-flash`, configure it explicitly as the requested staging model rather than silently switching from `gemini-3.8-flash`.

## Blocker 2 — ID retention checks are tautological

The staging harness assigns `semantic_input_ids`, `recent_input_ids` and `rules_input_ids` from **already packed** `preview` lanes, then directly copies them to corresponding `*_retained_ids`.

Thus `8/8, 20/20, 4/4` confirms the numbers in the final preview, **not** that the original unscoped source IDs are preserved. The manifest validator comparing each copied list to itself cannot detect omitted source artifacts.

The same harness writes `dropped_artifacts: 0`, `protected_overflow: false`, and stress `*_exact: true` as literals instead of deriving every acceptance field from measured packer/input comparisons.

**Required:** capture original unscoped package/evidence IDs before scoping/packing; separately capture final packed IDs; compare under the documented canonical rule ordering. Read drop/overflow results directly from the returned package/packer trace. Perform equivalent actual before/after checks for the stress fixture.

## Blocker 3 — the recorded context hash is not proven to be the generation context hash

The harness computes `context_hash` from a standalone `preview_context` query (`Elena forging anti-mana blade`) before calling `start_generation()`. The generation pipeline creates its **own** semantic query from the instruction plus selected source text and performs its own context retrieval/packing.

The evidence stores the standalone preview hash under `generation.context_hash` without comparing it to `job.context_hash` or the generation job's actual routing summary. The report therefore does not establish that the generation used the same balanced route/tier or the claimed exact context.

**Required:** record and validate the actual `job.context_hash`, `job.context_summary` and the actual generation routing/tier, and compare a preview only when its request inputs are truly identical.

## Qualification — provider-call counts and safety coverage

`InstrumentedRealGeminiLLMService.actual_provider_calls` increments once per `_call_gemini` invocation. That invocation can attempt multiple Gemini model candidates, so the reported count of 1 is **not** necessarily the count of individual HTTP requests. Similarly, embedding wrappers count adapter invocations rather than every underlying HTTP attempt/retry. Disclose successful calls versus attempted model calls without committing credentials.

The leak counters are useful but limited: future safety is checked on the retained recent-event IDs, and the superseded/cross-tenant checks examine scoped entities. They do not by themselves independently prove zero future information across all semantic, rule, state and prompt lanes. Retain the previously passing PostgreSQL cutoff/supersede tests as separate evidence.

Tier escalation uses a deterministic fixture, not a genuine large novel; that distinction is already labelled correctly and is acceptable for this narrow gate once checks are measured rather than hard-coded.

## Acceptance decision

```text
real embedding path                OBSERVED (wrapper-level call evidence)
real generation path               OBSERVED (effective 3.7 model reported)
12k balanced preview               OBSERVED
16k deterministic stress           OBSERVED
unscoped-to-packed ID retention    NOT DEMONSTRATED BY THIS HARNESS
actual generation context hash     NOT DEMONSTRATED
clean tested-commit lineage        FAILED
production LLM fallback CI/review  MISSING
staging acceptance                 PARTIAL / REMEDIATION REQUIRED
balanced default activation        NOT AUTHORIZED
legacy-v1 default                  RETAIN
P8-05                              BLOCKED
```

## Minimal remediation — no new EVAL A/B

1. Create a focused fix branch/PR that restores or separately reviews the production LLM fallback policy and corrects the staging harness; do not make further direct-to-`main` production modifications as part of evidence capture.
2. Add a clean-tree preflight, accurately log requested/effective model and per-model provider attempts, and disable local fallback.
3. Replace self-copied IDs and literal PASS fields with measured source-vs-packed comparisons; record the actual generation job's context hash/routing.
4. Run CI on the final committed tree, then execute one small real-provider smoke on that exact SHA using an isolated staging database. A targeted rerun is sufficient.
5. Submit corrected evidence, with real model/provider used and separate deterministic stress provenance.
6. Astra reviews corrected evidence. Even after staging passes, authorize at most an opt-in demo/staging rollout first; changing the global default requires a separate stability gate.

No change to embedding/hybrid contracts, EVAL-01 closure, or P8-05 is justified by this report.
