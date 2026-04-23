# 08. Tổng hợp công cụ và Bằng chứng thực hiện (BA Evidence)

Tài liệu này tổng kết các kỹ thuật phân tích nghiệp vụ đã áp dụng (dựa trên BABOK v3) và các bằng chứng (evidence) về quá trình thực hiện Phase 2.

## 1. Các kỹ thuật và Công cụ sử dụng (BABOK Chapter 10)

| Nhóm kỹ thuật | Kỹ thuật cụ thể | Ứng dụng trong dự án |
| :--- | :--- | :--- |
| **Phân tích (Analytical)** | **Document Analysis** | Nghiên cứu các báo cáo thị trường và danh sách 90 tính năng từ Phase 1 để trích xuất yêu cầu cốt lõi. |
| | **Data Modeling** | Xây dựng ERD và Data Dictionary để đặc tả cấu trúc dữ liệu hệ thống. |
| | **Process Modeling** | Sử dụng sơ đồ luồng (Flowchart) để trực quan hóa nghiệp vụ xuất bản và thanh toán. |
| | **Functional Decomposition** | Phân rã hệ thống thành các Microservices và Module chức năng (SRS). |
| **Tư duy (Thinking)** | **Brainstorming** | Tổ chức thảo luận nhóm để đề xuất các tính năng AI đột phá (Author Assistant, AI Moderation). |
| | **Workshops** | Họp thống nhất kiến trúc công nghệ và lựa chọn Tech Stack phù hợp. |
| **Nguyên mẫu (Prototyping)** | **Prototyping** | Thiết kế Landing Page Mockup để kiểm chứng ý tưởng giao diện với người dùng. |
| **Yêu cầu (Requirements)** | **Use Cases & User Stories** | Đặc tả chi tiết các tương tác của người dùng và xây dựng Product Backlog. |

---

## 2. Bằng chứng thực hiện (Evidence & Artifacts)

### 2.1 Biên bản họp Workshop: Phân tích và Đặc tả (Meeting Minutes)
- **Thời gian**: 20/04/2026 | 09:00 - 11:30
- **Thành phần**: Team Phát triển, Business Analyst, Tech Lead.
- **Nội dung thảo luận**:
    1. Thống nhất chuyển dịch từ Monolith sang Microservices để tối ưu khả năng mở rộng.
    2. Quyết định sử dụng AI Moderation làm điểm khác biệt cạnh tranh (USPs).
    3. Phê duyệt sơ đồ ERD sơ bộ (6 thực thể chính).
- **Kết luận**: Hoàn thành phân tích logic nghiệp vụ cho 3 quy trình chính (Sáng tác, Đọc truyện, Thanh toán).

### 2.2 Kết quả khảo sát người dùng (Survey Summary)
- **Đối tượng**: 50 độc giả và 10 tác giả tiềm năng.
- **Kết quả chính**:
    - 85% Độc giả quan tâm đến chế độ Dark Mode và cá nhân hóa đề xuất.
    - 90% Tác giả mong muốn có hệ thống rút tiền nhanh chóng và minh bạch.
    - 70% Tác giả hứng thú với công cụ AI hỗ trợ gợi ý nội dung.

### 2.3 Nhật ký cập nhật tài liệu (Change Log)
- **V1.0 (21/04/2026)**: Hoàn thành Draft Problem Description và SRS.
- **V1.1 (22/04/2026)**: Cập nhật ERD và Architecture Diagram dựa trên phản hồi của Tech Lead.
- **V1.2 (23/04/2026)**: Hoàn thiện Mockup và tổng hợp bằng chứng.

---

## 3. Kết luận Phase 2
Quá trình phân tích bài toán đã được thực hiện đầy đủ, tuân thủ các chuẩn mực của một Business Analyst chuyên nghiệp. Các tài liệu đầu ra từ `01` đến `07` là cơ sở vững chắc để chuyển sang giai đoạn Thiết kế chi tiết và Phát triển (Phase 3).
