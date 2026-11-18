# Chương 3 – Biểu đồ tuần tự

> **Ghi chú kiểm tra:** Các sơ đồ được tách từ [Chương 3](../BAO_CAO_CHUONG_3.md) để xem Mermaid theo nhóm, giảm tải cho trình xem GitHub. Nguồn đối chiếu nghiệp vụ là mã nguồn nhánh `main`; vị trí lưu này chỉ là nhánh tài liệu.

## 3.5.1. Đăng nhập

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant UI as Web/Mobile
    participant R as Auth Route/Controller
    participant S as Auth Service
    participant DB as PostgreSQL
    U->>UI: Nhập định danh và mật khẩu
    UI->>R: POST /api/v1/auth/login
    R->>S: login(input)
    S->>DB: Tra cứu người dùng
    DB-->>S: Thông tin tài khoản
    S->>S: Kiểm tra mật khẩu và trạng thái
    alt Hợp lệ
        S->>DB: Lưu hash refresh token
        S-->>R: Access token + refresh cookie
        R-->>UI: Đăng nhập thành công
        UI-->>U: Vào không gian phù hợp vai trò
    else Không hợp lệ
        S-->>R: Lỗi xác thực
        R-->>UI: Thông báo lỗi
    end
```

*Hình 3.13. Sơ đồ tuần tự đăng nhập.*

## 3.5.2. Tạo, lưu và gửi công bố chương

```mermaid
sequenceDiagram
    actor A as Tác giả
    participant UI as Author IDE
    participant API as Chapter Controller
    participant S as Chapter Service
    participant PG as PostgreSQL
    participant MO as MongoDB Draft
    participant CC as Content Control
    A->>UI: Soạn hoặc cập nhật nội dung
    UI->>API: PATCH chapter / lưu bản thảo
    API->>S: updateChapter()
    S->>PG: Kiểm tra truyện và quyền sở hữu
    S->>MO: Ghi draft và phiên bản
    MO-->>S: Phiên bản bản thảo đã lưu
    S-->>API: Kết quả cập nhật chương
    API-->>UI: Xác nhận lưu bản thảo
    A->>UI: Gửi công bố
    UI->>API: POST submit-publish
    API->>S: submitChapterPublish()
    S->>PG: Kiểm tra trạng thái chương
    S->>MO: Đọc bản thảo hiện hành
    S->>CC: checkContent()
    alt Không yêu cầu kiểm duyệt
        S->>PG: Ghi nội dung đã công bố
        S-->>UI: PUBLISHED
    else Yêu cầu kiểm duyệt
        CC->>PG: Tạo hoặc sử dụng review
        S->>PG: Chuyển sang PENDING_MODERATION
        S-->>UI: Chờ Admin xử lý
    end
    UI-->>A: Hiển thị kết quả
```

*Hình 3.14. Sơ đồ tuần tự lưu bản thảo và gửi công bố chương.*

## 3.5.3. AI sinh gợi ý và tác giả phê duyệt

```mermaid
sequenceDiagram
    actor A as Tác giả
    participant UI as Author IDE
    participant GW as Node AI Gateway
    participant AI as FastAPI Writing Service
    participant NR as Narrative Repository
    participant LLM as LLM Provider
    participant PG as PostgreSQL / Revisions
    A->>UI: Gửi yêu cầu hỗ trợ viết
    UI->>GW: POST /api/v1/ai/writing/generations
    GW->>GW: Xác thực, kiểm tra quyền truyện
    GW->>AI: Gửi yêu cầu có phạm vi novel/chapter
    AI->>NR: Truy vấn Story Brain / memory
    NR-->>AI: Dữ liệu ngữ cảnh phù hợp
    AI->>AI: Chọn, giới hạn và đóng gói ngữ cảnh
    AI->>LLM: Prompt và ngữ cảnh
    LLM-->>AI: Nội dung gợi ý
    AI-->>GW: Job / draft / kết quả xử lý
    GW-->>UI: Kết quả để xem trước
    UI-->>A: Hiển thị bản thảo đề xuất
    alt Tác giả đồng ý áp dụng
        A->>UI: Chấp nhận
        UI->>GW: Yêu cầu áp dụng hoặc lưu revision
        GW->>PG: Ghi thay đổi hợp lệ / revision
        GW-->>UI: Đã ghi nhận
    else Tác giả từ chối
        A->>UI: Bỏ qua kết quả
        UI-->>A: Giữ nội dung hiện tại
    end
```

*Hình 3.15. Sơ đồ tuần tự AI hỗ trợ sáng tác.*

## 3.5.4. Mở khóa chương VIP

```mermaid
sequenceDiagram
    actor R as Độc giả
    participant UI as Mobile/Web Reader
    participant API as Wallet Controller
    participant W as Wallet Service
    participant PG as PostgreSQL
    R->>UI: Chọn mở khóa chương
    UI->>API: POST /api/v1/chapters/:chapterId/unlock
    API->>W: unlockVipChapter()
    W->>PG: Bắt đầu giao dịch và kiểm tra chương
    W->>PG: Kiểm tra đã mở và số dư
    alt Đủ điều kiện
        W->>PG: Cập nhật số dư / transaction / unlock
        PG-->>W: Giao dịch thành công
        W-->>UI: Đã mở khóa
    else Không đủ điều kiện
        PG-->>W: Không ghi thay đổi
        W-->>UI: Thông báo lý do
    end
    UI-->>R: Kết quả mở khóa
```

*Hình 3.16. Sơ đồ tuần tự mở khóa chương bằng Coin mô phỏng.*

## 3.5.5. Quản trị viên xử lý kiểm duyệt

```mermaid
sequenceDiagram
    actor AD as Admin
    participant UI as Admin Dashboard
    participant API as Admin Moderation API
    participant CC as Content Control Service
    participant PG as PostgreSQL
    participant MO as MongoDB Evidence
    AD->>UI: Xem hàng đợi kiểm duyệt
    UI->>API: GET reviews
    API->>CC: listModerationReviews()
    CC->>PG: Đọc trạng thái review
    CC-->>UI: Danh sách review
    AD->>UI: Chọn mục cần xử lý
    UI->>API: GET reviews/:reviewId
    API->>CC: getModerationReview()
    CC->>MO: Đọc bằng chứng nếu có
    CC-->>UI: Nội dung và bằng chứng
    AD->>UI: Duyệt hoặc từ chối
    UI->>API: POST reviews/:reviewId/resolve
    API->>CC: resolveModerationReview()
    CC->>PG: Ghi quyết định và cập nhật trạng thái
    CC-->>UI: Kết quả
    UI-->>AD: Trạng thái mới
```

*Hình 3.17. Sơ đồ tuần tự xử lý kiểm duyệt nội dung.*

