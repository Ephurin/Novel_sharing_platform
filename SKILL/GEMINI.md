# Gemini Context

Hãy đọc kỹ các tài liệu này trước khi tạo code hoặc đưa ra các giải pháp cho dự án Ephurin Novel Platform:

1. `SKILL/README.md`
2. `SKILL/ARCHITECTURE.md`
3. `SKILL/BACKEND_DESIGN.md`
4. `SKILL/FRONTEND_DESIGN.md`
5. `SKILL/AI_CODING_STANDARDS.md`
6. `SKILL/RULES.md`
7. `docs/SRS/`
8. `docs/API/`
9. `docs/Backend/`
10. `docs/Database/`
11. `docs/Frontend/`

Không tự ý suy diễn cấu trúc cây thư mục nếu nó chưa tồn tại. Hiện tại dự án đang ở giai đoạn thiết lập cấu trúc mã nguồn.
Khi viết code, luôn tuân thủ các quy tắc bảo mật Node.js, sử dụng Prisma/Mongoose cho database, và Mantine UI cho giao diện Web của Tác giả/Admin.
AI/Copilot dùng hướng LLM-only cho metadata, style analysis, Writing Copilot, context proposals và plot consistency checking.
Không dùng AI/LLM cho Content Control; kiểm soát nội dung thuộc module riêng `content-control`.
`docs/Final_SRS_v1.md` chỉ là baseline tham khảo, không phải source hiện hành.
