# P1-LIVE-AI-PREFLIGHT-01: Zero-Call Provider Readiness Audit (Revised)

- **Document Reference:** `docs/development/integration/p1-author/P1_LIVE_AI_PREFLIGHT_01.md`
- **Repository:** `Ephurin/Novel_sharing_platform`
- **Target Branch for PR:** `integration/p1-demo-20261109` (Base commit: `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`)
- **Working Branch:** `gemini/p1-live-ai-preflight-01`
- **Audit Date:** 2026-10-30
- **Audit Scope:** Runtime Compose Topology, Provider Adapter Implementation, Timeout and Failure Mapping, Hard Call Budgeting, Pricing & Quota Modeling, HITL Extraction Error Handling, and Acceptance Fixture.
- **Provider Invocation Status:** **ZERO CALLS (0 generative/handshake calls executed; $0.00 spent).**

---

## Executive Summary & Independent Review Disposition

This revised preflight audit directly addresses all findings raised in the **GPT-6 Independent Review (`NEEDS_CHANGES`)**:

| Finding ID | Review Finding Description | Audit Resolution & Implementation Status |
|---|---|---|
| **G-01** | Runtime Compose Configuration | **AUDITED / UNCONFIGURED IN DEMO COMPOSE:** Neither [docker-compose.yml](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docker-compose.yml#L40-L52) nor [docker-compose.flash-lite-demo.yml](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docker-compose.flash-lite-demo.yml#L4-L14) defines `ENTITY_CANDIDATE_VERIFICATION_ENABLED`. `docker compose config` verifies it is unset, defaulting to `false` in [core/settings.py:59](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/settings.py#L59). Proposed a dedicated runtime override Compose configuration without mutating integration source. |
| **G-02** | Hard Provider Budget Enforcement | **`NOT IMPLEMENTED` in runtime code:** Disambiguated in-memory `ContextBudgetPacker` token limits from outbound financial/request ceilings. Documented that no code-level request limiter exists. Proposed a 15-request hard limit architecture spanning both Python and Node provider paths. Status remains **`NOT IMPLEMENTED` / BLOCKED**. |
| **G-03** | Deadline & Failure Mapping | **AUDITED & CORRECTED:** Verified that [core/llm_service.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/llm_service.py#L221-L234) does **not** pass `LLM_TIMEOUT_SECONDS` to the Google GenAI SDK. Confirmed that 429/timeout errors are not mapped to HTTP 429/503 or `QUOTA_EXCEEDED` codes; unhandled provider errors produce generic 500 errors in APIs and `error={"message": ...}` in `WritingService`. Verified `LLM_LOCAL_FALLBACK=false` requirement. |
| **G-04** | Model, Quota & Pricing Verification | **AUDITED & DISAGGREGATED:** Separated documented model strings (`MODEL_ID_DOCUMENTED`) from project-level credentials (`PROJECT_ACCESS_UNVERIFIED`). Relabeled 15 RPM / 250K TPM / 500 RPD as an `UNVERIFIED_ASSUMPTION` (nominal free-tier limits, not operator-confirmed). Corrected official pricing formula ($0.075 / $0.30 per 1M tokens = ~$0.0027/run). Formulated sliding-window rate pacing to respect project-level limits. |
| **G-05** | Acceptance Fixture & Extraction Robustness | **UPDATED TO EPHURIN UNIVERSE:** Replaced external Xianxia fixture with Ephurin's canonical characters (`Lâm Phong`, `Diệp Linh Nhi`, `Trấn Thanh Phong`, `Ngọc Bội Huyết Long`). Formalized handling of imperfect LLM extractions (False Positives, False Negatives, Precision/Recall targets) via the HITL review protocol. |

### Final Preflight Verdict

```
P1_LIVE_AI_PREFLIGHT_NEEDS_CHANGES (BLOCKED ON RUNTIME HARNESS & BUDGET ENFORCEMENT)
```

**Zero live Gemini calls will be issued until all blocking prerequisites are formally resolved and approved.**

---

## 1. Runtime Compose Configuration (Finding G-01)

### 1.1 Source Inspection of Compose Files

An AST and text audit of active Docker Compose configurations reveals:
1. **Base Compose ([docker-compose.yml](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docker-compose.yml#L40-L52)):**
   Under `services.ai-service.environment`, the following variables are defined:
   - `PLATFORM_API_BASE_URL`, `PLATFORM_SERVICE_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
   - `EMBEDDING_PROVIDER`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SEMANTIC_RETRIEVAL_ENABLED`
   - `ACTIVE_EMBEDDING_VERSION`, `SEMANTIC_RETRIEVAL_LIMIT`, `CONTEXT_ROUTING_POLICY`
   - **`ENTITY_CANDIDATE_VERIFICATION_ENABLED` is NOT listed.**
2. **Demo Override ([docker-compose.flash-lite-demo.yml](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/docker-compose.flash-lite-demo.yml#L4-L14)):**
   Under `services.ai-service.environment`, the override sets:
   - `LLM_ENABLED: "true"`
   - `LLM_PROVIDER: gemini`
   - `LLM_MODEL: ${DEMO_LLM_MODEL:-gemini-3.5-flash-lite}`
   - `GEMINI_API_KEY: ${GEMINI_API_KEY:?}`
   - `LLM_BASE_URL: ""`
   - `LLM_FALLBACK_PROVIDER: ""`
   - `LLM_LOCAL_FALLBACK: "false"`
   - `CONTEXT_ROUTING_POLICY: legacy-v1`
   - **`ENTITY_CANDIDATE_VERIFICATION_ENABLED` is ALSO NOT listed.**
3. **Application Default ([ai-service/core/settings.py#L59](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/settings.py#L59)):**
   ```python
   entity_candidate_verification_enabled: bool = False
   ```
   Parsed via `Settings.from_env()` line 146: `os.getenv("ENTITY_CANDIDATE_VERIFICATION_ENABLED", "false").lower() in ("true", "1", "t")`.

### 1.2 `docker compose config` Verification

Executing `docker compose -f docker-compose.yml -f docker-compose.flash-lite-demo.yml config` proves that `ENTITY_CANDIDATE_VERIFICATION_ENABLED` is completely omitted from the generated container configuration. 

Consequently, launching the stack via standard demo instructions will result in:
```python
Settings.from_env().entity_candidate_verification_enabled is False
```
In this state, `RevisionAnalysisService.analyze()` runs the legacy extraction branch and completely bypasses the P1 HITL candidate verification checkpoint (`waiting_entity_review`).

### 1.3 Strict Boundary Rule & Proposed Runtime Override

Per project guidelines, **we do not modify integration source directly**. To activate HITL verification without changing `docker-compose.yml`, a separate runtime override configuration must be applied:

```yaml
# runtime/docker-compose.hitl-live.yml
services:
  ai-service:
    environment:
      ENTITY_CANDIDATE_VERIFICATION_ENABLED: "true"
```

**Verification Gate for Live Acceptance:**
Before running live acceptance, the operator must execute:
```bash
docker compose -f docker-compose.yml -f docker-compose.flash-lite-demo.yml -f runtime/docker-compose.hitl-live.yml config | grep ENTITY_CANDIDATE_VERIFICATION_ENABLED
```
and verify container runtime readback:
```bash
docker compose exec ai-service python -c "from core.settings import Settings; assert Settings.from_env().entity_candidate_verification_enabled is True; print('HITL Checkpoint: ENABLED')"
```

---

## 2. Provider Hard Budget Enforcement (Finding G-02)

### 2.1 Disambiguation: Context Budget vs. Provider Budget

It is vital to distinguish two fundamentally different budgeting systems in the architecture:

| Budget Type | Subsystem | Scope & Mechanism | Enforcement Status |
|---|---|---|:---:|
| **Context Token Budget** | `ContextBudgetPacker` ([context_budget.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/application/context_budget.py)) | In-memory prompt packing. Trims low-priority narrative events to keep prompts within 12,000–24,000 token tiers. Does **NOT** count HTTP requests or limit external cloud costs. | **IMPLEMENTED** |
| **Provider Financial / Request Budget** | Outbound HTTP Gateway / Harness | Hard ceiling on physical outbound API requests to external Google/OpenAI endpoints. Bounded at $\le 15$ requests. | **`NOT IMPLEMENTED`** |

### 2.2 Dual Provider Paths in the Architecture

Outbound LLM calls can be initiated through two distinct paths:
1. **Path A (Python AI-Service — `LLMService`):**
   Calls Google GenAI SDK (`genai.Client.models.generate_content`) for `EntityPipeline`, `EntityDecisionBatch` verification, `EventSummarizer`, `ProseFacts`, and `WritingService` drafting.
2. **Path B (Node Backend — `backend/src/modules/ai-copilot/llm-provider.ts`):**
   Issues direct `fetch` requests to Google's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`) for interactive inline suggestions.

Neither path possesses a request counter, financial limiter, or circuit breaker.

### 2.3 Required Hard-Budget Architecture (Capped at 15 Requests)

To prevent runaway billing or quota exhaustion, a hard gate must be enforced:
- **Maximum Outbound Call Cap:** **15 requests total** across all components.
- **Budget Accounting Allocation:**
  - Chunked Discovery: 2 calls
  - Candidate Verification: 1 call (+ 1 repair loop = max 2 calls)
  - Event Extraction: 1 call
  - Fact Extraction: 1 call
  - Source Quote Grounding Repair: max 1 call
  - State Transitions: 2 calls
  - Writing Generation Draft: 1 call
  - Backend Copilot Completion: 1 call
  - Operational Retries: max 2 calls
  - **Hard Stop:** If cumulative outbound requests reach `15`, the client interceptor/harness immediately fails closed, dropping further requests without touching the network.
- **Current Code Status:** **`NOT IMPLEMENTED`**. The system is marked **BLOCKED** until this harness enforcement is wired into the test runner.

---

## 3. Deadline and Failure Mapping (Finding G-03)

### 3.1 `LLM_TIMEOUT_SECONDS` Audit in Google SDK

Inspection of [ai-service/core/llm_service.py](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/llm_service.py):
- In `__init__` (line 32), `self.timeout_seconds = timeout_seconds` is recorded.
- In `_call_openai()` (lines 304–305), `timeout=self.timeout_seconds` is passed to `OpenAI()`.
- **In `_call_gemini()` (lines 221–234):**
  ```python
  client = genai.Client(api_key=self.api_key)
  ...
  response = client.models.generate_content(
      model=model_name,
      contents=merged_prompt,
      config={
          "temperature": self.temperature,
          "max_output_tokens": self.max_tokens,
      },
  )
  ```
  **Critical Finding:** `self.timeout_seconds` is **NOT passed** to `genai.Client` or `generate_content()`. The Google GenAI SDK does not receive the timeout parameter, relying instead on default underlying urllib3/HTTP transport timeouts.

### 3.2 Error & Failure Mapping Analysis

The codebase does **NOT** translate provider errors into structured HTTP 429/503 responses or a specific `QUOTA_EXCEEDED` error code:
1. **In `_call_gemini()` ([llm_service.py:247](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/llm_service.py#L247)):**
   Any exception from the SDK is wrapped in `LLMServiceError(f"Gemini request failed: {exc}")`.
2. **In Synchronous Endpoints (e.g. `POST /v1/revisions/{id}/analyses`):**
   `LLMServiceError` is uncaught in FastAPI route handlers, propagating as an unhandled exception resulting in HTTP `500 INTERNAL_SERVER_ERROR`. The Node Gateway logs this as `AI_SERVICE_500`.
3. **In Asynchronous Writing Generation ([writing_service.py:493-517](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/application/writing_service.py#L493-L517)):**
   ```python
   except Exception as exc:
       logger.error("LLM draft generation failed for job %s: %s", job_id, exc)
       job = WritingGenerationJob(
           ...
           status="failed",
           stage="failed",
           error={"message": str(exc)},
           ...
       )
   ```
   The job record records `status: "failed"` with a raw string message. There is no custom error code taxonomy for quota or timeout.

### 3.3 Strict Invariant: `LLM_LOCAL_FALLBACK=false`

In [core/llm_service.py:507-511](file:///c:/Users/thaib/Documents/Projects/Novel_sharing_platform/Novel_sharing_platform/ai-service/core/llm_service.py#L507-L511):
```python
except Exception as exc:
    if self._local_fallback_enabled():
        logger.warning("LLM generation failed, using local draft fallback: %s", exc)
        draft_text = f"Đoạn văn tự động bổ sung dựa trên hướng dẫn: {instruction.strip() or 'Tiếp diễn mạch truyện'}"
    else:
        raise LLMServiceError(f"Writing generation failed: {exc}") from exc
```
If `LLM_LOCAL_FALLBACK` is `"true"` (the code default), any Gemini failure (429, timeout, invalid key) silently generates mock Vietnamese text and sets `status: "completed"`.
**Mandatory Enforcement:** Live acceptance must strictly set `LLM_LOCAL_FALLBACK=false` to guarantee fail-closed behavior on provider errors.

---

## 4. Model, Quota, and Pricing Verification (Finding G-04)

### 4.1 Model Identification and Classification

| Model Friendly Name | Documented API String | Status Category | Technical Finding |
|---|---|---|---|
| **Gemini 3.5 Flash Lite** | `gemini-3.5-flash-lite` | `MODEL_ID_DOCUMENTED` / `PROJECT_ACCESS_UNVERIFIED` | Valid official model identifier documented by Google. Project-level enablement and API key access remain unverified until authorized handshake. |
| **Gemini 3.1 Flash Lite** | `gemini-3.1-flash-lite` | `MODEL_ID_DOCUMENTED` / `PROJECT_ACCESS_UNVERIFIED` | Valid official model identifier documented by Google. Supported in code via `LLM_MODEL` env variable; **no automatic code fallback**. |
| **Gemini 2.5 / 1.5 / 2.0** | `gemini-2.5-*`, `gemini-1.5-*` | `DISQUALIFIED` | Deprecated or excluded by project governance. |

### 4.2 Quota Envelope Status

The nominal quota figures (15 RPM / 250K TPM / 500 RPD) represent **standard Google AI Studio free-tier documentation defaults**, not operator-confirmed enterprise limits:
- **Classification:** **`UNVERIFIED_ASSUMPTION`** (no publishable operator quota dashboard or key tier documentation has been provided).
- **Project-Level Enforcement:** Google Gemini applies rate limits at the **GCP Project level**, aggregating requests across all keys belonging to the same project. If other developers or processes share the project, burst calls can trigger 429 even when the test runner is below 15 RPM.

### 4.3 Official Pricing and Financial Forecast

Based on official Google Cloud Gemini Flash-Lite tier pricing ($0.075 per 1M input tokens, $0.30 per 1M output tokens for context $\le 128\text{k}$):

$$\text{Input Cost} = \frac{22{,}000 \text{ tokens}}{1{,}000{,}000} \times \$0.075 = \$0.00165 \text{ USD}$$

$$\text{Output Cost} = \frac{3{,}500 \text{ tokens}}{1{,}000{,}000} \times \$0.300 = \$0.00105 \text{ USD}$$

$$\text{Total Cost per Full Acceptance Run} = \$0.00165 + \$0.00105 = \mathbf{\$0.00270 \text{ USD}}$$

- **15-Call Hard Cap Maximum Exposure:** $\le \mathbf{\$0.0040 \text{ USD}}$ ($< 0.5$ cents).
- **Proposed Spending Ceiling:** **$0.25 USD** (provides a $60\times$ safety buffer over a single full run).

### 4.4 Sliding-Window Rate Pacing Strategy

To guarantee that peak request rate remains strictly within the nominal 15 RPM project envelope:
- **Inter-Request Sleep:** Enforce an explicit delay of $\ge \mathbf{4.5\text{ seconds}}$ between successive outbound calls.
- **Maximum Paced Rate:** $\frac{60\text{s}}{4.5\text{s} + \approx 1\text{s latency}} \approx 10.9\text{ RPM} \le 12\text{ RPM}$.
- This guarantees a **20% safety margin** below the 15 RPM threshold and prevents burst-induced HTTP 429 rate limit errors.

---

## 5. Acceptance Design & Ephurin Universe Fixture (Finding G-05)

### 5.1 Fictional Canonical Fixture Specification (Ephurin Universe)

To maximize continuity with verified P1/AX-01/AX-02 acceptance evidence, the live evaluation fixture utilizes Ephurin's canonical characters and universe:

```yaml
Story Metadata:
  novel_id: "c8791754-faf2-4e55-b94e-f0df60ee29c2"
  title: "Bá Đao Nghịch Mệnh"
  genre: "Xianxia / Eastern Fantasy"

Canonical Entities (Target Ground Truth):
  - canonical_name: "Lâm Phong"
    entity_type: "PER"
    role: "Protagonist"
  - canonical_name: "Diệp Linh Nhi"
    entity_type: "PER"
    role: "Junior Martial Sister"
  - canonical_name: "Trấn Thanh Phong"
    entity_type: "LOC"
    role: "Starting Town"
  - canonical_name: "Cồn Vân"
    entity_type: "LOC"
    role: "River Island Port"
  - canonical_name: "Ngọc Bội Huyết Long"
    entity_type: "ITEM"
    role: "Ancestral Heritage Artifact"

Narrative Source Text (Chapter 1, ~320 words / ~1,500 Unicode chars): |
  Chương 1: Huyết Bội Dị Biến.
  Mặt trời lặn sau rặng núi phía tây trấn Thanh Phong. Lâm Phong khẽ lau đi mồ hôi trên trán, nhìn xuống ngực áo nơi chiếc Ngọc Bội Huyết Long đang tỏa ra một luồng hơi ấm kỳ lạ. Gia tộc sa sút, phụ thân mất tích, chỉ còn lại miếng ngọc bội cổ xưa này làm manh mối duy nhất.
  Phía xa, Diệp Linh Nhi từ hướng bờ sông chạy lại, thở hổn hển: "Lâm Phong ca ca, ngày mai chúng ta phải rời khỏi Cồn Vân rồi, huynh đã chuẩn bị xong chưa? Nghe đồn trên Hắc Long Động gần đây có yêu thú xuất hiện, đường đi e là không bình yên."
  Lâm Phong nắm chặt chuôi đao gỉ sét bên hông, ánh mắt kiên định: "Linh Nhi đừng sợ, dù có gặp hiểm nguy gì, ta cũng sẽ bảo vệ muội."

Canon Profile (Lâm Phong - Approved State):
  description: "Thiếu niên kiên định mang trong mình huyết mạch bí ẩn."
  appearance: "Vết sẹo mảnh cắt ngang lông mày trái, ánh mắt sắc như chim ưng."
  personality: "Trầm tĩnh, cẩn trọng và không dễ tin người."
  effective_from_chapter: 1

Private Author Note (STRICT CONFIDENTIALITY INVARIANT):
  author_notes: |
    [BẢO MẬT TÁC GIẢ] Ngọc Bội Huyết Long thực chất phong ấn tàn hồn của Cửu U Ma Tôn. Lâm Phong khi kích hoạt thần thông sẽ bị ma khí ăn mòn tâm trí. Chi tiết này TUYỆT ĐỐI BẢO MẬT, không được xuất hiện trong bất kỳ ngữ cảnh sinh đoạn văn hay tóm tắt nào.

Next-Chapter Writing Instruction (Chapter 2 Draft):
  instruction: "Viết tiếp cảnh sáng sớm hôm sau tại cảng Cồn Vân, Lâm Phong và Diệp Linh Nhi chuẩn bị lên thuyền thì gặp đám gia đinh họ Triệu đến khiêu khích."
  operation: "continue"
  chapter_number: 2
```

### 5.2 Imperfect Extraction & Candidate Quality Protocol

A production LLM processing raw Vietnamese prose will produce imperfect extractions. The acceptance test does **not** assume 100% zero-shot accuracy; instead, it defines explicit measurement and error-recovery boundaries:

#### 1. Metric Formulations:
- **True Positives (TP):** Target canonical entities correctly identified (`Lâm Phong` [PER], `Diệp Linh Nhi` [PER], `Trấn Thanh Phong` [LOC], `Cồn Vân` [LOC], `Ngọc Bội Huyết Long` [ITEM]).
- **False Positives (FP):** Non-entities incorrectly proposed as named entities (e.g., `"Mặt trời"`, `"Ngực áo"`, `"Gia tộc"`, `"Phía tây"`).
- **False Negatives (FN):** Target canonical entities present in the source text that the LLM missed entirely.
- **Precision Target:** $\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}} \ge 0.70$.
- **Recall Target:** $\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}} \ge 0.75$.

#### 2. HITL Checkpoint Absorption & Rejection Flow:
The Author IDE HITL checkpoint is specifically engineered to handle imperfect extractions without corrupting Canon:
```
[Raw Candidate Proposals from LLM]
                │
                ▼
[Status: waiting_entity_review] (Pauses downstream pipelines)
                │
   Author Review Action (UI or API):
   ├─► Valid Entities (TP)    ──► verdict: "entity", assign canonical identity
   ├─► False Positives (FP)   ──► verdict: "not_entity" (SCRUBBED: name/type stripped)
   └─► Type Errors (e.g. LOC) ──► correct entity_type (e.g. ITEM -> LOC)
                │
                ▼
[POST /entity-reviews/{run_id}/continue]
                │
   Downstream Event/Fact Pipeline:
   ├─► Restricted exclusively to ReviewedInventory
   └─► Rejected candidates (FP) are permanently barred from entering narrative.entities
```

#### 3. Acceptance Pass/Fail Criteria:
- **PASS:**
  - LLM extracts `Lâm Phong` and `Diệp Linh Nhi` as `PER` (Recall $\ge 0.75$).
  - Spurious common nouns are successfully filtered out via `verdict: "not_entity"`.
  - Only author-confirmed entities advance to `narrative.entities`.
  - Generation prompt in Chapter 2 contains `Lâm Phong`'s approved profile (`Vết sẹo mảnh cắt ngang lông mày trái`).
  - Private author note (`[BẢO MẬT TÁC GIẢ]`, `Cửu U Ma Tôn`) is strictly **0% present** in prompt context and generated text.
- **FAIL:**
  - Unreviewed candidates automatically mutate `narrative.entities`.
  - Private author notes leak into the prompt payload or generated prose.
  - LLM failure triggers synthetic local mock text while claiming live provider success.

---

## 6. Blocking Prerequisites Before Live Provider Handshake

Live provider testing remains **STRICTLY BLOCKED** pending the resolution of the following items:

1. **[BLOCKER 1 - G-01] Runtime HITL Compose Configuration:**
   A dedicated runtime override file (`runtime/docker-compose.hitl-live.yml`) must be provided so that `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` is injected into the container without mutating integration source files.
2. **[BLOCKER 2 - G-02] Hard Request Budget Enforcement:**
   A fail-closed client-side request counter capping total outbound requests across Python and Node at $\le 15$ calls must be implemented in the acceptance harness.
3. **[BLOCKER 3 - G-03] Timeout Parameter Propagation:**
   `LLMService._call_gemini` in `ai-service/core/llm_service.py` currently ignores `self.timeout_seconds`. An approved fix passing timeout options to `genai.Client` must be scheduled.
4. **[BLOCKER 4 - G-04] Project Quota & Access Verification:**
   Explicit credential access for model `gemini-3.5-flash-lite` must be authorized by the repository owner with rate pacing ($\ge 4.5\text{s}$ interval) configured.

---

## Preflight Verification Sign-Off

- **Audited by:** Gemini 3.8 Flash (Autonomous Agent)
- **Review Standard:** GPT-6 Independent Review Criteria (`P1-LIVE-AI-PREFLIGHT-01`)
- **Next Step:** Commit revised preflight report and open Draft PR targeting `integration/p1-demo-20261109` for reviewer sign-off.
