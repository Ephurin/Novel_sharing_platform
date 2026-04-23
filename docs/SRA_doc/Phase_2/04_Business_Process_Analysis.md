# 04. Phân tích và Trực quan hóa nghiệp vụ (Business Process Analysis)

Tài liệu này trực quan hóa các quy trình nghiệp vụ cốt lõi của hệ thống Ephurin bằng sơ đồ luồng (Flowchart/BPMN).

## 1. Quy trình Đăng ký Tác giả & Xác thực (Author KYC)

Để đảm bảo chất lượng nội dung và tính minh bạch trong thanh toán, tác giả cần thực hiện quy trình xác thực.

```mermaid
sequenceDiagram
    participant User as Người dùng
    participant System as Hệ thống Ephurin
    participant Admin as Quản trị viên
    
    User->>System: Gửi yêu cầu trở thành Tác giả
    System->>User: Yêu cầu thông tin định danh (KYC)
    User->>System: Cung cấp thông tin (CCCD/CMND, TK ngân hàng)
    System->>Admin: Thông báo yêu cầu duyệt KYC
    Admin->>System: Kiểm tra & Phê duyệt
    System-->>User: Gửi thông báo: Đã kích hoạt quyền Tác giả
```

## 2. Quy trình Sáng tác & Xuất bản (Publishing Workflow)

Quy trình tích hợp kiểm duyệt tự động bằng AI để rút ngắn thời gian xuất bản.

```mermaid
flowchart TD
    A[Bắt đầu viết chương mới] --> B{Lưu nháp?}
    B -- Có --> C[Lưu vào Drafts]
    B -- Không --> D[Gửi yêu cầu Xuất bản]
    D --> E[AI Kiểm duyệt nội dung]
    E --> F{Hợp lệ?}
    F -- Không --> G[Gửi phản hồi lỗi cho Tác giả]
    F -- Có --> H[Đăng tải chương truyện]
    H --> I[Gửi thông báo tới Độc giả theo dõi]
    G --> A
```

## 3. Quy trình Thanh toán & Mở khóa nội dung (Monetization)

```mermaid
flowchart LR
    User[Độc giả] --> A{Có đủ Coin?}
    A -- Không --> B[Nạp Coin qua Ví/Bank]
    B --> C[Cập nhật số dư]
    C --> A
    A -- Có --> D[Xác nhận mở khóa chương]
    D --> E[Trừ Coin độc giả]
    E --> F[Cộng doanh thu cho Tác giả]
    F --> G[Hiển thị nội dung chương]
```

## 4. Phân tích các bên liên quan (Stakeholder Analysis)

| Bên liên quan | Vai trò & Trách nhiệm | Mục tiêu chính |
| :--- | :--- | :--- |
| **Độc giả** | Tiêu thụ nội dung, tương tác, trả phí. | Tìm kiếm truyện hay, trải nghiệm đọc mượt. |
| **Tác giả** | Sáng tạo nội dung, quản lý tác phẩm. | Tiếp cận độc giả, kiếm thu nhập minh bạch. |
| **Quản trị viên** | Quản lý hệ thống, kiểm duyệt cao cấp. | Đảm bảo hệ thống vận hành ổn định, đúng pháp luật. |
| **Nhà quảng cáo** | Cung cấp tài trợ, quảng bá thương hiệu. | Tiếp cận đúng đối tượng khách hàng mục tiêu. |
| **Đối tác thanh toán** | Xử lý giao dịch tài chính. | Đảm bảo giao dịch nhanh chóng và an toàn. |
| **Đội ngũ Phát triển** | Xây dựng và bảo trì phần mềm. | Tối ưu hóa tính năng và hiệu năng hệ thống. |
| **Giảng viên (SQA)** | Giám sát chất lượng và quy trình. | Đánh giá tính tuân thủ quy chuẩn phần mềm. |
