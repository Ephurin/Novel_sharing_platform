# 02. Phân tích và đặc tả yêu cầu phần mềm (SRS)

Tài liệu này chi tiết hóa các yêu cầu chức năng và phi chức năng cho hệ thống Ephurin.

## 1. Yêu cầu chức năng (Functional Requirements - FR)

Hệ thống được chia thành các phân hệ cốt lõi sau:

### 1.1 Phân hệ Người dùng (User Management)
- **FR-01**: Đăng ký, đăng nhập và quản lý tài khoản (hỗ trợ SSO Google/Facebook).
- **FR-02**: Quản lý hồ sơ cá nhân (Avatar, Bio, Social links).
- **FR-03**: Hệ thống theo dõi (Follow/Unfollow) tác giả và độc giả.
- **FR-04**: Hệ thống cấp bậc và huy hiệu (Gamification).

### 1.2 Phân hệ Tác giả & Tác phẩm (Novel & Author Management)
- **FR-05**: Tạo và quản lý tác phẩm (Tiêu đề, mô tả, tag, thể loại, ảnh bìa).
- **FR-06**: Trình soạn thảo chương truyện (Rich Text/Markdown) hỗ trợ tự động lưu (Autosave).
- **FR-07**: Quản lý chương (Đăng ngay, hẹn giờ, lưu nháp, sắp xếp thứ tự).
- **FR-08**: Dashboard thống kê cho tác giả (Lượt xem, lượt vote, doanh thu theo thời gian thực).

### 1.3 Phân hệ Độc giả (Reading Experience)
- **FR-09**: Trình đọc truyện tùy biến (Font, size, màu nền, chế độ sáng/tối).
- **FR-10**: Lưu lịch sử đọc và đánh dấu chương (Bookmark).
- **FR-11**: Tìm kiếm nâng cao (Full-text search) và lọc theo nhiều tiêu chí.
- **FR-12**: Hệ thống gợi ý truyện dựa trên hành vi người dùng.

### 1.4 Phân hệ Tương tác & Cộng đồng (Social Interaction)
- **FR-13**: Bình luận theo chương và bình luận theo đoạn văn (Inline comment).
- **FR-14**: Hệ thống Vote, Rating và Review tác phẩm.
- **FR-15**: Tạo và quản lý danh sách đọc (Reading List).

### 1.5 Phân hệ Kinh doanh (Monetization)
- **FR-16**: Hệ thống ví điện tử và nạp Coin.
- **FR-17**: Mở khóa chương trả phí (Paywall management).
- **FR-18**: Hệ thống Donate và quà tặng cho tác giả.
- **FR-19**: Quản lý đăng ký thành viên (Subscription models).

### 1.6 Phân hệ Quản trị (Administration & Moderation)
- **FR-20**: Kiểm duyệt nội dung tự động bằng AI và xử lý báo cáo từ người dùng.
- **FR-21**: Quản lý người dùng, tác phẩm và quảng cáo.
- **FR-22**: Hệ thống báo cáo và phân tích dữ liệu tổng thể (Admin Dashboard).

---

## 2. Yêu cầu phi chức năng (Non-Functional Requirements - NFR)

### 2.1 Hiệu năng (Performance)
- **NFR-01**: Thời gian phản hồi cho các thao tác đọc và tìm kiếm phải dưới 2 giây.
- **NFR-02**: Hệ thống phải chịu tải được ít nhất 10,000 người dùng đồng thời (Concurrent Users).
- **NFR-03**: Sử dụng CDN để tối ưu hóa tốc độ tải ảnh bìa và tài nguyên tĩnh.

### 2.2 Bảo mật (Security)
- **NFR-04**: Toàn bộ dữ liệu nhạy cảm (mật khẩu, thông tin thanh toán) phải được mã hóa.
- **NFR-05**: Áp dụng phân quyền dựa trên vai trò (RBAC - Role Based Access Control).
- **NFR-06**: Chống các cuộc tấn công phổ biến như SQL Injection, XSS, CSRF.

### 2.3 Độ tin cậy (Reliability)
- **NFR-07**: Đảm bảo tính sẵn sàng của hệ thống (Uptime) đạt 99.9%.
- **NFR-08**: Dữ liệu phải được sao lưu (Backup) định kỳ hàng ngày.

### 2.4 Khả năng mở rộng (Scalability)
- **NFR-09**: Kiến trúc hệ thống phải cho phép mở rộng linh hoạt (Horizontal Scaling) khi lượng người dùng tăng đột biến.

### 2.5 Tính khả dụng (Usability)
- **NFR-10**: Giao diện phải thân thiện, đáp ứng tốt trên cả Web và Mobile (Responsive Design).
- **NFR-11**: Hỗ trợ đa ngôn ngữ (i18n) - ưu tiên Tiếng Việt và Tiếng Anh.
