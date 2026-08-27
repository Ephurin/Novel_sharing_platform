# Claude Context

Tài liệu hướng dẫn nhanh cho Claude khi làm việc với dự án Ephurin Novel Platform.

## Lệnh Phát triển & Kiểm thử hữu ích (NPM/Yarn)

- Khởi động môi trường phát triển (Monorepo hoặc các thư mục riêng):
  - Backend: `npm --prefix backend run dev`
  - Frontend Web: `npm --prefix web run dev`
- Cài đặt thư viện: `npm install` hoặc `npm install --prefix <folder>`
- Kiểm tra lỗi cú pháp (Lint): `npm run lint`
- Định dạng code (Format): `npm run format`
- Chạy Unit Tests: `npm run test`

## Quy tắc Giao tiếp & Triển khai nhanh

- Đọc kỹ `SKILL/AGENTS.md` để nắm rõ các Defaults và Core Rules.
- Ưu tiên tài liệu hiện hành trong `docs/SRS`, `docs/API`, `docs/Backend`, `docs/Database`, `docs/Frontend`; `docs/Final_SRS_v1.md` chỉ là baseline tham khảo.
- Luôn kiểm tra các Mantine shared components trong `web/src/shared/components/` trước khi tự viết mới hoặc dùng component gốc của Mantine.
- Với Author editor, bám theo hướng **AI Writing IDE** trong `docs/Frontend/wireframes.md`.
- Không dùng AI/LLM cho Content Control; moderation/report đi qua module `content-control`.
- Viết code TypeScript nghiêm ngặt, không dùng `any`.
- Các API endpoints ở Backend bắt buộc phải qua middleware xác thực và phân quyền (RBAC).
