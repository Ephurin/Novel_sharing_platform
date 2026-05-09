# Báo cáo Phân tích Cấu trúc Tài liệu SRS (Software Requirements Specification)

Tài liệu này phân tích và so sánh hai mẫu SRS (Mẫu 1 và Mẫu 2) để trích xuất các thành phần tối ưu cho dự án **AI Story Intelligence System**.

## 1. So sánh Cấu trúc

| Thành phần | Mẫu 1 (Phong cách Chính quy/Chính phủ) | Mẫu 2 (Phong cách Kỹ thuật/Doanh nghiệp - FA Style) |
| :--- | :--- | :--- |
| **Trọng tâm** | Nghiệp vụ, quy trình quản lý và tính pháp lý. | Use Case, luồng hoạt động (Activities Flow) và Mockups. |
| **Giới thiệu** | Chi tiết về thuật ngữ, tài liệu liên quan, đối tượng sử dụng. | Tập trung vào mục đích hệ thống và các từ viết tắt kỹ thuật. |
| **Yêu cầu Tổng quát** | Phân rã chức năng (Functional Decomposition). | Biểu đồ ERD, Workflow, Use Case Diagram và Ma trận phân quyền. |
| **Đặc tả Chức năng** | Mô tả theo từng Module lớn, liệt kê danh sách chức năng. | Đặc tả chi tiết từng Use Case (Main Flow, Alternative Flow, Exception Flow). |
| **Yêu cầu Phi chức năng** | Rất chi tiết: Bảo mật, Hiệu năng, Sao lưu, Công nghệ ràng buộc. | Thường lồng ghép vào Business Rules hoặc mục tiêu hệ thống. |
| **Giao diện** | Mô tả bằng văn bản là chính. | Hình ảnh Mockups chi tiết cho từng màn hình quan trọng. |

## 2. Ưu điểm trích xuất được

- **Từ Mẫu 1**: Cách tổ chức mục lục rõ ràng cho các hệ thống phức tạp, phần yêu cầu phi chức năng cực kỳ chuyên nghiệp (phù hợp để ghi điểm trong tiểu luận SRA).
- **Từ Mẫu 2**: Cách tiếp cận bằng Use Case và ERD giúp nhóm phát triển hiểu rõ logic hệ thống và luồng dữ liệu, phần Mockups giúp minh họa ý tưởng trực quan.

## 3. Đề xuất cho Tiểu luận Cuối kỳ môn SRA

Dự án **AI Story Intelligence System** là một hệ thống mang tính kỹ thuật cao (AI, Knowledge Graph, RAG). Vì vậy, cấu trúc SRS cần kết hợp:
1. **Phần Giới thiệu & Nghiệp vụ** của Mẫu 1 để định hình bài toán "Story Intelligence".
2. **Phần Biểu đồ & Use Case** của Mẫu 2 để làm rõ cách AI tương tác với dữ liệu truyện.
3. **Phần Yêu cầu Phi chức năng** của Mẫu 1 để đảm bảo tính hàn lâm cho tiểu luận.

---
*Tài liệu được phân tích tự động dựa trên mẫu SRS thực tế.*
