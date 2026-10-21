# Gemini — retest entity extraction có tác giả tham gia

Đọc `WORKFLOW_CONTRACT.md` revision1.3 trước: đây là source of truth P1/P2/P3. Sau đó đọc báo cáo `runs/2026-10-20-human-entity-review/REPORT.md`, `architecture/AI_PIPELINE_MAP.md` và task S01–S11. Đây là kiểm thử chức năng qua UI; chỉ dùng API/SQL đọc evidence, không gọi endpoint ghi thay thao tác người dùng để cứu test.

## Môi trường

- Dùng run/novel/stack test cô lập mới; giữ dữ liệu và5 outbox cũ của `2026-10-19-recovery-ui-01`. Không restart worker cũ để test code mới.
- Build đồng bộ AI/backend/web. Chạy `alembic upgrade head` trên DB test mới; xác minh head `0012_entity_guidance`, cột `story_brains.entity_guidance` và `analysis_runs.entity_candidate_audit`.
- Bật `ENTITY_CANDIDATE_VERIFICATION_ENABLED=true` trên AI service của stack mới; có override `compose.entity-candidates.yml`. Mặc định vẫn OFF. UI phải hết thông báo chế độ chưa bật; analysis pipeline version phải là `entity-human-review-v1` (candidate collector policy vẫn `entity-candidates-v1`).
- Xác minh provider/model thực và ngân sách. `/health` không chứng minh provider đã sẵn sàng. Ghi source fingerprint, schema/config, mỗi call/latency/usage và giới hạn run; không in API keys.

## Luồng tác giả cần kiểm tra

1. Mở **Bộ nhớ → Chờ duyệt**. Điền danh sách tăng cường, mỗi dòng một tên: `An`, `Mai Linh`, `trạm Bốn`, `CV-04`, một tên viết thường và một tên hoàn toàn vắng mặt. Lưu rồi reload: danh sách còn, narrative memory/context chưa có entity hay fact mới.
2. Dùng đoạn có “đi cho an toàn”, “An toàn là trên hết” và người An thật; có câu xác lập `Linh là tên gọi của Mai Linh.`. Thêm alias mơ hồ của hai người, tên ở ranh giới discovery chunk, Unicode có emoji trước tên. Đóng băng gold entity/mention/alias/negative trước test.
3. **P1:** import bản thảo. Job phải dừng `waiting_entity_review` tại đúng chương. Inventory hiển thị tên, verdict LLM, số occurrence, context và offsets. Chưa gọi event/fact, chưa tạo canon hoặc partial proposal group của chương đó.
4. Duyệt theo nhóm tên; mở từng occurrence khi cần. Dùng nút giữ/loại, sửa loại/tên chuẩn/alias có bằng chứng. Không giữ An trong “an toàn”. `unresolved` phải được xử lý hoặc loại; thiếu quyết định không được tiếp tục.
5. Lưu quyết định entity. Reload phải còn `entities_reviewed`, brain vẫn chưa đổi. Thêm một tên thiếu vào danh sách tăng cường, lưu rồi bấm **Chạy lại riêng bước entity**: chỉ entity LLM chạy lại, không event/fact; giữ quyết định cũ khi ID/context/machine decision còn khớp. Phải duyệt candidate mới.
6. Bấm **Tiếp tục trích xuất event/fact**: không gọi lại entity LLM khi danh sách/source không đổi. Sau đó duyệt proposals canon như trước. Với import nhiều chương, bấm tiếp tục job import để sang chương chưa xong; không phân tích lại chương đã xong. Cuối cùng mới activate baseline.
7. Thử **Tạo đề xuất entity từ khai báo** bằng một tên chưa có trong prose. Chỉ một proposal `source_type=author_declaration`, status Unknown, không có chapter quote/event. Duyệt proposal mới thành canon; sau này LLM có thể đề xuất chuẩn hóa/alias nhưng không overwrite hoặc tự merge identity đã duyệt.
8. Hai tab cùng sửa danh sách/duyệt checkpoint: tab cũ phải409 và yêu cầu reload. Sửa/lưu chương sau khi có checkpoint: gateway phải chặn review/continue bản cũ; phân tích bản mới. Không đổi UUID/DB để vượt guard.
9. Nếu event/fact nêu identity ngoài inventory đã duyệt: quay lại entity review, không tự tạo tên hoặc lưu group dở. Tên không có occurrence trong nguồn phải báo lỗi rõ. Nếu verifier output malformed/thiếu ID: bounded repair rồi fail, không “PASS nhờ review tay”.
10. **P2:** setup có hints được gửi vào setup extraction nhưng tên vắng không được thêm; chỉ nhân vật/địa danh explicit theo contract hiện tại. Duyệt entities setup trước baseline/viết; không biến future outline thành history. Sau chương đầu, extraction dùng checkpoint như P1.
11. **P3:** sau accept bản viết, nếu còn checkpoint entity thì `waiting_for_entity_review`; không tự approve, advance objective hoặc tốn retries generation để né gate. Human review + continue event/fact xong, chạy tiếp auto trên revision đã accept, không viết lại/chèn trùng. Outbox `COMPLETED` chỉ có thể là đã giao việc, không chứng minh downstream extraction xong.

## Evidence và gate

- Lưu danh sách tăng cường/version; source/hash; audit trước/sau review; quyết định tác giả; proposals raw và sau sửa; official memory/context và ảnh UI tại mỗi chuyển trạng thái.
- Đọc scoped audit: `/v1/story-brains/{novel_id}/entity-candidate-audits/{run_id}`; danh sách checkpoint: `/v1/story-brains/{novel_id}/entity-reviews`. Không coi số record là coverage.
- Báo candidate recall, LLM verified recall/precision, sau author review recall/precision, alias false merge, unresolved, số chỉnh tay, call count/latency/usage riêng. So sánh cùng gold;35 narrative assertions là một audit độc lập.
- Retest S01–S11,35 gold và narrative memory sau import, sau10/20/50 chương cho P1/P2/P3. Chỉ mở bài khoảng100k từ khi gate đầu đạt; đánh giá toàn bộ tiểu thuyết, continuity, hoàn thành cốt truyện và các vấn đề gặp phải theo task hiện có.
- Báo rõ PASS/FAIL/BLOCKED/NOT_RUN từng phần. Không publish, tự bật flag mặc định hoặc sửa dữ liệu nghiệp vụ để cứu test. Lưu REPORT/checkpoint/evidence trong thư mục run mới.
