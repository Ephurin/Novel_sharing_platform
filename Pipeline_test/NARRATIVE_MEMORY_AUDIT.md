# Gate narrative memory cho P1, P2 và P3

Task revision 1.1. Áp dụng cho mọi run mới; fixture văn học PT-CV-001 v1.0.0 không đổi. Mục tiêu: xác định **LLM có thực sự trích xuất thông tin từ nội dung mới, thông tin ấy có được lưu đúng và có dùng được ở lượt viết tiếp hay không**. Tăng brain_version, số entities hoặc job COMPLETED không đủ để PASS.

## Lịch bắt buộc

Đếm theo số chương canonical đã hoàn thành về nội dung, bao gồm chương import hoàn chỉnh; không đếm generation, scene, revision hay objective. Seed có 4 chương hoàn chỉnh, chương 5 dở. Mỗi checkpoint ghi cả số chương hoàn chỉnh và chapter cutoff thực tế.

- **M0:** ngay sau import/bootstrap, chụp proposal trước sửa/duyệt; sau đó kiểm tra lại sau review/activation.
- **M-FIRST:** sau lần đầu accept nội dung mới và incremental analysis, cho từng đường P1/P2/P3 thực sự được chạy.
- **M10:** sau mỗi 10 chương hoàn chỉnh: 10, 20, 30, 40, 50, 60…; không chạy generation kế tiếp trước khi đã lưu evidence checkpoint đến hạn.
- **M20:** tại các bội số 20, mở rộng audit dài hạn và supersession.
- **M50:** tại các bội số 50, audit tích lũy toàn bộ ledger trọng yếu và khả năng giữ thông tin xa. Tại mốc trùng, chạy một audit với phạm vi sâu nhất và gắn đủ nhãn, không tính nhiều lần.
- **M-FINAL:** cuối run hoặc khi dừng sớm, kể cả chưa đến mốc 10. Có thể dùng chung snapshot với checkpoint đúng thời điểm đó, ghi rõ alias.

Task mặc định 40 chương: chạy M0, M-FIRST, 10, 20, 30, 40 và final; **mốc 50 = NOT_APPLICABLE vì kế hoạch chỉ có 40 chương**, không phải PASS. Nếu run có kế hoạch >=50 nhưng bị chặn ở 27, mốc 30/40/50 = NOT_RUN với lý do chưa đạt; không đổi thành NOT_APPLICABLE. Không đổi số chương của fixture chỉ để đủ mốc kiểm tra.

| Pipeline | M0 | M-FIRST | 10/20/50 và final |
|---|---|---|---|
| P1 | Manuscript → extraction proposals → tác giả review → persisted narrative memory | Revision viết tiếp đầu tiên → outbox/analysis → proposals → memory mới | Áp dụng trên main novel |
| P2 | Idea/constraints → blueprint đề xuất → review → baseline; đối chiếu phần tác giả cung cấp với phần model sáng tạo được duyệt | Văn xuôi chương đầu được accept → incremental extraction; đây mới là bằng chứng trích xuất từ chương cho P2 | Áp dụng nếu P2 được chạy thành truyện dài; probe ngắn vẫn có M0/M-FIRST/final |
| P3 | Audit baseline kế thừa trước khi controller bắt đầu; không ghi công controller đã trích xuất baseline nếu do P1/P2 tạo | Accepted revision đầu tiên của controller → analysis → auto-accept → memory | Áp dụng trên autonomous long run; probe ngắn audit cuối, không mượn mốc 10/20 của main để báo P3 đạt |

P2 bootstrap tạo world bible có thể đề xuất chi tiết mới hợp lệ. Gắn `author_supplied`, `model_proposed`, `author_accepted`; không tính mọi sáng tạo blueprint là hallucination. Tuy nhiên tương lai trong outline vẫn không được coi là sự kiện lịch sử. Tách verdict bootstrap generation khỏi verdict extraction từ prose.

## 1. Đóng băng nguồn và lập đáp án độc lập

Tại checkpoint, lưu danh sách canonical revision ID, hash và chapter cutoff. Đợi outbox/analysis xử lý trong timeout đã cấu hình; nếu còn pending, ghi trạng thái và latency. Không suy ra extraction lỗi trước timeout, cũng không chờ vô hạn.

**Đọc văn bản nguồn để lập expected items trước khi xem kết quả extraction của checkpoint.** Dùng `memory_items.csv`, mỗi dòng một khẳng định nguyên tử có excerpt và revision nguồn: entity/alias, event, fact/world rule, relationship, state transition, vật thể/người giữ, thời gian và certainty. Các đáp án chỉ nằm trong evidence, không gửi vào extractor hoặc prompt generation để giúp bài test pass.

- M0 P1: đối chiếu đủ C01–C15, tách dòng nhiều ý thành các expected items nguyên tử; phân biệt fact đã chứng minh với nhận định nhân vật.
- M-FIRST và probe ngắn: kiểm tra toàn bộ các thông tin trọng yếu mới trong revision đó; không bắt buộc bịa đủ sample count.
- M10: chọn trước ít nhất 20 items mới/có thay đổi từ block 10 chương và 10 items cũ cần nhớ; phân bố đầu/giữa/cuối block, gồm mọi thay đổi trọng yếu. Nếu nguồn thật ít hơn, kiểm tra toàn bộ và ghi mẫu nhỏ. Không chọn chỉ các mục sản phẩm đã trích xuất được.
- M20: thêm kiểm tra toàn bộ state/relationship/ownership đã đổi kể từ checkpoint sâu trước; chọn ít nhất 20 items cũ còn hiệu lực từ các phần xa hơn. Trạng thái cũ phải được giữ như lịch sử khi hợp lệ, không thắng trạng thái hiện tại.
- M50: kiểm tra toàn bộ ledger trọng yếu từ đầu tới cutoff, cùng mẫu thông tin không trọng yếu phân bố qua từng block 10 chương. Nếu mẫu quá lớn vượt ngân sách, ghi PARTIAL và phần chưa kiểm tra; không coi mẫu nhỏ là toàn bộ memory.
- M-FINAL: kiểm tra toàn bộ các bất biến cứng và payoff thực tế đến cuối; dùng bản truyện đã lưu làm nguồn, không lấy outline tương lai làm gold.

Không buộc một schema cụ thể khi hệ thống biểu diễn cùng ý nghĩa bằng loại record khác; chấp nhận tương đương ngữ nghĩa nếu có ID, provenance và certainty đúng. Nếu loại memory sản phẩm không hỗ trợ, ghi UNSUPPORTED và số mục ảnh hưởng riêng; không âm thầm bỏ chúng khỏi độ bao phủ tổng.

## 2. Theo dõi từ LLM tới narrative memory

Lưu từng lớp riêng trong `evidence/memory/<pipeline>-<checkpoint-id>/`:

1. **Source:** revision manifest và expected items đã đóng băng, thời điểm/hash của danh sách expected.
2. **Extraction execution:** analysis/job ID, model requested/effective của **extraction**, input revision/hash hoặc chunk IDs, call/trace IDs, trạng thái parse/schema, lỗi và fallback. Generation model chạy thật không chứng minh extraction model chạy thật. Gắn rõ mỗi loại: LLM, rule/regex, derived projection, fake hay unknown; world rules từ regex không được ghi LLM extraction PASS.
3. **Raw proposals trước correction:** payload, type, evidence, dependency group, certainty và trạng thái. Có thể dùng export/log/trace sẵn có được phép đọc. Không có trace đầy đủ thì nêu thiếu; không dump secrets hoặc tự sửa mã để tạo bằng chứng.
4. **Sau review/auto-accept:** proposal accepted/rejected/edited, IDs record đã materialize, brain version và delta so với checkpoint trước. Tách kết quả gốc khỏi kết quả sau tác giả sửa; sửa thành công không xóa lỗi extractor.
5. **Context/retrieval:** truy vấn và IDs thực được trả về, final packed context, thời gian/cutoff, phiên bản và kết quả đối chiếu.

P3 có thể auto-accept trước khi tester đọc queue. Dùng audit history/persisted proposals/trace sẵn có để thu hồi dữ liệu nguyên gốc nếu được phép; không giả vờ snapshot sau auto-accept là trước accept. Nếu không quan sát được raw stage, đánh dấu OBSERVABILITY_GAP và raw-extraction quality NOT_ASSESSED. Việc tạm dừng giữa các `/step` để đọc evidence là quan sát; sửa memory thủ công trong autonomous run là can thiệp và phải làm thay đổi claim.

Chỉ đọc qua UI/public API hoặc diagnostics read-only đã được cấp quyền. Nếu API chỉ trả counts/summary, không dùng nó thay bản ghi chi tiết. Ghi gap, đề xuất bổ sung observability ở công việc riêng. Nếu cần structured memory export chưa có, gate tương ứng BLOCKED/NOT_ASSESSED, không lách bằng ghi DB.

## 3. Kiểm tra retrieval và context bằng câu hỏi có đáp án

Mỗi checkpoint có ít nhất 5 probes nếu nguồn hỗ trợ, ghi vào `memory_probes.csv`: thông tin mới, thông tin từ seed, state/ownership đã đổi, uncertainty/attribution, và thông tin tương lai phải bị loại khỏi historical canon. Thêm một probe long-range và một probe phủ định tại M20/M50. Lưu gold trước khi chạy probe.

Ví dụ sau import: “CV-04 đã được quét bao nhiêu lần?”, “Ai giữ vòng chuẩn khía tam giác?”, “Linh đã xác minh giọng Lâm chưa?”, “Duy nghe bằng tai nào?”, “Đã có bằng chứng 83 người được cứu ở cutoff này chưa?”. Sau đó tạo probe từ **văn xuôi thực đã accept**, không yêu cầu model biết mốc outline chưa được viết.

Quan sát retrieved/packed records và provenance, không chỉ câu trả lời LLM nghe có vẻ đúng. Không gửi gold như context hỗ trợ. LLM trả đúng bằng kiến thức từ prompt/blueprint không chứng minh retrieval. Không có endpoint trả lời câu hỏi thì dùng context preview/query được hỗ trợ; khả năng không quan sát được ghi NOT_ASSESSED, không tự phát minh endpoint.

Nếu semantic lane disabled thì semantic retrieval = NOT_ASSESSED; structured narrative memory vẫn phải audit. Nếu semantic lane bật: kiểm tra embedding version, memory chunk/source revision, cutoff, trạng thái stale và IDs retained sau packing. Phân biệt “đã lưu đúng nhưng không truy xuất”, “đã truy xuất nhưng bị pack loại”, và “extract sai ngay từ đầu”.

## 4. Chỉ số và verdict

Tính riêng cho raw proposals, persisted memory trước sửa tay và sau sửa tay, từng loại memory và từng pipeline. Counts là thống kê phụ, không phải tiêu chí thành công.

- **Sample recall:** expected items được biểu diễn đúng / tổng expected items đã đóng băng trong mẫu. Ghi n/N; UNSUPPORTED vẫn nằm trong coverage tổng, đồng thời báo recall trên phần supported riêng.
- **Sample precision:** khẳng định output đúng và có nguồn / khẳng định output được review. Review toàn bộ outputs của các revisions đã chọn; không chọn riêng output khớp gold. Ghi tổng output, số đã review và số không đánh giá; không suy precision toàn corpus từ mẫu.
- **Provenance accuracy:** records có revision/chapter/source đúng / records được kiểm tra; P2 baseline từ idea dùng request/blueprint identity nếu chưa có revision, không bịa revision ID.
- **Critical recall:** số bất biến/thay đổi trọng yếu đúng / tổng mục trọng yếu đến cutoff. Báo missing, unsupported assertion, duplicate, sai entity link, sai certainty, stale-state, future leak, và latency analysis riêng.
- **Context coverage:** probes có đủ bằng chứng đúng được giữ trong context / probes có thể thực thi; probe không quan sát được vẫn báo riêng. Correct answer không thay context evidence.

Ngưỡng task đặt trước: sample recall >=90%, sample precision >=95%, critical recall =100%, provenance accuracy =100%, không có future leak/stale current state/unsupported critical assertion. Áp dụng từng checkpoint, không gộp trung bình để che một mốc fail. Mẫu trống → NOT_ASSESSED, không chia 0 thành 100%. Đây là ngưỡng acceptance của task, không phải số đo đã có.

Tách verdict `llm_execution`, `raw_extraction_quality`, `memory_materialization`, `context_retrieval`, `post_correction_quality`, `overall_memory`. LLM execution PASS cần bằng chứng call thật thành công gắn đúng nguồn + kết quả extraction, không chỉ setting `LLM_PROVIDER` hoặc brain_version tăng. Thiếu trace → NOT_ASSESSED; rule-only → NOT_APPLICABLE cho call LLM của loại đó, đồng thời chưa chứng minh yêu cầu LLM extraction. Overall memory không PASS nếu một phần bắt buộc chưa được đánh giá.

Sai memory trọng yếu/future leak/nhầm nhân vật → issue S1 và giữ checkpoint trước khi viết tiếp. Assisted run có thể sửa qua chức năng tác giả rồi retest ghi before/after, vẫn lưu fail ban đầu. Autonomous run không được nhận sửa tay mà giữ claim tự động. Với thiếu observability hoặc lỗi không trọng yếu, có thể tiếp tục theo quyết định ghi log, nhưng gate còn PARTIAL/NOT_ASSESSED và phải xuất hiện trong báo cáo cuối.

## 5. Artifact bắt buộc và resume

Mỗi checkpoint: sao `templates/MEMORY_AUDIT.md` vào thư mục evidence nêu trên, gắn snapshot/trace/expected/actual/probe evidence. Thêm một dòng `memory_checkpoints.csv` cho **mỗi pipeline được kiểm tra**; các mốc chưa tới hoặc không áp dụng cũng phải được giải thích trong báo cáo cuối. Không nhân bản một baseline để giả thành ba lần extraction độc lập; ghi shared_evidence khi dùng chung nguồn.

Cập nhật `checkpoint.json.memory_audit`: các mốc đã xong, mốc kế tiếp, audit còn pending và issue chưa xử lý. Resume phải hoàn tất audit đến hạn trước khi generation tiếp; không chỉ nhìn số chapter rồi bỏ qua memory gate. Công cụ `task_tool.py` chỉ sao các template khi init và kiểm tra fixture; **không tự thu thập memory, tính recall hay chứng nhận live audit**.
