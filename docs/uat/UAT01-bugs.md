# UAT01 — Bug ghi nhận ngày 26/10/2026

Môi trường: http://localhost:8080, main@749b4bf30811f59845a9bdcd0a7cb6d8fa8961bb, Docker project ephurin-uat01.

## UAT01-A04-001 — Hai tab không có hiệu lực thay đổi, không báo lỗi

- Trạng thái: FAIL theo phản hồi tester; nguyên nhân chưa xác nhận.
- Ưu tiên: P1 tạm thời. Nâng P0 nếu xác nhận mất nội dung đã báo lưu thành công.
- Thực tế tester báo: “cả 2 thay đổi ở 2 tab đều vô hiệu, không có thông báo lỗi”.
- Tester xác nhận bổ sung: “nội dung không lưu và không có cảnh báo”. Đây là lỗi lưu nội dung kèm thiếu phản hồi lỗi, không chỉ là thiếu cảnh báo xung đột.
- Kỳ vọng: tab đầu lưu được; thao tác tab cũ không âm thầm ghi đè, thông báo xung đột và giữ nội dung chưa lưu.
- Chưa xác nhận giao diện đã hiển thị “Đã lưu” trước đó; chưa có đoạn sửa cụ thể, chương và thao tác reload để đối chiếu dữ liệu máy chủ. Giữ P1, nâng P0 nếu xác nhận mất nội dung đã báo lưu thành công.
- Đọc dữ liệu không thay đổi qua API: chương UAT 1 có draft version 13, wordCount 362, updatedAt 2026-10-26T02:59:40.135Z. Chưa đủ để xác định hai thay đổi A04 còn hay mất.
- Chưa tự tái hiện bằng thao tác ghi để tránh ảnh hưởng dữ liệu tester và phát sinh phân tích AI tự động.

## UAT01-A06-001 — Extraction trả AI_SERVICE_500

- Trạng thái: FAIL; mức P1.
- Thực tế tester: A06 báo AI_SERVICE_500.
- Log AI service xác nhận POST /v1/revisions/9570e05c-2263-455e-aa08-05984f3ac0b2/analyses trả 500; một revision khác cũng gặp cùng lỗi.
- Lỗi database: psycopg.errors.NumericValueOutOfRange, numeric field overflow khi INSERT narrative.proposals, confidence=Decimal('10.0'). Cột confidence khai báo Numeric(5,4), không chứa được 10.0.
- Kết luận: pipeline không kiểm tra/chuẩn hóa confidence trước khi lưu; đây là lỗi ứng dụng, không thể giải quyết chỉ bằng khởi động lại.
- Log còn ghi nhận output trích xuất không phải JSON hợp lệ (502), retry tự động và Gemini 429 RESOURCE_EXHAUSTED (giới hạn 15 request/phút). Đây là các triệu chứng phụ cần phân loại riêng khi sửa.
- Kết quả cuối lượt AUTHOR 1: tester xác nhận A07 BLOCKED do A06, chưa thể thực hiện. A08 PASS theo phản hồi “ổn”; khuyến nghị hoãn A08 trước đó đã được thay thế bằng kết quả tester thực tế.
- Chưa sửa code, database hoặc gọi thêm sinh nội dung trong lượt chẩn đoán.

## Chốt lượt review AUTHOR lần 1

Tester xác nhận kết thúc lượt review ngày 26/10/2026.

| Kịch bản | Trạng thái | Ghi nhận |
|---|---|---|
| A04 | PASS (tạm thời) | Theo yêu cầu tester sau lượt 1; giữ mô tả lỗi cũ để truy vết, chưa sửa hoặc xác minh kỹ thuật |
| A06 | FAIL | P1: AI_SERVICE_500, log xác nhận confidence gây numeric overflow |
| A07 | BLOCKED | Phụ thuộc A06, chưa thể thực hiện |
| A08 | PASS | Tester báo “ổn”; chưa có điểm chất lượng AI hoặc số lượt gọi thực tế |

A01, A02, A03, A05: chưa nhận kết quả xác nhận từ tester, không suy diễn PASS hoặc NOT RUN.

Tổng kết các kết quả đã báo: 1 PASS, 2 FAIL (P1), 1 BLOCKED. Kết thúc lượt review không đồng nghĩa đạt điều kiện nghiệm thu UAT; còn hai lỗi P1. Chưa sửa code hoặc reset môi trường trong lượt review.

## Cập nhật sau lượt 1 — xử lý A06

- Theo chỉ đạo mới của tester, A04 được coi PASS tạm thời; các ghi nhận FAIL phía trên là lịch sử lượt review, không phải kết luận hiện hành của A04.
- Sửa A06 tại RevisionAnalysisService: chuyển score thực thể 0..10 thành confidence 0..1 bằng chia 10 trước khi tạo proposal. Hợp đồng EntityPipeline giữ nguyên; event importance đã là 0..1 nên không chuyển đổi.
- Regression test tái hiện lỗi trước sửa: score 10 và 9.5 tạo confidence sai 10.0 và 9.5 (FAIL). Sau sửa: 1.0 và 0.95; event vẫn 0.7; Canon chưa tự thay đổi.
- Kiểm tra liên quan: 34 passed, 1 skipped (22 deselected). PostgreSQL integration riêng: 1 passed, kiểm tra lưu và đọc lại proposal với điểm 10. Database test riêng `uat01_a06_regression`, không dùng database UAT.
- Đã build/recreate riêng ai-service, không restart backend, không chạy seed, không reset dữ liệu UAT. Chưa gọi thêm Gemini khi kiểm thử bản sửa.
- A06: đã sửa nguyên nhân numeric overflow, chờ tester chạy lại để kết luận PASS. Lỗi output JSON và quota Gemini ghi nhận trước đó chưa được sửa trong thay đổi này.
- A07 tiếp tục BLOCKED cho đến khi tester extraction và duyệt Canon thành công.

## A06 — lỗi JSON tiếp theo và bản sửa lần 2

- Tester chạy lại: `Entity extraction error: model output is not valid JSON`; A06 vẫn FAIL, chưa đóng bug.
- Kiểm tra code: Gemini không bật response_mime_type JSON và dùng ngân sách mặc định 512 token cho extraction. Chưa có raw output/finish reason của lần lỗi để khẳng định JSON bị cắt hay model thêm văn bản ngoài JSON.
- Bản sửa: dispatch JSON riêng cho entity/event extraction; Gemini dùng application/json, temperature 0 và tối thiểu 4096 output token. Đầu ra MAX_TOKENS bị từ chối với thông báo rõ, không sửa JSON thiếu thành dữ kiện giả và không tự retry.
- Giữ nguyên contract adapter legacy và các bước duyệt HITL. Request context được reset; Writing giữ cấu hình cũ, không bị tăng token hoặc ép JSON từ request extraction trước.
- Kiểm tra: 48 passed, 1 skipped, 22 deselected trong nhóm hồi quy; sau khi bổ sung event JSON và Writing isolation, riêng test_llm_services có 9 passed. git diff --check ai-service sạch.
- Build/recreate riêng AI service; không reset dữ liệu hoặc gọi thêm Gemini. Cần tester thử lại A06 để xác nhận đầu ra provider thực tế; quota là lỗi độc lập chưa xử lý.
