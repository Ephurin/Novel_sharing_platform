# AI Story Co-Pilot Service (AI Writing & Context Retrieval Engine)

Dịch vụ AI thế hệ mới hỗ trợ tác giả tiểu thuyết dài kỳ xây dựng thế giới truyện nhất quán, truy xuất ngữ cảnh thông minh và đồng sáng tác bản thảo (co-authoring) thông qua đồ thị tri thức (Knowledge Graph), PostgreSQL 16 + pgvector và mô hình ngôn ngữ lớn (Google Gemini Flash-Lite).

> 🎓 **Tài liệu phục vụ Bàn giao & Vấn đáp Bảo vệ Tốt nghiệp:** Xem chi tiết tại [docs/DEFENSE_QNA_HANDOVER.md](docs/DEFENSE_QNA_HANDOVER.md) để nắm rõ lý do lựa chọn mô hình, cơ chế Context Budgeting, Hybrid RAG và các kịch bản trả lời phản biện trước Hội đồng.

---

## 🚀 Tính năng chính

- **Hybrid Context Retrieval (RAG lai)**: Kết hợp tìm kiếm ngữ nghĩa dày đặc (**Dense Semantic Search** qua `pgvector` 768 chiều L2) và tìm kiếm từ khóa cục bộ (**Sparse Lexical Search** qua PostgreSQL `pg_trgm`) với thuật toán xếp hạng lai (Hybrid Ranker), loại bỏ hoàn toàn nhược điểm tìm kiếm đơn lẻ.
- **Context Budget Packer (Đóng gói ngân sách ngữ cảnh đa làn)**: Phân bổ token thông minh theo từng làn riêng biệt: *Recent Events* (sự kiện gần nhất duy trì mạch truyện), *World Rules* (quy tắc thế giới bất biến), *Semantic Memories* (ký ức liên quan), *Active Entities & States* (nhân vật và trạng thái hiện tại). Áp đặt giới hạn `cutoff_chapter` để ngăn chặn triệt để hiện tượng rò rỉ dữ liệu tương lai (future-information leakage).
- **Human-in-the-Loop & Proposal-First Workflow**: AI không ghi đè trực tiếp lên tác phẩm mà trả về dưới dạng đề xuất vá lỗi/thay thế (Patch Proposal) với vị trí Unicode code-point chuẩn xác. Tác giả giữ toàn quyền phê duyệt, chỉnh sửa hoặc từ chối trước khi áp dụng vào bản thảo.
- **Pure LLM NER & Relation Extraction**: Tận dụng tối đa khả năng suy luận của LLM để trích xuất thực thể (PER, LOC, ORG, SKILL, ITEM) và mối quan hệ phức tạp, loại bỏ các mô hình ML nặng nề (PhoBERT, Random Forest) và Regex cổ điển.
- **Cơ chế Điều phối Mô hình An toàn (Safe Model Routing)**: Sử dụng **Google Gemini 3.5 Flash-Lite** làm mô hình sinh chính thức cho demo nhằm tối ưu hóa hạn mức (quota feasibility) và độ trễ (~2.1s - 2.5s), hỗ trợ `gemini-3.1-flash-lite`, đồng thời ngăn chặn tuyệt đối việc fallback ngầm sang mô hình hạn mức thấp `gemini-3.8-flash`.
- **Hạ tầng Lưu trữ Chuẩn Doanh nghiệp**: Schema `narrative` trên PostgreSQL 16 với hỗ trợ cô lập đa khách thuê (tenant isolation), kiểm soát xung đột đồng thời (optimistic locking), khóa bất biến (idempotency key) và Transactional Outbox.

---

## 🏗️ Kiến trúc hệ thống (System Architecture)

```mermaid
flowchart TD
    subgraph Client["Lớp Giao diện & Gateway"]
        UI["💻 Author IDE (React / Mantine)"] -->|JWT Auth| NodeGW["🛡️ Node.js Gateway / Backend"]
    end

    subgraph AIService["AI Service (FastAPI / Python 3.12)"]
        NodeGW -->|REST API| Controller["API Routes (/v1/writing/generations)"]
        Controller --> WritingSvc["WritingService (Application)"]

        subgraph ContextEngine["Bộ điều phối Ngữ cảnh (Context Engine)"]
            WritingSvc --> Repo["PostgresNarrativeRepository"]
            Repo --> HybridRanker["Hybrid Ranker (Semantic + Lexical Trigram)"]
            Repo --> PGVector[("🐘 PostgreSQL 16 + pgvector (narrative schema)")]
            WritingSvc --> Packer["Context Budget Packer (context-budget-v1)"]
            Packer --> Lanes["Multi-lane Allocation:
              - Recent Events (Chronological)
              - World Rules (Invariants)
              - Semantic Memories (Hybrid)
              - Active Entities & States"]
        end

        subgraph LLMLayer["Lớp Tương tác Mô hình (LLM Layer)"]
            WritingSvc --> LLMClient["Gemini LLM Service"]
            LLMClient --> GoogleAPI["☁️ Google Gemini 3.5 Flash-Lite"]
        end

        WritingSvc --> Validator["Patch & Content Validator"]
    end

    Validator -->|Patch JSON & Diff| UI
```

---

## 📂 Cấu trúc thư mục (Directory Structure)

```text
ai-service/
├── main.py                     # ⚡ Entry point — FastAPI app, middleware, routes
├── requirements.txt            # 📦 Dependencies Python
├── alembic.ini                 # 🐘 Cấu hình Alembic migration cho PostgreSQL
├── Dockerfile                  # 🐳 Container image definition
├── check_startup.py            # 🩺 Script kiểm tra hệ thống và môi trường
│
├── api/                        # 🌐 API Layer — HTTP Endpoints
│   ├── routes.py               #    🛣️ Router chính /v1/ai
│   ├── schemas.py              #    📋 Pydantic request/response models
│   ├── deps.py                 #    💉 Dependency injection
│   └── interactions.py         #    🤝 Router tương tác nâng cao
│
├── application/                # 💼 Application Layer — Điều phối nghiệp vụ
│   ├── writing_service.py      #    ✍️ Quản lý vòng đời tác vụ sinh bản thảo
│   └── context_budget_packer.py#    📦 Phân bổ và đóng gói prompt theo ngân sách token
│
├── domain/                     # 🏛️ Domain Core — Thực thể và Hợp đồng
│   ├── entities.py             #    🏷️ Entity, Event, Memory, State models
│   └── narrative_repository.py #    📐 Abstract Repository interface
│
├── infrastructure/             # 🔌 Infrastructure Layer — Cơ sở hạ tầng
│   ├── postgres/               #    🐘 PostgreSQL 16 + pgvector implementation
│   │   └── postgres_narrative_repository.py
│   ├── retrieval/              #    🔍 Hybrid Ranker & Semantic Retriever
│   │   ├── hybrid_ranker.py
│   │   └── semantic_retriever.py
│   └── embedding/              #    🧠 Gemini Embedding client (gemini-embedding-2)
│
├── core/                       # 🧠 Core Logic — LLM Orchestration
│   ├── llm_service.py          #    🤖 Client kết nối và điều phối LLM
│   ├── settings.py             #    ⚙️ Typed Settings đọc từ biến môi trường
│   ├── consistency.py          #    ✅ Consistency Engine
│   └── structured_outputs.py   #    📐 Schemas cho kết quả cấu trúc
│
├── migrations/                 # 📜 Alembic Migrations cho schema `narrative`
├── models/                     # 📝 Pydantic Data Models nội bộ
├── services/                   # ⚙️ Domain Services bổ trợ (NER, relation, state)
├── tests/                      # 🧪 Test suites (Unit, Integration, Contract, Smoke)
└── docs/                       # 📖 Tài liệu chuyên sâu nội bộ
    ├── DEFENSE_QNA_HANDOVER.md #    🎓 Sổ tay vấn đáp bảo vệ & bàn giao
    ├── ARCHITECTURE.md         #    🏛️ Kiến trúc chi tiết
    ├── DATA_MODEL.md           #    💾 Data Model, ERD & Invariants
    ├── API_CONTRACTS.md        #    📋 API Contracts & Job Lifecycle
    └── README.md               #    📑 Mục lục tài liệu Copilot
```

---

## 🛠️ Công nghệ sử dụng (Technology Stack)

- **Backend Framework**: FastAPI (Python 3.10+ / 3.12)
- **Vector & Relational Database**: PostgreSQL 16 với extension `pgvector` (schema `narrative`)
- **Database Access & Migrations**: SQLAlchemy 2.0, Psycopg 3 (native async/sync driver), Alembic
- **LLM Engine**: Google Gemini 3.5 Flash-Lite (chính thức), hỗ trợ Gemini 3.1 Flash-Lite
- **Embedding Model**: Google Gemini Embedding 2 (`gemini-embedding-2-768-v1`, vector 768 chiều L2/Cosine)
- **Validation**: Pydantic v2 với định dạng Output có cấu trúc chặt chẽ

---

## ⚙️ Cấu hình hệ thống (.env)

Hệ thống sử dụng file cấu hình `.env` (hoặc `.env.demo` trong chế độ chạy thử nghiệm):

```bash
# === Cấu hình Dịch vụ & LLM ===
SERVICE_NAME="AI Service - Story Platform"
LLM_ENABLED=true
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=AIzaSy...              # Không bao giờ commit key thật!
LLM_TIMEOUT_SECONDS=45

# === Storage & Narrative Repository ===
NARRATIVE_REPOSITORY=postgres
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/ephurin
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
DEFAULT_ACTOR_ID=00000000-0000-0000-0000-000000000001

# === Context Routing & Retrieval Policy ===
CONTEXT_ROUTING_POLICY=legacy-v1       # Giữ legacy-v1 cho production / demo chuẩn
SEMANTIC_RETRIEVAL_ENABLED=false       # Bật true khi novel đã có vector embedding
EMBEDDING_PROVIDER=gemini
ACTIVE_EMBEDDING_VERSION=gemini-embedding-2-768-v1
SEMANTIC_RETRIEVAL_LIMIT=8

# === Bảo mật & Tích hợp ===
CORS_ORIGINS=http://localhost:8080,http://localhost:5173
```

---

## 🏁 Hướng dẫn khởi động & Vận hành

### 1. Khởi động thông qua Docker Compose (Khuyến nghị cho Demo & Thuyết trình)
Từ thư mục gốc của toàn bộ dự án:

```powershell
# Sao chép file cấu hình mẫu và điền GEMINI_API_KEY
Copy-Item docs/Deployment/flash-lite-demo.env.example .env.demo

# Khởi chạy toàn bộ stack (PostgreSQL pgvector, MongoDB, Backend, AI Service, Web)
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml up -d --build
```

### 2. Kiểm tra sức khỏe hệ thống
```powershell
# Kiểm tra AI Service trực tiếp
curl http://localhost:8000/health
# Expected: {"status": "ok", "service": "ephurin-ai-service"}

# Kiểm tra model đã được kích hoạt đúng
docker compose --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml exec -T ai-service python -c "import main; s=main.settings; print('AI Model:', s.llm_model, '| Policy:', s.context_routing_policy)"
# Expected: AI Model: gemini-3.5-flash-lite | Policy: legacy-v1

# Kiểm tra tính toàn vẹn hợp đồng Demo (Contract Drift Guard)
python scripts/check_defense_demo_manifest.py
# Expected: Defense demo contract: PASS
```

### 3. Chạy Unit Test cục bộ
```bash
cd ai-service
pytest tests/ -v
```

---

## 📊 Trạng thái Hoàn thành & Sẵn sàng Bảo vệ (Defense Readiness)

### ✅ Đã hoàn thành & Đóng gói (Merged & Locked)
- [x] **Pure LLM Pipeline**: Trích xuất thực thể và quan hệ hoàn toàn bằng LLM, loại bỏ code dư thừa.
- [x] **PostgreSQL 16 + pgvector Migration**: Lưu trữ chuẩn hóa bảng `narrative`, vector embeddings 768 chiều.
- [x] **Hybrid Context Retrieval**: Kết hợp Dense Semantic Vector + Sparse Trigram Lexical Search.
- [x] **Context Budget Packer**: Phân bổ token đa làn (Recent Events, Rules, Memories, Entities, States) có chặn cắt `cutoff_chapter`.
- [x] **Human-in-the-Loop & Patch Lifecycle**: Sinh patch có tính toán Unicode code-point và kiểm tra schema.
- [x] **Tích hợp Gemini 3.5 Flash-Lite**: Đã kiểm thử thực tế cả 2 luồng (Copilot Suggestion & Writing Generation) đạt 100% thành công, zero 429/503.
- [x] **Graduation Defense Demo Package**: Khóa cấu hình bất biến, seed dữ liệu tác giả mẫu (`reader03` / Ashenhold), runbook phục hồi [docs/Deployment/defense-demo-runbook.md](../../docs/Deployment/defense-demo-runbook.md) và validator CI tự động.

---

## 📚 Tài liệu tham khảo liên quan

- 🎓 **[Sổ tay Vấn đáp & Bàn giao](docs/DEFENSE_QNA_HANDOVER.md)**: Chi tiết câu hỏi phản biện, lý do công nghệ và kịch bản bảo vệ.
- 🏛️ **[Kiến trúc chi tiết (Architecture)](docs/ARCHITECTURE.md)**: Thiết kế chi tiết các tầng nghiệp vụ và luồng dữ liệu.
- 📋 **[Hợp đồng API (API Contracts)](docs/API_CONTRACTS.md)**: Chuẩn giao tiếp giữa Web IDE, Node Backend và FastAPI AI-Service.
- 📖 **[Runbook Demo Bảo vệ (Defense Runbook)](../../docs/Deployment/defense-demo-runbook.md)**: Kịch bản từng bước cho buổi thuyết trình demo.

---

© 2026 Novel Sharing Platform Team. All rights reserved.
