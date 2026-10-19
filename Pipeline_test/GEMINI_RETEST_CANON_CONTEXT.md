# Prompt giao Gemini retest sau sửa canon/context — 2026-10-19

Kiểm thử bản sửa ba lỗi MEM-DUPLICATE-001, MEM-CRITICAL-001 và CTX-COVERAGE-001.
Đọc WORKFLOW_CONTRACT.md, SHORT_LOOP_TEST.md, NARRATIVE_MEMORY_AUDIT.md,
runs/2026-10-18-independent-01/REPORT_REVIEWED.md, REGRESSION_CASES.md trong cùng
run cũ và runs/2026-10-19-canon-context-repair/REPORT.md trước khi thao tác.

## Phạm vi và preflight

- Dùng stack http://localhost:18080; backend localhost:14000/api/v1; AI localhost:18000.
  Xác minh migration **0010_fact_supersession**, source/runtime fingerprints và UI có
  nhãn “Đã có trong canon — giữ nguyên”, “Phân tích lại chương đang mở”. Không tự
  build/deploy/fix code khi runtime chưa đúng; ghi BLOCKED cụ thể.
- Tạo run mới và project mới qua UI. Không sửa project
  `46642ff1-5bac-4513-98fd-ffe1be6cb318`, project reader03, canon trùng cũ hay 26
  proposal pending cũ. Dữ liệu lịch sử đó được cố ý giữ nguyên để so sánh.
- Mọi thao tác tác giả qua UI; API/SQL chỉ đọc để kiểm chứng. Không dùng API ghi,
  DB writes hoặc script generation để cứu một bước UI. Không xuất bản.
- Dùng fixture PT-CV-001 không đổi. Đóng băng đầy đủ gold gốc trước extraction;
  không chỉ xét 19 mục đã được chọn trong báo cáo trước. Bind revision/hash của
  project mới. Không đưa gold vào prompt extraction/generation.
- Quyền provider và ngân sách đã cấp còn áp dụng trong cùng phạm vi; tuân thủ quota.
  Bản sửa có thêm lời gọi kiểm tra độ phủ fact và đối chiếu canon. Theo dõi số call,
  token, retry/429 và model hiệu lực; không tự khẳng định bốn key đang xoay vòng.

## Thực hiện

1. Chạy S01–S04 qua UI: nhập 5 chương, chủ động extraction, đợi xong toàn bộ job,
   chụp raw proposals trước review, review từng nhóm và activate baseline. Không
   duyệt hàng loạt mà chưa đọc. Đánh giá riêng G06/G07 (cạnh xanh/vết nứt CV-04),
   G13 (giới hạn suy luận từ chuông), scan count, quy tắc quét, certainty và Duy.
   Chạy đầy đủ M0; lỗi thiếu critical item vẫn là lỗi extraction dù có đường tác giả sửa.

2. Chạy REG-01: lưu lại nội dung không đổi. Đối chiếu revisions/outbox/analysis và
   canon; không nhầm debounce với dedup memory.

3. Chạy REG-02: thêm một cảnh nhỏ có một sự kiện và một fact mới rõ ràng vào chương
   đã có memory; lưu bình thường. Chụp official memory trước duyệt và raw queue.
   Nhóm mới có thể chứa đề xuất “Đã có trong canon — giữ nguyên”: duyệt chúng phải
   tham chiếu bản ghi cũ, không chèn event/fact trùng. Cảnh mới phải vào canon sau
   duyệt. Cho phép extractor phân tích lại toàn chương, không bắt chỉ trả phần mới.

4. Chạy REG-03: sửa một sự kiện/fact và thử bỏ một chi tiết trên project probe riêng.
   Review đề xuất thay thế/gỡ, rồi kiểm tra official memory, projected state và context.
   Lịch sử cũ được giữ qua `supersedes_id`; bản cũ/tombstone không còn là canon hiện
   hành. Không gọi các phiên bản có liên kết supersession là duplicate. Các fact không
   đổi phải giữ ID; fact thay đổi có phiên bản mới và provenance đúng. Kiểm tra thứ tự
   tương đối của sự kiện được sửa với sự kiện xảy ra sau đó.

5. Chạy REG-04: tạo hai revision thực sự chồng nhau (lưu V1 rồi V2 khi extraction V1
   chưa xong). Thử duyệt kết quả V1 sau V2; kết quả cũ phải bị chặn, không đổi canon.
   Chụp IDs/timestamps/server state trước-sau. Không bắt buộc status phải tự đổi tên.
   Nếu không tạo được overlap, ghi NOT_ASSESSED, không lấy một save debounce làm PASS.
   Nếu canon đã đổi sau lúc phân tích, hệ thống có thể yêu cầu phân tích lại. Dùng nút
   “Phân tích lại chương đang mở”, kiểm tra nhóm mới rồi loại nhóm cũ qua UI; ghi rõ
   đây là hành động phục hồi, không che lần lỗi đầu.

6. Chạy REG-06: thêm một lần gặp/hành động tương tự nhưng xảy ra ở thời điểm/bối cảnh
   khác, nói rõ trong prose. Nó phải được lưu riêng, không bị gộp với lần trước. Tiếp
   tục phân tích lại cùng đoạn đó để kiểm tra không tạo lần thứ ba giả. Đối chiếu nguồn,
   quote, timeline và ID, không chấm chỉ bằng event_type/participants/fact_key.

7. Chạy REG-05 trên cùng nguồn/cutoff/truy vấn ở ngân sách 4.000 và 8.192 token.
   Lưu context payload, token estimate, selected/dropped IDs và drop reasons. Chấm
   từng probe gold: trạng thái quan trọng, dữ kiện từ seed, uncertainty, event liên quan
   và cách ly tương lai. Không áp tỷ lệ phần trăm cứng; số record lớn không tự là PASS.
   Fact phải có subject rõ và không bị tách khỏi certainty. Phân biệt preview với final
   context thực sự gửi model; final generation context chưa quan sát được = NOT_ASSESSED.

8. Hoàn thành các bước S05–S11 còn lại, M-FIRST và audit cuối. Xuất lại văn bản từ
   sản phẩm, cập nhật revision manifest/hash/word count, decisions, actions, issues và
   checkpoint. Không dùng dữ liệu run cũ làm before/after của run mới.

## Báo cáo và cổng nghiệm thu

- Lưu tất cả dưới thư mục run mới. Giữ raw snapshot trước sửa, accepted snapshot,
  context và probe results riêng. Không lưu secrets hoặc toàn bộ HTTP headers.
- Mỗi REG và S-step có Expected/Actual/Evidence/PASS/FAIL/PARTIAL/BLOCKED/NOT_ASSESSED.
  Tách lỗi sản phẩm khỏi lỗi môi trường, tác giả sửa thành công khỏi raw extraction.
- Đối chiếu duplicate theo **canon hiện hành** và provenance; vẫn xuất lịch sử để
  chứng minh không xóa dấu vết. Với reuse, kiểm tra canonical_artifact_ids/ID cũ và
  quyết định mới. Với replacement/retirement, kiểm tra supersession và projection.
- Không lấy unit tests, DB giả lập hay con số context sau sửa từ báo cáo development
  làm LIVE_UI/Gemini PASS. Độ đúng của quyết định LLM đối chiếu canon phải được test thật.
- P1 chỉ nghiệm thu khi REG-01–REG-06 và các gate memory/context của short loop đạt.
  Có lỗi thì giữ issue OPEN và checkpoint có thể tiếp tục. Chỉ sau P1 PASS mới probe
  P2/P3 theo tài liệu task; chưa chạy bài 100k trước khi các probe đó đạt.
