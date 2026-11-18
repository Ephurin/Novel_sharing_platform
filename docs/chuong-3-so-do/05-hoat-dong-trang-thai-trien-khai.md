# Chương 3 – Hoạt động, trạng thái và triển khai

> **Ghi chú kiểm tra:** Các sơ đồ được tách từ [Chương 3](../BAO_CAO_CHUONG_3.md) để xem Mermaid theo nhóm, giảm tải cho trình xem GitHub. Nguồn đối chiếu nghiệp vụ là mã nguồn nhánh `main`; vị trí lưu này chỉ là nhánh tài liệu.

## 3.6.1. Quy trình AI phân tích bản thảo và quản lý đề xuất

```mermaid
flowchart TD
    A(["Bản thảo / revision được chọn"]) --> B["Kiểm tra quyền và định danh truyện"]
    B --> C["Tạo hoặc tiếp nhận yêu cầu phân tích"]
    C --> D["Trích xuất thực thể và dữ kiện"]
    D --> E["Chuẩn hóa, đối chiếu thực thể"]
    E --> F["Phân tích sự kiện / trạng thái / quan hệ"]
    F --> G["Tạo finding hoặc proposal có bằng chứng"]
    G --> H{"Cần tác giả quyết định?"}
    H -->|Có| I["Đưa vào hàng đợi review"]
    I --> J{"Tác giả quyết định"}
    J -->|Chấp nhận / sửa| K["Kiểm tra phiên bản và điều kiện hợp lệ"]
    K --> L["Ghi nhận dữ liệu đã xác nhận"]
    J -->|Từ chối| M["Đánh dấu từ chối, không cập nhật canonical"]
    H -->|Không, dữ liệu dẫn xuất an toàn| N["Cập nhật dữ liệu dẫn xuất theo chính sách"]
    L --> O(["Truy vấn ngữ cảnh cho lần viết tiếp theo"])
    N --> O
    M --> O
```

*Hình 3.18. Activity Diagram của quy trình phân tích và phê duyệt ngữ cảnh AI.*

## 3.6.2. Vòng đời chương truyện

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Tạo chương
    DRAFT --> DRAFT: Lưu bản thảo / chỉnh sửa
    DRAFT --> PENDING_MODERATION: Có quy tắc cần review
    DRAFT --> PUBLISHED: Qua kiểm tra công bố
    PENDING_MODERATION --> PUBLISHED: Admin chấp nhận
    PENDING_MODERATION --> REJECTED: Admin từ chối
    REJECTED --> DRAFT: Tác giả chỉnh sửa
    PUBLISHED --> ARCHIVED: Lưu trữ chương
    ARCHIVED --> PUBLISHED: Khôi phục theo quy tắc
```

*Hình 3.19. State Machine thể hiện các trạng thái chính của chương truyện.*

## 3.6.3. Mô hình triển khai ứng dụng

```mermaid
flowchart TB
    subgraph External["Thiết bị và kết nối ngoài"]
      Browser["Trình duyệt Web"]
      Phone["Ứng dụng React Native / Expo"]
      LLM["LLM / Embedding Provider"]
    end
    subgraph Docker["Docker Compose - hệ thống demo"]
      WEB["Web container / HTTP"]
      API["Backend container / Node.js:4000"]
      AI["AI Service container / FastAPI:8000"]
      PG[("PostgreSQL + pgvector")]
      MONGO[("MongoDB")]
      MEDIA[("Volume lưu tài nguyên")]
    end
    Browser --> WEB
    Phone --> API
    WEB --> API
    API --> AI
    API --> PG
    API --> MONGO
    API --> MEDIA
    AI --> PG
    AI --> LLM
```

*Hình 3.20. Sơ đồ triển khai hệ thống theo Docker Compose trên nhánh `main`.*

