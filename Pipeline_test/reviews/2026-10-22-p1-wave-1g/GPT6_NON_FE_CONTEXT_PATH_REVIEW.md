# GPT-6 independent P1 non-FE continuation — actual Story Brain writing-context path

**Date:** 2026-10-22 (Asia/Bangkok). **Branch:** `codex/ai-copilot-pipeline-test`. **Reviewed HEAD:** `67c431aa62faaa2aa6f1cb02f66cb0374caf1ec4`.  
**Method:** GitHub remote source inspection and previously committed Wave 1F/1G execution reports. Reviewer **did not** rerun unit tests, app containers, real browser, actual provider or new generation jobs, and did **not** modify production source.  
**Purpose:** identify P1 work that is *truly independent* of blocked S09 autosave while FE owner addresses [issue #56](https://github.com/Ephurin/Novel_sharing_platform/issues/56) / [PR #55](https://github.com/Ephurin/Novel_sharing_platform/pull/55). This document is **supplementary**, NOT a competing active Codex wave.

## 1. Confirmed source path (NOT full runtime E2E)

```
WritingService.process_generation(job_id)
    -> _resolve_selected_text(job)
    -> _build_semantic_query(job.instruction, selected_text)
    -> preview_context(tenant, novel, chapter_number, semantic_query)
       -> repo.get_structured_context()
       -> optional semantic_retriever.retrieve()
       -> ContextScopeBuilder / ContextBudgetRouter OR ContextBudgetPacker
    -> ContextBudgetPacker.prompt_context(package)  [exact selected payload]
    -> canonical JSON serialization / sha256 -> job.context_hash
    -> save writing-job with context_summary and context_hash
    -> LLMService.generate_writing_draft(context_package=prompt_context)
       -> serialize same Story Brain JSON into generation user prompt
    -> validate draft against retrieved/packed context
    -> save completed job and context_hash
```

**Grounded code:** `ai-service/application/writing_service.py` lines 408–483 (at reviewed SHA); `application/context_budget.py` lines 29–49; `core/llm_service.py` lines 658–704. `LLMService.generate_writing_draft` directly serializes `context_package` to a Story Brain section of the prompt, not merely a visual preview.

**Existing deterministic tests:** `ai-service/tests/test_context_budget.py::test_real_llm_prompt_uses_same_canonical_context_serialization_as_estimator` (captures actual `LLMService` user prompt without external egress) and `test_writing_service_hashes_and_sends_exact_packed_prompt_context` (asserts the exact packed dict passed to fake LLM and stored `context_hash`). `ai-service/tests/test_context_routing.py` checks 12k/16k/24k routing/fail closed and cannot be substituted for live integration proof.

**Independent source-review verdict:** `PACKED_TO_LLM_PATH_PRESENT_AND_UNIT_COVERED`, **not** `P1_REAL_DATA_CONTEXT_PROVEN`. No code rewrite or duplicate tests justified by this inspection alone.

## 2. Missing proof — do not conflate preview, job hash and actual model input

Previous [Wave 1F execution report](../2026-10-21-p1-wave-1f/EXECUTOR_WAVE_1F_REPORT.md) states S03–S08 **offline functional** with fake provider, five-chapter baseline (15 entities / 1 alias / 5 events / 5 facts) and M-FIRST, but actual generation-prompt context and semantic RAG were **NOT_ASSESSED**. Wave 1G fresh test ran only S01/S02 + S09 RED pre-activation. No current run proves that the exact `P1` canon records, locked rules, source versions and temporal filters from an active brain reach the *actual serialized request*.

The job `context_hash` is code-derived after packaging. It is strong trace metadata, **not evidence that an external model honored the context**; likewise `context-preview` can have a different semantic query, chapter/cutoff or model configuration than the generation call.

**Verify separately (a new fake-provider/integration run may be scheduled while FE patch pending, if agent execution capacity permits):**
1. On a **new isolated test-owned, fake-upstream project** with approved canonical memory (do not alter Wave1F/Wave1G projects), build context for a known frozen source, chapter cutoff and story brain version; record official memory IDs/revisions/hashes, author constraints and plan status.
2. Capture the **real outbound generation HTTP payload at the separate fake upstream** after gateway; record only sanitized Story Brain fragment, effective model/config, request ID and deterministic hash. Compare exact normalized JSON and SHA256 to the persisted job `context_hash`, not to `context-preview` alone. If provider request has prompt augmentation, report what is included/excluded instead of assuming equality with the hash of a different object.
3. Validate specific known memory assertions and negatives against source/official canon: locked rule retention, entity ownership, uncertain attribution, stale state replacement, **no future plan treated as occurred event**; no wrong-tenant or post-chapter leakage. Do not pass gold data as generation context or accidentally test echoing answers.
4. Check status `semantic_retrieval_status`, `semantic_embedding_version`, `semantic_memory_ids` and actual packer dropped IDs; when embeddings are disabled under fake-only P1, mark `SEMANTIC_RAG_NOT_ASSESSED` rather than PASS.
5. Assert no hallucinated source facts through the deterministic validator where viable; assess `RAW_MODEL_QUALITY_NOT_TESTED` and `REAL_PROVIDER_INPUT_NOT_TESTED`. Running against a scripted fake upstream only establishes routing/provenance, not Gemini generation correctness.
6. Do **not** bypass the author's S09 blocker by writing/changing author draft via API; read-only diagnostics and isolated generation-job requests must have their own channel label (`OFFLINE_API_DIAGNOSTIC`), never substitute UI-acceptance PASS.

## 3. Remaining blockers, priority, boundaries

| Gate | Review verdict | Owner |
|---|---|---|
| S09 autosave stale save / active-brain inconsistent revision | **BLOCKED_AWAITING_FE_PATCH**; Wave1G fresh B→A→B RED, original Wave1F active-brain RED | FE owner PR #55 / issue #56 |
| PR55 hook account identity source-level failure | **SOURCE_LEVEL_FAIL, BROWSER_IMPACT_NOT_ASSESSED**; 11 hook PASS / 1 mock account-switch FAIL. Must verify actual React remount | FE owner |
| FE hook/backend `expectedVersion` and migrations 015/016 | **INCOMPATIBLE_AS_BLIND_CHERRY_PICK**, integration requires reviewed contract | FE+backend owner |
| Actual packed Story Brain → LLM function at code/test level | **SOURCE_PRESENT, UNIT_COVERED** | AI service, no rewrite needed |
| Actual stored canon → outbound generation prompt in P1 fake stack | **NOT_RUN**, safe independent diagnostic candidate | AI/pipeline Codex, optional scoped offline |
| Real semantic retrieval/embedding & model recognition quality | **NOT_ASSESSED**; don't claim after fake run | Later authorized eval |
| Full S01–S11 actual UI provider backed | **BLOCKED**, live approval expired | Owner review needed later |

**NO changes to task precedence:** `Pipeline_test/ACTIVE_GEMINI_TASK.md` and `P1_WAVE_1G_S09_AUTOSAVE_HANDOFF.md` remain the only active Codex assignment. Do not replace S09 with a new wave or report S10/S11 PASS. Do not activate real provider: user deferred USD cost hard cap engineering for intended Free Tier, **not** separate permission for Google calls. Report any additional offline context test only at its actual scope.

## 4. Actionable FE update

Wave1G's PR55 source-mock test has a **concrete** account-transition finding: in the same hook instance with same chapter ID, switching `userId` may return a prior account's pending local buffer, because hook slots are keyed only by chapter ID. Whether React routing remounts on account change **is not verified**; no live cross-account leak was established. FE owner must either guarantee remount/clear on identity change, or scope in-memory slot identity to `userId + chapterId` and ensure in-flight saves are bound to immutable account ownership, plus E2E under actual mounted auth/router.

Keep prior Wave1G RED evidence immutable and do not weaken tests to fabricate green.
