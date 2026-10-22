# P1 Wave 1H — Independent outbound Story Brain context diagnostic (OFFLINE ONLY)

**Date:** 2026-10-22 (Asia/Bangkok)
**Branch:** `codex/ai-copilot-pipeline-test` only.
**Status:** SUPPLEMENTARY task, not a replacement for `ACTIVE_GEMINI_TASK.md` (Wave 1G S09 remains blocked awaiting FE patch).
**Scope:** AI service/backend diagnostic only, under a fresh isolated fake-provider runtime. No author UI production changes.

## Read first
- `Pipeline_test/ACTIVE_GEMINI_TASK.md`
- `Pipeline_test/WORKFLOW_CONTRACT.md` v1.4
- `Pipeline_test/NARRATIVE_MEMORY_AUDIT.md`
- `Pipeline_test/reviews/2026-10-22-p1-wave-1g/GPT6_NON_FE_CONTEXT_PATH_REVIEW.md`
- Wave 1F / Wave 1G executor reports.

## Goal
Prove, or explicitly fail to prove, that **approved canonical Story Brain memory** from a frozen novel/source revision reaches the **actual outbound generation HTTP payload** received by an isolated fake upstream, with correct temporal/tenant/approval filters and budget routing.

Source-level existence and mocked `LLMService` tests are already documented. **Do not re-implement the existing context builder just to produce changes.** The gap is integration-level data provenance, not proof that a fake model knows the story.

## Execution order and acceptance

1. **Preflight:** Inspect HEAD, worktree, source hashes and existing evidence before modifications. Stay on permitted branch. Do not overwrite Wave 1F/1G reports, gold fixtures, historical ledgers or data; no reset/clean/stash/force-push.
2. **Containment:** New uniquely named test-owned DB/volumes/tenant/author/novel/run, separate fake HTTP upstream, block real provider egress and omit real keys. No Google/OpenAI/embedding requests. Preserve quota/retry/security safeguards. Capture zero real-provider calls.
3. **Seed through supported product flow:** Use an isolated source-grounded five-chapter fixture and a known approved canonical baseline. Record source chapter version/hash, official canon IDs/revisions, locked rules, plan statuses and chapter cutoff. Do **not** inject evaluation gold answers into the prompt. Do not mutate any pre-existing run.
4. **End-to-end diagnostic:** Trigger a scoped writing generation job through the supported backend integration path. Capture actual sanitized outbound HTTP payload at the fake upstream *after* gateway routing: effective model/config, correlation IDs, prompt/Story Brain section, inclusion and exclusion IDs. Compare byte or normalized semantic values and SHA256 of the packed context with persisted `context_hash`. Distinguish full-prompt hash from context hash where prompt augmentation exists.
5. **Positive and negative assertions:** Relevant approved rule and character relation included; uncertain attribution remains uncertain; superseded state not treated as current; post-cutoff/future plan not represented as already occurred; wrong tenant and unapproved canon excluded; budget-dropped items identified. Validate source-grounding without equating string presence with model comprehension.
6. **Recovery and boundaries:** Note retriever/embedding status (`semantic_retrieval_status`, `semantic_embedding_version`, `semantic_memory_ids`) and dropped IDs. If disabled, report `SEMANTIC_RAG_NOT_ASSESSED`. Simulated output is `RAW_MODEL_QUALITY_NOT_TESTED`. Unit tests alone are not an outbound capture.
7. **Tests:** Add only minimal deterministic tests for uncovered boundaries, and run focused suite with exact commands, versions, exit codes and artifacts. Confirm no secret leakage in committed sanitized evidence.

## Hard stops
- No production FE autosave patch, no cherry-pick or merge of PR #55, and no author-write API workaround for S09.
- Do not classify this diagnostic as S03/S09 UI acceptance, S10/S11, P1 provider-backed PASS, P2/P3 or 100k acceptance.
- If real provider network cannot be verifiably isolated, stop before any generation request and report blocker.
- Only commit changes proven necessary, and only to test branch.

## Handoff artifacts
Write in `Pipeline_test/reviews/2026-10-22-p1-wave-1h/`:
- `CONTEXT_DELIVERY_AUDIT.md` (exact tested SHA, reproduction path, limitations, finding)
- `validation.json` (PASS/FAIL/NOT_RUN/NOT_ASSESSED per assertion)
- sanitized outbound payload fragment and canonical/context/prompt hashes, capture provenance
- focused command logs and an isolated-run ownership/egress ledger

Return a clear matrix distinguishing:
- `PACKED_TO_LLM_SOURCE_VERIFIED` (historical source review)
- `OFFLINE_OUTBOUND_CONTEXT_VERIFIED` (only if new captured evidence proves it)
- `SEMANTIC_RAG_NOT_ASSESSED` (when fake/no embeddings)
- `REAL_MODEL_QUALITY_NOT_TESTED`
- `S09_BLOCKED_AWAITING_FE_PATCH`.

Provide the resulting source SHA and evidence commit SHA, preserved-evidence check, zero external calls, and remaining blocker list. Stop for independent GPT-6 review.
