# Human entity review — code và offline regression

Ngày:2026-10-20. Trạng thái: **OFFLINE_IMPLEMENTED; LIVE_RETEST_NOT_RUN**. Chưa đủ điều kiện mở bài100k.

## Thay đổi

- Danh sách tăng cường tùy chọn, mỗi tên có thể kèm type/aliases/notes; API phân biệt hint và author-declared identity. Guidance lưu riêng, có optimistic version, không vào approved memory/context và không chứng minh chapter occurrence.
- UI có ô nhập tên, tạo entity do tác giả khai báo và checkpoint review theo nhóm tên/identity/verdict; mở bằng chứng/từng occurrence, giữ/loại/sửa loại/tên chuẩn/alias. Unknown status mặc định; canonical identity đã có không tự overwrite/merge.
- Revision pipeline opt-in: discovery chia đoạn → candidates → LLM verify → **waiting_entity_review** → tác giả quyết định → **entities_reviewed** → event/fact → proposal review canon. Chưa đủ quyết định hoặc unresolved thì chưa chạy downstream.
- Source/hash, novel/tenant, guidance/review version và policy gắn checkpoint. Hints đổi chỉ rerun entity stage; giữ author decisions khi occurrence context và machine decision còn khớp. Continue không rediscovery nếu checkpoint còn hợp lệ. Gateway chặn source không còn là revision mới nhất.
- Identity mới ở event/fact quay lại review; không tự tạo/ép vào tên gần nhất hoặc lưu group dở. Verifier malformed vẫn fail sau bounded repair; không dùng review để coi output lỗi là đã hợp lệ.
- P1 bootstrap dừng/resume tại entity checkpoint, không đếm lặp scene hoặc chạy lại chương đã xong. P2 setup nhận hints, vẫn chỉ source-grounded character/location proposals và review trước baseline. P3 chờ human entity review, không auto-approve/advance hoặc tăng generation retry để vượt gate.
- PostgreSQL lấy entity/alias registry bằng2 bulk queries, không N+1 theo tên hoặc tải facts/events/mentions/proposals trước entity gate. Guidance là một JSON column; checkpoint dùng audit JSON ngoài canon. JSON/in-memory có contract tương ứng.
- Đã sửa lỗi approve một nhóm làm xóa staged edits của các nhóm khác. Chưa có live UI regression cho edits qua refetch/reload.

## Kích hoạt

Mặc định flag vẫn OFF; các endpoint legacy không tự đổi. Chạy migration head **0012_entity_guidance**, build đồng bộ3 services, bật `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` trên **stack test cô lập mới**. Pipeline version mới **entity-human-review-v1**; collector policy vẫn entity-candidates-v1. Không tái sử dụng analysis key cũ thuộc policy khác.

UI báo rõ nếu server chưa bật chế độ. Override mẫu `../../compose.entity-candidates.yml` chưa được apply trong lượt này. Không deploy/restart worker cũ hoặc chạy migration trên DB ứng dụng thật.

## Validation

Kết quả cuối và hashes xem `validation.json`; logs cùng thư mục:

**AI-service397 PASS /2 SKIP /42 DESELECTED; kiểm tra entity/audit cuối48 PASS; backend targeted39 PASS; backend typecheck PASS; web build PASS.**

- AI-service: toàn bộ suite, bao gồm lifecycle/API/optimistic conflict, P1 resume, P2 hints, aliases, Unicode/offset/limits, migration và persistence memory/JSON/SQLite.
- Backend: targeted gateway/autonomous/outbox suites, bao gồm guard P3 không vượt entity review; typecheck.
- Web: production build; giữ warning sẵn có của Mantine và bundle size nếu có.
- Backend full suite không xanh: nhóm moderation/publish/social vướng MongoDB13297 (`Ephurin` đã tồn tại nhưng test dùng `ephurin`), kéo theo failures/cancellations. Không sửa/drop/đổi tên DB để cứu test. Logs full suite giữ riêng; không coi targeted PASS là full backend PASS.
- Pipeline map cập nhật code mới, các nhánh human review, flag routing, remaining gaps và export standalone; QA riêng lưu cùng architecture.

## Chưa chứng minh

Chưa chạy provider thật hoặc UI E2E cho workflow mới, chưa đo gold recall/precision/cost/latency, chưa deploy. Event/fact/coverage vẫn toàn chương; chưa có assertion extraction/merge cross-chunk. Guidance hỗ trợ recall nhưng không đảm bảo đủ mọi entity. P2 setup vẫn giới hạn character/location; alias cần bằng chứng nguồn.

Optimistic review version chặn thao tác cũ; regression hiện tại kiểm tuần tự và persistence, chưa phải stress test nhiều worker/requests đồng thời. JSON fallback là single-document store, không cam kết multi-process transactions như PostgreSQL. UI decisions đang chỉnh chưa bấm lưu có thể mất khi reload; checkpoint đã lưu mới là điểm resume bền.

Các lỗi writing JSON/prose, reconciliation live và35 gold cũ vẫn cần retest riêng; không được coi đã sửa hết nhờ entity gate. Giữ nguyên5 durable outboxes và trạng thái stop của run recovery cũ. Hướng dẫn tiếp theo: `../../GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`.
