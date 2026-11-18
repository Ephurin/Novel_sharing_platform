# Chương 3 – Kiến trúc và Use Case

> Nguồn kiểm chứng: mã nguồn `main`. Xem sơ đồ chi tiết từng nhóm để tránh lỗi hiển thị khi tải quá nhiều sơ đồ trên cùng một trang.

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

### 3.2.2. Sơ đồ tổng quát

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    A["Author"]
    AD["Admin"]
    subgraph SYS["Hệ thống Ephurin"]
        U1(["Khám phá truyện công khai"])
        U2(["Đọc và quản lý thư viện"])
        U3(["Tương tác cộng đồng"])
        U4(["Sử dụng Coin mô phỏng"])
        U5(["Quản lý tác phẩm và chương"])
        U6(["Quản lý ngữ cảnh truyện"])
        U7(["Sáng tác với AI Copilot"])
        U8(["Quản trị và kiểm duyệt"])
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U3
    R --- U4
    A --- U5
    A --- U6
    A --- U7
    AD --- U8
```

*Hình 3.2. Biểu đồ Use Case tổng quát Ephurin.*

Sơ đồ này định vị các nhóm chức năng, không cố chứa toàn bộ thao tác. Đăng nhập được mô tả là điều kiện tiên quyết của các ca sử dụng yêu cầu xác thực, không phải một mục tiêu mở rộng của mọi thao tác.


[Use Case độc giả](01a-usecase-doc-gia.md) · [Use Case tác giả](01b-usecase-tac-gia.md) · [Use Case AI](01c-usecase-ai.md) · [Use Case quản trị](01d-usecase-quan-tri.md)
