# P1-LIVE-AI-PREFLIGHT-01: Zero-Call Provider Readiness Audit (Revised)

- **Document Reference:** `docs/development/integration/p1-author/P1_LIVE_AI_PREFLIGHT_01.md`
- **Repository:** `Ephurin/Novel_sharing_platform`
- **Target Branch for Draft PR:** `integration/p1-demo-20261109` (Base commit: `6cbff8829d731704a0e8301fedaa2b1f38dd14c1`)
- **Working Branch:** `gemini/p1-live-ai-preflight-01`
- **Audit Date:** 2026-10-30
- **Audit Scope:** Runtime Compose Topology, Provider Adapter Implementation, Timeout and Failure Mapping, Hard Call Budgeting, Pricing & Quota Modeling, Pre-HITL vs. Post-HITL Evaluation Metrics, and Acceptance Fixture.
- **Provider Invocation Status:** **ZERO CALLS (0 generative/handshake calls executed; $0.00 spent).**

---

## Executive Summary & Independent Review Disposition

This preflight audit directly addresses all findings raised in the **GPT-6 Independent Review (`NEEDS_CHANGES`)**, incorporating both foundational findings (G-01 through G-05) and targeted review findings (F01 through F04):

| Finding ID | Review Finding Description | Audit Resolution & Implementation Status |
|---|---|---|
| **G-01 / F04** | Runtime Compose Configuration & Evidence | **AUDITED & VERIFIED (NOT_RUN on live container):** Neither `docker-compose.yml:40-52` nor `docker-compose.flash-lite-demo.yml:4-14` defines `ENTITY_CANDIDATE_VERIFICATION_ENABLED`. Executed `docker compose config` with command evidence confirming it defaults to `false` via `ai-service/core/settings.py:5-9, 59, 146`. Live container runtime readback is marked **`NOT_RUN` (derived from static source/compose inspection)**. All file paths converted to repository-relative format. |
| **G-02 / F02** | Hard Provider Budget & Rate Limiting | **`NOT IMPLEMENTED` in runtime code:** Disambiguated in-memory `ContextBudgetPacker` token limits from outbound financial/request ceilings. Removed claims that a naive 4.5s sleep guarantees $\le 12$ RPM. Formulated a shared sliding-window rate limiter and hard 15-request cap spanning both Python (`LLMService`) and Node (`llm-provider.ts`) paths. Status remains **`NOT IMPLEMENTED` / BLOCKED**. |
| **G-03** | Deadline & Failure Mapping | **AUDITED & CORRECTED:** Verified that `ai-service/core/llm_service.py:221-234` does **not** pass `LLM_TIMEOUT_SECONDS` to the Google GenAI SDK. Confirmed that 429/timeout errors are not mapped to HTTP 429/503 or `QUOTA_EXCEEDED` codes; unhandled provider errors produce generic 500 errors in APIs and `error={"message": ...}` in `WritingService`. Verified `LLM_LOCAL_FALLBACK=false` requirement. |
| **G-04 / F01** | Model, Quota & Pricing Modeling | **AUDITED & DISAGGREGATED:** Separated documented model strings (`MODEL_ID_DOCUMENTED`) from project-level credentials (`PROJECT_ACCESS_UNVERIFIED`). Relabeled 15 RPM / 250K TPM / 500 RPD as an `UNVERIFIED_ASSUMPTION`. Corrected pricing to official paid Standard rates ($0.30/1M input, $2.50/1M output $\implies \$0.01535$/nominal run). Removed the incorrect $0.004 ceiling claim. Separated Estimated Cost, Authorized Spending Ceiling, and Enforced Spending Ceiling (`NOT IMPLEMENTED`). |
| **G-05 / F03** | Acceptance Fixture & Evaluation Metrics | **UPDATED TO EPHURIN UNIVERSE WITH FORMAL METRICS:** Configured Ephurin canonical fixture (5 entities: `Lâm Phong`, `Diệp Linh Nhi`, `Trấn Thanh Phong`, `Cồn Vân`, `Ngọc Bội Huyết Long`). Set mathematical Recall target $\ge 0.75 \implies \ge 4/5$ canonical entities. Strictly separated Pre-HITL extraction quality (Recall $\ge 0.75$, Precision $\ge 0.70$) from Post-HITL Canon correctness (100% integrity, 0 FP in canon, 0 private note leak). Added detailed TP/FP/FN/Type-Error classification table and explicit FAIL criteria. |

### Final Preflight Verdict

```
P1_LIVE_AI_PREFLIGHT_NEEDS_CHANGES (BLOCKED ON RUNTIME HARNESS & BUDGET ENFORCEMENT)
```

**Zero live Gemini calls will be issued until all blocking prerequisites are formally resolved and approved.**

---

## 1. Runtime Compose Configuration (Findings G-01 & F04)

### 1.1 Source Inspection of Compose Files

An AST and text audit of active Docker Compose configurations reveals:
1. **Base Compose (`docker-compose.yml:40-52`):**
   Under `services.ai-service.environment`, the following variables are defined:
   - `PLATFORM_API_BASE_URL`, `PLATFORM_SERVICE_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
   - `EMBEDDING_PROVIDER`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SEMANTIC_RETRIEVAL_ENABLED`
   - `ACTIVE_EMBEDDING_VERSION`, `SEMANTIC_RETRIEVAL_LIMIT`, `CONTEXT_ROUTING_POLICY`
   - **`ENTITY_CANDIDATE_VERIFICATION_ENABLED` is NOT listed.**
2. **Demo Override (`docker-compose.flash-lite-demo.yml:4-14`):**
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
3. **Application Default and Environment Parser (`ai-service/core/settings.py:5-9, 59, 146`):**
   In `ai-service/core/settings.py`, the boolean environment parser is defined as:
   ```python
   def _env_bool(name: str, default: bool) -> bool:
       raw_value = os.getenv(name)
       if raw_value is None:
           return default
       return raw_value.strip().lower() not in {"0", "false", "no", "off"}
   ```
   The field definition in `Settings` (line 59) is:
   ```python
   entity_candidate_verification_enabled: bool = False
   ```
   In `Settings.from_env()` (line 146), it is initialized via:
   ```python
   entity_candidate_verification_enabled=_env_bool('ENTITY_CANDIDATE_VERIFICATION_ENABLED', False),
   ```
   When `ENTITY_CANDIDATE_VERIFICATION_ENABLED` is not set in the process environment, `os.getenv` evaluates to `None`, causing `_env_bool` to return `default` (`False`).

### 1.2 `docker compose config` Execution & Evidence

To prove whether `ENTITY_CANDIDATE_VERIFICATION_ENABLED` is injected into the container environment, the following command was executed against the repository:

**Command Executed:**
```powershell
$env:GEMINI_API_KEY="dummy_key_for_config_validation"; docker compose -f docker-compose.yml -f docker-compose.flash-lite-demo.yml config
```

**Execution Output (Excerpt for `services.ai-service.environment`):**
```yaml
name: novel_sharing_platform
services:
  ai-service:
    build:
      context: C:\Users\thaib\Documents\Projects\Novel_sharing_platform\Novel_sharing_platform\ai-service
      dockerfile: Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
        required: true
    environment:
      ACTIVE_EMBEDDING_VERSION: ""
      APP_ENV: production
      CONTEXT_ROUTING_POLICY: legacy-v1
      DATABASE_URL: postgresql+psycopg://postgres:postgres@postgres:5432/ephurin
      EMBEDDING_PROVIDER: none
      GEMINI_API_KEY: dummy_key_for_config_validation
      GOOGLE_API_KEY: ""
      LLM_API_KEY: ""
      LLM_BASE_URL: ""
      LLM_ENABLED: "true"
      LLM_FALLBACK_PROVIDER: ""
      LLM_LOCAL_FALLBACK: "false"
      LLM_MODEL: gemini-3.5-flash-lite
      LLM_PROVIDER: gemini
      NARRATIVE_REPOSITORY: postgres
      PLATFORM_API_BASE_URL: http://backend:4000
      PLATFORM_SERVICE_TOKEN: test-token
      PORT: "8000"
      SEMANTIC_RETRIEVAL_ENABLED: "false"
      SEMANTIC_RETRIEVAL_LIMIT: "8"
```

**Verification Finding:**
`ENTITY_CANDIDATE_VERIFICATION_ENABLED` is completely omitted from the generated container configuration. 

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

**Live Container Readback Status: `NOT_RUN (derived from static inspection)`**
The container readback command:
```bash
docker compose exec ai-service python -c "from core.settings import Settings; assert Settings.from_env().entity_candidate_verification_enabled is True; print('HITL Checkpoint: ENABLED')"
```
has **not** been executed against a running container because the demo stack is not running. Its status is strictly **`NOT_RUN` (Pending container runtime startup)**.

---

## 2. Provider Hard Budget Enforcement (Findings G-02 & F01/F02)

### 2.1 Disambiguation: Context Budget vs. Provider Budget

It is vital to distinguish two fundamentally different budgeting systems in the architecture:

| Budget Type | Subsystem | Scope & Mechanism | Enforcement Status |
|---|---|---|:---:|
| **Context Token Budget** | `ContextBudgetPacker` (`ai-service/application/context_budget.py`) | In-memory prompt packing. Trims low-priority narrative events to keep prompts within 12,000–24,000 token tiers. Does **NOT** count HTTP requests or limit external cloud costs. | **IMPLEMENTED** |
| **Provider Financial / Request Budget** | Outbound HTTP Gateway / Harness | Hard ceiling on physical outbound API requests to external Google/OpenAI endpoints. Capped at $\le 15$ requests. | **`NOT IMPLEMENTED`** |
| **Financial Cost Governor** | Billing / Token Tracking Governor | Hard ceiling on cumulative dollar spend. Fails closed before incurring unexpected cloud charges. | **`NOT IMPLEMENTED`** |

### 2.2 Dual Provider Paths in the Architecture

Outbound LLM calls can be initiated through two distinct paths:
1. **Path A (Python AI-Service — `LLMService` in `ai-service/core/llm_service.py`):**
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

## 3. Deadline and Failure Mapping (Findings G-03 & F04)

### 3.1 `LLM_TIMEOUT_SECONDS` Audit in Google SDK

Inspection of `ai-service/core/llm_service.py`:
- In `__init__` (line 32), `self.timeout_seconds = timeout_seconds` is recorded.
- In `_call_openai()` (lines 304–305), `timeout=self.timeout_seconds` is passed to `OpenAI()`.
- **In `_call_gemini()` (`ai-service/core/llm_service.py:221-234`):**
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
1. **In `_call_gemini()` (`ai-service/core/llm_service.py:247`):**
   Any exception from the SDK is wrapped in `LLMServiceError(f"Gemini request failed: {exc}")`.
2. **In Synchronous Endpoints (e.g. `POST /v1/revisions/{id}/analyses`):**
   `LLMServiceError` is uncaught in FastAPI route handlers, propagating as an unhandled exception resulting in HTTP `500 INTERNAL_SERVER_ERROR`. The Node Gateway logs this as `AI_SERVICE_500`.
3. **In Asynchronous Writing Generation (`ai-service/application/writing_service.py:493-517`):**
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

In `ai-service/core/llm_service.py:507-511`:
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

## 4. Model, Quota, Pricing, and Rate Limiting (Findings G-04, F01, F02)

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

### 4.3 Official Pricing and Financial Disaggregation (Finding F01)

Per Google Cloud official paid Standard tier pricing for `gemini-3.5-flash-lite`:
- **Input Tokens:** **$0.30 per 1,000,000 tokens**
- **Output Tokens:** **$2.50 per 1,000,000 tokens**

#### Nominal Workflow Run Cost (1 run $\approx 11$ requests, 22,000 input tokens, 3,500 output tokens):

$$\text{Input Cost} = \frac{22{,}000 \text{ tokens}}{1{,}000{,}000} \times \$0.30 = \$0.00660 \text{ USD}$$

$$\text{Output Cost} = \frac{3{,}500 \text{ tokens}}{1{,}000{,}000} \times \$2.50 = \$0.00875 \text{ USD}$$

$$\text{Total Estimated Cost for 1 Workflow Run} = \$0.00660 + \$0.00875 = \mathbf{\$0.01535 \text{ USD}}$$

#### 15-Call Maximum Exposure Forecast (Worst case with retries/repairs, ~30,000 input, ~5,000 output tokens):

$$\text{15-Call Estimated Upper Bound} \approx \frac{30{,}000}{1{,}000{,}000} \times \$0.30 + \frac{5{,}000}{1{,}000{,}000} \times \$2.50 = \$0.00900 + \$0.01250 = \mathbf{\$0.02150 \text{ USD}} \approx \$0.025 \text{ USD}$$

#### Financial Governance Disaggregation:

To eliminate ambiguity between estimated consumption, administrative caps, and programmatic circuit breakers, cost control is separated into three distinct tiers:

| Cost Tier | Dollar Value | Description & Mechanism | Enforcement Status |
|---|---|---|:---:|
| **Estimated Cost** | $\approx \mathbf{\$0.01535 \text{ USD}}$ / run<br>(Worst-case 15 calls: $\approx \$0.025$) | Expected actual billing for 1 nominal execution based on official rates ($0.30 / $2.50 per 1M tokens). | **ESTIMATED** (Model projection) |
| **Authorized Spending Ceiling** | $\mathbf{\$0.50 \text{ USD}}$ (or $\$1.00$ USD) | Proposed administrative limit approved by project owner. Provides a $\ge 30\times$ safety margin over a single run. | **PROPOSED** (Operator governance) |
| **Enforced Spending Ceiling** | None in code | Code-level financial circuit breaker that halts calls when spend reaches threshold. | **`NOT IMPLEMENTED`** |

*(Note: Prior claims that 15 calls correspond to a hard cost ceiling of $0.004 have been retracted per official paid standard rates).*

### 4.4 Shared Sliding-Window Rate Limiting Architecture (Finding F02)

A naive sequential delay (such as an arbitrary 4.5-second sleep) does **not** guarantee $\le 12$ RPM across an asynchronous system with concurrent workers, retries, and multiple integration points. 

To guarantee project-level compliance with Google Gemini's 15 RPM project quota:
1. **Shared Sliding-Window Coordinator:**
   A shared sliding-window rate limiter must track outbound request timestamps across all processes over a rolling 60-second window.
2. **Multi-Path Coverage:**
   The limiter must mediate both:
   - **Path A:** Python AI-Service (`LLMService` in `ai-service/core/llm_service.py`).
   - **Path B:** Node Gateway (`llm-provider.ts` in `backend/src/modules/ai-copilot/llm-provider.ts`).
3. **Pacing Threshold:**
   To guarantee a safety margin under 15 RPM, the coordinator enforces a threshold of **$\le 10$ requests per rolling 60 seconds** across all components. When the quota is reached, subsequent requests are paced (delayed) or rejected before dispatch.
4. **Current Status:**
   **`NOT IMPLEMENTED`**. The system is marked **BLOCKED** until this shared rate-limiting mechanism is integrated into the test harness.

---

## 5. Acceptance Design & Evaluation Metrics (Findings G-05 & F03)

### 5.1 Fictional Canonical Fixture Specification (Ephurin Universe)

To maximize continuity with verified P1/AX-01/AX-02 acceptance evidence, the live evaluation fixture utilizes Ephurin's canonical characters and universe:

```yaml
Story Metadata:
  novel_id: "c8791754-faf2-4e55-b94e-f0df60ee29c2"
  title: "Bá Đao Nghịch Mệnh"
  genre: "Xianxia / Eastern Fantasy"

Canonical Entities (Target Ground Truth - Exactly 5 Entities):
  1. canonical_name: "Lâm Phong"
     entity_type: "PER"
     role: "Protagonist"
  2. canonical_name: "Diệp Linh Nhi"
     entity_type: "PER"
     role: "Junior Martial Sister"
  3. canonical_name: "Trấn Thanh Phong"
     entity_type: "LOC"
     role: "Starting Town"
  4. canonical_name: "Cồn Vân"
     entity_type: "LOC"
     role: "River Island Port"
  5. canonical_name: "Ngọc Bội Huyết Long"
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

### 5.2 Pre-HITL vs. Post-HITL Evaluation Protocol (Finding F03)

A production LLM processing raw Vietnamese prose will produce imperfect candidate proposals. The acceptance framework does **not** assume 100% zero-shot accuracy; instead, it establishes a strict mathematical separation between **Pre-HITL Extraction Quality** (evaluating raw LLM proposals) and **Post-HITL Canon Correctness** (evaluating database integrity after human review).

#### 1. Mathematical Metric Formulations (Ground Truth $N = 5$ Entities):

With exactly 5 target canonical entities in the ground truth fixture:
$$\text{Recall} = \frac{\text{TP}}{N_{\text{ground\_truth}}} = \frac{\text{TP}}{5} \ge 0.75 \implies \text{TP} \ge \lceil 5 \times 0.75 \rceil = 4$$

**Exact Acceptance Threshold:** The LLM must correctly extract a minimum of **4 out of the 5** canonical entities.

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}} \ge 0.70$$

#### 2. Candidate Classification Taxonomy:

| Classification | Definition | Example in Fixture | Pipeline / Reviewer Action | Impact on Evaluation |
|---|---|---|---|---|
| **True Positive (TP)** | Canonical entity correctly extracted with correct type | `Lâm Phong` proposed as `PER` | Author reviews and confirms (`verdict: "entity"`) | Increments TP count; required for Recall threshold ($\ge 4/5$). |
| **False Positive (FP)** | Non-entity or common noun incorrectly proposed as named entity | `"Mặt trời"` proposed as `LOC`, `"Ngực áo"` proposed as `ITEM` | Author rejects proposal (`verdict: "not_entity"`); candidate scrubbed | Affects Pre-HITL Precision ($\frac{\text{TP}}{\text{TP} + \text{FP}} \ge 0.70$). Permanently barred from Canon. |
| **False Negative (FN)** | Target canonical entity present in text but missed by LLM | `Cồn Vân` omitted from candidate list | Author manually registers or continues without candidate | Affects Pre-HITL Recall ($\frac{\text{TP}}{5} \ge 0.75$). Max 1 missed entity permitted. |
| **Entity-Type Error (Misclassification)** | Target entity detected, but assigned incorrect type | `Ngọc Bội Huyết Long` proposed as `LOC` instead of `ITEM` | Author corrects type during review | Counted as Pre-HITL classification defect. Must be corrected prior to continuation. |

#### 3. HITL Absorption & Rejection Flow:

```
[Raw Candidate Proposals from LLM]
                │
                ▼
[Status: waiting_entity_review] (Pauses downstream pipelines)
                │
   Author Review Action (UI or API):
   ├─► Valid Entities (TP)    ──► verdict: "entity", assign canonical identity
   ├─► False Positives (FP)   ──► verdict: "not_entity" (SCRUBBED: name/type stripped)
   └─► Type Errors (e.g. LOC) ──► correct entity_type (e.g. LOC -> ITEM)
                │
                ▼
[POST /entity-reviews/{run_id}/continue]
                │
   Downstream Event/Fact Pipeline:
   ├─► Restricted exclusively to ReviewedInventory
   └─► Rejected candidates (FP) are permanently barred from entering narrative.entities
```

#### 4. Explicit PASS / FAIL Criteria:

| Evaluation Dimension | Metric / Invariant | Threshold / Target | Result if Violated |
|---|---|:---:|:---:|
| **Pre-HITL Extraction** | Entity Extraction Recall | $\ge 0.75$ ($\ge 4 / 5$ entities) | **FAIL** (Model extraction capability inadequate) |
| **Pre-HITL Extraction** | Entity Extraction Precision | $\ge 0.70$ | **FAIL** (Excessive hallucinations or noise) |
| **Post-HITL Canon Correctness** | Spurious Candidates in Canon | **Strictly 0 (0% leakage)** | **FAIL** (Data corruption: rejected candidate entered `narrative.entities`) |
| **Post-HITL Canon Correctness** | Automatic Canon Mutation | **0 mutations before review** | **FAIL** (Unreviewed candidates bypass HITL gate) |
| **Privacy / Confidentiality** | Private Author Note Leakage | **Strictly 0% in prompts / drafts** | **FAIL** (Security invariant breach: confidential notes exposed) |
| **Profile Grounding** | Approved Profile Inclusion | **100% present in draft prompt** | **FAIL** (Story brain continuity lost in generation) |
| **Harness Discipline** | Silent Local Mock Fallback | **0 fallback activations** | **FAIL** (Harness masked provider failure with fake text) |
| **Harness Discipline** | Total Outbound Requests | $\le 15$ requests | **FAIL** (Budget cap exceeded or runaway loop) |

---

## 6. Blocking Prerequisites Before Live Provider Handshake

Live provider testing remains **STRICTLY BLOCKED** pending the formal resolution of the following four blocking items:

1. **[BLOCKER 1 - G-01 / F04] Runtime HITL Compose Configuration:**
   A dedicated runtime override file (`runtime/docker-compose.hitl-live.yml`) must be provided and wired so that `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` is injected into the container without mutating integration source files.
2. **[BLOCKER 2 - G-02 / F02] Shared Sliding-Window Budget & Rate Limiter:**
   A cross-process shared sliding-window rate limiter ($\le 10$ requests / 60s) and fail-closed request counter capping total outbound requests across Python and Node at $\le 15$ calls must be implemented in the acceptance harness.
3. **[BLOCKER 3 - G-03] Timeout Parameter Propagation:**
   `LLMService._call_gemini` in `ai-service/core/llm_service.py:221-234` currently ignores `self.timeout_seconds`. An approved update passing timeout options to `genai.Client` must be scheduled.
4. **[BLOCKER 4 - G-04 / F01] Project Quota & Access Verification:**
   Explicit credential access for model `gemini-3.5-flash-lite` must be authorized by the repository owner with an authorized spending ceiling ($0.50 USD) approved.

---

## Preflight Verification Sign-Off

- **Audited by:** Gemini 3.8 Flash (Autonomous Agent)
- **Review Standard:** GPT-6 Independent Review Criteria (`P1-LIVE-AI-PREFLIGHT-01`, Remediation F01–F04)
- **Next Step:** Commit revised preflight report, push to `gemini/p1-live-ai-preflight-01`, and provide Draft PR compare URL targeting `integration/p1-demo-20261109` for reviewer sign-off.
