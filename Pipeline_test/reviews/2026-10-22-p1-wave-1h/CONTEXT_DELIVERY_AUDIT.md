# P1 Wave 1H — Independent Story Brain Context Delivery Verification

**Date:** 2026-10-22 (Asia/Bangkok)  
**Permitted branch:** `codex/ai-copilot-pipeline-test`  
**Baseline commit:** `8a8bb499919674349cd8d0022784e95dd0fb14ca`  
**Execution:** OFFLINE ONLY — 0 real provider calls.  
**Channel:** `OFFLINE_API_DIAGNOSTIC`  

---

## 1. Executive Summary & Verdict

While S09 autosave remains blocked by FE Issue #56 on PR #55, this Wave 1H verification independently traced and proved that the approved Story Brain canonical memory is correctly retrieved, filtered, packed, serialized, and transmitted into the actual outbound HTTP request to the LLM upstream.

### Final Verdict Distinction

| Distinction Gate | Status | Grounded Finding |
|---|---|---|
| **`PACKED_TO_LLM_SOURCE_VERIFIED`** | **PASS** | Source-level serialization in `WritingService` matches estimator and `LLMService` prompt format bit-for-bit. |
| **`OFFLINE_OUTBOUND_CONTEXT_VERIFIED`** | **PASS** | Real HTTP request captured at fake upstream after gateway confirms the serialized Story Brain JSON fragment hashes identically to persisted job `context_hash` (`da363c14c68dfe7e639f2e6deada4ba832dfb1b928dc2c9ffdb2b6131966dd0d`). |
| **`SEMANTIC_RAG_NOT_ASSESSED`** | **NOT_ASSESSED** | Embeddings and semantic retrieval disabled under offline test policy; honest reporting maintained. |
| **`REAL_MODEL_QUALITY_NOT_TESTED`** | **NOT_TESTED** | Executed strictly against deterministic fake upstream; zero external Google AI Studio / Gemini API egress. |
| **`S09_BLOCKED_AWAITING_FE_PATCH`** | **BLOCKED** | Author-writing autosave defect #56 remains pending reviewed compatible patch from FE owner; S10/S11 NOT_RUN. |

---

## 2. Environment Isolation & Provenance

The verification was executed in an isolated, test-owned environment without modifying production frontend code, merging PR #55, or touching historical Wave 1F / Wave 1G ledgers:

- **Project ID:** `p1-wave1h-20261022-ctx-verify-01`
- **Author ID:** `author-wave1h-owned`
- **Tenant ID:** `tenant-wave1h-owned`
- **Novel ID:** `novel-wave1h-canon-01`
- **Cross-tenant Novel:** `novel-wave1h-foreign` (`tenant-wave1h-foreign`)
- **Fake Upstream:** Ephemeral loopback HTTP server with scenario `wave1h-context-verify-v1`
- **Budget Gateway:** Authoritative ledger on ephemeral loopback port (`total_calls: 2`, `charged_usd: 0.021671`, `live_authorized: false`, 0 external egress)
- **Local DNS Guard:** Non-loopback DNS resolution hard-blocked (`OFFLINE_TEST_EXTERNAL_NETWORK_DENIED`)

---

## 3. End-to-End Context Delivery Trace

### 3.1 Pipeline Trace Stages

```text
Canonical Story Brain (v1, ch1-5)
  │
  ▼ [repo.get_structured_context(story_id, chapter_number=4)]
Context Retrieval & Temporal Filtering
  ├── Excludes Chapter 5 entities (e-future-06)
  ├── Excludes Chapter 5 events (ev-ch5-future)
  ├── Excludes Chapter 5 facts (fact-future-ch5-05)
  ├── Excludes superseded Chapter 1 facts (fact-signal-ch1-old)
  ├── Resolves character state (Duy: condition=recovered, not hurt)
  └── Excludes cross-tenant memory (foreign tenant)
  │
  ▼ [ContextBudgetPacker.prompt_context(package)]
Context Budget Packing & Canonical JSON Serialization
  ├── Serialized Prompt Context: canonical JSON (sort_keys=True, separators=(',', ':'))
  └── Computes context_hash = sha256(prompt_context_bytes)
  │
  ▼ [WritingService.start_generation -> save_writing_job]
Persisted Writing Job Record
  └── writing_jobs.context_hash = da363c14c68dfe7e639f2e6deada4ba832dfb1b928dc2c9ffdb2b6131966dd0d
  │
  ▼ [LLMService.generate_writing_draft(context_package=prompt_context)]
Serialized LLM User Prompt
  └── Formats: "Bối cảnh tiểu thuyết (Story Brain): <prompt_context_json>\n"
  │
  ▼ [google-genai Client -> Budget Gateway (proxy)]
Gateway Dispatch
  ├── Authoritative ticket reservation (ai-service token verified)
  └── Forward to Upstream with dispatch ID
  │
  ▼ [Fake Provider Upstream HTTP Server]
Outbound HTTP Request Interception
  ├── Captures contents[0].parts[0].text
  ├── Computes full outbound prompt hash: 896cd1cdfca0905f4d273eabf25aed3f614cefaa7e169920bac5e16792c7abad
  ├── Extracts exact Story Brain JSON substring
  └── Computes extracted Story Brain hash: da363c14c68dfe7e639f2e6deada4ba832dfb1b928dc2c9ffdb2b6131966dd0d
```

### 3.2 Hash Comparison & Prompt Augmentation Distinction

| Artifact Representation | SHA256 Hash | Match / Distinction |
|---|---|---|
| **Persisted Job `context_hash`** | `da363c14c68dfe7e639f2e6deada4ba832dfb1b928dc2c9ffdb2b6131966dd0d` | Base Truth |
| **Extracted Outbound Story Brain JSON** | `da363c14c68dfe7e639f2e6deada4ba832dfb1b928dc2c9ffdb2b6131966dd0d` | **EXACT MATCH (100% BIT-FOR-BIT)** |
| **Full Outbound LLM Prompt** | `896cd1cdfca0905f4d273eabf25aed3f614cefaa7e169920bac5e16792c7abad` | **EXPLICITLY DISTINCT** |

The packed Story Brain context hash is bit-for-bit identical to the persisted job context hash. The full outbound prompt incorporates additional author instruction, selection, and system prompt framing, resulting in a distinct prompt hash as required by the specification.

### 3.3 Outbound Model & Effective Configuration

- **Requested Model:** `gemini-3.5-flash-lite`
- **Effective Model Version:** `gemini-3.5-flash-lite`
- **Output Token Bound:** `512`
- **Dispatch ID:** `4f21a4ae-d8f3-4c2d-8457-1d4ce02a28a3`
- **Client Service Identification:** `ai-service`
- **Gateway Reservation Settlement:** `SUCCESS`

---

## 4. Verification of the Eight Invariants

### Invariant 1: Approved Canon Included When Relevant
- **Result:** **PASS**
- **Evidence:** Generation at Chapter 4 cutoff included entities `Mai Linh`, `Duy`, `CV-04`, `Cồn Vân`, events `ev-ch1-init` through `ev-ch4-recover`, and active narrative facts.

### Invariant 2: Locked Rules Retained Under Budget Pressure
- **Result:** **PASS**
- **Evidence:** Tested under extreme budget pressure (token budget = 150 tokens). All non-locked recent events and non-locked facts were pruned into `dropped_event_ids`, while `rule-locked-barrier-01` ("Không thể dịch chuyển tức thời khi đang ở trong kết giới phong tỏa") and `rule-locked-freq-02` were retained with 100% fidelity.

### Invariant 3: Future Events Not Presented as Historical Facts
- **Result:** **PASS**
- **Evidence:** When querying at Chapter 4 cutoff, Chapter 5 event `ev-ch5-future` was excluded by temporal filtering. Future planned event ("Kiểm tra micro trước cửa Bốn" from Chapter 6 plan) was verified completely absent from recent historical events.

### Invariant 4: Superseded Character States Not Treated as Current
- **Result:** **PASS**
- **Evidence:** Entity Duy was injured (`condition: hurt`) in Chapter 3 and recovered in Chapter 4. At cutoff 4, Duy's state reflected `condition: recovered` and `status: Alive`; obsolete condition `hurt` was excluded. Furthermore, superseded fact `fact-signal-ch1-old` was excluded and replaced by `fact-signal-ch3-new`.

### Invariant 5: Cross-Tenant Memory Isolation
- **Result:** **PASS**
- **Evidence:** Foreign tenant novel entities (`Kẻ Xâm Nhập Dị Giới`), foreign rules (`rule-foreign-secret-99`), and foreign events (`ev-foreign-99`) never appeared in any context package or outbound prompt.

### Invariant 6: Context-Budget Pruning Deterministic & Traceable
- **Result:** **PASS**
- **Evidence:** Packing identical context packages across multiple passes produced bitwise identical packages and identical SHA256 hashes. Pruned records were logged into `context_summary["dropped_event_ids"]`.

### Invariant 7: Retrieval Failures Represented Honestly
- **Result:** **PASS**
- **Evidence:** With semantic embeddings disabled, retrieval status was honestly recorded as `disabled` / `not_requested`, never falsely asserted as PASS.

### Invariant 8: No Unapproved Memory Promoted to Canon
- **Result:** **PASS**
- **Evidence:** Unapproved pending proposal `prop-unapproved-draft-01` was excluded from canon facts. Requesting generation with a mismatched/stale expected brain version (`expected_brain_version=999`) was immediately rejected with `OptimisticLockError`.

---

## 5. Deterministic Regression Suite

Focused regression tests were created and verified:

```text
Pipeline_test/tests/test_wave1h_story_brain_context_delivery.py

test_story_brain_to_outbound_http_prompt_hash_parity                        PASSED [ 11%]
test_invariant_1_approved_canon_included_at_chapter_cutoff                  PASSED [ 22%]
test_invariant_2_locked_rules_survive_extreme_budget_pressure               PASSED [ 33%]
test_invariant_3_future_events_and_plans_not_historical_facts              PASSED [ 44%]
test_invariant_4_superseded_states_and_facts_not_current                   PASSED [ 55%]
test_invariant_5_cross_tenant_memory_isolation                             PASSED [ 66%]
test_invariant_6_deterministic_budget_pruning_and_traceability             PASSED [ 77%]
test_invariant_7_honest_retrieval_and_fail_closed_routing                  PASSED [ 88%]
test_invariant_8_unapproved_proposals_and_stale_brain_version_prevented    PASSED [100%]

============================== 9 passed in 2.13s ==============================
```

Full logs: [test_logs.txt](test_logs.txt).

---

## 6. Boundary Commitments & Next Steps

1. **Semantic RAG Quality:** NOT_ASSESSED. No embedding calls were made.
2. **LLM Generation Quality:** NOT_TESTED. No claims of Gemini literary or factual quality are made from scripted fake upstream responses.
3. **Author Writing Feature (S09):** NOT BYPASSED. Author draft mutations were not simulated via API to fake completion.
4. **Subsequent Waves (S10/S11):** NOT_RUN. S09 remains `BLOCKED_AWAITING_FE_PATCH` pending the reviewed compatible frontend patch for GitHub Issue #56.
