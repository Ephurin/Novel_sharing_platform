# AI Story Intelligence System — Master Plan

---

# 1. Vision

## Mục tiêu cốt lõi

Xây dựng một hệ thống:

```text
AI hiểu truyện dài hạn,
không chỉ sinh văn bản.
```

Positioning:

```text
Story Intelligence + AI Co-pilot
```

Khác với:
- ChatGPT → text generation
- Sudowrite → creative assistance
- Scrivener → organization

Hệ thống sẽ:
- nhớ story state
- track logic
- quản lý knowledge graph
- hỗ trợ viết theo ngữ cảnh thực

---

# 2. Mục tiêu hệ thống

## 2.1. Mục tiêu ngắn hạn (MVP / Demo)

### Hệ thống cần:
- Viết tiếp truyện theo context
- Track entity & relationship
- Detect plot-hole cơ bản
- Hiển thị story graph
- Quản lý story knowledge

---

## 2.2. Mục tiêu trung hạn

### Hệ thống mở rộng:
- Event-driven story engine
- Long-term memory
- Context-aware generation mạnh
- Character state reasoning

---

## 2.3. Mục tiêu dài hạn

### Hệ thống hướng tới:
- Story Operating System
- AI hiểu toàn bộ thế giới truyện
- Collaborative writing AI
- Narrative reasoning engine

---

# 3. Core Identity

Không phải:

```text
AI Writer
```

Mà là:

```text
Story Intelligence Engine
```

---

# 4. Kiến trúc tổng thể

```text
                    Frontend Editor
                           |
                           ↓
------------------------------------------------
|                API Gateway                   |
------------------------------------------------
        |               |               |
        ↓               ↓               ↓

 AI Writing      Story Intelligence     Story Management
 Service             Engine                 Service

        ↓               ↓               ↓

------------------------------------------------
|              Knowledge Layer                 |
|----------------------------------------------|
| PostgreSQL | Vector DB | Knowledge Graph     |
------------------------------------------------
```

---

# 5. Các module chính

---

# MODULE A — Entity Intelligence Layer

## Mục tiêu
Biến raw text thành:
- entities
- relationships
- structured knowledge

---

## Thành phần

### A1. NER Pipeline
Sử dụng:
- Hybrid Pipeline (ML kết hợp LLM)

---

### A2. Entity Normalization

Fix:

```text
"Hải Phòng"
"Hải"
"Phòng."
```

---

### A3. Entity Resolution

Merge:

```text
"Tiêu Viêm"
"Tiêu Viêm thiếu gia"
```

---

### A4. Entity Classification Repair

LLM-assisted reclassification.

---

# MODULE B — Event Intelligence Layer

## Mục tiêu
Biến text thành:
- actions
- causality
- story events

---

## Thành phần

### B1. Event Extraction

Ví dụ:

```json
{
  "subject": "Lan",
  "action": "attack",
  "object": "Minh"
}
```

---

### B2. Emotion Extraction

Ví dụ:

```text
anger
fear
betrayal
```

---

### B3. Event Timeline

Track:
- when
- where
- consequences

---

### B4. Relation Inference

Ví dụ:

```text
attack → ENEMY_OF
save → ALLY_OF
```

---

# MODULE C — Story Knowledge Graph

## Mục tiêu
Lưu toàn bộ logic của truyện.

---

## Node types

```text
Character
Location
Organization
Item
Event
Concept
```

---

## Edge types

```text
ALLY_OF
ENEMY_OF
LOCATED_IN
OWNS
LOVES
BETRAYED
```

---

## State system

Ví dụ:

```text
Lan:
- health: 30
- location: Hanoi
- status: injured
```

---

# MODULE D — Consistency Engine

## Mục tiêu
Phát hiện:
- plot-hole
- contradiction
- impossible logic

---

## Thành phần

### D1. State Consistency

```text
dead → xuất hiện lại
```

---

### D2. Timeline Consistency

```text
teleport bất hợp lý
```

---

### D3. Personality Consistency

```text
character hành xử trái tính cách
```

---

### D4. World-rule Consistency

Ví dụ:

```text
magic system violation
```

---

# MODULE E — Context Builder

## Mục tiêu
Tạo context “thông minh” cho LLM.

---

## Input
- recent chapters
- entities
- events
- states
- lorebook

---

## Output
Structured prompt.

---

## Đây là thứ quyết định

```text
AI có “ngu” hay không
```

---

# MODULE F — AI Writing Layer

## Mục tiêu
AI hỗ trợ viết.

---

## Features

### F1. Continue Writing
### F2. Rewrite
### F3. Expand Outline
### F4. Dialogue Generation
### F5. Mood-based Writing

---

# MODULE G — Story Management Layer

## Mục tiêu
Tổ chức truyện dài hạn.

---

## Features

### G1. Character Database
### G2. Lorebook
### G3. Timeline Viewer
### G4. Story Graph Visualization
### G5. Chapter Organization

---

# 6. Thứ tự thực hiện

---

# PHASE 1 — FOUNDATION

## Thời gian
2–3 tuần

## Mục tiêu
Làm sạch data pipeline.

---

## Tasks
- Integrate current NER
- Entity normalization
- Entity resolution
- PostgreSQL schema
- Story storage
- API cleanup

---

## Output
- entity pipeline sạch
- KB ổn định

---

# PHASE 2 — EVENT ENGINE

## Thời gian
2–4 tuần

## Mục tiêu
Biến system thành:

```text
event-driven
```

---

## Tasks
- Event extraction
- Relation inference
- Relation history
- Event timeline
- Interaction engine

---

## Output
- story events
- dynamic relationships

---

# PHASE 3 — CONSISTENCY ENGINE

## Thời gian
3–4 tuần

## Mục tiêu
Killer feature.

---

## Tasks
- State conflict detection
- Timeline validation
- Rule engine
- AI reasoning checks
- Warning system

---

## Output
- plot-hole detection thật sự

---

# PHASE 4 — CONTEXT-AWARE AI WRITING

## Thời gian
2–3 tuần

## Mục tiêu
AI generate có logic.

---

## Tasks
- Context builder
- RAG integration
- Writing API
- Rewrite API
- Suggestion API

---

## Output
- AI nhớ truyện

---

# PHASE 5 — STORY MANAGEMENT UI

## Thời gian
3–5 tuần

## Mục tiêu
Demo “wow”.

---

## Tasks
- Character dashboard
- Lorebook UI
- Story graph
- Timeline UI
- Warning panel

---

# PHASE 6 — ADVANCED FEATURES

## Thời gian
1–3 tháng

---

## Advanced
- Character personality engine
- Adaptive prompting
- Multi-agent system
- Narrative reasoning
- Memory compression

---

# 7. Thời gian tổng ước tính

| Phase | Time |
|---|---|
| Foundation | 2–3 tuần |
| Event Engine | 2–4 tuần |
| Consistency Engine | 3–4 tuần |
| AI Writing | 2–3 tuần |
| Management UI | 3–5 tuần |

---

## MVP hoàn chỉnh

```text
~2–3 tháng
```

---

## Production-grade

```text
~6–12 tháng
```

---

# 8. Ưu tiên thực sự

## MUST HAVE
- Entity normalization
- Event extraction
- Context builder
- Consistency engine

---

## NICE TO HAVE
- Graph DB
- Multi-agent
- Fine-tune model

---

# 9. Stack đề xuất

## Backend
- FastAPI
- PostgreSQL
- SQLAlchemy

---

## AI
- OpenAI API / local LLM
- sentence-transformers

---

## Vector
- FAISS / Chroma

---

## Frontend
- React
- Monaco Editor

---

# 10. KPI thành công

## Technical KPI

### Entity precision

```text
>90%
```

---

### Plot-hole detection accuracy

```text
>80%
```

---

### Context relevance

```text
AI references correct past events
```

---

# 11. Điểm khác biệt thị trường

Các tool hiện tại:
- generate text tốt

Nhưng:

```text
không hiểu story state
```

---

System này:

```text
Story-aware AI
```

---

# 12. Kết luận

Nếu build đúng hướng:

Không chỉ là:

```text
AI writing assistant
```

Mà là:

```text
Narrative Operating System
```

với:
- memory
- reasoning
- consistency
- story intelligence

---
