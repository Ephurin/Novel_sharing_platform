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
*   Cá nhân hóa giao diện đọc (Font, Dark mode).
*   Tìm kiếm, Lọc truyện nâng cao.
### 4.5 Module 5: Tương tác & Cộng đồng
*   Bình luận (theo chương/đoạn), Like, Bookmark.
*   Theo dõi tác giả, Thông báo đẩy (Push Notification).
### 4.6 Module 6: Quản trị & Thống kê (Admin Dashboard)
*   Kiểm duyệt nội dung, Quản lý người dùng.
*   Thống kê lượt xem, doanh thu (nếu có), biểu đồ tăng trưởng.

## CHƯƠNG V: THIẾT KẾ GIAO DIỆN (UI/UX)
### 5.1 Sơ đồ điều hướng (Sitemap & Screen Flow)
### 5.2 Mockups giao diện Web (Author & Admin)
### 5.3 Mockups giao diện Mobile (Reader App)

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
