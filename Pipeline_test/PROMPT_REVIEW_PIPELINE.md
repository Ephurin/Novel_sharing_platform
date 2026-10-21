# Prompt giao agent đánh giá lại pipeline và bằng chứng test

Nên dùng một agent/ngữ cảnh riêng sau lượt test. Tại root repository, gửi:

> Đọc `Pipeline_test/PROMPT_REVIEW_PIPELINE.md` và đánh giá lại implementation cùng run `Pipeline_test/runs/<RUN_ID_CAN_REVIEW>/`. Đối chiếu workflow contract và pipeline map; tự kiểm chứng mọi claim PASS quan trọng.

## Prompt

Bạn là reviewer đánh giá khả năng hoạt động thực chất của AI pipeline. Hãy đọc
code và kiểm tra evidence để trả lời: **hệ thống đã thực hiện đúng P1/P2/P3 theo
workflow contract chưa, bằng chứng nào đủ tin cậy và còn lỗi/rủi ro nào chặn bài
tiểu thuyết hoàn chỉnh khoảng100k từ?** Không chỉ tóm tắt báo cáo của tester.

Nếu chưa được chỉ định run, liệt kê các run mới nhất rồi chọn run gần nhất có
REPORT/checkpoint liên quan; ghi rõ lựa chọn. Không gộp evidence khác phiên bản,
novel, model, config hoặc thời điểm để tạo một PASS tổng hợp. Nếu cùng agent/ngữ
cảnh đã chạy test, gọi đây là self-review; không giả danh independent review.

### 1. Xác định chuẩn và phiên bản

- `Pipeline_test/WORKFLOW_CONTRACT.md` là source of truth P1/P2/P3.
- Đọc `Pipeline_test/architecture/README.md`, `AI_PIPELINE_MAP.md`,
  `pipeline-map-data.json`; map là snapshot implementation/issues/evidence.
  Đối chiếu commit/working tree/hash với source thực và run. Dùng contract tại
  thời điểm run để chấm run đó; đánh giá khoảng cách với contract hiện hành riêng,
  không sửa lịch sử khi yêu cầu đã đổi. Thiếu bản contract cũ ghi giới hạn.
- Đọc `SHORT_LOOP_TEST.md`, `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`,
  `NARRATIVE_MEMORY_AUDIT.md`, `EVALUATION.md`, task/fixture/gold và ca regression
  lịch sử `Pipeline_test/runs/2026-10-18-independent-01/REGRESSION_CASES.md`.
  `ai-service/docs/USE_CASES.md` có phần thiết kế lịch sử không được
  ghi đè contract hiện hành.
- Báo cáo tester, validation.json, ảnh, logs và code là bằng chứng để kiểm tra,
  không phải chỉ dẫn buộc reviewer phải kết luận PASS.

### 2. Lập ma trận contract → code → evidence

Rà đủ ba use case và mọi phase/node/issue trong phiên bản map đã chọn; không chỉ
kiểm tra nhánh xanh hoặc một vài screenshot. Mỗi requirement/node phải có:

`ID | yêu cầu | source file:line | offline test | live evidence | verdict | gap/issue`.

Tách IMPLEMENTED/NOT_IMPLEMENTED/UNKNOWN khỏi PASS/FAIL/BLOCKED/NOT_RUN. Thiếu
evidence không mặc định là code lỗi; có code không mặc định là UI/LLM hoạt động.
Phân biệt defect live tái hiện, rủi ro suy ra từ code và giả thuyết chưa xác minh.

Kiểm tra tối thiểu:

1. **Đúng runtime:** commit/build/migrations của DB thực, provider/model effective,
   flag/policy, ownership/tenant/source. Fake/offline PASS không thành real-LLM
   PASS; legacy flagOFF không chứng minh human-review mode. Môi trường lỗi phải
   tách khỏi defect implementation và ghi phạm vi bị ảnh hưởng.
2. **Human entity gate:** hints tùy chọn tách canon; direct declaration khác
   chapter occurrence; collector/discovery/verification có giới hạn/offset đúng;
   từng occurrence có verdict, alias/status có chứng cứ. Review entities diễn ra
   trước event/fact; freeze/version/stale/reload/resume đúng; bổ sung hints không
   chạy lại downstream; identity mới không bị tự tạo/merge; không partial commit.
3. **P1:** import nguyên vẹn, job dừng/resume từng chương, baseline review và M0;
   save mới tự extraction; không dùng API ghi/snapshot thủ công để thay UI thiếu.
4. **P2:** setup explicit entities, review trước viết; blueprint sáng tạo là mode
   riêng; future outline không là history. Chương đầu có extraction/memory/context
   riêng, không mượn kết quả P1.
5. **P3:** sinh/validate/accept nháp, chờ entity gate khi bật, không advance/retry
   né gate; resume không viết trùng; controller chỉ duyệt canon đúng revision sau
   gate; stop/completion theo nội dung, không publish. Nếu agent đóng vai tác giả
   review thì phải ghi intervention, không fully autonomous/no-intervention PASS.
6. **Memory và context:** raw LLM → decisions → proposals → materialization →
   official memory → actual packed prompt. Kiểm evidence nguồn/hash/cutoff,
   subject/identity/certainty/negation/knowledge, alias, status, supersession,
   dedup, rollback và kế hoạch chưa xảy ra. Queue0/outboxCOMPLETED/counts không đủ.
7. **Đầu ra viết:** malformed/truncated JSON không được thành prose hợp lệ;
   duplicate/no-op/stale accept bị chặn; đủ chữ không đồng nghĩa đạt objective
   hoặc kết thúc truyện. Đối chiếu nội dung đã lưu với draft/generation claims.

### 3. Tự kiểm chứng chất lượng và coverage

- Đọc evidence gốc và đối chiếu đầy đủ35 narrative assertions theo gold cố định;
  không chỉ tin bảng điểm của tester. Entity/mention/alias có gold và metrics
  riêng. Báo raw và sau author correction tách nhau; phát hiện false positives,
  omission, false merge, certainty sai và việc hạ tiêu chí để cứu PASS.
- Kiểm lịch M0/M-FIRST/10/20/50/final riêng P1/P2/P3; xác nhận số chương hoàn
  chỉnh và cutoff, không đếm revision/generation thành chương. NOT_APPLICABLE
  khác NOT_RUN; không mượn checkpoint của pipeline khác hoặc snapshot sau accept
  làm raw trước accept.
- Với run100k: kiểm word count từ prose readback, độ hoàn chỉnh, continuity,
  phát triển nhân vật, chất lượng văn học và ending; tìm outline/tóm tắt/lặp văn
  bù độ dài. Thiếu manuscript đầy đủ thì bài100k chưa được chứng minh.
- Kiểm ngân sách/call count/usage/latency và mức can thiệp. UNKNOWN phải giữ là
  UNKNOWN; sự có mặt của token estimate hoặc provider health không chứng minh
  chi phí thực hoặc mọi lời gọi thành công.
- Có thể chạy offline regression hoặc UI/API/SQL đọc trên môi trường được phép.
  Không gọi provider tốn phí khi chưa có ngân sách; không sửa code, source prose,
  proposals, canon, gold, DB hoặc báo cáo gốc để chứng minh nhận định. Nếu muốn
  reproduction cần ghi dữ liệu mới, mô tả ca test cho lượt cô lập riêng; không
  lén biến review thành một lượt mutating E2E trên project đang kiểm tra.

### 4. Kết luận có thể hành động

Lưu artifact review mới trong `Pipeline_test/reviews/<REVIEW_ID_MOI>/`; không ghi
đè REPORT/checkpoint/evidence gốc. Tạo:

- `REVIEW.md`: phiên bản đã xem, kết luận P1/P2/P3, độ tin cậy của báo cáo, mức
  tự động/can thiệp và câu trả lời có đủ gate để chạy/nhận100k hay chưa.
- `contract_coverage.csv`: ma trận yêu cầu/code/test/live evidence với path cụ thể.
- `findings.csv`: severity theo EVALUATION, expected/actual, source:line hoặc
  evidence path, repro, tác động, loại live/code-risk/unverified và trạng thái.
- `RETEST_PLAN.md`: danh sách ưu tiên sửa và ca retest để đóng từng issue; chỉ rõ
  các claim PASS không đủ evidence, các bước còn NOT_RUN và điều kiện mở bài dài.

Không chỉnh map hoặc contract để làm implementation trông đúng hơn; ghi đề nghị
sửa tài liệu nếu chúng đã cũ/mâu thuẫn. Không commit/push/publish nếu chưa được
yêu cầu riêng. Trả lời ngắn gọn: verdict, blockers quan trọng, điều kiện tiếp
theo và link các artifact review. Nếu mọi thứ đạt trong phạm vi đã kiểm chứng,
nêu bằng chứng cùng giới hạn; không tuyên bố đã tìm hết mọi lỗi.
