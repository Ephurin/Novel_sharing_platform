# Rà soát độc lập các báo cáo ngày 19/10/2026

Ngày rà soát: 2026-10-19 (Asia/Saigon).
Phạm vi: đọc báo cáo, snapshot JSON, CSV, script của run và đối chiếu source hiện có.
Không chạy lại provider/UI, không sửa code, DB hoặc báo cáo gốc.

## Kết luận

**P1 chưa đạt gate; P2/P3 và bài 95.000–105.000 từ chưa đủ điều kiện chạy nghiệm thu.**
Run retest có bằng chứng hữu ích về reuse, supersession và khắc phục context bị rỗng,
đồng thời phát hiện các đường lỗi thực tế. Tuy nhiên, kết luận “RESOLVED/100%” của
dedup/context vượt quá coverage được lưu. Kết quả phù hợp là **PARTIAL**, kèm lỗi
sản phẩm và các khoảng trống bằng chứng cần hoàn thiện.

## Hai báo cáo có mục đích khác nhau

- `../2026-10-19-canon-context-repair/REPORT.md`: báo cáo development, ghi rõ Python
  328 passed / 2 skipped / 42 deselected, backend 29 passed và PostgreSQL 8 cases;
  LLM đối chiếu dùng stub, fresh Gemini/UI NOT_RUN. Không mâu thuẫn khi retest thật
  sau đó thất bại; các kiểm tra đó không chứng minh độ bền với output LLM thật.
- `REPORT.md`: run Gemini ghi COMPLETED_WITH_ISSUES, P1_PARTIAL_REPAIRED. Nhận định
  chưa mở bài dài là đúng. Các phát biểu “triệt để”, “100%” và một số PASS chi tiết
  cần giới hạn lại như các nhận xét dưới đây.

## 1. Ba đường lỗi cần sửa

1. **AI-GATEWAY-422:** source xác nhận controller phân tích lại gọi forwardRequest
   mà không có Idempotency-Key; gateway cũng chưa có option/header tương ứng.
   FastAPI `api/narrative_routes.py:715–720` bắt buộc header này. Đây là nguyên nhân
   có cơ sở trực tiếp của 422 được báo cáo. Cần test xuyên controller → gateway →
   AI service, cả lần gọi đầu, retry và yêu cầu phân tích lại mới.
2. **EXTRACT-RECONCILE-COLLISION-001:** `services/canon_reconciliation.py:60` ném
   ValueError nếu target không hợp lệ, sai kind hoặc bị claim nhiều lần. Báo cáo
   ghi outbox FAILED sau 5 lần. Source xác nhận đường lỗi; thông báo gộp ba nguyên
   nhân nên cần lưu output reconciliation/trace đã khử secrets để kết luận chính
   xác lần nào là collision. Không tự chuyển claim thứ hai thành `new` như đề xuất
   trong báo cáo: cách đó có thể tái tạo chính lỗi duplicate. Cần sửa output/retry
   có kiểm soát hoặc cơ chế review rõ ràng, giữ invariant canon.
3. **EXTRACT-GROUNDING-AMBIGUOUS-001:** fact path ở
   `application/revision_analysis_service.py:308` gọi quote_span trực tiếp; quote
   lặp sẽ bị từ chối. Cần xử lý ambiguity bằng evidence đủ ngữ cảnh/offset đã kiểm
   chứng, cùng trạng thái lỗi có thể phục hồi. Không lấy tùy tiện lần xuất hiện đầu
   hoặc bỏ fact âm thầm rồi báo extraction thành công.

Các traceback/HTTP payload của từng attempt chưa được lưu thành evidence riêng
trong run; ảnh FAILED chỉ chứng minh trạng thái UI, không tự chứng minh cả chuỗi
nguyên nhân. Cần bổ sung log đã khử secrets và job/revision/trace ID.

## 2. MEM-CRITICAL-001 vẫn mở, không chỉ ở cảnh vỏ ốc

`evidence/memory/P1-M0/raw-audit-results.json` ghi:

- total_gold = 35, total_critical = 35;
- matched_count = critical_matched = 20; tỷ lệ heuristic 57,14%;
- G06, G07, G08, G09, G12, G13, G15, G20, G23, G24, G26, G27, G28, G29, G32
  chưa khớp theo script.

Trong khi đó `memory_checkpoints.csv` dòng P1-M0 ghi 23/25 overall và 16/19 critical.
Hai mẫu số/kết quả này không nhất quán. `memory_items.csv` có 35 dòng, chỉ 15 dòng
persisted_match=TRUE. Không coi các tỷ lệ trên là recall semantic chính thức:
script raw ghép cả quote vào payload để so từ khóa, nên có thể tính đúng dù
proposition sai/thiếu; script approved cũng có thể bỏ sót diễn đạt tương đương.
Script còn gán provenance_correct bằng persisted_match, không kiểm tra độc lập
revision/hash/offset/certainty.

Cần audit thủ công đầy đủ 35 gold, trước can thiệp, có raw proposal ID → assertion
→ certainty/subject → accepted record → context. G06/G07/G13 vẫn cần kiểm tra
riêng; không thu hẹp lỗi thành mỗi cảnh thêm ở REG-02.

## 3. CTX-COVERAGE-001: hết rỗng, chưa chứng minh đạt semantic gate

Snapshot 4k thực có 7 entities / 7 current_states / 6 recent_events / **9 world_rules**;
8k có 14 / 14 / 13 / **16 world_rules**. Báo cáo ghi world_rules=0 là sai.
Snapshot 8k có 142 drop_reasons, khác số 144 trong báo cáo.

Quan trọng hơn, phần đối chiếu gold đã gán sai nội dung:

- G14 là Duy không nghe tai trái, không phải vị trí Linh bên phải Duy;
- G28 là bản đồ ghi ống bịt nhưng hiện trường có âm, không phải góc chụp;
- G30 là An giữ thuyền ngoài trạm, không phải khoảng cách micro;
- G31 là Linh/Duy ở sàn trên chưa xuống khoang, không phải khoảng cách cửa;
- G34 là nguồn tiếng gõ chưa xác định, không phải sọc màn hình.

Đối chiếu với `evidence/memory/P1-M0/expected-items-before-extraction.csv`.
`memory_probes.csv` chỉ có header. Vì vậy phát biểu “19/19 critical retained” và
đóng toàn bộ context gate chưa có bảng probe hỗ trợ. Các event trong snapshot
đều ở chapter <=5; điều này chưa kiểm chứng toàn bộ fact/state/semantic/planning
và final prompt gửi model. Preview có dữ kiện chapter 5; không được suy từ việc
event không có chapter 5 rằng mọi lane đều loại chapter 5. Cần chấm theo cutoff
contract của API, không theo giả định của báo cáo.

## 4. MEM-DUPLICATE-001: bằng chứng tốt nhưng coverage chưa trọn

REG-02 before/after giữ 20 events và 84 facts; có reuse metadata, là bằng chứng
chống insert trùng cho ca này. REG-03 context chứa event 15 ngày, loại event 12
ngày và giữ event trao chìa khóa. Snapshot memory còn event cũ với supersession,
đúng mục tiêu giữ lịch sử; không gọi bản lịch sử này là duplicate hiện hành.

Tuy nhiên REG-01 chủ yếu kiểm tra no-op save, REG-06 Part 2 bị chặn/thất bại, và
REG-03 dùng chỉnh memory thủ công qua UI thay vì hoàn tất cả sửa/xóa nguồn rồi
LLM tự đối chiếu. Chưa có đủ bằng chứng source-edit retirement. Không kết luận
dedup mọi lần phân tích lại đã “giải quyết triệt để”.

## 5. Chưa xác nhận được UI_ONLY

`approve_remaining_groups.py` chứa Runtime.evaluate lấy token phiên đăng nhập và
POST trực tiếp `/api/v1/ai/proposal-groups/{gid}/accept` cho tất cả nhóm pending,
với reason “Author approved in UI”, rồi reload/chụp baseline. Đây là API write,
không phải click UI dù chạy trong browser. Sự tồn tại của script chưa chứng minh
nó đã chạy; cần xác nhận execution và decision logs. Nếu đã chạy, phân loại bước
baseline là HYBRID/API-assisted, giữ nguyên lần test rồi chạy lại gate UI tương ứng.
Không có dữ liệu đủ để xác nhận từng nhóm được đọc/review thực chất trước duyệt.

## 6. S-step bị đổi nghĩa

S05–S10 trong REPORT không trùng `../../SHORT_LOOP_TEST.md`: consistency check bị
gọi S05, export thành S07, quota thành S08, issue ledger thành S10. Kịch bản gốc
đòi sửa/bỏ gợi ý, duyệt kế hoạch và kiểm tra future separation, tự extraction sau
save, duyệt queue, chủ động cài mâu thuẫn rồi sửa/check lại, reload và tiếp tục S11.
Ảnh “không tìm thấy mâu thuẫn” không thay thế positive test có mâu thuẫn biết trước.
Cần lập lại ma trận theo ID gốc; thiếu evidence ghi NOT_RUN/NOT_ASSESSED.

## 7. Hồ sơ chưa đủ để tái lập/tiếp tục đáng tin cậy

- run_config.json vẫn NOT_STARTED, code_sha/model/URLs/limits null, calls=0;
  issues.csv ghi SHA 601275d nhưng chưa kèm fingerprint gắn với runtime retest.
- actions.csv, interventions.csv, memory_probes.csv, chapter_reviews.csv chỉ header;
  MEMORY_AUDIT.md còn nội dung template. Chưa có M-FIRST/final audit đầy đủ.
- checkpoint ghi 4.887 từ; tổng revision_manifest và split count của 7 bản export
  đều là **4.917 từ**. Đây là readback fixture + probe, chưa phải tiểu thuyết dài.
- Cả 7 export hash khớp khi đọc text và chuẩn hóa newline LF, nhưng không khớp raw
  bytes hiện tại do CRLF. Script export hash chuỗi trước write_text. Cần ghi rõ
  content hash LF và/hoặc tính lại SHA256 trên bytes đã ghi, không gọi nhầm byte hash.
- Một số evidence path bị sai tên, ví dụ reg02_group_approval.png (thực tế
  reg02_group_approved.png), s01_author_ide.png và audit_reg05_context.py.
- Không đủ bằng chứng đã chạy P2/P3, generation context thực, bài 100k và các mốc
  memory 10/20/50 chương; ghi NOT_RUN thay vì suy rộng từ vòng hồi quy.

## Hành động tiếp theo

1. Giữ nguyên evidence và báo cáo gốc; bổ sung bảng verdict đã review và hồ sơ run.
2. Sửa ba đường lỗi phân tích lại/validation/grounding, thêm regression cho output
   LLM sai schema ngữ nghĩa, target collision và quote lặp; không nới invariant canon.
3. Retest REG-06 cả hai phần, sửa/xóa nguồn REG-03 và recovery sau FAILED bằng UI.
4. Hoàn thành đúng S01–S11, audit 35 gold/certainty/provenance và probes context;
   đo final context nếu sản phẩm có observability. Giữ MEM-CRITICAL-001 OPEN.
5. Chỉ sau gate P1 đạt mới chạy probe P2/P3, rồi bài dài có audit 10/20/50/final.

Đây là review tĩnh của evidence đã lưu, không phải một lượt LIVE_UI mới và không
tự nâng verdict nào thành PASS.
