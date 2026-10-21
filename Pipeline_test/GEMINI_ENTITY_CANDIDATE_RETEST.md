# Gemini — retest tầng ứng viên entity

**Hướng dẫn lịch sử cho implementation trước human review. Không dùng cho code hiện tại.** Dùng `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`: hiện tại unresolved đi vào checkpoint tác giả, không còn toàn bộ flow như mô tả bên dưới.

Đọc `architecture/AI_PIPELINE_MAP.md`, checkpoint của `runs/2026-10-20-entity-candidates/REPORT.md` và workflow contract trước khi chạy.

## Chuẩn bị

1. Dùng run/project và stack test cô lập mới; giữ nguyên dữ liệu,5 outbox và trạng thái stop của run recovery cũ. Không khởi động worker cũ để chạy test mới.
2. Build code mới; chạy migration AI `alembic upgrade head` trên DB test mới, kiểm chứng head0011 và cột `analysis_runs.entity_candidate_audit`. Không reset volume hoặc sửa DB nghiệp vụ để cứu test.
3. Bật `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` chỉ trên AI service của stack mới (có override mẫu `compose.entity-candidates.yml`, chưa apply). Kiểm tra runtime flag và policy `entity-candidates-v1` từ audit/analysis run, provider/model thực và ngân sách trước khi gửi synthetic fixture. `/health` chỉ báo liveness, không xác nhận policy hoặc provider readiness.

## Test chức năng qua UI

- Import/lưu các đoạn nhỏ có Mai Linh/Linh, ông Hòa, trạm Bốn, CV-04; thêm cả “đi cho an toàn” và câu đầu đoạn “An toàn là trên hết”, cùng một lần xuất hiện thật của người An.
- Thêm alias có câu xác lập rõ và một tên ngắn mơ hồ của hai người khác nhau. Thêm tên/mã ở ranh giới discovery chunks và Unicode có ký tự ngoài BMP trước tên.
- Bấm extraction qua UI. API/SQL chỉ đọc evidence. Mọi candidate phải có start/end/context/origins và một quyết định; rejected/unresolved vẫn có trong audit. Không dùng số entity tăng làm bằng chứng recall tốt hơn.
- Đọc `GET /v1/story-brains/{novel_id}/entity-candidate-audits/{analysis_run_id}` bằng service scope được phép; lấy analysis_run_id từ job/analysis evidence. API này chỉ chẩn đoán, chưa phải UI review ứng viên.
- Nếu unresolved: đợi mã ENTITY_CANDIDATES_NEED_REVIEW, audit needs_review; event/fact/proposals của analysis đó chưa được tạo. Không ghi thành PASS hoặc sửa DB để vượt guard.
- Nếu toàn bộ quyết định hợp lệ: event/fact chỉ dùng entity inventory đã xác minh; alias là proposal chờ review. Trước duyệt canon chưa đổi; sau duyệt chỉ một identity đúng, aliases lưu bền sau reload.
- Reanalyse/no-op/retry: không nhân canon, không neo An vào chữ an bị loại, không áp proposal stale. Giữ nguyên bằng chứng lỗi nếu verifier thiếu ID hoặc hết repair.

## Đo chất lượng

Đóng băng gold entity/occurrence/alias/negative mentions trước extraction. Báo candidate recall, verified recall/precision, false merge và unresolved riêng; so sánh cùng nguồn với đường cũ. 15/35 của báo cáo cũ là narrative assertions, không phải entity recall. Chạy lại35 gold narrative riêng để kiểm tra downstream không bị xấu đi.

Lưu audit, source/hash, raw verdicts, proposals trước sửa, quyết định tác giả, provider calls/latency/tokens và report vào thư mục run mới. Thiếu provider/UI hoặc unresolved thì PARTIAL/FAIL tương ứng. Chưa mở P2/P3/100k chỉ vì offline tests PASS; chưa tự bật default flag hoặc publish.
