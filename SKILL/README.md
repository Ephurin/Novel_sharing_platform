# Ephurin Novel Platform

Dự án này là mã nguồn và cơ sở tri thức sản phẩm của **Ephurin Novel Platform** - bao gồm phân hệ **Sáng tác và Đăng truyện trực tuyến** (dành cho Tác giả/Quản trị viên) và ứng dụng đọc truyện (dành cho Độc giả).

## Cấu trúc Thư mục Dự án

Mã nguồn ứng dụng nằm tại thư mục root:
- `backend/`: Mã nguồn Backend Node.js (TypeScript).
- `web/`: Giao diện Web dành cho Tác giả & Quản trị viên (React + Mantine).
- `mobile/`: Ứng dụng di động dành cho Độc giả (React Native).
- `docs/`: Chứa các tài liệu phân tích yêu cầu (SRS, Use cases, Workflows) và đặc tả module của dự án.
- `SKILL/`: Chứa các tài liệu tiêu chuẩn kỹ thuật và quy tắc code dành cho các AI Agent.

---

## Danh sách Tài liệu Chính

| File | Mục đích |
|---|---|
| `SKILL/ARCHITECTURE.md` | Kiến trúc kỹ thuật hệ thống và stack công nghệ chi tiết |
| `SKILL/SYSTEM_DESIGN.md` | Thiết kế hệ thống cấp cao (Actors, Use Cases, Luồng nghiệp vụ) |
| `SKILL/BACKEND_DESIGN.md` | Tiêu chuẩn thiết kế Backend Node.js |
| `SKILL/FRONTEND_DESIGN.md` | Tiêu chuẩn thiết kế Frontend React & Mantine |
| `SKILL/AI_CODING_STANDARDS.md` | Các quy định bắt buộc đối với AI khi sinh mã nguồn |
| `SKILL/RULES.md` | Các quy tắc giao diện và ánh xạ Mantine Components |
| `SKILL/CONTRIBUTING.md` | Quy trình đóng góp code và kiểm tra lỗi |
| `SKILL/CLAUDE.md`, `SKILL/GEMINI.md` | Ngữ cảnh rút gọn cho các Trợ lý AI |
| `docs/Implementation/roadmap.md` | Thứ tự triển khai từ tài liệu sang code |

Tài liệu nghiệp vụ chi tiết nằm ở thư mục [docs/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/):
- [docs/SRS/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/SRS/): SRS đã được phân mảnh và cập nhật theo từng service/module.
- [docs/API/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/API/): API contract hiện hành.
- [docs/Backend/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/Backend/): Backend architecture hiện hành.
- [docs/Database/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/Database/): Database design hiện hành.
- [docs/Frontend/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/Frontend/): Frontend mockup, sitemap, screen specs.
- [docs/Implementation/](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/Implementation/): Roadmap và checklist bắt đầu code.
- [Final_SRS_v1.md](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/Final_SRS_v1.md): Tài liệu baseline tham khảo, không phải nguồn cập nhật mới nhất.
- [SRA_novel_platform_plan (1).md](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/SRA_novel_platform_plan%20(1).md): Kế hoạch phân tích yêu cầu môn học SRA.
- [techstack.md](file:///c:/Users/Laptop/OneDrive/Documents/Novel_sharing_platform/docs/techstack.md): Lựa chọn công nghệ của dự án.

---

## Tech Stack Lựa chọn

### 1. Backend (Node.js)
- **Runtime:** Node.js (v20+), viết bằng TypeScript.
- **Framework:** Express.js + TypeScript cho MVP.
- **Database Client / ORM:**
  - PostgreSQL (Prisma ORM) cho dữ liệu quan hệ cần tính nhất quán cao (User, Wallet, Coin, Transaction, Novel, Chapter...).
  - MongoDB (Mongoose ORM) cho dữ liệu phi cấu trúc hoặc lưu nhật ký nháp (Draft chapter versions, Activity logs).
- **Caching & Sessions:** Redis cho việc tối ưu hiệu năng (Bảng xếp hạng, lưu Session/Token blacklist).
- **Security:** Mã hóa mật khẩu bằng Argon2id hoặc bcrypt; phân quyền theo vai trò (RBAC) trên tất cả các endpoint.

### 2. Web Frontend (React - Author & Admin)
- **Framework:** React 19 + Vite 6.
- **Language:** TypeScript.
- **UI Library:** Mantine UI v7 (https://mantine.dev/) - được tùy biến CSS theo theme thống nhất.
- **Server State:** TanStack Query v5.
- **Client/UI State:** Zustand (quản lý trạng thái client gọn nhẹ).
- **Routing:** React Router v7.
- **Forms:** Mantine Form hoặc React Hook Form kết hợp với Zod để xác thực.
- **Soạn thảo:** TipTap Editor làm trình soạn thảo nội dung chương truyện.

### 3. Mobile Frontend (React Native - Reader)
- **Framework:** React Native (Expo hoặc CLI) cho ứng dụng di động iOS/Android.
- **Language:** TypeScript.
- **UI Library:** React Native Paper hoặc Tailwind CSS (NativeWind).
- **State Management:** TanStack Query (server state), Zustand (client/UI state).
- **Local Storage:** AsyncStorage (lưu token JWT, cấu hình đọc).
- **Notifications:** Firebase Cloud Messaging (FCM) cho thông báo chương mới.

### 4. AI/Copilot và Content Control
- AI/Copilot sử dụng hướng **LLM-only** cho gợi ý metadata, phân tích văn phong, Writing Copilot, context proposal và plot consistency checking.
- AI/LLM **không** thực hiện kiểm soát/kiểm duyệt nội dung.
- Kiểm soát nội dung thuộc `Content Control & Moderation Service`: keyword/rule filtering, user reports, moderation queue, Admin decision.
- MVP có thể triển khai AI bằng adapter/provider phía backend hoặc tích hợp service ngoài sau; code phải giữ abstraction qua `ai-provider.client`.

---

## Nguyên tắc Triển khai cốt lõi

1. Luôn ưu tiên phát triển các tính năng cốt lõi trước (Đăng ký/Đăng nhập, Sáng tác truyện, Thêm chương, quản lý nhân vật/timeline/summary, Content Control, ví mock).
2. Code Frontend phải sử dụng các components tái sử dụng từ `@/shared/components` dựa trên Mantine UI (đối với Web).
3. Ưu tiên ORM/ODM cho truy vấn PostgreSQL/MongoDB. Raw SQL chỉ dùng khi cần transaction lock/analytics phức tạp và phải được isolate trong repository.
4. Viết unit test cho các service xử lý nghiệp vụ quan trọng (đặc biệt là giao dịch Coin và duyệt nội dung).
