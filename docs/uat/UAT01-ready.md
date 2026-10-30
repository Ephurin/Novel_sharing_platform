# UAT01 — Bàn giao môi trường ngày 26/10/2026

- URL: http://localhost:8080
- Code chạy: `749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb` (main). Kịch bản promt.md ghi `48d1bfb0`; hãy ghi SHA thực chạy ở trên vào báo cáo bug.
- Docker Compose project: `ephurin-uat01`, database và media dùng volume riêng.
- Năm dịch vụ đã chạy: web, backend, ai-service, PostgreSQL và MongoDB. Web và API health trả HTTP 200; database và ai-service healthy.

## Tài khoản demo

| Tester | Email | Mật khẩu |
|---|---|---|
| A — AUTHOR | reader03@example.com | StrongPassword123! |
| B — READER | reader04@example.com | StrongPassword123! |
| Admin phụ | reader02@example.com | StrongPassword123! |

Dùng hai browser profile riêng. Cả ba tài khoản đã kiểm tra đăng nhập và đúng role.

## Dữ liệu

- Ashenhold - Sample Story: đúng 10 chương công khai, chương 10 VIP giá 50 xu. Không sửa truyện mẫu khi kiểm thử nháp.
- Thanh Van Sword Path - Sample Story: seed 3 chương dự phòng.
- Truyện riêng: **UAT01 - TesterA - 2026-10-26**, trạng thái DRAFT, thuộc AUTHOR reader03.
- Novel ID: `a66b8297-9c4b-42a5-a689-b2038b832ae8`.
- Chương 1: `849dc2ec-a60b-4966-9c7a-49140678a35b`, 257 từ, Minh trao chìa khóa đồng cho Lan tại cảng Cồn Vân.
- Chương 2: `45a55b3b-fdb9-4239-9f79-27533a98f769`, bản nháp để kiểm thử chuyển chương.
- Link IDE sau đăng nhập: http://localhost:8080/author/ide?novelId=a66b8297-9c4b-42a5-a689-b2038b832ae8&chapterId=849dc2ec-a60b-4966-9c7a-49140678a35b

## Kiểm tra trước bàn giao

- Reader đọc chương miễn phí, mở API Library và History: HTTP 200.
- Reader đọc chương VIP chưa mua: HTTP 402.
- Reader mở API chỉnh sửa chương nháp của AUTHOR: HTTP 403.
- Reader mở chương nháp qua API đọc: HTTP 404.
- AUTHOR đọc lại chương UAT thành công; dấu tiếng Việt đúng.
- API Story Brain và review queue của truyện UAT: HTTP 200. Chưa tạo đề xuất hoặc duyệt Canon; A06 cần thực hiện extraction theo giao diện, A07 cần Canon đã duyệt trước.

Đây là kiểm tra môi trường qua API, không phải kết quả PASS của các bài UAT giao diện.

## AI live

- Đã bật Gemini, model thực cấu hình `gemini-3.5-flash-lite`, AI service khởi tạo client thành công.
- Đã dùng khóa trong `.env.demo`; không chép khóa vào báo cáo.
- Người dùng cho phép tối đa **1 yêu cầu Copilot + 1 yêu cầu AI Writing** cho A08. Chuẩn bị môi trường chưa dùng lượt sinh nào. Giới hạn này được tuân thủ thủ công, chưa phải hạn mức kỹ thuật của hệ thống.
- Chưa gọi sinh nội dung để xác minh chất lượng, quota hay tính hợp lệ của khóa với provider. Ghi lỗi thực tế nếu A08 không thành công; không tự retry nhiều lần hoặc đổi sang Gemini 3.8.

## Vận hành

Chạy tại thư mục gốc dự án:

```powershell
docker compose -p ephurin-uat01 --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml ps
docker compose -p ephurin-uat01 --env-file .env.demo -f docker-compose.yml -f docker-compose.flash-lite-demo.yml logs --tail 100 backend ai-service
```

Dừng/tiếp tục mà giữ nguyên dữ liệu và container:

```powershell
docker compose -p ephurin-uat01 stop
docker compose -p ephurin-uat01 start
```

Không chạy `down -v`, prune volume, hoặc chạy lại seed trong lúc hai tester đang làm việc.

Thông tin máy đọc được: `UAT01-environment.json`. Kết quả preflight: `UAT01-preflight.json`.
