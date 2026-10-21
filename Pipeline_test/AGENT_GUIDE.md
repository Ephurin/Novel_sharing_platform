# Hướng dẫn thực thi cho testing agent

**Workflow revision1.3 — gate bắt buộc:** đọc `WORKFLOW_CONTRACT.md`,
`WORKFLOW_GAP_AUDIT.md`, chạy `SHORT_LOOP_TEST.md` trước bài dài. Các thao tác
snapshot/bootstrap API bên dưới là adapter cho kiểm thử kỹ thuật/hybrid, không
thay bằng chứng tác giả lưu chương rồi tự có extraction. UI gate thiếu phải ghi
BLOCKED; không mặc định dùng hybrid để vượt gate. Giữ evidence và verdict cũ.

Human-review mode đọc thêm `GEMINI_HUMAN_ENTITY_REVIEW_RETEST.md`: optional hints
→ tác giả duyệt entity → event/fact → duyệt canon. P3 phải chờ entity checkpoint,
không auto-approve nó; ghi can thiệp và không báo fully autonomous. P2 UI mặc định
extract setup explicit; blueprint sáng tạo là mode/API riêng, không thay PASS.

## 1. Preflight và định danh lượt chạy

Đọc toàn bộ task và `NARRATIVE_MEMORY_AUDIT.md`. Chạy `verify`; lưu stdout vào `evidence/fixture-check.txt`. Đọc `input/manifest.json` để biết chính xác độ dài seed. Không giả định seed bằng nửa tiểu thuyết.

Tạo run bằng `tools/task_tool.py init`. Điền `run_config.json`: SHA code, fixture version/hash, tài khoản test (chỉ ID), URL, chế độ, model yêu cầu/thực dùng, routing, embedding, cấu hình output, ngân sách đã chấp thuận. Ghi thời gian ISO 8601 có offset. Không tự suy ra model hiện còn dùng được từ báo cáo cũ.

Kiểm tra sức khỏe dịch vụ và quyền AUTHOR; dùng stack/dataset riêng có thể nhận diện bằng run ID. Chỉ đọc cấu hình không chứa bí mật; không dump môi trường. Không tự pull/reset checkout đang có thay đổi. Ghi SHA thực tế và dirty state. Nếu chức năng đã thay đổi, cập nhật bản sao adapter trong run và ghi sai lệch; giữ fixture nguồn bất biến.

Chạy một generation nhỏ với provider thật để xác minh model và chi phí trước khi bắt đầu dài. Không lấy smoke PASS làm kết quả truyện. Mọi bước dùng fake hoặc offline fallback phải ghi đúng và không được tính vào acceptance real-provider.

## 2. Chọn đường kiểm thử

| Chế độ | Vai tác giả | Cách dùng API | Kết luận được phép |
|---|---|---|---|
| AUTHOR_ASSISTED_HYBRID | Đọc, sửa yêu cầu, reject/accept, điều chỉnh plan | Dùng public Node gateway khi UI thiếu, ghi từng gap | Truyện hoàn chỉnh với tác giả hỗ trợ; không suy ra full UI hoặc tự động |
| UI_ONLY | Chỉ dùng giao diện tác giả | Read-only để đối chiếu được phép; không dùng API thay thao tác thiếu | Nếu không có UI nhập idea/plan thì gate tương ứng BLOCKED; không âm thầm đổi chế độ |
| AUTONOMOUS_100K | Agent khởi tạo và quan sát; không biên tập nội dung giữa run | Điều khiển run bằng endpoint hiện có nếu đã khai báo | Chỉ PASS tự động khi tự tạo đủ truyện đạt rubric; assisted rescue là run/chế độ khác |

Mặc định assisted hybrid thực hiện main novel cùng P2/P3 probe riêng. Nếu agent được yêu cầu chạy cả ba chế độ, mỗi chế độ có run ID và project riêng. Không so chất lượng ba chế độ như một thí nghiệm kiểm soát nếu model/config/seed khác nhau.

## 3. Nhập bản thảo và dựng Story Brain — P1

1. Tạo novel riêng mang run ID, không dùng dự án thật của người dùng.
2. Tạo chương 1–5 theo đúng thứ tự, nạp nguyên văn body từ `input/manuscript/chNN.md`; tiêu đề tách khỏi body. Chương 5 là partial, không tự đánh dấu complete. Lưu mọi chapter ID.
3. Tạo snapshot cho mỗi chương qua ứng dụng. Readback revision; so nội dung với nguồn sau quy tắc chuyển đổi editor đã khai báo. Dùng content hash do API trả, không dùng hash file Markdown thay cho hash revision.
4. Lập bootstrap manifest từ 5 revision thật. Kích hoạt import, poll job đến terminal/waiting_review; ghi các proposal và nguồn của chúng.
5. Bắt đầu audit **P1-M0** theo `NARRATIVE_MEMORY_AUDIT.md`: đóng băng expected items từ nguồn, thu bằng chứng call extraction/model, chụp raw proposals **trước sửa tay**; đối chiếu đủ `CANON_AT_START.md`. Review từng nhóm: xác nhận event đã xảy ra; giữ “giọng giống Lâm” và lời kể chuông của Sâm ở trạng thái chưa kiểm chứng thích hợp. Không tự động accept toàn bộ queue.
6. Nếu thiếu fact trọng yếu, dùng chức năng tác giả để sửa/bổ sung và ghi issue extraction + intervention. Nếu không có chức năng phù hợp, ghi gap; không sửa DB.
7. Activate baseline. Readback trạng thái/brain version, kiểm tra context cho chương 5: CV-04 mới một lần quét, Lâm đã chết, Duy điếc tai trái, không có các tiết lộ về 83 người hoặc trách nhiệm Vũ như lịch sử đã xảy ra.
8. Hoàn tất **P1-M0** bằng snapshot persisted narrative memory sau review/activation, delta/provenance và probes context. Đếm đúng/sai/thiếu theo loại; tách raw extraction khỏi correction. Nếu cần đánh giá semantic memory, xác minh worker/build embeddings thật và artifact được tạo. `build_embeddings=false` hoặc không có vector hợp lệ phải ghi NOT_ASSESSED cho semantic lane; structured memory vẫn phải kiểm tra.

## 4. Blueprint và Story Plan — P2

Trên **dự án phụ rỗng**, gửi idea/premise, preferences, constraints qua bootstrap-from-idea; đọc proposal, review, activate, tạo chương đầu và một generation + accept + readback. Đây là P2 smoke thật riêng biệt, không nhập lại idea lên Story Brain của main novel đang có bản thảo. Không cần tạo thêm truyện 100k trên dự án phụ.

Chạy **P2-M0** trước/sau review entities setup (hoặc blueprint khi chọn rõ mode đó), phân biệt author-supplied với model-proposed/author-accepted; không ghi blueprint generation là extraction từ prose. Sau chương đầu accept chạy **P2-M-FIRST** kiểm tra incremental LLM extraction thật và memory/context. Probe ngắn phải có final audit; nếu chạy P2 dài, áp dụng đầy đủ lịch 10/20/50. Ghi riêng P2 plan isolation trên main, không dùng nó thay bằng chứng P2 idea-run memory.

Trên **main novel**, chuyển các dòng chương **5–40** trong `chapter_plan.csv` thành objectives của plan; chương 1–4 đã xong nằm ở ledger tác giả, không được controller viết lại. `target_chapter` phải là số chương thật. Ngày trong CSV là ngày tương đối trong truyện, không phải ngày test. Cột completion_criterion phải được tác giả đọc để đánh giá, không chỉ copy nhãn.

Activate plan qua ứng dụng. So context của chương 5/6: mục tiêu hiện tại được cung cấp ở planning lane, tình tiết chương 17/28/40 không xuất hiện trong historical facts/events. Một mục tiêu tương lai trong planning không tự nó là leak; leak là được khẳng định đã xảy ra hoặc bị nhân vật biết trước vô cớ.

Khi sửa plan, giữ revision/version, ghi lý do và kiểm tra canon cũ không bị viết lại. Với P3, xác minh rule pin plan version trước khi chạy lại; không sửa plan bên dưới một run đang chạy rồi tiếp tục như không có thay đổi.

## 5. Vòng làm việc như tác giả

Trước mỗi cảnh/chương:

- Đọc phần vừa accept, mục tiêu chương, continuity ledger và các payoff đến hạn.
- Tính số từ còn thiếu: `100000 - số_từ_canonical_hiện_tại`. Phân bổ lại cho các chương/cảnh còn lại. Không tạo 40 đoạn ngắn rồi gọi đó là 40 chương đủ tiểu thuyết.
- Lấy revision/content hash và brain version mới nhất. Context phải được sản phẩm xây; không nhét toàn bộ gold ledger vào mọi prompt để che lỗi retrieval. Ghi rõ nếu một lần buộc phải nhắc lại canon và vì sao.
- Gửi yêu cầu một cảnh cụ thể, có mục tiêu và độ dài hợp lý với output limit thật. Nếu hệ thống chỉ sinh được vài trăm từ mỗi lượt, dùng nhiều lượt; ghi số lần, truncation, thời gian và chi phí. Nếu phải đổi cấu hình sản phẩm vượt phạm vi test thì báo blocker, không tự sửa code.

Sau generation:

1. Đọc toàn bộ draft; so người/đồ vật/thời gian/động cơ và mục tiêu. `validation_status=passed` chỉ là một tín hiệu kỹ thuật.
2. Chọn reject, yêu cầu sửa, hoặc accept. Ghi lý do và số lần. Văn tác giả tự viết qua editor phải được định lượng trong `interventions.csv`.
3. Sau accept, đọc revision thật, xác minh chỉ thêm/sửa đúng vùng. Kiểm tra outbox và review queue qua chức năng có sẵn/read-only diagnostics; đợi xử lý xong trong timeout cấu hình. Duyệt proposal từ revision đúng, không nuốt queue của dự án khác.
4. Context lượt tiếp phải phản ánh phần vừa accept. Khi pipeline lỗi, giữ bằng chứng trước khi thử lại; không retry accept một cách mù quáng.
5. Chỉ tác giả/reviewer đánh dấu chương đạt nội dung khi đọc đủ. Nếu controller đã completed nhưng mới một đoạn thì ghi `PREMATURE_OBJECTIVE_COMPLETION`; không xóa dấu vết.
6. Sau accepted revision mới đầu tiên chạy **M-FIRST**. Sau mỗi chương ghi checkpoint và bản readback. Sau mỗi 5 chương kiểm tra hồi quy continuity dài hạn và độ dài tích lũy. Sau mỗi 10 chương chạy memory audit bắt buộc; bội số 20/50 mở rộng kiểm tra thông tin xa và thay đổi state theo `NARRATIVE_MEMORY_AUDIT.md`. Chương 10/20/30/40 vẫn có review văn học toàn phần đã viết; review này không thay audit extraction.

## 6. Các tình huống kiểm thử bắt buộc

| ID | Thao tác | Bất biến / bằng chứng | Nơi chạy |
|---|---|---|---|
| T01 | Import 5 chương + review | Nguồn revision đúng, C01–C15 đối chiếu, future canon không được bịa | Main |
| T02 | Reject một draft hợp lệ về kỹ thuật nhưng chưa đạt mục tiêu | Không đổi canonical revision/brain chỉ vì reject | Main |
| T03 | Accept rồi gửi lại đúng generation | Trả revision cũ, không duplicate revision/outbox | Probe riêng hoặc main trước khi viết tiếp |
| T04 | Tạo draft rồi sửa tay snapshot trước accept | Stale draft bị từ chối; không mất sửa của tác giả | Probe |
| T05 | Reload/đăng nhập lại sau accept | Readback đúng nội dung; không mất chương hay drift revision | Main |
| T06 | Hai scene objectives cùng một chương qua P3 | Objective thứ hai phải tạo tiến triển nội dung riêng; không tái dùng nhầm accepted draft | Probe |
| T07 | Generation dài/provider chậm; quan sát retry lỗi tự nhiên | Không accept rỗng, không giả completed; ghi latency, timeout và phục hồi | Probe/main; không cố đốt quota gây 429 |
| T08 | Dừng run rồi yêu cầu step | Không có generation/canonical mutation mới sau stop | Probe |
| T09 | Resume từ checkpoint sau gián đoạn có kiểm soát | Không duplicate acceptance; đọc lại trạng thái server trước action | Main; không kill dịch vụ dùng chung |
| T10 | Idea → review → brain → first chapter → accept | P2 thật không bị thay bởi manuscript bootstrap | Project phụ |
| T11 | Create/activate/edit plan, context chương sớm | Tương lai không thành historical canon; version đổi có trace | Probe hoặc main khi tác giả cần |
| T12 | P3 nhiều objective đến terminal | Trạng thái, nội dung thực, stop reason và mức can thiệp được ghi riêng | Project phụ |
| T13 | Review toàn truyện và xuất từ revision | 95–105k từ; mở lại đủ chương, ending/payoff đạt | Main cuối run |
| T14 | M0 và M-FIRST riêng P1/P2/P3 | Trace LLM đúng nguồn, raw proposals trước correction, persisted memory/provenance và context đối chiếu | Mỗi project/pipeline tương ứng |
| T15 | Narrative memory mỗi 10 chương; audit sâu 20/50; final | Recall/precision mẫu, critical memory, state/relationship, future leak và retrieval dài hạn có evidence | Mỗi run dài; probe ngắn ghi phạm vi không đạt |

Nếu không chạy một tình huống, ghi NOT_RUN và lý do; không suy từ test cũ. Không dùng `force_gate_failure` thay bằng chứng model thật hay gọi một lỗi cố ý là lỗi provider thật. Fault injection nếu có phải được gắn nhãn riêng.

## 7. Probe P3 và ranh giới tự động

Tạo project probe mới từ cùng seed qua đường public. Plan gồm hai mục tiêu cảnh trong chương 5 và một mục tiêu kết thúc probe ở chương 6. `ending` ở đây chỉ kết thúc probe, không phải kết thúc tiểu thuyết. Theo dõi draft mới, revision, brain version, retry/stop và resume. Không đưa các chương probe vào bản truyện chính.

Chạy **P3-M0** trên baseline kế thừa trước controller, **P3-M-FIRST** sau lần accept đầu và final sau probe. Thu raw proposals/trace trước auto-accept nếu quan sát được qua history; thiếu evidence phải ghi OBSERVABILITY_GAP, không lấy memory đã sửa làm điểm extractor. Autonomous long run áp dụng cùng lịch 10/20/50; quan sát giữa các step không phải sửa nội dung. Sửa memory tay phải ghi intervention và không được giữ claim tự động không can thiệp.

Trong `AUTONOMOUS_100K`, không can thiệp giữa chừng để chữa văn mà vẫn báo autonomous PASS. Nếu controller tạo rất ít từ rồi completed, lưu bản đó, báo FAIL mục tiêu độ dài/nội dung. Có thể đề xuất assisted run khác, không ghi đè kết quả thất bại. Giới hạn API mỗi run/step không phải tiêu chí văn học; nếu sản phẩm thiếu scheduler/continuation cần thiết, ghi rõ hạn chế.

## 8. Checkpoint, ngân sách và resume

Sau mỗi acceptance ghi `checkpoint.json`: chapter/revision/generation/plan/run IDs, brain version, objective, số từ readback, pending jobs, thao tác tiếp theo, ngân sách đã dùng và còn lại. `checkpoint.json` là chỉ dẫn, server là nguồn sự thật.

Trong `checkpoint.json.memory_audit`, lưu các mốc đã xong theo pipeline, mốc kế tiếp và audit đang pending. Resume phải hoàn tất audit đến hạn trước generation tiếp theo. Dự toán ngân sách bao gồm audit/probes; hết ngân sách audit phải ghi thiếu coverage, không bỏ qua gate âm thầm.

Khi tiếp tục: kiểm tra fixture hash/SHA, đọc checkpoint, GET trạng thái job và revision đang chờ; chỉ retry nếu chưa có bằng chứng commit. Dùng lại idempotency key cho cùng yêu cầu bị gián đoạn, tạo key mới khi nội dung yêu cầu khác. Ghi mọi recovery vào action log.

Ngừng gọi model khi đạt một trong các trần đã chốt. Ghi `BUDGET_EXHAUSTED` hoặc `TIME_LIMIT`, số từ/chương còn thiếu; không giảm tiêu chí pass. Nếu tiền/token không quan sát được, ghi UNKNOWN và dùng trần call/thời gian quan sát được đã thỏa thuận. Không điền chi phí 0 khi thực tế không có dữ liệu.

## 9. Đóng run

Xuất nội dung từ từng canonical revision thành UTF-8 `final/chapters/chNN.md`, chỉ title + body; không thêm summary/report vào file truyện. `final/novel.md` ghép đúng các file đó. `revision_manifest.csv` ghi hash body/API và hash file riêng. Kiểm tra readback trước và sau reload.

Chạy count; lưu JSON output vào `evidence/final-word-count.json`. Count PASS về độ dài không chứng minh canonical provenance, chất lượng hoặc 40 chương đầy đủ. Điền chapter_reviews, continuity/payoff ledger mới, issue log và REPORT. Reviewer đọc toàn bộ, không chỉ snippets.

Chạy **M-FINAL** cho từng pipeline đã thực thi, tổng hợp `memory_checkpoints.csv` và các audit report. Nêu rõ mốc 50 NOT_APPLICABLE cho plan 40 chương hoặc NOT_RUN nếu plan >=50 nhưng dừng sớm. Không tuyên bố extraction hoạt động chỉ từ job completed, câu trả lời hợp lý hoặc brain_version tăng.

Các lỗi có thể workaround vẫn phải ghi cùng tác động. Chỉ đánh dấu overall đạt khi điều kiện trong EVALUATION được đáp ứng; nếu reviewer độc lập chưa có thì quality acceptance vẫn pending. Không tự xóa dự án test để giữ evidence có thể truy vết; chỉ cleanup khi có yêu cầu riêng.
