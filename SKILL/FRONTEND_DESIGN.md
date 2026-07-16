# React Frontend Design Standard

Tài liệu này định nghĩa các quy chuẩn phát triển Web Frontend cho hệ thống **Ephurin Novel Platform** sử dụng **React + Mantine**. Web app phục vụ Author AI Writing IDE và Admin Dashboard; Mobile app phục vụ Reader.

---

## 1. Stack công nghệ Frontend

- **Core:** React 19 + Vite 6 + TypeScript.
- **UI Library:** Mantine UI v7 (https://mantine.dev/) - tận dụng hệ thống Grid, Layout, Modal, Notifications, và Rich-text editor.
- **Server State:** TanStack Query v5 (quản lý lấy dữ liệu API, caching, và đồng bộ dữ liệu với server).
- **Client/UI State:** Zustand (lưu trữ trạng thái đăng nhập, trạng thái sidebar, theme preference).
- **Routing:** React Router v7.
- **Forms:** Mantine Form (hoặc React Hook Form + Zod) phục vụ việc validate dữ liệu.
- **Rich-text Editor:** `@mantine/tiptap` (hoặc TipTap editor) làm trình soạn thảo nội dung chương truyện của Tác giả.

---

## 2. Cấu trúc Thư mục Frontend

```
web/
  src/
    app/                  # Cấu hình Router, App Layout, Providers
      router.tsx
      providers.tsx
      layout/             # App shell, activity bar, dynamic sidebar, status bar
    theme/                # Mantine theme customization (colors, fonts...)
      index.ts
    shared/               # Tiện ích và component dùng chung toàn App
      api/                # HTTP API Client (Axios wrapper cấu hình JWT)
      components/         # AppButton, AppTextInput, DataTable, ConfirmDialog...
      hooks/
      stores/             # Global Zustand stores (authStore...)
      utils/
    features/             # Các module tính năng chính
      auth/               # Đăng ký, đăng nhập, quên mật khẩu
      author-ide/         # AI Writing IDE: activity bar, story tree, editor, AI panel
      novels/             # Quản lý truyện, arc, chương, metadata
      chapters/           # Soạn thảo chương truyện, autosave, publish
      story-context/      # Character, entity, timeline, plot summary, graph
      ai-copilot/         # Suggestions, consistency warnings, context proposals
      content-control/    # Moderation queue, reports, rule/filter evidence
      admin/              # User management, taxonomy, dashboard, withdraw review
      settings/           # Cấu hình tài khoản, thông tin cá nhân/tác giả
```

---

## 3. Quy chuẩn viết Component

- **Tái sử dụng Shared Components:** Luôn kiểm tra thư mục `src/shared/components/` trước khi trực tiếp dùng các component gốc của Mantine để đảm bảo giao diện nhất quán (Button, Input, Table...).
- **Cấu hình Theme:** Không viết cứng mã màu Hex (ví dụ: `#FF0000`) vào CSS hoặc style. Luôn sử dụng hệ thống Mantine Theme Tokens (`theme.colors.blue[6]`, `theme.spacing.md`, v.v.).
- **Tách biệt logic và giao diện:** Page component chỉ đóng vai trò điều phối luồng dữ liệu (orchestrator). Logic xử lý form phức tạp hoặc gọi API nên được tách ra các custom hooks riêng (ví dụ: `useNovelMutations`).
- **Create/Edit Dialogs:** Các form tạo mới và chỉnh sửa phải dùng chung một Component và phân biệt tiêu đề/nút qua biến `mode: 'create' | 'edit'`.
- **Auto-save trong soạn thảo:** Component trình soạn thảo chương truyện (`TipTapEditor`) phải tích hợp cơ chế tự động lưu nháp (Auto-save) sau mỗi 30 giây vào cơ sở dữ liệu MongoDB thông qua API Backend.
- **Author IDE layout:** Màn hình viết chính dùng cấu trúc Top Toolbar + Left Activity Bar + Dynamic Sidebar + Center Rich Text Editor + Right AI Assistant + Bottom Status Bar.
- **AI suggestions:** Không tự chèn/sửa nội dung nếu Author chưa xác nhận. Context proposals phải có thao tác Approve/Reject rõ ràng.
- **Consistency warnings:** Hiển thị cảnh báo mâu thuẫn như non-blocking warning; không khóa editor và không chặn publish.

---

## 4. Quản lý Trạng thái (State Management)

- **Server State (TanStack Query):** Toàn bộ dữ liệu lấy từ API Backend (danh sách truyện, nội dung chương, thống kê...) phải được quản lý bởi TanStack Query.
  - **Cấm:** Không copy dữ liệu từ Query Cache vào Zustand Store để tránh bất đồng bộ dữ liệu.
  - **Cache Invalidation:** Khi thực hiện các thay đổi (Mutation) như tạo truyện, sửa chương, phải gọi hàm `queryClient.invalidateQueries` để làm tươi dữ liệu trên UI.
- **Client State (Zustand):** Chỉ lưu trữ các trạng thái mang tính UI toàn cục như: User Session hiện tại, cài đặt giao diện (Dark/Light mode), thu gọn/mở rộng Sidebar.

---

## 5. Sử dụng API Client

- Mọi lời gọi API phải đi qua instance Axios cấu hình sẵn trong `src/shared/api/api-client.ts`.
- Axios Client chịu trách nhiệm tự động đính kèm `Authorization: Bearer <token>` vào request header và bắt lỗi `401 Unauthorized` để thực hiện làm mới token (Refresh Token) tự động.
- Không sử dụng `fetch` hoặc `axios` trực tiếp trong component.
- Trích xuất định nghĩa kiểu dữ liệu (TypeScript Types) của request/response từ API Backend để đảm bảo an toàn kiểu dữ liệu ở Frontend.
- Các màn hình Author IDE phải đối chiếu `docs/Frontend/wireframes.md`, `docs/Frontend/screen-specs.md` và `docs/API/ai-copilot-api.md`.
