# AI pipeline — source of truth, revision 1.3, 2026-10-20

Đây là **tài liệu chuẩn mô tả hành vi đã thống nhất của ba use case P1/P2/P3**.
Nguồn: `../promt_.md`, các xác nhận trong hội thoại và quyết định bổ sung human
in the loop ngày2026-10-20. Khi hướng dẫn test hoặc tài liệu thiết kế cũ khác tài
liệu này, áp dụng contract này; không sửa hồi tố báo cáo/evidence cũ.

## Phạm vi và thứ tự tham chiếu

1. **Contract này:** hành vi sản phẩm và quy tắc review phải kiểm thử.
2. `architecture/AI_PIPELINE_MAP.md` và bản HTML: đối chiếu từng bước với code,
   vấn đề và evidence; không thay contract hoặc chứng minh tính năng đã PASS.
3. `SHORT_LOOP_TEST.md`, `NARRATIVE_MEMORY_AUDIT.md`, `TASK.md`, `AGENT_GUIDE.md`:
   cách kiểm thử và nghiệm thu. Retest human review đọc thêm
   `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`.
4. `runs/*/REPORT.md`: kết quả của đúng phiên bản/môi trường đã chạy, không phải
   yêu cầu sản phẩm. `../ai-service/docs/USE_CASES.md` giữ phần thiết kế lịch sử;
   các mã UC cũ không đồng nghĩa với mã P1/P2/P3.

## Trạng thái triển khai, không phải verdict nghiệm thu

Luồng human review đã có code và offline regression dưới cờ
`ENTITY_CANDIDATE_VERIFICATION_ENABLED=true`, mặc định **false**. Cần migration
head `0012_entity_guidance` và build đồng bộ AI/backend/web trên stack test mới.
Pipeline revision mới: `entity-human-review-v1`; collector policy:
`entity-candidates-v1`. Flag OFF vẫn dùng đường legacy, không được báo là đã test
luồng human review. Chưa có live UI/provider PASS cho luồng mới; xem
`runs/2026-10-20-human-entity-review/REPORT.md`.

## Bước chung — entity trước, event/fact sau

1. **Danh sách tăng cường tùy chọn:** tác giả nhập tên cần chú ý; type, aliases và
   notes có thể bổ sung. Hint là chỉ dẫn tìm kiếm, không phải canon hoặc chứng cứ
   entity đã xuất hiện. Tên không có trong nguồn không tạo mention/event/fact.
2. **Khai báo entity trực tiếp:** tác giả xác nhận tên và loại của một identity
   trong thế giới truyện, kể cả chưa xuất hiện trong prose. Tạo proposal riêng
   `source_type=author_declaration`, status Unknown, không gắn quote/chapter occurrence
   giả. Duyệt proposal mới thành canon. Tên đã tồn tại không bị tự overwrite/merge.
3. **Lọc và xác minh:** đọc immutable revision và kiểm hash; gom occurrences từ
   registry, aliases, hints, patterns và LLM discovery. Discovery entity chia đoạn
   có overlap/absolute offsets; event/fact hiện vẫn đọc toàn chương. LLM quyết định
   từng occurrence: entity/not_entity/unresolved, kèm type/identity/bằng chứng.
4. **Tác giả duyệt entity:** dừng tại `waiting_entity_review`, hiển thị danh sách
   nhóm theo tên/identity/verdict, số lần xuất hiện và context/offsets; có thể kiểm
   tra riêng từng occurrence. Cho phép giữ/loại/chỉnh type/tên chuẩn/alias có chứng
   cứ. Không bắt hàng trăm lượt click theo occurrence; unresolved vẫn phải được
   tác giả giải quyết hoặc loại. Chưa chạy event/fact hay lưu group downstream dở.
5. **Bổ sung tên thiếu:** lưu quyết định entity, thêm vào danh sách tăng cường rồi
   chạy lại riêng entity stage. Giữ quyết định tác giả khi occurrence context và
   machine decision còn khớp; candidate mới/đổi phải được kiểm tra. Không chạy lại
   event/fact chỉ vì vừa bổ sung hints. Edits chưa bấm lưu không phải checkpoint bền.
6. **Freeze và tiếp tục:** toàn bộ decisions hợp lệ mới thành `entities_reviewed`.
   Chốt source/hash, tenant/novel, policy, guidance/review version và inventory.
   Continue trên checkpoint hợp lệ không gọi lại entity LLM. Checkpoint cũ hoặc
   guidance version đổi phải được reload/rerun; gateway chặn nguồn không còn latest.
7. **Extract event/fact/state:** chỉ dùng inventory đã duyệt. Identity ngoài
   inventory quay về entity review; tên không có occurrence trong nguồn báo lỗi,
   không tự tạo hoặc ép vào entity gần nhất. Alias/normalization là đề xuất có
   chứng cứ, không âm thầm gộp identity đã xác nhận.
8. **Duyệt canon:** duyệt entity là chốt inventory cho extraction, chưa cập nhật
   official memory. Event/fact và entity/alias proposals sau đó vẫn phải qua quyết
   định canon theo mode. UI phân biệt hints, checkpoint, proposals và dữ liệu đã
   duyệt. Đọc lại memory/context sau materialization và reload.

Guidance/checkpoint nằm ngoài approved memory/context. PostgreSQL bulk-load
entity/alias registry, không query từng tên hay tải toàn bộ facts/events chỉ để
lọc entity. Version guard và provenance bắt buộc; không đồng nghĩa đã stress-test
multi-worker hoặc chứng minh đầy đủ entity recall.

## P1 — Có bản thảo/truyện đang viết

**Đầu vào:** chương đã lưu nháp hoặc đã xuất bản; tác giả chủ động chọn trích xuất
ban đầu. Có thể chuẩn bị danh sách tăng cường trước khi import/extract.

```text
Bản thảo → revisions/hash → entity discovery/verification
→ tác giả duyệt entity → event/fact/state proposals
→ tác giả sửa/loại/duyệt canon → audit M0 → activate baseline
→ viết tiếp/lưu → tự extraction revision mới → lặp bước review → memory/context
```

Bootstrap nhiều chương dừng đúng chương chờ entity review; resume không phân tích
lại chương đã xong hoặc đếm lặp scene. Lần lưu mới sau baseline tự kích hoạt
extraction; không yêu cầu snapshot thủ công hay accept văn AI để một lần lưu được
phân tích. Debounce/gộp việc được phép, nhưng không áp kết quả revision cũ âm thầm.
Phân biệt facts được xác nhận, lời đồn, phủ định, suy đoán và giới hạn tri thức.

## P2 — Bắt đầu từ ý tưởng/thiết lập

**Đầu vào:** ô setup riêng và constraints tác giả cung cấp; outline tương lai giữ
riêng. Danh sách tăng cường hỗ trợ tìm tên, không cho phép sáng tạo thêm sự thật.

```text
Setup + optional hints → extract nhân vật/địa danh explicit
→ tác giả sửa/loại/duyệt entities setup → baseline → audit M0
→ định hướng/kế hoạch → viết và accept/lưu chương đầu
→ entity gate của revision → event/fact proposals → canon → audit M-FIRST
→ tiếp tục cùng vòng viết của P1
```

Luồng UI hiện tại là `mode=extract`: chỉ nhân vật/địa danh có trong setup, không
biến future outline thành lịch sử hoặc tự thêm premise/rules thành canon. Các
trường thiết lập khác phải giữ riêng. API `mode=blueprint` là nhánh sáng tạo riêng,
phải ghi rõ model_proposed/author_accepted; không lấy kết quả nhánh đó thay PASS
setup extraction. P2 setup có review entity proposals riêng, không được mô tả là
đã chạy chunk discovery/checkpoint của chapter revision.

## P3 — Controller tự động điều phối vòng sáng tác

**Đầu vào:** baseline đã duyệt từ P1/P2, có hoặc không có định hướng. Định hướng
là khuyến cáo; khi thiếu phải có cách tạo kế hoạch, không ép tác giả tự điền trước.

```text
Baseline + plan → chọn objective → build context → generate/validate
→ accept/lưu NHÁP → analysis revision → human entity gate (khi flag ON)
→ tác giả duyệt entity và continue → event/fact proposals
→ controller duyệt canon đúng revision → đánh giá objective/kết thúc
→ viết thêm hoặc advance/stop
```

**Human-review mode:** P3 phải dừng `waiting_for_entity_review`, không auto-approve
entity checkpoint, không advance objective hoặc tăng generation retry để né gate.
Sau human review + continue downstream, controller mới được duyệt canon và tiếp
tục từ revision đã accept, không viết lại/chèn trùng. Outbox `COMPLETED` có thể chỉ
là giao việc thành công, không chứng minh event/fact analysis đã hoàn tất.

Vì có can thiệp bắt buộc, run này phải ghi **P3 có human entity review**, không
được gọi là fully autonomous/no-intervention PASS. Khi flag OFF, cơ chế auto-review
legacy là kết quả riêng; contract này chưa bổ sung policy tự thay human entity
review trong mode mới. Controller chỉ lưu nháp, không có quyền tự xuất bản.

## Quy tắc viết, kế hoạch và hoàn thành

- Gợi ý sự kiện dựa trên approved memory. Tác giả được sửa/thêm/bớt/chọn rồi lưu
  plan; planned event chưa là event đã xảy ra. Chỉ prose có chứng cứ mới xác lập.
- Văn AI đi qua preview/edit/accept/reject và kiểm validation; tác giả cũng có thể
  tự viết/lưu. Consistency findings phải cho xem nguồn và quyết định, không tự sửa
  lịch sử để che mâu thuẫn trong chương mới.
- Hoàn thành dựa trên nội dung, cốt truyện/kết thúc và tiêu chí khai báo; không chỉ
  job thành công, đủ chữ hoặc hết objectives. Bài dài yêu cầu95–105k từ thực đọc
  lại từ sản phẩm; đây không phải yêu cầu cho mọi lần dùng copilot.

## Cách chứng minh

Tách SOURCE_CODE, AUTOMATED_TEST, LIVE_UI và LIVE_API. Có endpoint hoặc test giả
lập không chứng minh hành trình UI/provider thật. API chẩn đoán không thay bước
UI còn thiếu thành PASS. Lưu raw LLM decisions trước sửa và author decisions sau
review riêng; đo recall/precision/false merge và mức can thiệp, không chỉ counts.

Chạy `SHORT_LOOP_TEST.md` trước bài dài. Audit memory riêng P1/P2/P3 tại M0,
M-FIRST, mỗi10 chương, sâu ở20/50 và final theo `NARRATIVE_MEMORY_AUDIT.md`.
Chưa đạt mốc phải ghi NOT_RUN hoặc NOT_APPLICABLE theo kế hoạch, không mượn coverage
của pipeline khác.35 gold narrative assertions không phải35 entities. Không sửa
hồi tố gold, evidence, verdict hoặc tự mở bài100k khi gate chưa đạt.
