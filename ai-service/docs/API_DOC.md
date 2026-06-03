# API Documentation — Ephurin Co-Pilot AI Service

Tài liệu này liệt kê tất cả các endpoints hiện có của hệ thống Backend (FastAPI).

---

## 1. Hệ thống (System)

### `GET /health`
- **Mô tả:** Kiểm tra trạng thái hoạt động của server.
- **Phản hồi (200):** `{"status": "ok"}`

---

## 2. Dịch vụ AI (AI Services) — `/v1/ai`

### `POST /v1/ai/extract-entities`
- **Mô tả:** Trích xuất thực thể (NER) từ văn bản và kiểm tra tính nhất quán sơ bộ.
- **Request Body:**
  ```json
  { "text": "Đoạn văn cần phân tích..." }
  ```
- **Response:** Danh sách các thực thể tìm thấy và các cảnh báo (nếu có).

### `POST /v1/ai/suggest-next`
- **Mô tả:** Gợi ý hướng đi tiếp theo cho câu chuyện dựa trên bối cảnh nhân vật và dữ liệu Graph.
- **Request Body:**
  ```json
  {
    "character_name": "Tên nhân vật",
    "current_text": "Đoạn văn hiện tại",
    "story_id": "session_id",
    "mood": "neutral",
    "max_regenerations": 2
  }
  ```
- **Response:** 3 gợi ý từ LLM kèm theo đánh giá tính nhất quán với Knowledge Base.

### `POST /v1/ai/analyze/chapter`
- **Mô tả:** Phân tích chương truyện để tìm các "ứng viên" thực thể (Human-in-the-loop).
- **Request Body:**
  ```json
  { "story_id": "id", "text": "Nội dung chương..." }
  ```
- **Response:** Danh sách các thực thể tiềm năng để người dùng duyệt (candidates).

### `POST /v1/ai/kb/confirm`
- **Mô tả:** Lưu các thực thể đã được người dùng phê duyệt vào Knowledge Base.
- **Request Body:**
  ```json
  {
    "story_id": "id",
    "approved_candidates": [...] 
  }
  ```

### `POST /v1/ai/sync-story`
- **Mô tả:** Đồng bộ hóa nội dung câu chuyện với cơ sở dữ liệu. Cập nhật các entity từ câu chuyện vào Knowledge Base nếu thiếu sót, nhưng đây là API cũ ít dùng trong luồng mới.
- **Request Body:**
  ```json
  {
    "story_id": "id",
    "story_content": "Toàn bộ nội dung..." 
  }
  ```

---

## 3. Tương tác Nâng cao (Enhanced Interactions) — `/v1/enhanced`

Đây là các API chính được sử dụng trong giao diện Co-Pilot hiện tại.

### `POST /v1/enhanced/process-interactions`
- **Mô tả:** Pipeline xử lý toàn diện: NER -> Entity Resolution -> LLM Event Extraction -> State Management -> Auto Persistence.
- **Mô tả quy trình:**
  1. Nhận diện nhân vật/địa điểm.
  2. Khớp với dữ liệu đã có trong KB (Resolution).
  3. LLM phân tích các sự kiện diễn ra giữa các nhân vật.
  4. LLM cập nhật trạng thái (máu, vị trí, vật phẩm).
  5. Tự động lưu các quan hệ rõ ràng vào KB.
- **Request Body:**
  ```json
  { "story_id": "id", "text": "Đoạn văn vừa viết..." }
  ```
- **Response:** Trả về toàn bộ dữ liệu phong phú về thực thể, sự kiện, và các quan hệ mới được áp dụng.

### `GET /v1/enhanced/kb/{story_id}`
- **Mô tả:** Lấy toàn bộ trạng thái Knowledge Base của một câu chuyện (dùng cho Graph Drawer).
- **Tham số:** `story_id` (string)
- **Response:** JSON chứa toàn bộ `entities`, `relations`, `events`, `entity_states`.

### `POST /v1/enhanced/relation/override`
- **Mô tả:** Cho phép tác giả thủ công thiết lập hoặc sửa đổi quan hệ giữa 2 thực thể.
- **Request Body:**
  ```json
  {
    "story_id": "id",
    "subject": "Nhân vật A",
    "relation": "LOVES",
    "object": "Nhân vật B"
  }
  ```

---

## 4. Công cụ hỗ trợ (Utilities)

### `POST /v1/ai/graph/related`
- **Mô tả:** Tìm nhanh các thực thể liên quan đến một cái tên cụ thể trong Graph.

### `POST /v1/ai/llm/generate`
- **Mô tả:** Cổng kết nối trực tiếp với LLM (OpenAI/Gemini/Groq) cho các mục đích tùy chỉnh.
