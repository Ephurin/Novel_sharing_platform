# Quy trình Đóng góp và Kiểm tra Code (Contributing Workflow)

Tài liệu này hướng dẫn các bước cần làm trước, trong, và sau khi đóng góp code cho dự án **Ephurin Novel Platform**.

---

## 1. Trước khi viết code (Before Coding)

- Đọc kỹ các tài liệu tiêu chuẩn kỹ thuật trong thư mục `SKILL/` (`README.md`, `ARCHITECTURE.md`, `BACKEND_DESIGN.md`, `FRONTEND_DESIGN.md`, `RULES.md`, và `AI_CODING_STANDARDS.md`).
- Đối chiếu với tài liệu hiện hành trong `docs/SRS`, `docs/API`, `docs/Backend`, `docs/Database`, `docs/Frontend` để hiểu rõ use case, API contract, kiến trúc và mockup. `docs/Final_SRS_v1.md` chỉ là baseline tham khảo.
- Xác định module nghiệp vụ chịu trách nhiệm (ví dụ: `novel`, `chapter`, `payment`).
- Kiểm tra các shared components và utilities hiện có, tránh viết trùng lặp code.
- **Cấm:** Không copy mã nguồn, địa chỉ email, tên dự án cũ, hoặc dữ liệu mẫu từ các dự án khác vào repository này.

---

## 2. Quy chuẩn Công việc Backend (Node.js)

- Tuân thủ nghiêm ngặt mô hình phân lớp: `Route -> Controller -> Service -> Repository -> Database`.
- Toàn bộ logic nghiệp vụ (business rules) và kiểm tra điều kiện nghiệp vụ phải nằm ở lớp **Service**.
- Các truy vấn database bắt buộc phải đi qua **Prisma Client** (PostgreSQL) hoặc **Mongoose Models** (MongoDB). Không viết raw SQL.
- Các migration dữ liệu PostgreSQL phải được viết qua công cụ Migration của Prisma (`npx prisma migrate dev`).
- Mọi endpoint API mới phải viết kèm kiểm thử tự động (Unit Test hoặc Integration Test) bao gồm cả luồng thành công và luồng xử lý lỗi (ví dụ: test phân quyền, test thiếu coin...).

---

## 3. Quy chuẩn Công việc Frontend (React)

- Sử dụng hệ thống Mantine UI v7, các shared components bọc ngoài, và theme tokens (không hardcode màu sắc).
- Gọi API Backend thông qua API Client dùng chung (`src/shared/api/api-client.ts`), không tự ý import axios/fetch trực tiếp trong component.
- Quản lý form bằng `@mantine/form` kết hợp Zod để validate dữ liệu đầu vào.
- Khi viết test cho UI, hãy giả lập hành vi người dùng thực tế và assert payload gửi lên API là chính xác.

---

## 4. Định dạng File trong Repository

- Toàn bộ file mã nguồn và text phải được lưu ở định dạng **`UTF-8 không có BOM`** và sử dụng ký tự xuống dòng **`LF`** (theo cấu hình bắt buộc trong `.gitattributes`).
- Tránh việc lưu file với ký tự xuống dòng `CRLF` (phổ biến trên Windows) để tránh xung đột git diff giữa các hệ điều hành và các công cụ sinh code AI.
- Trước khi commit, hãy chạy kiểm tra `git diff --check` để phát hiện và chuẩn hóa các dòng bị sai định dạng xuống dòng.

---

## 5. Các bước kiểm tra trước khi Merge (Before Merge)

- Chạy các lệnh kiểm tra và tự động định dạng code:
  - Khử lỗi cú pháp (Lint): `npm run lint`
  - Tự động format code: `npm run format`
- Chạy toàn bộ các unit test và integration test liên quan: `npm test`.
- Rà soát lại code để đảm bảo không vô tình commit các thông tin bảo mật (Secret keys, database passwords, API tokens thực...).
- Đảm bảo các thông tin nhãn, text trên giao diện không chứa dấu vết của dự án mẫu cũ (uLearn LMS).
- Cập nhật tài liệu thiết kế nghiệp vụ hoặc tài liệu kỹ thuật liên quan nếu code mới làm thay đổi luồng hoạt động chính của hệ thống.
