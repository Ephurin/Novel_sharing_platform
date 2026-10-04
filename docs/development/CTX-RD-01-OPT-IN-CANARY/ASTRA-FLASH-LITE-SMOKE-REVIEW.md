# Astra review — CTX-RD-01 Flash-Lite functional smoke / PR #34

## Verdict

**REAL GEMINI 3.5 FLASH-LITE FUNCTIONAL SMOKE OBSERVED WITH QUALIFICATION. CONTENT ACCEPTANCE PARTIAL; PROVIDER STABILITY INSUFFICIENT; PR #34 NOT YET APPROVED FOR MERGE.**

Reviewed branch `astra/ctx-rd-01-flash-lite-smoke`, head `10a6fbcf14393d2ad9ccb189d4d5a69bb7e680a6`; PR: https://github.com/Ephurin/Novel_sharing_platform/pull/34. Source of record: `docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-narrative-e2e-gemini-3.5-flash-lite.json`.

### Correct code / live evidence lineage

- Tested code commit: `e22ea63590b0d4cc715be34b041e1ecdb1746b61`, based on then-current `main` at `8d489fb9c7aa18af19db832da9c111a283ab04ae`.
- Actual evidence commit: `48f65231e0d435a36da7f7e45f5d259c6ca4112a`, **direct child** of tested code; adds only the model-specific sanitized JSON.
- Execution-only branch handoff: `10a6fbcf14393d2ad9ccb189d4d5a69bb7e680a6`.
- Historical `unadapted-narrative-e2e.json` with 3.8 Flash measurements is unchanged. No new full-draft files are present in the branch diff.
- Dedicated unit tests now check artifact-path isolation and reject a claimed effective 3.8 model when Flash-Lite is requested. The runner resolves `--output` or a model-specific default file path; the existing 3.8 path is preserved.

### Observed Flash-Lite live technical result

The JSON reports a live unadapted PostgreSQL narrative + real Gemini document/query embedding + pgvector/hybrid retrieval + `balanced-scope-v1` packer + real generation path on disposable local staging. Both `requested_model` and `effective_model` are `gemini-3.5-flash-lite`. Each of the two attempts was successful, with **no 429/503 errors recorded in this tiny sample**, and no 3.8 fallback appears in recorded attempts.

| Metric | `core_gold:rq-0011` Ch32 | `challenge:rq-0025` Ch49 |
| --- | ---: | ---: |
| Generation latency | 3,243.24 ms | 4,369.29 ms |
| Context tier / used | 12k / 10,496 | 12k / 11,863 |
| Entities before → retained | 63 → 19 | 68 → 20 |
| Raw semantic → retained + dedup into recent | 8 → 3 + 5 | 8 → 5 + 3 |
| Recent / world rules | 20/20; 6/6 | 20/20; 12/12 |
| Drops / overflow | 0 / false | 0 / false |
| Preview/job context hash | equal | equal |
| LLM attempts | 1 success | 1 success |

Embedding: `gemini-embedding-2`, 768-dimensional L2-normalized `gemini-embedding-2-768-v1`, with 11 recorded document-adapter and six query-adapter calls. The Ch45/47/49 source memories `mem-000164/172/176` are raw semantic ranks 3/1/2, retained in actual final recent-event lane after dedup with `source_status=ambiguous`; unrelated `mem-000167/174/177` remain world rules.

This establishes a **two-case functional smoke only**. The 2/2 success rate and shorter latencies do not establish a reliable population success rate or prove Flash-Lite will always outperform 3.8. Gemini API call logs are self-reported by the instrumented runner, not independently captured provider HTTP/billing records.

### Content review / documentation inconsistency requiring correction

The **evidence manifest correctly reports**:
```text
technical_execution           PASS
automated_content_check       PARTIAL
independent_full_draft_review NOT_ASSESSED
provider_stability            INSUFFICIENT
checklist_verdict             PARTIAL
```

Both cases' automated checklist criteria are **PARTIAL**, not just one:
- `rq-0011`: the **entire draft has only 191 characters**. Its stated origin details can be compared as a narrow extract, but it omits explicit chapter 27 attribution and the requested differentiation from chapter 32. `canonical_source_status_correctness`, `chronology_causality`, `ambiguity_handling` and `completeness` are all PARTIAL in the actual JSON.
- `rq-0025`: the draft is 706 characters, while only a **truncated ~400-character snippet** is public. The JSON marks `chain_45_47_49_verified=false`, both Ch45 and Ch47 requirements absent under the strict checklist, and `ambiguity_handling=PARTIAL`. The snippet's language about cavalry being buried and regrouping could inadvertently imply a resolved canon; neither source fidelity nor full-draft leakage can be established from the snippet.

The branch handoff's section titled **“Independent Full-Draft Review against Frozen_v1”**, its assertion `independent complete-draft audit AUDITED`, and unconditional `no hallucination/no future leakage` conclusions are **not supported by evidence available in the PR**. Its own manifest explicitly says `independent_full_draft_review=NOT_ASSESSED`, and the complete 706-character second draft was not made available as a separately controlled, independently reviewed artifact. Do **not** change the measured JSON to claim an audit. Change the handoff to *source-informed snippet observations*, acknowledge the exact partial criteria and preserve `future_leakage=NOT_ASSESSED` and `unsupported_claim=NOT_ASSESSED`. If a genuine independent complete-draft audit was performed locally, provide a verifiable sanitized review manifest with reviewer/process, complete-draft hashes matching the evidence, line/source-specific findings and scope; keep actual full text in controlled storage.

The old 3.8 `rq-0011` chronology partial is a **different historical generation**. This new Lite output is shorter and misses both requested chronological distinctions. Treat this as a **content-quality limitation to investigate**, not a retrieval failure (the required source memories are in retrieved/retained lanes).

### CI and acceptance steps

At the initial review, PR #34 was opened on the existing branch head and P7, P8, and Evaluation Pilot workflows were running. The branch's earlier local unit/validator claim is not a substitute for GitHub Actions. Update CI status in a separate note when all jobs finish; do not assume green merely because earlier PR #33 passed.

Before merge:
1. Correct the branch's handoff/report **independent-audit overclaim** and clearly distinguish *model invocation/retrieval PASS*, *content PARTIAL* and *stability INSUFFICIENT*. Preserve the raw Lite evidence and historical 3.8 JSON.
2. Review P7/P8/Evaluation Pilot CI for PR #34. If all pass, the implementation and **functional Lite smoke** can be accepted for merge with the documented qualifications. Content acceptance and stability can remain open, separate gates.
3. For next source-based content assessment, capture full outputs as controlled artifacts for independent Frozen_v1 audit. Consider diagnosing whether a 191-character answer and a 706-character answer reflect the intended generation type/instructions or only short summaries; do not force lexical PASS or retune core retrieval to fix writing quality.
4. Follow with a bounded, low-cost opt-in Flash-Lite stability window tracking retries, 429/503, success/latency. Keep 3.8 out of automatic fallback.

**Governance unchanged:** production `CONTEXT_ROUTING_POLICY=legacy-v1`, balanced routing opt-in staging only, global activation NOT AUTHORIZED, P8-05 destructive cleanup `BLOCKED_PENDING_STABILITY`. No broad EVAL-01 reopen or core hybrid/packer/embedding retuning.
