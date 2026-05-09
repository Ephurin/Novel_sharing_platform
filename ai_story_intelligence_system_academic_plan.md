# ĐỀ TÀI

# Hệ thống AI hỗ trợ sáng tác truyện thông minh dựa trên Knowledge Graph và Context-Aware Generation

---

# 1. Giới thiệu

Trong các hệ thống sáng tác truyện truyền thống, tác giả thường gặp khó khăn trong việc:

- Duy trì tính nhất quán của cốt truyện
- Quản lý số lượng lớn nhân vật và sự kiện
- Theo dõi trạng thái của thế giới truyện
- Phát hiện plot-hole khi truyện kéo dài

Các công cụ AI hiện tại chủ yếu tập trung vào sinh văn bản, nhưng chưa có khả năng hiểu logic dài hạn của toàn bộ tác phẩm.

Đề tài này hướng tới xây dựng một hệ thống:

```text
AI hỗ trợ sáng tác truyện có khả năng ghi nhớ,
phân tích và kiểm tra logic cốt truyện.
```

---

# 2. Mục tiêu đề tài

## 2.1. Mục tiêu chính

Xây dựng hệ thống AI có khả năng:

- Trích xuất thực thể từ văn bản truyện
- Xây dựng đồ thị tri thức (Knowledge Graph)
- Theo dõi trạng thái nhân vật và sự kiện
- Phát hiện mâu thuẫn logic trong cốt truyện
- Hỗ trợ gợi ý nội dung tiếp theo dựa trên ngữ cảnh

---

## 2.2. Mục tiêu nghiên cứu

- Ứng dụng NLP trong sáng tác truyện
- Kết hợp NER + Knowledge Graph + LLM
- Nghiên cứu Context-aware Generation
- Nghiên cứu phát hiện inconsistency trong narrative systems

---

# 3. Kiến trúc hệ thống

## 3.1. Tổng quan

```text
Text Input
    ↓
NER Pipeline
    ↓
Entity Normalization
    ↓
Event Extraction
    ↓
Knowledge Graph Update
    ↓
Consistency Engine
    ↓
AI Writing Suggestion
```

---

# 4. Các chức năng chính

## 4.1. Trích xuất thực thể (NER)

Hệ thống sử dụng:
- Pipeline lai (Hybrid pipeline)
- Kết hợp Machine Learning (ML) và Large Language Model (LLM)

Các loại thực thể:
- Nhân vật
- Địa điểm
- Tổ chức
- Vật phẩm

---

## 4.2. Knowledge Graph

Hệ thống xây dựng đồ thị tri thức gồm:

### Node
- Character
- Location
- Event
- Organization
- Item

### Relation
- ALLY_OF
- ENEMY_OF
- LOCATED_IN
- OWNS
- LOVES

---

## 4.3. Event Extraction

Ví dụ:

```text
Lan tấn công Minh tại Hải Phòng
```

Hệ thống sẽ trích xuất:

```json
{
  "subject": "Lan",
  "action": "attack",
  "object": "Minh",
  "location": "Hải Phòng"
}
```

---

## 4.4. Consistency Engine

Chức năng:
- Phát hiện plot-hole
- Kiểm tra timeline
- Kiểm tra trạng thái nhân vật
- Kiểm tra logic thế giới truyện

Ví dụ:

```text
Nhân vật đã chết nhưng xuất hiện trở lại
```

---

## 4.5. Context-aware Generation

Hệ thống sử dụng:
- Recent chapters
- Event history
- Character states
- Knowledge Graph

để xây dựng context cho LLM.

---

# 5. Công nghệ sử dụng

## Backend
- FastAPI
- PostgreSQL
- SQLAlchemy

---

## NLP & AI
- Hybrid NER (ML kết hợp LLM)
- OpenAI API / Local LLM
- sentence-transformers

---

## Storage
- PostgreSQL
- FAISS / Chroma Vector DB

---

## Frontend
- React
- Monaco Editor

---

# 6. Quy trình hoạt động

## Bước 1
Người dùng nhập nội dung truyện.

## Bước 2
Hệ thống thực hiện NER để trích xuất thực thể.

## Bước 3
Thực hiện Event Extraction.

## Bước 4
Cập nhật Knowledge Graph.

## Bước 5
Consistency Engine kiểm tra logic.

## Bước 6
AI đưa ra gợi ý nội dung tiếp theo.

---

# 7. Kế hoạch triển khai

| Phase | Nội dung | Thời gian |
|---|---|---|
| 1 | Foundation & NER Integration | 2–3 tuần |
| 2 | Event Engine | 2–4 tuần |
| 3 | Consistency Engine | 3–4 tuần |
| 4 | Context-aware Writing | 2–3 tuần |
| 5 | UI & Visualization | 3–5 tuần |

---

# 8. Kết quả kỳ vọng

Hệ thống có thể:

- Ghi nhớ trạng thái truyện dài hạn
- Hỗ trợ sáng tác theo ngữ cảnh
- Phát hiện lỗi logic trong truyện
- Tổ chức dữ liệu truyện hiệu quả
- Hỗ trợ quản lý nhân vật và timeline

---

# 9. Điểm mới của đề tài

So với các AI writing tools hiện tại:

| Công cụ hiện tại | Hạn chế |
|---|---|
| ChatGPT | Không nhớ logic dài hạn |
| Sudowrite | Dễ mất consistency |
| Scrivener | Không có AI reasoning |

---

Hệ thống đề xuất:

```text
Story-aware AI System
```

có khả năng:
- reasoning
- memory
- consistency checking
- narrative intelligence

---

# 10. Kết luận

Đề tài hướng tới xây dựng một hệ thống AI hỗ trợ sáng tác truyện thông minh, kết hợp giữa:

- NLP
- Knowledge Graph
- Context-aware Generation
- Narrative Consistency Checking

Hệ thống không chỉ hỗ trợ sinh văn bản mà còn có khả năng quản lý và phân tích logic của toàn bộ tác phẩm.
