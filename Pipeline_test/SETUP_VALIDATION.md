# Kiểm tra bộ task trước bàn giao

Ngày: 2026-10-17. Phạm vi: **offline artifact validation**, không phải kết quả E2E ứng dụng.

| Kiểm tra | Kết quả |
|---|---|
| Manifest: đầy đủ danh sách file input, SHA-256 khớp | PASS |
| Seed: 4 chương hoàn chỉnh, chương 5 dở, tổng 4.747 từ theo bộ đếm | PASS |
| Plan CSV: 40 chương theo thứ tự; seed states đúng | PASS |
| Plan JSON: 36 objectives cho chương 5–40; chỉ chương 40 là ending | PASS |
| Payoff ledger: PF01–PF12 | PASS |
| JSON templates parse; CSV headers không trùng | PASS |
| Bộ đếm: bỏ heading, bỏ token chỉ có dấu câu, chuẩn hóa Unicode | PASS |
| Init run trong thư mục kiểm tra riêng: sao template và bind run ID/hash | PASS |
| Init trùng ID không ghi đè; tên/path run không hợp lệ bị từ chối | PASS |
| Sửa bản sao seed làm verify thất bại | PASS |

Kiểm tra init/tamper dùng bản sao tạm trong `Pipeline_test` và đã dọn sau khi kiểm tra. Lần thử ban đầu với thư mục temp mặc định của sandbox gặp lỗi quyền; chuyển kiểm tra sang thư mục tạm trong workspace và chạy thành công. Không có run giả được giữ trong `runs/`.

Không gọi provider, không dùng credential, không nạp ứng dụng, không tạo truyện 100k trong bước chuẩn bị này. Không sửa mã sản phẩm. Chưa chứng minh chất lượng đầu ra hoặc khả năng hoạt động của pipeline.

Chạy lại kiểm tra fixture từ root:

```text
python Pipeline_test/tools/task_tool.py verify
python Pipeline_test/tools/task_tool.py count --directory Pipeline_test/input/manuscript
```

`in_target_range=false` đối với seed là đúng: đích 95–105k áp dụng bản truyện cuối sau live run, không áp dụng đầu vào.

## Bổ sung task revision 1.1 — narrative memory

- Đã thêm audit sau import/bootstrap, sau accepted revision đầu tiên, mỗi 10 chương, audit sâu tại bội số 20/50 và cuối run cho P1/P2/P3.
- JSON cấu hình/checkpoint và CSV templates mới parse thành công; header CSV không trùng.
- Đã kiểm tra init run trên bản sao tạm: đủ ba CSV memory và MEMORY_AUDIT.md, policy 10/20/50 đúng, checkpoint có trạng thái riêng P1/P2/P3. Thư mục kiểm tra đã dọn.
- Fixture integrity vẫn PASS, seed vẫn 4.747 từ; manifest hash không đổi: `7abef96ba77bef7a8bd520207b7abc43c94e339f2c5d4a7f86dce87da96fa255`.
- Chưa thực hiện live extraction/memory audit. Các ngưỡng recall/precision là tiêu chí task, không phải kết quả của sản phẩm.
