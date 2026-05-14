# Outline Đặc tả Yêu cầu Phần mềm (SRS) - Nền tảng Chia sẻ Tiểu thuyết (Web + Mobile + AI)

**Dành cho: Tiểu luận cuối kỳ môn SRA (Software Requirements Analysis)**
**Dự án: Ephurin Novel Platform**
**Phiên bản: 2.0 (Updated: Full Platform Scope)**

---

## CHƯƠNG I: GIỚI THIỆU CHUNG
### 1.1 Mục đích tài liệu
### 1.2 Phạm vi dự án
*   Hệ thống Web: Soạn thảo, quản lý nội dung, quản trị.
*   Hệ thống Mobile: Trải nghiệm đọc, tương tác cộng đồng.
*   Dịch vụ AI: Hỗ trợ phân loại và gợi ý nội dung.
### 1.3 Đối tượng sử dụng tài liệu
### 1.4 Thuật ngữ và Từ viết tắt
### 1.5 Tài liệu tham khảo
### 1.6 Khảo sát và Phân tích các hệ thống tương tự (Benchmarking)
*   So sánh mô hình phân phối nội dung: Netflix, Spotify.
*   So sánh tính năng nền tảng: Wattpad, Webnovel.
*   Xác định vị thế của "AI Support" trong hệ thống.

## CHƯƠNG II: TỔNG QUAN HỆ THỐNG
### 2.1 Kiến trúc hệ thống (Web - Mobile - Backend - AI Service)
### 2.2 Sơ đồ phân rã chức năng (Functional Tree - 90+ features)
### 2.3 Biểu đồ Use Case tổng quát
### 2.4 Danh sách các tác nhân (Actors)
*   **Guest**: Người dùng vãng lai.
*   **Reader**: Độc giả (Mobile tập trung).
*   **Author**: Tác giả (Web tập trung).
*   **Admin/Editor**: Quản trị viên và Biên tập viên.
*   **AI Service**: Tác nhân hệ thống hỗ trợ xử lý.
### 2.5 Ma trận phân quyền (Permission Matrix)

## CHƯƠNG III: YÊU CẦU DỮ LIỆU & QUY TRÌNH
### 3.1 Sơ đồ thực thể liên kết (ERD)
*   Thực thể chính: User, Story, Chapter, Tag, Comment, Bookmark, Statistic.
### 3.2 Các luồng quy trình chính (Workflow)
*   3.2.1 Quy trình Đăng ký & Xác thực (JWT).
*   3.2.2 Quy trình Sáng tác & Xuất bản (Draft -> Pending -> Published).
*   3.2.3 Quy trình AI hỗ trợ metadata (Gợi ý Tag/Thể loại).
*   3.2.4 Quy trình Kiểm duyệt nội dung (Admin Review).

## CHƯƠNG IV: ĐẶC TẢ CHI TIẾT CÁC YÊU CẦU CHỨC NĂNG
*(Áp dụng format Use Case chi tiết từ Mẫu 2)*

### 4.1 Module 1: Quản lý Tài khoản & Hồ sơ (User Management)
*   Đăng ký, Đăng nhập (Google/Facebook/Email).
*   Hệ thống cấp bậc và huy hiệu (Gamification).
### 4.2 Module 2: Quản lý Tác phẩm (Novel Management - Web)
*   Trình soạn thảo Rich Text/Markdown.
*   Quản lý chương, lịch sử phiên bản, tự động lưu (Auto-save).
### 4.3 Module 3: Module AI thông minh (AI Story Assistant)
*   UC-AI-01: Tự động phân loại thể loại truyện (Fine-tuned PhoBERT).
*   UC-AI-02: Gợi ý Tag và Tiêu đề dựa trên nội dung.
*   UC-AI-03: Phân tích văn phong và độ dài chương.
### 4.4 Module 4: Trải nghiệm Đọc (Reading Features - Mobile)

**1. Sơ đồ Use Case tổng quan phía Độc giả**

![Sơ đồ Use Case tổng quan](<./images/Reading Features.png>)

**2. Đặc tả Use Case chi tiết (Dựa trên Mẫu 2)**

#### UC-RD-01: Cá nhân hóa giao diện đọc
- **Objective:** Độc giả có thể thay đổi font chữ, kích thước, màu nền (Dark/Light mode) để phù hợp với sở thích và môi trường.
- **Actor:** Reader
- **Trigger:** Nhấn vào biểu tượng "Cài đặt hiển thị" trong màn hình đọc.
- **Pre-condition:** Đang ở trong màn hình đọc truyện.
- **Post-condition:** Cài đặt được áp dụng ngay lập tức và lưu lại cho lần đọc sau.
- **Luồng hoạt động (Activities Flow):**

![Luồng hoạt động Cá nhân hóa giao diện](<./images/Cá nhân hóa giao diện đọc.png>)
- **Kịch bản chi tiết:**
  | Bước | Basic Flow | Exception Flow |
  | :--- | :--- | :--- |
  | 1 | Hệ thống hiển thị bảng tùy chỉnh (Font, Size, Background). | |
  | 2 | Người dùng kéo slider để chỉnh cỡ chữ hoặc chọn màu nền. | |
  | 3 | Hệ thống cập nhật CSS/Theme trực tiếp trên màn hình đọc. | |
  | 4 | Hệ thống lưu thông tin cấu hình. | Lỗi lưu trữ: Hiển thị thông báo không thể đồng bộ cài đặt. |

#### UC-RD-02: Tìm kiếm, Lọc truyện nâng cao
- **Objective:** Cho phép tìm kiếm tác phẩm theo từ khóa, thể loại, tình trạng, và các bộ lọc kết hợp.
- **Actor:** Reader, Guest
- **Trigger:** Truy cập thanh tìm kiếm hoặc trang danh mục.
- **Post-condition:** Hiển thị danh sách truyện phù hợp, sắp xếp theo độ liên quan/lượt xem.
- **Kịch bản chi tiết:**
  | Bước | Basic Flow | Alternative Flow |
  | :--- | :--- | :--- |
  | 1 | Người dùng nhập từ khóa và chọn các tiêu chí lọc (Thể loại, Tình trạng). | |
  | 2 | Hệ thống gửi request lọc đến Backend. | Nếu không có từ khóa, chỉ lọc theo tiêu chí sẵn có. |
  | 3 | Backend trả về danh sách kết quả. | Nếu không tìm thấy: Báo "Không có kết quả" và gợi ý truyện phổ biến. |
  | 4 | Hệ thống hiển thị kết quả (dạng List/Grid). | |

### 4.5 Module 5: Tương tác & Cộng đồng

#### UC-IN-01: Bình luận (theo chương/đoạn)
- **Objective:** Cho phép độc giả để lại bình luận tại một chương hoặc một đoạn văn bản cụ thể (Inline comment).
- **Actor:** Reader
- **Trigger:** Bôi đen đoạn văn bản hoặc cuộn xuống cuối chương và chọn "Bình luận".
- **Pre-condition:** Đã đăng nhập.
- **Post-condition:** Bình luận được hiển thị công khai hoặc đưa vào diện chờ duyệt.
- **Luồng hoạt động (Activities Flow):**

![Luồng hoạt động Tương tác cộng đồng](<./images/Tương tác & Cộng đồng.png>)

#### UC-IN-02: Like và Bookmark
- **Objective:** Đánh dấu lưu lại truyện (Bookmark) hoặc thích (Like) để tăng độ phổ biến.
- **Actor:** Reader
- **Trigger:** Nhấn nút "Thêm vào tủ sách" (Bookmark) hoặc "Thích" (Like).
- **Pre-condition:** Đã đăng nhập.
- **Post-condition:** Tác phẩm thêm vào Tủ sách cá nhân; lượt Like tăng.

#### UC-IN-03: Theo dõi tác giả & Thông báo đẩy
- **Objective:** Nhận thông báo khi tác giả yêu thích ra chương mới.
- **Actor:** Reader
- **Trigger:** Nhấn "Theo dõi" tại trang hồ sơ tác giả.
- **Post-condition:** Hệ thống tự động đẩy thông báo (Push Notification) đến thiết bị khi có update.
### 4.6 Module 6: Quản trị & Thống kê (Admin Dashboard)
*   Kiểm duyệt nội dung, Quản lý người dùng.
*   Thống kê lượt xem, doanh thu (nếu có), biểu đồ tăng trưởng.

## CHƯƠNG V: THIẾT KẾ GIAO DIỆN (UI/UX)
### 5.1 Sơ đồ điều hướng (Sitemap & Screen Flow)
### 5.2 Mockups giao diện Web (Author & Admin)
### 5.3 Mockups giao diện Mobile (Reader App)
*   **Màn hình Home:** Hiển thị banner đề cử, top trending, lịch sử "tiếp tục đọc".
    <br>![Màn hình Home](<./images/Màn hình Home.png>)
*   **Màn hình Khám phá & Lọc:** Thanh tìm kiếm, danh mục thể loại (Tags), bộ lọc nâng cao.
    <br>![Màn hình Khám phá](<./images/Màn hình Khám phá.png>)
*   **Màn hình Chi tiết truyện:** Chứa thông tin tổng quan, tóm tắt, danh sách chương, review/đánh giá.
    <br>![Màn hình Chi tiết truyện](<./images/Màn hình Chi tiết truyện.png>)
*   **Màn hình Đọc truyện (Reader View):** Nội dung chương, thanh công cụ ẩn/hiện tùy chỉnh hiển thị (font, nền), tính năng inline comment (bình luận theo dòng).
    <br>![Màn hình Đọc truyện](<./images/Màn hình Đọc truyện (Reader View).png>)
*   **Màn hình Tủ sách (Thư viện):** Chứa các truyện đã Bookmark, lịch sử đọc truyện.
    <br>![Màn hình Tủ sách](<./images/Màn hình Tủ sách.png>)
*   **Màn hình Hồ sơ Tác giả:** Nút "Theo dõi", danh sách tác phẩm của tác giả đó.
    <br>![Màn hình Hồ sơ Tác giả](<./images/Màn hình Hồ sơ Tác giả.png>)

## CHƯƠNG VI: CÁC YÊU CẦU PHI CHỨC NĂNG
### 6.1 Hiệu năng (Performance)
*   Thời gian phản hồi API, khả năng chịu tải đồng thời.
### 6.2 Bảo mật (Security)
*   Mã hóa mật khẩu, bảo mật API Key, phân quyền chặt chẽ.
### 6.3 Độ tin cậy (Reliability)
*   Khả năng sao lưu dữ liệu tự động, tính nhất quán dữ liệu giữa Web và Mobile.
### 6.4 Công nghệ & Ràng buộc (Tech Stack)
*   Backend (NestJS/Django), Mobile (Flutter/React Native), AI (PyTorch/Transformers).

## PHỤ LỤC
*   Danh mục mã lỗi hệ thống.
*   Mô tả chi tiết Dataset dùng để Fine-tune model AI.
