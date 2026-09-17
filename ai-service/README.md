# AI Story Co-Pilot Service

Dịch vụ AI thế hệ mới, tích hợp LLM (Large Language Models) để hỗ trợ tác giả xây dựng thế giới truyện nhất quán, thông minh và có chiều sâu thông qua đồ thị tri thức (Knowledge Graph).

---

## 🚀 Tính năng chính

- **Pure LLM NER Pipeline**: Kiến trúc trích xuất thực thể (Nhân vật, Địa điểm, Tổ chức, Kỹ năng, Vật phẩm) sử dụng hoàn toàn năng lực của LLM. Tối ưu hóa 85-90% độ chính xác và giao quyền kiểm soát quyết định cuối cùng cho tác giả (Human-in-the-loop).
- **Context-Aware Classification**: Nhờ LLM, hệ thống có khả năng phân loại chính xác các thực thể đặc thù của thể loại tiên hiệp/kiếm hiệp (SKILL, ITEM) dựa trên ngữ cảnh mà các mô hình Regex truyền thống thường bỏ sót.
- **KB-Anchored Entity Resolution**: Tự động chuẩn hóa tên gọi bằng so khớp mờ (Fuzzy Matching) và đối soát trực tiếp với Knowledge Base (KB).
- **LLM-Powered Event Extraction**: Sử dụng sức mạnh suy luận của LLM (Qwen-2.5/Gemini) để trích xuất các tương tác phức tạp (Quan hệ, Sự kiện).
- **Robust Fallback Mechanism**: Hỗ trợ bẻ lái (fallback) sang local LLM (ví dụ chạy trên Google Colab qua Ngrok) khi các dịch vụ chính gặp lỗi quota.
- **Lightweight Architecture**: Loại bỏ hoàn toàn các mô hình Machine Learning nặng nề (PhoBERT, Random Forest) và Regex phức tạp, giúp dự án siêu nhẹ, dễ maintain và khởi động tức thì.
- **Human-in-the-Loop Philosophy**: AI xử lý 90% công việc tay chân, tác giả review trên UI và tự do tùy chỉnh các mối quan hệ (ví dụ: bẻ lái cốt truyện) ở 10% còn lại.

---

## 🏗️ Kiến trúc hệ thống (Pure LLM Pipeline)

```mermaid
flowchart TD
    subgraph Input["Giai đoạn Đầu vào"]
        A["📝 Văn bản chương truyện"]
    end

    subgraph LLMExtraction["Giai đoạn Phân tích & Trích xuất"]
        A --> B["🧠 Pure LLM Engine (Qwen/Gemini)"]
        B --> C["🏷️ Entity Labels (PER, LOC, SKILL, etc.)"]
        B --> D["🤝 Quan hệ & Tương tác (KNOWS, ALLY_OF,...)"]
    end

    subgraph Validation["Giai đoạn Kiểm duyệt & Human-in-the-Loop"]
        C --> E["⚖️ Validation & Fallback Rules"]
        D --> E
        E --> F["💻 UI Review & Quyết định của Tác giả"]
    end

    subgraph Persistence["Giai đoạn Lưu trữ"]
        F --> I["🔗 Entity Resolver & KB Sync"]
        I --> J["💾 Knowledge Base (JSON/Graph)"]
    end
```

---

## 📂 Cấu trúc thư mục

```
ai-service/
│
├── main.py                     # ⚡ Entry point — Khởi tạo FastAPI app, middleware,
│                                #    exception handlers, và đăng ký các router.
│
├── requirements.txt            # 📦 Danh sách dependencies Python (pip install -r)
├── .env                        # 🔑 Biến môi trường (API keys, LLM config) — KHÔNG commit
├── check_startup.py            # 🩺 Script kiểm tra hệ thống khi khởi động
│
├── api/                        # 🌐 API Layer — Định nghĩa HTTP endpoints
│   ├── schemas.py              #    📋 Tất cả Pydantic request/response models
│   ├── deps.py                 #    💉 Dependency Injection helpers (FastAPI Depends)
│   ├── routes.py               #    🛣️ Router chính /v1/ai
│   └── interactions.py         #    🤝 Router nâng cao /v1/enhanced
│
├── core/                       # 🧠 Core Logic — Các module xử lý trung tâm
│   ├── llm_client.py           #    🤖 Client kết nối trực tiếp với LLM providers
│   ├── llm_service.py          #    🧩 High-level LLM orchestration (Trích xuất NER, Relations)
│   ├── consistency.py          #    ✅ ConsistencyChecker & ConsistencyEngine
│   ├── settings.py             #    ⚙️ Typed settings đọc từ environment
│   ├── structured_outputs.py   #    📐 Versioned entity/event/state output schemas
│   ├── story_kb_manager.py     #    💾 Quản lý Knowledge Base
│   ├── entity_resolver.py      #    🔗 Fuzzy matching + chuẩn hóa tên thực thể
│   ├── candidate_processor.py  #    📊 Xử lý NER output → Candidates cho HITL review
│   └── span_expander.py        #    📏 Mở rộng biên thực thể
│
├── services/                   # ⚙️ Service Layer — Các dịch vụ nghiệp vụ
│   ├── entity_helpers.py       #    🔄 Shared helper functions
│   ├── interaction_service.py  #    🤝 Quyết định auto-apply/suggest/ignore cho relations
│   ├── relation_service.py     #    🕸️ Xử lý quan hệ giữa các thực thể
│   ├── event_service.py        #    📅 Xử lý sự kiện trong truyện
│   ├── state_extraction.py     #    📊 Trích xuất trạng thái entity (HP, vị trí, vật phẩm)
│   │
│   └── entity_pipeline/        #    🔬 Pure LLM Pipeline
│       └── pipeline.py         #       Orchestrator: Bắn trực tiếp text sang LLM
│
├── models/                     # 📝 Data Models — Pydantic schemas cho internal data
│
├── data/                       # 💿 Runtime Data — Dữ liệu phiên làm việc
│   ├── kb/                     #    📚 Knowledge Base files (JSON per story)
│   └── writing_session_*.json  #    📝 Session data của từng phiên viết
│
├── scratch/                    # 🧪 Test & Debug Scripts
│
└── docs/                       # 📖 Tài liệu sát với service
    ├── README.md               #    📑 Mục lục & hướng dẫn tài liệu Copilot
    ├── API_DOC.md              #    📡 API Reference
    ├── STATE_PROJECTION.md     #    ⚡ State Projection & Event Sourcing
    ├── ARCHITECTURE.md         #    🏛️ Kiến trúc chi tiết
    ├── DATA_MODEL.md           #    💾 Data Model & Invariants
    ├── API_CONTRACTS.md        #    📋 API Contracts & Job Lifecycle
    └── ...                     #    Các tài liệu thiết kế khác
```

Tài liệu sản phẩm, kiến trúc, roadmap và UX chuẩn nằm tại [`docs/README.md`](docs/README.md).

---

## 🛠️ Công nghệ sử dụng

- **Backend Framework**: FastAPI (Python 3.10+)
- **LLM Providers**: Qwen-2.5 (Ngrok/Colab), Google Gemini 2.0 Flash, OpenAI, Groq Cloud
- **Storage hiện tại**: JSON-based Story KB; PostgreSQL schema `narrative` là đích migration của MVP

---

## ⚙️ Cấu hình hệ thống (.env)

Hệ thống yêu cầu các API Key hoặc Custom Endpoint để hoạt động:

```bash
# Trong thư mục ai-service
LLM_ENABLED=true
LLM_PROVIDER=openai
LLM_MODEL=qwen2.5:7b
LLM_BASE_URL=https://<your-ngrok-url>.ngrok-free.dev/v1
LLM_TIMEOUT_SECONDS=30
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Storage backend: json mặc định, postgres sau khi chạy migration
NARRATIVE_REPOSITORY=json
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/novel_platform
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
DEFAULT_ACTOR_ID=00000000-0000-0000-0000-000000000001

# Version metadata cho structured pipeline output
ENTITY_PIPELINE_VERSION=entity-v1
ENTITY_PROMPT_VERSION=entity-extraction-v1

# Tùy chọn fallback
LLM_FALLBACK_PROVIDER=gemini
LLM_FALLBACK_MODEL=gemini-2.0-flash
GEMINI_API_KEY=AIza_your_key_here
```

> ⚠️ **QUAN TRỌNG:** Không bao giờ commit file `.env` hoặc để lộ API key trong source code.

---

## 🏁 Hướng dẫn khởi động

### 1. Khởi động AI Service (Backend)
Yêu cầu Python 3.10+

```bash
cd ai-service

# Cài đặt thư viện (nếu chưa có)
pip install -r requirements.txt

# Kiểm tra cấu hình và chạy unit tests không cần API key thật
python check_startup.py
python -m unittest discover -s tests -v

# Khi dùng NARRATIVE_REPOSITORY=postgres
alembic -c alembic.ini upgrade head

# Chạy server (mặc định tại cổng 8000)
uvicorn main:app --reload --port 8000
```

> [!TIP]
> Nếu gặp lỗi `WinError 10013` (Access Denied), đổi sang cổng khác bằng tham số `--port 8001`.

### 2. Kiểm tra sức khỏe hệ thống

```bash
curl http://localhost:8000/health
# Expected: {"status": "ok"}
```

---

## 📊 Trạng thái & Lộ trình (Roadmap)

### ✅ Đã hoàn thành (Stable)
- [x] Chuyển đổi sang **Pure LLM NER Pipeline** (Dọn dẹp code rác, vứt bỏ Regex/ML cũ).
- [x] Áp dụng triết lý **Human-in-the-Loop**, tối ưu hóa backend 90% và trao quyền cho tác giả.
- [x] Tích hợp LLM Colab qua Ngrok Endpoint.
- [x] Refactor codebase: Cấu trúc gọn nhẹ, khởi động tức thì.
- [x] Centralized typed Settings cho provider, endpoint, timeout, CORS và pipeline version.
- [x] Entity/event/state structured output validation và fail-explicit provider/parsing errors.
- [x] Fake-LLM unit tests không cần API key thật.
- [x] Domain/repository boundary với JSON adapter, in-memory fake và contract tests.
- [x] PostgreSQL ORM/Alembic foundation với tenant scope, idempotency và optimistic locking.
- [x] Revision analysis và proposal-first review với evidence, atomic dependency groups và Platform revision adapter.

### 🚧 Đang triển khai
- [ ] **Vector Search (RAG)**: Hỗ trợ bối cảnh truyện dài hàng trăm chương.
- [ ] **Advanced Graph Visualization**: Trực quan hóa mối quan hệ nhân vật dưới dạng đồ thị động.

---

© 2026 Novel Sharing Platform Team.

## Phase 4: state projections

See [State projection and correction workflow](docs/STATE_PROJECTION.md) for the migration, proposal review API, rebuild command, and validation limits. State-transition extraction is opt-in through `options.extract_state_transitions`.
