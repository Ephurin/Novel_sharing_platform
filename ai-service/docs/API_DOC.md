# API Documentation — Ephurin Co-Pilot AI Service

Tài liệu này liệt kê tất cả các endpoints hiện có của hệ thống Backend (FastAPI) cho AI Service.

---

## 1. Hệ thống (System)

### `GET /health`
- **Mô tả:** Kiểm tra trạng thái hoạt động của server.
- **Request:** Không yêu cầu.
- **Response (200 OK):**
  ```json
  {
    "status": "ok"
  }
  ```

---

## 2. Dịch vụ AI (AI Services) — `/v1/ai`

### `POST /v1/ai/extract-entities`
- **Mô tả:** Trích xuất thực thể (NER) từ văn bản và kiểm tra tính nhất quán sơ bộ.
- **Request Body:**
  ```json
  {
    "text": "Đoạn văn cần phân tích..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "entities": [
      {
        "Entity": "Tên thực thể (ví dụ: Chu Vân)",
        "Label": "Loại thực thể (ví dụ: PER, LOC, ORG, MISC)",
        "Score": 0.95
      }
    ],
    "warnings": [
      {
        "code": "Mã lỗi/Cảnh báo tính nhất quán",
        "message": "Chi tiết cảnh báo"
      }
    ],
    "processing_ms": 12.34
  }
  ```

### `POST /v1/ai/suggest-next`
- **Mô tả:** Gợi ý hướng đi tiếp theo cho câu chuyện dựa trên bối cảnh nhân vật và dữ liệu Graph.
- **Request Body:**
  ```json
  {
    "character_name": "Tên nhân vật cần gợi ý",
    "current_text": "Đoạn văn hiện tại",
    "story_id": "default_story", // optional, mặc định là "default_story"
    "mood": "neutral", // optional, romantic | tragic | comedic | dark | neutral
    "max_regenerations": 2, // optional, mặc định là 2 (tối đa lần sinh lại khi xung đột)
    "graph_limit": 50 // optional, mặc định là 50
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "character_name": "Tên nhân vật",
    "graph_context": "Mô tả dạng text các quan hệ 1-hop của nhân vật",
    "suggestions": [
      "Gợi ý hướng đi 1 từ LLM...",
      "Gợi ý hướng đi 2 từ LLM...",
      "Gợi ý hướng đi 3 từ LLM..."
    ],
    "validations": [
      {
        "suggestion": "Nội dung gợi ý tương ứng",
        "is_consistent": true,
        "action": "Regenerate hoặc Accept",
        "errors": [
          {
            "code": "MÃ_XUNG_ĐỘT",
            "message": "Chi tiết xung đột với dữ liệu KB Graph"
          }
        ]
      }
    ],
    "attempts": 1,
    "regenerated": false,
    "status": "accepted", // hoặc "conflict_after_max_regenerate"
    "processing_ms": 250.5
  }
  ```

### `POST /v1/ai/analyze/chapter`
- **Mô tả:** Phân tích chương truyện để tìm các "ứng viên" thực thể (Human-in-the-loop).
- **Request Body:**
  ```json
  {
    "story_id": "id_cua_truyen",
    "text": "Nội dung chương truyện cần phân tích..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "story_id": "id_cua_truyen",
    "candidates": [
      {
        "id": "uuid-tu-dong-sinh",
        "raw_name": "Tên thực thể dạng thô",
        "normalized_name": "Tên thực thể đã chuẩn hóa",
        "type": "Loại thực thể (PER/LOC/...)",
        "confidence": 0.85,
        "status": "pending",
        "source": "ner", // ner hoặc expanded
        "action": "suggest_add" // suggest_add, suggest_merge, hoặc ignore
      }
    ],
    "processing_ms": 45.67
  }
  ```

### `POST /v1/ai/kb/confirm`
- **Mô tả:** Lưu các thực thể đã được người dùng phê duyệt vào Knowledge Base (KB). Nếu gửi kèm tham số `text` (văn bản gốc của chương truyện/phân đoạn), API sẽ tự động kích hoạt pipeline trích xuất sự kiện (Events) và cập nhật Trạng thái thế giới hiện tại (Current World State).
- **Request Body:**
  ```json
  {
    "story_id": "id_cua_truyen",
    "text": "Nội dung chương/phân đoạn truyện gốc (tùy chọn)", // optional, dùng để kích hoạt trích xuất sự kiện & cập nhật trạng thái
    "approved_candidates": [
      {
        "id": "uuid-truoc-do",
        "raw_name": "Tên thực thể dạng thô",
        "normalized_name": "Tên thực thể đã chuẩn hóa",
        "type": "Loại thực thể",
        "confidence": 0.85,
        "status": "pending",
        "source": "ner",
        "action": "suggest_add"
      }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "story_id": "id_cua_truyen",
    "db_updates": [
      {
        "entity": "Tên thực thể đã cập nhật",
        "label": "Loại thực thể",
        "story_id": "id_cua_truyen",
        "status": "updated"
      }
    ],
    "event_history": [
      {
        "event_id": "evt_583266c4",
        "chapter": 1,
        "timestamp": "2026-06-18T13:46:51.249115+00:00",
        "participants": [
          "Tiêu Trần",
          "Lâm Nguyệt Nhi"
        ],
        "locations": [
          "Thương Loan Sơn"
        ],
        "summary": "Tiêu Trần và Lâm Nguyệt Nhi rời khỏi Thương Loan Sơn để trốn tránh Hắc Ma Hội.",
        "event_type": "movement",
        "emotion_tags": [
          "fear"
        ],
        "importance_score": 0.8,
        "consequences": [
          "Tiêu Gia bị đe dọa"
        ],
        "source": "AI"
      }
    ],
    "current_world_state": {
      "characters": {
        "Tiêu Trần": {
          "location": "Outside Thương Loan Sơn",
          "realm": "Unknown",
          "health": 100,
          "status": "Alive",
          "inventory": [],
          "active_relationships": {}
        }
      }
    },
    "processing_ms": 1250.45
  }
  ```

### `POST /v1/ai/sync-story`
- **Mô tả:** Đồng bộ hóa nội dung câu chuyện với cơ sở dữ liệu. Cập nhật các entity từ câu chuyện vào Knowledge Base nếu thiếu sót (Đây là API cũ ít dùng trong luồng Co-pilot mới).
- **Request Body:**
  ```json
  {
    "story_id": "id_cua_truyen",
    "story_content": "Toàn bộ nội dung truyện..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "story_id": "id_cua_truyen",
    "extracted_entities": [
      {
        "word": "Từ được trích xuất",
        "entity": "Loại thực thể",
        "score": 0.99
      }
    ],
    "db_updates": [
      {
        "entity": "Từ được trích xuất",
        "label": "Loại thực thể",
        "story_id": "id_cua_truyen",
        "status": "updated",
        "reason": null
      }
    ],
    "updated_count": 1,
    "failed_count": 0,
    "processing_ms": 120.45
  }
  ```

---

## 3. Tương tác Nâng cao (Enhanced Interactions) — `/v1/enhanced`

Đây là các API chính được sử dụng trong giao diện Co-Pilot hiện tại.

### `POST /v1/enhanced/process-interactions`
- **Mô tả:** Pipeline xử lý toàn diện: NER -> Entity Resolution -> LLM Event Extraction -> State Management -> Auto Persistence.
- **Mô tả quy trình:**
  1. Nhận diện nhân vật/địa điểm thông qua pure-LLM entity pipeline.
  2. Khớp thực thể với dữ liệu đã có trong KB (Entity Resolution).
  3. LLM phân tích các sự kiện diễn ra giữa các nhân vật/thực thể.
  4. LLM cập nhật trạng thái (máu, vị trí, thuộc tính vật phẩm).
  5. Tự động lưu các quan hệ hợp lệ vào KB.
- **Request Body:**
  ```json
  {
    "story_id": "id_cua_truyen",
    "text": "Đoạn văn vừa viết...",
    "use_existing_entities": true // optional, mặc định là true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "story_id": "id_cua_truyen",
    "entities_extracted": 3,
    "entities_resolved": 3,
    "entities_anchored": 1,
    "entities": [
      {
        "word": "Nhân vật A",
        "resolved_name": "Nhân vật A",
        "entity_type": "PER",
        "status": "Alive",
        "location": "Vị trí hiện tại",
        "attributes": {
          "health": {
            "attribute": "health",
            "value": "Healthy",
            "confidence": 0.9,
            "source": "AI",
            "timestamp": "2026-06-18T09:30:00Z"
          }
        }
      }
    ],
    "events_extracted": 1,
    "states_extracted": 1,
    "applied_relations": [
      {
        "relation": {
          "subject": "Nhân vật A",
          "subject_type": "PER",
          "relation": "ALLY_OF",
          "object": "Nhân vật B",
          "object_type": "PER",
          "confidence": 0.85,
          "metadata": {
            "source_event_id": "uuid-cua-event",
            "context": "Đoạn văn chứa tương tác"
          }
        },
        "reason": "Mô tả lý do hệ thống tự động lưu quan hệ"
      }
    ],
    "suggested_relations": [], // Các quan hệ gợi ý cho người dùng duyệt nếu độ tin cậy thấp hoặc nghi ngờ
    "ignored_relations": [], // Các quan hệ bị bỏ qua
    "processing_ms": 350.2
  }
  ```

### `GET /v1/enhanced/kb/{story_id}`
- **Mô tả:** Lấy toàn bộ trạng thái Knowledge Base của một câu chuyện (dùng cho Graph Drawer hiển thị mối quan hệ).
- **Tham số:** `story_id` (định danh câu chuyện trên đường dẫn URL)
- **Response (200 OK):**
  ```json
  {
    "story_id": "id_cua_truyen",
    "metadata": {
      "created_at": "2026-06-18T09:30:00Z",
      "updated_at": "2026-06-18T09:40:00Z"
    },
    "entities": {
      "nhân vật a": {
        "name": "Nhân vật A",
        "entity_type": "PER",
        "status": "Alive",
        "location": "Vị trí X",
        "mentions": 5
      }
    },
    "relations": [
      {
        "subject": "Nhân vật A",
        "relation": "ALLY_OF",
        "object": "Nhân vật B",
        "metadata": {},
        "source": "system", // system hoặc author
        "locked": false
      }
    ],
    "events": [],
    "enhanced_events": [],
    "relation_history": [],
    "entity_states": {}
  }
  ```

### `POST /v1/enhanced/relation/override`
- **Mô tả:** Cho phép tác giả thủ công thiết lập hoặc sửa đổi quan hệ giữa 2 thực thể (sẽ khóa quan hệ này lại để AI không tự động thay đổi).
- **Request Body:**
  ```json
  {
    "story_id": "id_cua_truyen",
    "subject": "Tên Nhân vật A",
    "relation": "LOVES",
    "object": "Tên Nhân vật B"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "success",
    "relation": "LOVES",
    "locked": true
  }
  ```

---

## 4. Công cụ hỗ trợ (Utilities)

### `POST /v1/ai/graph/related`
- **Mô tả:** Tìm nhanh các thực thể liên quan đến một cái tên cụ thể trong Graph.
- **Request Body:**
  ```json
  {
    "entity": "Tên thực thể cần tìm kiếm",
    "limit": 10 // optional, mặc định là 10 (từ 1 đến 100)
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "entity": "Tên thực thể cần tìm kiếm",
    "related": [
      {
        "name": "Thực thể liên quan",
        "relation": "ALLY_OF"
      }
    ]
  }
  ```

### `POST /v1/ai/llm/generate`
- **Mô tả:** Cổng kết nối trực tiếp với LLM (Gemini/OpenAI/Groq...) cho các mục đích tùy chỉnh.
- **Request Body:**
  ```json
  {
    "prompt": "Câu lệnh prompt gửi cho LLM...",
    "system_prompt": "Câu lệnh cấu hình hệ thống (tùy chọn)", // optional
    "temperature": 0.2, // optional, mặc định 0.2 (0.0 đến 2.0)
    "max_tokens": 256 // optional, mặc định 256 (16 đến 2048)
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "output": "Nội dung phản hồi được sinh ra từ LLM..."
  }
  ```
