# AGENTS.md

Sử dụng repository này làm mã nguồn của hệ thống Sáng tác và Đăng truyện trực tuyến (Ephurin Novel Platform) và làm cơ sở tri thức sản phẩm (knowledge base).

Thư mục gốc của dự án là repository Git hiện tại: `Novel_sharing_platform`. Không tạo hoặc tiếp tục triển khai công việc trong bất kỳ thư mục dự án song song nào khác.

Trước khi viết code, hãy đọc các tài liệu sau để nắm ngữ cảnh:

1. `SKILL/README.md`
2. `SKILL/ARCHITECTURE.md`
3. `SKILL/BACKEND_DESIGN.md`
4. `SKILL/FRONTEND_DESIGN.md`
5. `SKILL/AI_CODING_STANDARDS.md`
6. `SKILL/RULES.md`
7. `docs/Final_SRS_v1.md`
8. `docs/SRA_novel_platform_plan (1).md`
9. `docs/techstack.md`
10. Khi làm theo module cụ thể, ưu tiên tài liệu hiện hành trong `docs/SRS`, `docs/API`, `docs/Backend`, `docs/Database`, `docs/Frontend`.

## Quy tắc Cốt lõi (Core Rules)

- **Backend Pattern:** Tuân thủ mô hình `Route -> Controller -> Service -> Repository -> DB` cho Node.js backend.
- **Database Access:** Sử dụng Prisma để truy xuất PostgreSQL và Mongoose (hoặc MongoDB native driver) để truy xuất MongoDB.
- **Frontend Components:** Ưu tiên sử dụng Mantine UI v7 và shared components. Author editor đi theo hướng **AI Writing IDE** trong `docs/Frontend/wireframes.md`.
- **Forms:** Sử dụng Mantine Form hoặc React Hook Form + Zod để xác thực dữ liệu phía client.
- **State Management:** Sử dụng TanStack Query cho server state và Zustand cho client/UI state.
- **API Client:** Gọi API thông qua các service client được chia sẻ hoặc tạo sẵn trong `@/shared/api`, không gọi trực tiếp `fetch` hay `axios` phân tán trong các component.
- **AI/Copilot Boundary:** AI dùng LLM-only cho metadata, style analysis, Writing Copilot, context proposals và plot consistency checking. Không dùng AI/LLM cho Content Control.
- **Content Control:** Kiểm soát nội dung nằm trong module riêng: keyword/rule filtering, user reports, moderation queue, Admin decision.
- **Security:** Mật khẩu phải được mã hóa bằng Argon2id hoặc bcrypt. Kiểm tra phân quyền RBAC và tổ chức/tác giả trên mọi endpoint nhạy cảm ở backend.

## Frontend Defaults

- Server state: TanStack Query.
- Client/UI state: Zustand.
- Forms: Mantine Form hoặc React Hook Form + Zod.
- UI library: Mantine UI v7.
- Author workspace: Top Toolbar + Activity Bar + Dynamic Sidebar + Rich Text Editor + AI Assistant + Status Bar.
- Dialogs/Modals: Dùng chung một component và phân biệt chức năng Create/Edit qua thuộc tính `mode: 'create' | 'edit'`.

## Backend Defaults

- Language: TypeScript / JavaScript (Node.js).
- Web framework: Express.js (hoặc NestJS/Fastify).
- Database: PostgreSQL (quan hệ, Coins, transactions) và MongoDB (nội dung chương, nháp, logs).
- Password hashing: Argon2id hoặc bcrypt.
- Session/Auth: JWT (AccessToken ngắn hạn và RefreshToken lưu trong HTTP-only cookie).

## Nguyên tắc Triển khai (Implementation Rules)

- Mã nguồn của ứng dụng sẽ nằm trong thư mục root: `backend/` (Node.js), `web/` (React/Vite cho Author/Admin), và `mobile/` (React Native cho Reader).
- Tài liệu phân tích và nghiệp vụ nằm trong thư mục `docs/`.
- Thực hiện công việc tuần tự theo kế hoạch phát triển. Hãy viết kiểm thử (unit/integration test) cho các API và logic nghiệp vụ quan trọng.
- Nếu có `WORKLOG.md` thì cập nhật tiến độ; nếu repository chưa có file này, không tự tạo trừ khi được yêu cầu.
