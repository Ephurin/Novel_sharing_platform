# Tiêu chuẩn và Quy chuẩn Viết Code dành cho AI (AI Coding Standards)

Tài liệu này định nghĩa các quy tắc và tiêu chuẩn bắt buộc áp dụng đối với các trợ lý AI (và nhà phát triển) khi sinh mã nguồn hoặc chỉnh sửa cấu trúc của dự án **Ephurin Novel Platform**.

---

## 1. Nguyên tắc Chung (General Principles)

| Quy tắc | Yêu cầu |
|---|---|
| **Đọc context trước** | Phải đọc kỹ `SKILL/README.md`, `SKILL/ARCHITECTURE.md`, `docs/SRS`, `docs/API`, `docs/Backend`, `docs/Database`, `docs/Frontend` trước khi sửa đổi lớn. |
| **Tuân thủ Pattern có sẵn** | Không tự ý phát minh ra các kiến trúc mới khi đã có sẵn khuôn mẫu phân lớp trong thư mục dự án. |
| **Xử lý lỗi tuyệt đối** | Không được bỏ qua lỗi. Bắt buộc phải try-catch hoặc trả về lỗi cụ thể cho luồng xử lý tiếp theo. |
| **Không hardcode thông tin nhạy cảm** | Mật khẩu, API Keys, Tokens, Database Connection URLs phải được lấy từ biến môi trường (`.env`) thông qua cấu hình tập trung. |
| **Tái sử dụng mã nguồn** | Kiểm tra các shared components, hooks, và API clients trước khi viết code mới. |
| **Định dạng file thống nhất** | Các file code phải được lưu dưới dạng `UTF-8 không BOM` với ký tự xuống dòng `LF` theo quy định của `.gitattributes`. |
| **Tự kiểm tra (Self-review)** | Rà soát kỹ các khía cạnh bảo mật, phân quyền, rò rỉ dữ liệu trước khi hoàn thành task. |

---

## 2. Các Điều Cấm (Forbidden Actions)

- **Cấm** ghép chuỗi (concatenation) đầu vào của người dùng để build câu lệnh SQL. Phải dùng Prisma parameterization để chống SQL Injection.
- **Cấm** lưu mật khẩu dạng văn bản thô (plaintext). Bắt buộc phải băm bằng Argon2id hoặc bcrypt.
- **Cấm** trả về stack trace lỗi hệ thống hoặc các câu lỗi DB chi tiết (raw DB errors) cho client để tránh rò rỉ cấu trúc hệ thống.
- **Cấm** bỏ qua bước kiểm tra phân quyền RBAC ở phía Backend. Giao diện ẩn/hiện nút ở Frontend chỉ mang tính chất trải nghiệm người dùng, bảo mật thật sự phải ở Backend.
- **Cấm** sử dụng kiểu dữ liệu `any` trong TypeScript trừ khi có lý do cực kỳ đặc biệt và được comment giải trình cụ thể.
- **Cấm** nhúng trực tiếp API call bằng `fetch` hoặc `axios` phân tán trong các React component khi đã có API client dùng chung.

---

## 3. Tiêu chuẩn Backend (Node.js & TypeScript)

- **Pattern bắt buộc:** `Route -> Middleware -> Controller -> Service -> Repository -> Database`.
- **Controller:** Chỉ phân giải tham số request, gọi Service và trả về response. Không chứa logic nghiệp vụ.
- **Service:** Chứa toàn bộ logic nghiệp vụ. Chỉ gọi qua Repository để tương tác DB. Service chịu trách nhiệm điều khiển Transactions (giao dịch ví tiền, trừ coin, mua chương).
- **Repository:** Chứa logic truy vấn Database cụ thể qua Prisma hoặc Mongoose.
- **Async Safety:** Toàn bộ các hàm bất đồng bộ phải được bọc trong các middleware xử lý lỗi (ví dụ: `express-async-handler`) hoặc try-catch chặt chẽ để tránh làm crash ứng dụng Node.js (Unhandled Promise Rejections).

---

## 4. Tiêu chuẩn Frontend (React & TypeScript)

- **UI Library:** Sử dụng **Mantine UI v7**. Phải dùng các component bọc dùng chung (shared components) trong `src/shared/components/`.
- **Mantine Theme:** Sử dụng theme tokens để lấy mã màu và style spacing. Không hardcode màu.
- **Server State:** Sử dụng **TanStack Query v5**. Khi thực hiện các hành động ghi (Mutation), bắt buộc phải invalidate các query liên quan để cập nhật lại UI.
- **Client State:** Sử dụng **Zustand** cho các trạng thái toàn cục gọn nhẹ (Session đăng nhập, theme...).
- **Form validation:** Sử dụng `@mantine/form` kết hợp với `zod` resolver để kiểm tra dữ liệu nhập vào của người dùng.

---

## 5. Tiêu chuẩn Bảo mật (Security Baseline)

- **Mã hóa mật khẩu:** Sử dụng Argon2id hoặc bcrypt.
- **Cơ chế Authenticate:** Sử dụng JWT. Access Token được lưu ở Memory hoặc HTTP header. Refresh Token bắt buộc phải lưu trong Cookie `HttpOnly`, `Secure`, và `SameSite=Strict`.
- **Phân quyền tác giả (Ownership validation):** Với các API chỉnh sửa truyện, thêm chương, quản lý nhân vật, Backend bắt buộc phải đối chiếu:
  ```typescript
  if (novel.author_id !== current_user.id && current_user.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện hành động này.');
  }
  ```
- **Content Control:** Không dùng LLM/AI để kiểm soát nội dung. Luồng kiểm soát nội dung phải đi qua `content-control`: keyword/rule filtering, user reports, moderation review, Admin decision.
- **AI/Copilot Boundary:** AI chỉ dùng cho metadata suggestion, style analysis, Writing Copilot, context proposal và plot consistency checking. Kết quả consistency chỉ là non-blocking warning, không chặn publish.
- **Không log PII:** Tránh log thông tin nhạy cảm của người dùng (Mật khẩu, Token, số dư ví...) vào Winston/Pino logs.

---

## 6. Danh sách kiểm tra trước khi Bàn giao (Pre-delivery Checklist)

- [ ] Đọc và hiểu kỹ tài liệu hiện hành trong `docs/SRS`, `docs/API`, `docs/Backend`, `docs/Database`, `docs/Frontend`; `docs/Final_SRS_v1.md` chỉ là baseline tham khảo.
- [ ] Code tuân thủ đúng cấu trúc phân lớp (`Route -> Controller -> Service -> Repository`).
- [ ] Đã kiểm tra phân quyền RBAC và phân quyền tác giả (Ownership) trên API.
- [ ] Dữ liệu đầu vào của API được validate chặt chẽ bằng Zod (hoặc tương đương).
- [ ] Không sử dụng kiểu dữ liệu `any` trong code TypeScript.
- [ ] Viết unit tests cho các hàm nghiệp vụ chính (đặc biệt là logic nạp/trừ Coin mở khóa chương).
- [ ] Định dạng file lưu dưới dạng `UTF-8 không BOM` với dấu xuống dòng `LF`.
