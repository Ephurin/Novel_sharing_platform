# Pipeline Diagrams — AI Writing Copilot

> **Active workflow: [WORKFLOW_CONTRACT.md v1.4](../../Pipeline_test/WORKFLOW_CONTRACT.md) (2026-10-21).**  
> **Current architecture:** [ARCHITECTURE.md](ARCHITECTURE.md), [source-inspected API matrix](CURRENT_API_IMPLEMENTATION_MATRIX.md).  
> **Evidence boundary:** The diagrams in sections **1–8 below are historical UC-01/02/03 design diagrams**, not the present-tense implementation or a certificate of P1/P2/P3 live success. They predate the Human Entity Review checkpoint, P3 human suspension, Story Plan implementation and Phase-7 hybrid retrieval. In particular, **event/fact is not allowed before human entity approval** when the new feature flag is ON. The old "changed spans" and "no context yet" source mapping remains an archived historical comparison only.

## 0. Current accepted flows (contract v1.4)

### P1 — Existing manuscript, human review before event/fact

```mermaid
flowchart TD
    A[Author UI imports chapters and saves immutable revisions] --> B[Explicit bootstrap / entity discovery]
    B --> C[Occurrence verdicts + source offsets]
    C --> D[waiting_entity_review]
    D --> E[Author keep / reject / correct; optional hints rerun entity only]
    E --> F[entities_reviewed frozen checkpoint]
    F --> G[Event fact state extraction from reviewed entities]
    G --> H[Canon proposal group review / source version guard]
    H --> I[(Official Story Brain event history / projections)]
    I --> J[Generate or author-write + save chapter revision]
    J --> K[Durable outbox / incremental analysis]
    K --> C
```

Author hints and machine decisions are not canon. Entity approval **freezes inventory** but cannot directly materialize official facts. Save of an ordinary author draft with active baseline must enqueue extraction for the **new revision**, not require a manual snapshot/write API in the test. S01–S11 must be performed via actual author UI for a `LIVE_UI` verdict.

### P2 — Idea/setup explicit, creative blueprint optional

```mermaid
flowchart TD
    A[Author-supplied setup and constraints] --> B{Mode?}
    B -->|extract - standard UI| C[Extract explicitly mentioned characters and locations]
    B -->|blueprint - separate creative mode| D[Model-proposed world bible / character suggestions]
    C --> E[Author reviews setup entities]
    D --> F[Author reviews and accepts model-proposed canon]
    E --> G[Approved baseline M0]
    F --> G
    G --> H[Future Story Plan - not historical events]
    H --> I[Generate first chapter / accept saved revision]
    I --> J[Chapter entity review, event/fact, canon / M-FIRST]
```

P2 setup review and **P2 first prose revision** have different evidence: do not count setup extraction as chapter chunk discovery or future outline as occurred history.

### P3 — Controller with human entity gate and mandatory terminal novel

```mermaid
flowchart TD
    A[Approved baseline + optional plan] --> B[P3 chooses objective and builds actual packed context]
    B --> C[Generate / validate / persist accepted draft revision]
    C --> D[Outbox / actual analysis status]
    D --> E{Human entity checkpoint?}
    E -->|waiting_for_entity_review| F[Persist run + pause objective; author reviews entities]
    F --> G[Continue revision event fact / canon]
    E -->|No HITL pending| G
    G --> H{Memory completed for exact revision?}
    H -->|No / provider blocked| I[Bounded wait retry or stop, no objective advancement]
    H -->|Yes| J[Evaluate objective against saved prose]
    J -->|Not achieved| B
    J -->|Achieved / next| K[Next objective or true terminal ending gate]
    K -->|Continue| B
    K -->|Book complete| L[P3_HITL_CONTROLLER_100K: 100,000-105,000 words + audits + blind review]
```

Controller cannot publish or auto-approve the entity checkpoint under flag ON. `P3_HITL_CONTROLLER_100K` has measured human reviews and is **not** `fully_unattended`. An unattended experiment requires an independently approved alternative entity/canon policy and **separate** run/verdict. Neither a probe nor an outbox `COMPLETED` satisfies book acceptance.

## Historical diagrams preserved for traceability

> Tài liệu trực quan hóa toàn bộ pipeline của hệ thống.
> Đọc kết hợp với [ARCHITECTURE.md](ARCHITECTURE.md) (kiến trúc) và [USE_CASES.md](USE_CASES.md) (luồng nghiệp vụ).

---

## 1. Tổng quan hệ thống — System Overview

Sơ đồ tổng thể cho thấy 3 luồng chính (Bootstrap Idea, Import Manuscript, Continuous Writing) và cách chúng tương tác với Story Brain, LLM, và các data store.

```mermaid
flowchart TB
    subgraph Entry["Entry Points"]
        IDEA["UC-01: Y tuong moi"]
        IMPORT["UC-02: Import manuscript"]
    end

    subgraph BrainInit["Story Brain Initialization"]
        BOOTSTRAP_IDEA["Bootstrap from Idea"]
        BOOTSTRAP_IMPORT["Bootstrap from Manuscript"]
        REVIEW_QUEUE["Author Review Queue"]
        BASELINE["Story Brain Baseline v1"]
    end

    subgraph WritingLoop["Continuous Writing Loop - UC-03"]
        WRITE["Author viet hoac yeu cau AI"]
        CONTEXT["Context Builder"]
        GENERATE["LLM Generation"]
        VALIDATE["Consistency Validation"]
        PREVIEW["Author Preview"]
        REVISION["Create Chapter Revision"]
        ANALYZE["Incremental Analysis"]
        PROPOSALS["Entity / Event / State Proposals"]
        AUTHOR_REVIEW["Author Review"]
        COMMIT["Commit Narrative Memory"]
    end

    subgraph DataStores["Data Stores"]
        PG[("PostgreSQL - narrative schema")]
        VEC[("pgvector - Semantic Memory")]
        PLATFORM[("Novel Platform")]
    end

    subgraph AI["AI Services"]
        LLM["LLM Providers"]
        EMBED["Embedding Model"]
    end

    IDEA --> BOOTSTRAP_IDEA
    IMPORT --> BOOTSTRAP_IMPORT
    BOOTSTRAP_IDEA --> REVIEW_QUEUE
    BOOTSTRAP_IMPORT --> REVIEW_QUEUE
    REVIEW_QUEUE --> BASELINE
    BASELINE --> WRITE

    WRITE --> CONTEXT
    CONTEXT --> GENERATE
    GENERATE --> VALIDATE
    VALIDATE --> PREVIEW
    PREVIEW -->|Reject| GENERATE
    PREVIEW -->|Accept/Edit| REVISION
    REVISION --> ANALYZE
    ANALYZE --> PROPOSALS
    PROPOSALS --> AUTHOR_REVIEW
    AUTHOR_REVIEW --> COMMIT
    COMMIT --> WRITE

    CONTEXT -.->|query| PG
    CONTEXT -.->|retrieve| VEC
    GENERATE -.->|call| LLM
    ANALYZE -.->|call| LLM
    COMMIT -.->|write| PG
    COMMIT -.->|index| VEC
    REVISION -.->|save| PLATFORM
    BOOTSTRAP_IDEA -.->|call| LLM
    BOOTSTRAP_IMPORT -.->|call| LLM
    ANALYZE -.->|embed| EMBED
```

---

## 2. UC-01 — Bootstrap from Idea

Luồng chi tiết từ khi tác giả nhập ý tưởng đến khi có Story Brain baseline.

```mermaid
flowchart TD
    A["Tac gia nhap y tuong"] --> B

    B["POST /v1/story-brains/bootstrap/from-idea"]
    B --> C

    subgraph JobWorker["Async Job Worker"]
        C["AI dat cau hoi lam ro"]
        C --> D["AI tao Story Blueprint Proposal"]
        D --> D1["Premise, genre, tone, themes"]
        D --> D2["World rules"]
        D --> D3["Character seeds + initial states"]
        D --> D4["Initial relationships"]
        D --> D5["Main conflict + story arcs"]
        D --> D6["Chapter/scene outline"]
        D --> D7["Open questions"]
    end

    D1 --> E
    D2 --> E
    D3 --> E
    D4 --> E
    D5 --> E
    D6 --> E
    D7 --> E

    E["Ghi proposals vao DB"]
    E --> F

    F{"Author Review Queue"}
    F -->|Accept| G["Materialize Canonical Brain"]
    F -->|Edit + Accept| G
    F -->|Reject| H["Giu lai 90 ngay"]
    F -->|Lock| I["is_locked = true"]

    G --> J["Story Brain Baseline v1"]
    I --> J

    J --> K["Mo Writing IDE"]
```

**Quy tắc dữ liệu quan trọng:**
- Nội dung tương lai **KHÔNG** được ghi vào `events` (event history). MVP giữ chúng dưới dạng open question hoặc draft chưa canonical; planning object được hoãn.
- Chỉ dữ liệu `confirmed` hoặc `locked` mới trở thành canonical Story Brain.

---

## 3. UC-02 — Import Manuscript

Luồng chi tiết từ khi import truyện có sẵn đến khi có Story Brain baseline.

```mermaid
flowchart TD
    A["Tac gia upload manuscript"] --> B

    B["POST /v1/story-brains/bootstrap/from-manuscript"]
    B --> C

    subgraph Pipeline["Import Pipeline - Async Job"]
        C["Chapter/Scene Segmentation"]
        C --> D["Tao immutable revisions"]
        D --> E

        subgraph PerChapter["Lap theo tung Chapter"]
            E["Entity Extraction"]
            E --> F["Entity Normalization"]
            F --> G["Entity Resolution"]
            G --> H["Event Extraction"]
            H --> I["State Transition Detection"]
            I --> J["Relationship Projection"]
            J --> K["World Rule / Author Fact Detection"]
        end

        K --> L["Cross-chapter Conflict Detection"]
        L --> M["Tao Proposals + Findings"]
    end

    M --> N{"Author Review Queue"}

    N --> N1["1. Conflict severity cao"]
    N --> N2["2. Duplicate/ambiguous entity"]
    N --> N3["3. World rules + author facts"]
    N --> N4["4. Current character state"]
    N --> N5["5. Low-confidence events"]

    N1 --> O
    N2 --> O
    N3 --> O
    N4 --> O
    N5 --> O

    O{"Tac gia quyet dinh"}
    O -->|Accept| P["Materialize canonical"]
    O -->|Merge| P
    O -->|Edit + Accept| P
    O -->|Reject| Q["Luu rejection"]
    O -->|Lock| R["Lock fact/entity"]

    P --> S{"Du required proposals reviewed?"}
    R --> S
    S -->|Chua| N
    S -->|Roi| T["Activate Story Brain Baseline"]

    T --> U["Mo Writing IDE"]
```

**Phân loại thông tin trong import:**

| Loại | Ví dụ | Xử lý |
|---|---|---|
| **Explicit** | "A đã chết ở chương 10" | Đề xuất, confidence cao |
| **Inferred** | A có thể đang thù B | Giữ `proposed` |
| **Unknown** | Không rõ A còn giữ thanh kiếm | Đưa vào review queue |

---

## 4. UC-03 — Continuous Writing Loop (Chi tiết)

Đây là **use case trung tâm** sau khi Story Brain baseline được xác nhận.

```mermaid
flowchart TD
    START["Author mo chapter trong IDE"]
    START --> A

    A{"Author chon hanh dong"}
    A -->|Tu viet| B["Author viet text trong Editor"]
    A -->|Yeu cau AI| C["Chon operation"]

    C --> CTX

    subgraph ContextBuild["Context Builder"]
        CTX["Xac dinh entities lien quan"]
        CTX --> CTX2["Query current_entity_states"]
        CTX2 --> CTX3["Retrieve recent events"]
        CTX3 --> CTX4["Retrieve semantic memory"]
        CTX4 --> CTX4B["Hybrid rerank semantic candidates"]
        CTX4B --> CTX5["Load relevant facts + world rules"]
        CTX5 --> CTX6["Deterministic dedup + context-budget pack"]
    end

    CTX6 --> GEN

    subgraph Generation["LLM Generation"]
        GEN["Gui context + prompt toi LLM"]
        GEN --> GEN2["Nhan draft / patch"]
        GEN2 --> VAL["Deterministic Validation"]
    end

    VAL -->|Violation| VAL2["Gan warning vao draft"]
    VAL -->|Pass| PREV
    VAL2 --> PREV

    PREV["Author Preview - Diff in editor"]
    PREV -->|Reject| C
    PREV -->|Edit| EDIT["Author chinh sua draft"]
    PREV -->|Accept| APPLY
    EDIT --> APPLY

    B --> APPLY
    APPLY["Create New Chapter Revision"]

    APPLY --> DELTA

    subgraph Analysis["Incremental Analysis"]
        DELTA["Compute Changed Spans"]
        DELTA --> EXT["Entity Extraction"]
        EXT --> NORM["Entity Normalization + Resolution"]
        NORM --> EVT["Event Extraction"]
        EVT --> STATE["State Transition Detection"]
        STATE --> REL["Relationship Projection Update"]
        REL --> CONSIST["Consistency Check"]
        CONSIST --> FIND["Tao Findings"]
    end

    EXT --> PROP
    EVT --> PROP
    STATE --> PROP
    REL --> PROP
    PROP["Tao Proposals"]

    FIND --> REVIEW
    PROP --> REVIEW

    REVIEW{"Author Review"}
    REVIEW -->|Accept| COMMIT
    REVIEW -->|Auto-accept| COMMIT
    REVIEW -->|Reject| SAVE_REJ["Luu rejection"]
    REVIEW -->|Edit + Accept| COMMIT

    subgraph CommitTx["Single Transaction"]
        COMMIT["Lock proposal + Check brain_version"]
        COMMIT --> MAT["Materialize canonical record"]
        MAT --> PROJ["Update projections"]
        PROJ --> VER["Tang brain_version"]
        VER --> MARK["Mark proposal = accepted"]
    end

    MARK --> IDX["Update Semantic Index"]
    IDX --> START
```

---

## 5. Analysis Pipeline — Chi tiết từng stage

Sơ đồ chi tiết bên trong Analysis Pipeline, hiển thị input/output và data flow.

```mermaid
flowchart LR
    subgraph Input["Input"]
        REV["Chapter Revision"]
    end

    subgraph Stage1["Stage 1: Entity Extraction"]
        E1["LLM: Trich xuat entities"]
        E1 --> E1O["canonical_name, entity_type, aliases, evidence, confidence"]
    end

    subgraph Stage2["Stage 2: Entity Resolution"]
        E2["So sanh voi entities da co"]
        E2 --> E2A{"Match found?"}
        E2A -->|Exact match| E2B["Link to existing entity"]
        E2A -->|Possible dup| E2C["Tao merge proposal"]
        E2A -->|New entity| E2D["Tao new entity proposal"]
    end

    subgraph Stage3["Stage 3: Event Extraction"]
        E3["LLM: Trich xuat events"]
        E3 --> E3O["event_type, summary, participants, location, consequences"]
    end

    subgraph Stage4["Stage 4: State Transition"]
        E4["So sanh event voi current states"]
        E4 --> E4O["entity_id, attribute_key, previous_value, new_value"]
    end

    subgraph Stage5["Stage 5: Consistency Check"]
        E5A["Deterministic Rules"]
        E5B["LLM Reasoning"]
        E5A --> E5OUT["Findings: type, severity, message, evidence"]
        E5B --> E5OUT
    end

    subgraph Stage6["Stage 6: Semantic Indexing"]
        E6["Tao memory_chunks"]
        E6 --> E6E["Embedding Model"]
        E6E --> E6O["Ghi vao pgvector"]
    end

    REV --> E1
    E1O --> E2
    E2B --> E3
    E2C --> E3
    E2D --> E3
    E3O --> E4
    E4O --> E5A
    E4O --> E5B
    E5OUT --> E6
    E3O --> E6
```

**Idempotency:** Mỗi stage được track bằng `analysis_runs` với idempotency key `{tenant_id}:{chapter_id}:{revision_id}:{operation}:{pipeline_version}`. Chạy lại cùng revision không tạo dữ liệu trùng.

---

## 6. Generation Pipeline — Chi tiết Context Builder

Sơ đồ chi tiết bên trong Generation Pipeline, cho thấy cách Context Builder tổng hợp thông tin trước khi gửi cho LLM.

```mermaid
flowchart TD
    subgraph Trigger["Trigger"]
        T["Author yeu cau AI generate"]
        T --> T2["Xac dinh: current_text, operation_type, brain_version"]
    end

    subgraph ContextBuilder["Context Builder"]
        C1["1. Relevant Entity Detection - NER"]

        C2["2. Current State Lookup"]

        C3["3. Recent Events Query"]

        C4["4. Semantic Memory Retrieval - exact pgvector"]

        C4B["5. Hybrid deterministic rerank"]

        C5["6. Facts and World Rules - locked uu tien"]

        C6["7. Author Instructions / Constraints"]

        C1 --> C2 --> C3 --> C4 --> C4B --> C5 --> C6

        C6 --> ASSEMBLE["ContextBudgetPacker: dedup + whole-artifact packing"]
    end

    subgraph LLMCall["LLM Call"]
        PROMPT["Prompt Assembly: SYSTEM + CONTEXT + USER"]
        PROMPT --> LLM["LLM Provider - Qwen / Cloud fallback"]
        LLM --> OUTPUT["Structured Output: draft, patch, generation_id"]
    end

    subgraph PostGen["Post-Generation"]
        CHECK["Deterministic Validation"]
        CHECK -->|Pass| RESULT["Return to Frontend"]
        CHECK -->|Violation| WARN["Attach warnings"]
        WARN --> RESULT
    end

    T2 --> C1
    ASSEMBLE --> PROMPT
    OUTPUT --> CHECK

    RESULT --> FRONTEND["Frontend: Preview Diff - Accept / Edit / Reject"]
```

**Nguyên tắc quan trọng:**
- AI service **không apply patch** — chỉ trả draft/patch cho frontend preview.
- Platform tạo revision mới sau khi tác giả accept.
- Mọi generation lưu IDs của context artifacts đã sử dụng (traceability).
- P7-05 chỉ có một production budget owner sau semantic/hybrid retrieval; repository-level fixed-cost budgeting chỉ là compatibility path cho direct callers.
- Budget được ước lượng từ canonical compact UTF-8 JSON của Story Brain context; estimator không phải exact tokenizer và không bao gồm system prompt, selected text, instruction/style/request constraints hay output tokens.
- Locked rules/facts, author constraints và locked entity/state bundles không bị silent truncation; nếu riêng protected artifacts vượt budget thì context báo overflow rõ ràng.

---

## 7. Data Flow — Vòng đời dữ liệu qua các trạng thái

```mermaid
stateDiagram-v2
    [*] --> Proposed

    Proposed --> Confirmed : Author Accept
    Proposed --> Rejected : Author Reject
    Proposed --> EditAccepted : Author Edit + Accept
    Proposed --> Superseded : Proposal moi thay the

    EditAccepted --> Confirmed : Materialize

    Confirmed --> Locked : Author Lock
    Confirmed --> Superseded : Correction

    Locked --> Locked : AI phai ton trong

    Rejected --> [*] : Soft delete sau 30-90 ngay
```

**Ghi chú:**
- **Proposed data** KHÔNG được đưa vào context như sự thật. Context Builder phải kèm trạng thái + confidence.
- **Locked** bao gồm: world rules, author facts, confirmed entities. Violation tạo consistency finding.

---

## 8. Job Lifecycle — Vòng đời async job

```mermaid
stateDiagram-v2
    [*] --> Pending : POST create job

    Pending --> Running : Worker picks up

    Running --> WaitingReview : Proposals generated
    Running --> Completed : Job done
    Running --> Failed : Error

    WaitingReview --> Completed : All proposals reviewed

    Failed --> Pending : Retry transient error
    Failed --> Cancelled : Max retries exceeded

    Pending --> Cancelled : Author cancel / timeout
```

**Ghi chú:**
- Không giữ DB transaction trong lúc gọi LLM. LLM call nằm ngoài transaction boundary.
- Chỉ retry cho: network timeout, provider 429/5xx, temporary DB errors.
- Không retry tự động: invalid request, schema-invalid, authorization failure, brain version conflict.

---

## Historical mapping (prototype-era source claims — NOT current deployment)

> This table remains unchanged as a historic snapshot. See [CURRENT_API_IMPLEMENTATION_MATRIX.md](CURRENT_API_IMPLEMENTATION_MATRIX.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for source-backed current mapping.

| Pipeline Stage | Code hiện tại | Code đích (IMPLEMENTATION_PLAN) |
|---|---|---|
| Entity Extraction | `services/entity_pipeline/pipeline.py` | Extraction tool trong `application/` |
| Entity Resolution | `entity_resolver` (in pipeline) | Resolution service |
| Event Extraction | `event_summarizer` | Event proposal generator |
| Interaction / Policy | `api/interactions.py` | Proposal policy/validation |
| KB Write | `StoryKBManager.upsert_*` | Repository materializer (via proposal) |
| Author Confirm | `/kb/confirm` endpoint | Proposal decision adapter |
| Context Build | (chưa có — hardcoded prompt) | `application/build_context.py` |
| Generation | `/suggest-next` endpoint | `application/generate_writing.py` |
| Consistency | `core/consistency.py` (basic) | Deterministic engine + LLM validator |
| Semantic Retrieval | (chưa có) | pgvector + hybrid ranker (Phase 7) |
