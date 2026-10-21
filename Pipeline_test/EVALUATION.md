# Tiêu chí nghiệm thu

Các ngưỡng dưới đây là tiêu chí task đặt trước, không phải kết quả đã đo. Không chỉnh ngưỡng sau khi thấy đầu ra để làm pass.

## Phạm vi và nguồn chuẩn v1.4

`WORKFLOW_CONTRACT.md` revision 1.4 ngày 2026-10-21 quy định **bài 100.000 từ là gate cuối P3 bắt buộc**, sau P1 UI S01–S11, P2 setup→first chapter và P3 functional controller probe. Kết quả chỉ áp dụng cho **run mới theo v1.4**; các ngưỡng 95–105k trong report/task đời trước phải giữ nguyên như lịch sử, không sửa hồi tố.

Rubric/chứng cứ dưới đây áp dụng riêng cho P3 HITL; hoàn toàn tự động là **claim độc lập**, chưa có policy entity/canon thay thế human gate được nghiệm thu. Pre-registration, baseline fairness, retention/attribution và full-book blind review có hướng dẫn tại [P3_100K_EVALUATION_PROTOCOL.md](P3_100K_EVALUATION_PROTOCOL.md). Các benchmark đối chứng cần cùng model, seed, budget và điều kiện can thiệp hoặc phải công khai confounder; không tuyên bố vượt trội khi chưa đo.

## Sáu verdict độc lập

| Trục | PASS cần gì |
|---|---|
| Artifact completion | **P3 terminal v1.4: 100.000–105.000 từ** theo cùng NFC/whitespace counter; đủ truyện có kết thúc; nguồn canonical revisions có hashes; không lấy bản assisted dưới 100k, outline hoặc job completed thay artifact P3 |
| Pipeline functionality | Các gate bắt buộc trong phạm vi chạy có evidence, gồm narrative memory M0/M-FIRST/10/20/50/final áp dụng cho từng P1/P2/P3; không mất dữ liệu, duplicate acceptance hoặc bypass làm sai kết quả |
| UI coverage | Hành trình được khai báo UI-only có thể hoàn tất bằng UI; hybrid luôn ghi PARTIAL nếu phải dùng API cho chức năng tác giả |
| Controller autonomy / unattended | **P3_HITL_CONTROLLER_100K:** controller điều phối generation/accept/memory nhưng được phép dừng human entity review, mọi intervention phải đo riêng; **P3_UNATTENDED_AUTONOMOUS_100K:** verdict zero-intervention chỉ nếu policy riêng được phê duyệt và run thực không có can thiệp nội dung |
| Literary quality | Toàn văn được đọc, các hard gates đạt và rubric đạt ngưỡng |
| Review independence | Người/agent reviewer khác thực hiện review toàn văn và ghi danh tính/phiên; tự review là SELF_REVIEW_ONLY |

Trạng thái được dùng: `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `NOT_RUN`, `NOT_ASSESSED`, `PENDING_REVIEW`, `NOT_APPLICABLE`. Phải có lý do và evidence cho mỗi ô. Không lấy trung bình để che fail về dữ liệu hoặc thiếu đầu ra.

## Điều kiện cứng

1. Bản cuối đủ độ dài thực, không tóm tắt thay cảnh, không lặp nguyên đoạn để tăng số từ.
2. Không hồi sinh Lâm; gốm thanh không đọc tương lai/ý nghĩ; không vượt ba lần quét gốc CV-04 vô hại; trạng thái tai trái Duy nhất quán.
3. Các tiết lộ phải có nguồn và thứ tự hợp lý; blueprint không trở thành tri thức nhân vật sớm. Số 23 và 83 không bị trộn.
4. Có cứu hộ/cao trào được chuẩn bị và kết quả có giá; có công bố trách nhiệm, Vũ sống và chịu hệ quả, quan hệ mẹ con không được xóa xung đột bằng một câu.
5. Mọi nội dung cuối có provenance qua sản phẩm; không sửa DB hoặc nhập văn xuôi ngoài để giả kết quả copilot. Không có mất sửa tác giả hay accepted draft ghi đè không hợp lệ chưa được xử lý.
6. Tất cả payoff bắt buộc trong ledger có kết quả và trích dẫn, hoặc deviation được ghi nhận và đánh giá FAIL/PARTIAL theo tác động, không xóa ledger.

Một hard gate nội dung thất bại → literary quality không PASS dù điểm trung bình cao. Không đủ độ dài → artifact completion FAIL/PARTIAL. Reviewer độc lập chưa có → tổng thể nghiệm thu chất lượng `PENDING_REVIEW`; không ngăn agent bàn giao bản đã hoàn tất với self-review.

## Rubric 0–4

Chấm từng chiều, đưa ít nhất hai dẫn chứng chapter/revision/đoạn; mức 0 = không có hoặc hỏng nghiêm trọng, 1 = lỗi lớn, 2 = đạt một phần cần biên tập đáng kể, 3 = đạt có lỗi nhỏ, 4 = tốt và nhất quán. Để PASS: mọi chiều ít nhất 3 và tất cả hard gates đạt. Đây là tiêu chí biên tập cho fixture, không phải thang đo khoa học phổ quát.

| Chiều | Cần đánh giá |
|---|---|
| Đáp ứng blueprint | Hứa hẹn ban đầu, các mốc chính và kết thúc đều được thực hiện bằng cảnh |
| Nhân quả và continuity | Timeline, vật chứng, tri thức, giới hạn cơ thể, quy tắc thế giới |
| Nhân vật | Động cơ, quyết định có giá, thay đổi được xây dựng, nhân vật phụ có chủ thể |
| Cấu trúc và nhịp | Mỗi chương tạo tiến triển; không trì hoãn giả, không kết thúc vội |
| Setup–payoff | Manh mối cũ được nhớ và giải quyết đúng, không deus ex machina |
| Văn phong và đối thoại | Tiếng Việt tự nhiên, điểm nhìn ổn định, giọng riêng, tránh sáo/lặp |
| Hoàn chỉnh toàn truyện | Cao trào, hậu quả và các tuyến chính khép lại thuyết phục |

## Chấm vận hành và công sức

**Narrative memory là gate riêng bắt buộc** theo `NARRATIVE_MEMORY_AUDIT.md`. Tại từng checkpoint: sample recall >=90%, sample precision >=95%, critical recall/provenance accuracy =100%, không có future leak hoặc stale current state. Báo n/N và phạm vi mẫu; không suy ra toàn corpus. Tách LLM execution thật, raw extraction, materialization, context retrieval và kết quả sau correction. World-rule regex/fake/generation call không chứng minh LLM extraction; thiếu trace/record cần thiết → NOT_ASSESSED, không PASS. Gate đến hạn thất bại hoặc chưa được đánh giá thì pipeline functionality không được PASS toàn bộ. Semantic lane disabled không miễn audit structured narrative memory.

Ghi tổng generation, rejected, accepted, retries, provider errors, latency median/p95 nếu đủ mẫu; báo sample count và cách tính. Tokens/chi phí không quan sát được → UNKNOWN. Tách thời gian chờ, thời gian tác giả đọc/sửa và thời gian xử lý lỗi.

Ghi số lượt nhắc lại canon vì hệ thống quên, số chỉnh plan, số sửa tay; số từ tác giả thêm/sửa là ước lượng diff và phải ghi cách tính. Không cộng nhiều lần cùng một đoạn sửa rồi coi là tỷ lệ tác giả trong bản cuối. Nếu không tách attribution được, ghi UNKNOWN thay tỷ lệ giả chính xác.

Không đặt ngưỡng “ít can thiệp” sau run. Báo raw effort trước; chỉ so với baseline hoặc budget đã chốt trước run. Với autonomous, mọi can thiệp nội dung ngoài khởi tạo và quan sát đều làm thay đổi phạm vi claim.

## Review toàn văn

Reviewer đọc manuscript trước khi xem tổng verdict/controller status để giảm thiên kiến; sau đó dùng blueprint, canon và payoff ledger kiểm tra toàn bộ. Có thể chia phiên theo chương, nhưng phải có synthesis toàn truyện và xác nhận đã đọc đủ. Chỉ đọc 10 đoạn mẫu không được ghi full review.

Tách lỗi nguồn seed khỏi lỗi do model thêm; chỉ ra lần xuất hiện đầu tiên. Ghi cả phản ví dụ khi kết luận “nhất quán”. Lỗi quan trọng phải có excerpt ngắn, chapter/revision và yêu cầu sửa có thể kiểm tra lại.

## Mức độ vấn đề

- `S0`: lộ dữ liệu/credential, phá dữ liệu ngoài fixture, sai ownership nghiêm trọng. Dừng nhánh liên quan.
- `S1`: chặn hoàn tất, mất/ghi đè canon, tự kết thúc quá sớm, vi phạm hard gate nội dung.
- `S2`: có workaround nhưng tốn công đáng kể, continuity cục bộ, timeout phục hồi được, UI thiếu làm phải chuyển API.
- `S3`: trình bày, wording hoặc friction nhỏ.

Mỗi issue ghi subsystem, expected/actual, repro, input IDs, observed evidence, workaround, tác động và trạng thái. Lỗi giả lập và lỗi tự nhiên phải tách nhau.

## Kết luận tổng thể

- `COMPLETED_WITH_ACCEPTANCE`: artifact/pipeline/quality trong phạm vi đều PASS, có independent review và không còn S0/S1 chưa xử lý; ghi rõ hybrid hay UI và mức tự động.
- `COMPLETED_PENDING_REVIEW`: đủ artifact nhưng thiếu review độc lập hoặc còn đánh giá chất lượng.
- `COMPLETED_WITH_ISSUES`: có truyện đủ độ dài nhưng chất lượng/vận hành còn lỗi cần sửa.
- `PARTIAL` / `BLOCKED`: thiếu truyện hoàn chỉnh hoặc gặp giới hạn không vượt được.

Full UI PASS chỉ khi thao tác tác giả thực hiện qua UI thật và có trace/readback. P1/P2/P3 probe PASS không đủ cho **P3 mandatory 100k**. P3 HITL 100k không đồng nghĩa fully unattended, và fully unattended cần run/policy độc lập.
