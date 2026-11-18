# Chương 3 – Kiến trúc và Use Case

> **Ghi chú kiểm tra:** Các sơ đồ được tách từ [Chương 3](../BAO_CAO_CHUONG_3.md) để xem Mermaid theo nhóm, giảm tải cho trình xem GitHub. Nguồn đối chiếu nghiệp vụ là mã nguồn nhánh `main`; vị trí lưu này chỉ là nhánh tài liệu.

## 3.1.2. Sơ đồ kiến trúc tổng thể

```mermaid
flowchart TB
    Guest["Khách truy cập"]
    Reader["Độc giả"]
    Author["Tác giả"]
    Admin["Quản trị viên"]
    subgraph Clients["Lớp giao diện"]
        WEB["Web React + Vite"]
        MOBILE["Mobile React Native + Expo"]
    end
    subgraph Backend["Backend Node.js / Express - Modular Monolith"]
        AUTH["Auth / Users"]
        NOVEL["Novels / Chapters / Revisions"]
        READING["Reading / Interactions"]
        WALLET["Wallet Coin mô phỏng"]
        CONTROL["Content Control / Admin"]
        GATEWAY["AI Gateway / Copilot"]
    end
    subgraph AI["Dịch vụ AI Python / FastAPI"]
        NARR["Narrative / Story Brain"]
        GENERATE["Writing / Analysis / Context"]
    end
    subgraph Storage["Tầng dữ liệu"]
        PG[("PostgreSQL")]
        MONGO[("MongoDB")]
        NVEC[("PostgreSQL narrative + pgvector")]
    end
    PROVIDER["LLM và Embedding Provider ngoài hệ thống"]
    Guest --> WEB
    Reader --> MOBILE
    Reader --> WEB
    Author --> WEB
    Admin --> WEB
    WEB --> AUTH
    WEB --> NOVEL
    WEB --> READING
    WEB --> WALLET
    WEB --> CONTROL
    WEB --> GATEWAY
    MOBILE --> AUTH
    MOBILE --> READING
    MOBILE --> WALLET
    GATEWAY --> NARR
    GATEWAY --> GENERATE
    NARR --> NVEC
    GENERATE --> NARR
    GENERATE --> PROVIDER
    AUTH --> PG
    NOVEL --> PG
    NOVEL --> MONGO
    READING --> PG
    READING --> MONGO
    WALLET --> PG
    CONTROL --> PG
    CONTROL --> MONGO
```

*Hình 3.1. Kiến trúc tổng thể của nền tảng Ephurin (tổng hợp từ [M1], [M2], [M3]).*

## 3.2.2. Biểu đồ Use Case tổng quát

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    A["Author"]
    AD["Admin"]
    subgraph E["Hệ thống Ephurin"]
        C1(["Tìm kiếm và xem truyện"])
        C2(["Đọc và lưu tiến độ"])
        C3(["Tương tác cộng đồng"])
        C4(["Dùng ví Coin mô phỏng"])
        C5(["Quản lý tác phẩm và chương"])
        C6(["Sáng tác và dùng AI Copilot"])
        C7(["Quản lý tài khoản"])
        C8(["Kiểm duyệt nội dung"])
    end
    G --> C1
    R --> C2
    R --> C3
    R --> C4
    A --> C5
    A --> C6
    AD --> C7
    AD --> C8
```

*Hình 3.2. Biểu đồ ca sử dụng tổng quát.*

## 3.2.3. Use Case của độc giả

```mermaid
flowchart LR
    R["Reader"]
    subgraph SYS["Phân hệ độc giả"]
      A(["Tìm kiếm và lọc truyện"])
      B(["Đọc chương"])
      C(["Lưu lịch sử đọc / dấu trang"])
      D(["Quản lý thư viện"])
      E(["Bình luận / thích / theo dõi"])
      F(["Đánh giá và nhận thông báo"])
      G(["Xem ví / mở khóa chương VIP"])
    end
    R --> A
    R --> B
    R --> C
    R --> D
    R --> E
    R --> F
    R --> G
```

*Hình 3.3. Ca sử dụng của độc giả.*

## 3.2.4. Use Case của tác giả

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Không gian sáng tác"]
      U1(["Tạo / cập nhật tác phẩm"])
      U2(["Tạo và chỉnh sửa chương"])
      U3(["Lưu bản thảo / tạo revision"])
      U4(["Sắp xếp và lên lịch chương"])
      U5(["Gửi yêu cầu công bố"])
      U6(["Quản lý nhân vật / timeline / tóm tắt"])
      U7(["Xem thống kê và thu nhập mô phỏng"])
    end
    A --> U1
    A --> U2
    A --> U3
    A --> U4
    A --> U5
    A --> U6
    A --> U7
```

*Hình 3.4. Ca sử dụng của tác giả.*

## 3.2.5. Use Case hỗ trợ sáng tác bằng AI

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["AI Writing / Story Brain"]
      X1(["Khởi tạo Story Brain từ ý tưởng"])
      X2(["Khởi tạo từ bản thảo có sẵn"])
      X3(["Xem / rà soát thực thể và dữ kiện"])
      X4(["Yêu cầu phân tích / tái phân tích"])
      X5(["Sinh gợi ý hoặc bản thảo"])
      X6(["Xem danh sách đề xuất"])
      X7(["Chấp nhận / sửa / từ chối đề xuất"])
      X8(["Xem trước ngữ cảnh và quản lý kế hoạch"])
    end
    A --> X1
    A --> X2
    A --> X3
    A --> X4
    A --> X5
    A --> X6
    A --> X7
    A --> X8
```

*Hình 3.5. Ca sử dụng của tác giả đối với phân hệ AI.*

## 3.2.6. Use Case của quản trị viên

```mermaid
flowchart LR
    AD["Admin"]
    subgraph SYS["Phân hệ quản trị"]
      M1(["Quản lý người dùng / trạng thái tài khoản"])
      M2(["Quản lý danh mục và truyện"])
      M3(["Xem báo cáo vi phạm"])
      M4(["Duyệt nội dung bị gắn cờ"])
      M5(["Quản lý giao dịch / rút Coin mô phỏng"])
      M6(["Xem bảng điều khiển vận hành"])
    end
    AD --> M1
    AD --> M2
    AD --> M3
    AD --> M4
    AD --> M5
    AD --> M6
```

*Hình 3.6. Ca sử dụng của quản trị viên.*

