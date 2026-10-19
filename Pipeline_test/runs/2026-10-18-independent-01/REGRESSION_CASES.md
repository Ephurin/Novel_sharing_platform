# Bộ Kịch bản Kiểm thử Hồi quy (Regression Test Cases) — Story Brain & Narrative Memory

- **Run ID:** `2026-10-18-independent-01`
- **Mục tiêu:** Cung cấp tài liệu kịch bản kiểm thử hồi quy chi tiết cho đội ngũ kỹ thuật sửa lỗi tầng trích xuất và đóng gói bộ nhớ (`MEM-DUPLICATE-001`, `MEM-CRITICAL-001`, `CTX-COVERAGE-001`).
- **Nguyên tắc phân định:** Tách bạch rõ **tiêu chí nghiệm thu (Acceptance Criteria / WHAT)** khỏi **phương án thiết kế chưa thống nhất (Implementation Architecture / HOW)**. Không ép buộc một giải pháp kỹ thuật cụ thể (như phân bổ % token cứng hay bộ khóa composite cụ thể).
- **Quy tắc kiểm thử:** Mọi kịch bản phải xác minh qua giao diện tác giả (UI) và đối chiếu bằng chứng chỉ đọc tại cơ sở dữ liệu Postgres (`narrative.*`), hàng đợi outbox (`public.revision_outbox_events`), và API context preview.

---

## Danh mục Ca Kiểm thử Hồi quy

| Mã ca | Tên kịch bản | Vấn đề / Lỗi đối ứng | Mục tiêu kiểm thử |
|---|---|---|---|
| **REG-01** | Lưu lại chương không đổi nội dung | `MEM-DUPLICATE-001` | Không sinh revision mới vô nghĩa, không sinh proposal trùng, không tăng `brain_version` |
| **REG-02** | Thêm cảnh mới vào chương | `MEM-DUPLICATE-001` | Phần cũ không bị materialize thêm lần nữa; cảnh mới được ghi nhận; sửa/bỏ nội dung cũ được xử lý đúng (cho phép extractor phân tích lại toàn chương) |
| **REG-03** | Chỉnh sửa một sự kiện hoặc dữ kiện | `MEM-PROVENANCE-001` | Cập nhật canon hiện hành, ghi nhận supersession/transition, bảo toàn provenance nguồn |
| **REG-04** | Hai revision xử lý chồng nhau | `STALE-REVISION` | Kết quả từ revision cũ không thể âm thầm ghi vào canon hiện hành (chặn duyệt, cảnh báo, đánh dấu stale hoặc cơ chế tương đương có bằng chứng) |
| **REG-05** | Giữ dữ kiện thiết yếu trong Context (4k / 8k) | `CTX-COVERAGE-001` | Ở ngân sách 4.000/8.192 token, context phải giữ được dữ kiện thiết yếu cho truy vấn và cutoff đã khai báo; ghi IDs được chọn/bị loại; chấm bằng frozen probes |
| **REG-06** | Phân biệt sự kiện lặp lại thật vs trích xuất trùng | `SEMANTIC_DEDUP` | Cùng sự việc trích xuất lại không tạo canon trùng; thay đổi thật phải cập nhật đúng; hành động tương tự ở thời điểm khác vẫn giữ riêng (kiểm tra provenance, thời điểm, supersession) |

---

### Kịch bản REG-01: Lưu lại chương không đổi nội dung

- **Mục tiêu:** Khi tác giả mở một chương đã kích hoạt baseline và bấm Save (hoặc để autosave chạy) mà không thay đổi nội dung (hoặc chỉ đổi khoảng trắng không đáng kể), hệ thống không được kích hoạt trích xuất lại hay làm ô nhiễm bộ nhớ.
- **Tiền điều kiện:** 
  - Novel ID: `46642ff1-5bac-4513-98fd-ffe1be6cb318`.
  - Chương 1 đã lưu với revision `6212307d-fb36-43f7-8e6e-d42dac617ae5` (1.265 từ).
  - Story Brain ở trạng thái `active`.
- **Các bước thực hiện:**
  1. Mở giao diện Author IDE tại Chương 1.
  2. Focus vào editor textarea, nhấn phím mũi tên hoặc click chuột không thay đổi text.
  3. Bấm tổ hợp `Ctrl + S` hoặc đợi trigger autosave.
  4. Kiểm tra phản hồi trên UI (hiển thị trạng thái "Đã lưu").
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **SQL Check 1:** `SELECT count(*) FROM chapter_revisions WHERE chapter_id = '940bbdee-fa51-4bb7-8996-4aca4a3dc505'` không tăng thêm bản ghi nào mới.
  - **SQL Check 2:** Không có event mới trong `revision_outbox_events` với `event_type = 'INCREMENTAL_ANALYSIS'`.
  - **SQL Check 3:** Số lượng proposals trong `narrative.proposals` giữ nguyên, không có proposal nào mới sinh.
  - **Story Brain Check:** `brain_version` giữ nguyên, số lượng thực thể, sự kiện, dữ kiện không đổi.

---

### Kịch bản REG-02: Thêm cảnh mới vào chương (Cho phép phân tích lại toàn chương)

- **Mục tiêu:** Khi tác giả viết thêm một cảnh văn xuôi mới vào cuối chương đã có baseline, hệ thống ghi nhận đầy đủ các thông tin của cảnh mới, đồng thời bảo đảm các phần nội dung cũ không bị materialize thêm lần nữa vào canon.
- **Phạm vi kỹ thuật:** Hệ thống trích xuất (extractor) được phép phân tích vi sai (incremental delta) hoặc phân tích lại toàn bộ chương (full chapter re-analysis). Phương thức xử lý trích xuất không bị giới hạn cứng, miễn là thỏa mãn tiêu chí nghiệm thu về bộ nhớ canon bên dưới.
- **Tiền điều kiện:**
  - Chương 1 đã có sẵn các sự kiện canon: An đón Linh, gặp Hòa, ký hợp đồng.
  - Baseline M0 active.
- **Các bước thực hiện:**
  1. Mở Chương 1 trong Author IDE.
  2. Cuộn xuống cuối văn bản, gõ thêm một đoạn cảnh mới:
     > *"Tối hôm đó, Mai Linh đi bộ dọc bờ kè đá và nhặt được một chiếc vỏ ốc xoắn màu tím tro do thủy triều đánh dạt lên bãi cát."*
  3. Đợi autosave lưu thành revision mới (ví dụ `rev_new_scene`).
  4. Đợi outbox worker xử lý phân tích hoàn tất (`status: COMPLETED`).
  5. Mở Drawer Bộ nhớ trên UI xem danh sách đề xuất trong hàng đợi duyệt.
  6. Thực hiện duyệt đề xuất.
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **Ghi nhận cảnh mới:** Cảnh mới được phát hiện và trích xuất đầy đủ các thực thể/sự việc mới (ví dụ: `chiếc vỏ ốc xoắn màu tím tro`, `bờ kè đá`, `Mai Linh nhặt được vỏ ốc xoắn tại bờ kè đá`).
  - **Không materialize trùng lặp phần cũ:** Sau khi hoàn tất quy trình lưu và duyệt, các sự kiện và dữ kiện cũ đã có trong canon (An đón Linh, Linh gặp Hòa, Hợp đồng 12 ngày, Mai Lâm đã chết, An 19 tuổi) **tuyệt đối không bị chèn thêm bản ghi mới (không nhân đôi)** trong `narrative.events` và `narrative.facts`.
  - **Xử lý sửa đổi / loại bỏ:** Nếu trong lần sửa này tác giả có chỉnh sửa hoặc xóa bỏ chi tiết cũ, hệ thống phải xử lý đúng (ghi nhận supersession hoặc cập nhật giá trị hiện hành), không để tồn tại song song hai trạng thái mâu thuẫn.

---

### Kịch bản REG-03: Sửa một sự kiện cập nhật canon hiện hành và giữ provenance

- **Mục tiêu:** Khi tác giả chỉnh sửa văn bản để thay đổi một chi tiết cốt truyện đã lưu trong canon (ví dụ: thời hạn hợp đồng từ 12 ngày thành 15 ngày), Story Brain phải cập nhật dữ kiện hiện hành sang giá trị mới, đồng thời lưu vết chuyển trạng thái liên kết tới revision mới và không làm mất provenance lịch sử.
- **Tiền điều kiện:**
  - Dữ kiện canon hiện hành: thời hạn hợp đồng = 12 ngày.
- **Các bước thực hiện:**
  1. Trong Author IDE, tìm câu văn: *"Ông Hòa đặt lên bàn bản hợp đồng mười hai ngày."*
  2. Chỉnh sửa thành: *"Ông Hòa đặt lên bàn bản hợp đồng mười lăm ngày do Ban công trình mới gia hạn."*
  3. Đợi hệ thống lưu revision mới và chạy outbox analysis.
  4. Mở hàng đợi duyệt trên UI, kiểm tra proposal.
  5. Duyệt proposal sửa đổi qua UI.
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **Proposal:** Sinh proposal cập nhật dữ kiện sang giá trị mới (15 ngày).
  - **Cập nhật Canon Hiện hành:** Dữ kiện hiện hành trong Story Brain được cập nhật sang giá trị 15 ngày.
  - **Bảo toàn Provenance:** Dữ kiện mới trỏ đúng vào quote trích dẫn mới và revision ID mới.
  - **Lưu vết Supersession:** Bản ghi lịch sử cũ (12 ngày) được lưu vết thay thế (superseded) hoặc ghi nhận chuyển trạng thái, bảo toàn tính toàn vẹn và nguồn gốc lịch sử.

---

### Kịch bản REG-04: Hai revision xử lý chồng nhau (Stale Revision Handling)

- **Mục tiêu:** Đảm bảo khi tác giả thực hiện hai lần chỉnh sửa liên tiếp tạo ra hai revision (R1 và R2) được gửi phân tích nền, nếu kết quả của R1 trả về sau R2 (hoặc cả hai cùng chạy song song), hệ thống không cho phép các kết quả từ revision cũ (R1) âm thầm ghi vào bộ nhớ canon hiện hành.
- **Phạm vi kỹ thuật:** Không bắt buộc proposal cũ phải tự động đổi trạng thái trong database; chấp nhận bất kỳ cơ chế kiểm soát nào có bằng chứng thực tế: chặn duyệt trên UI, cảnh báo revision lỗi thời, đánh dấu stale, hoặc cơ chế tương đương.
- **Tiền điều kiện:**
  - AI Service và Outbox Worker đang chạy.
- **Các bước thực hiện:**
  1. Tác giả gõ nội dung sửa A và kích hoạt lưu revision R1.
  2. Ngay lập tức (trong vòng 500ms), tác giả thay đổi lại thành nội dung B và kích hoạt lưu revision R2.
  3. Theo dõi tiến trình phân tích R1 và R2 trong hàng đợi xử lý.
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **Không ghi đè âm thầm:** Kết quả từ revision cũ R1 không thể âm thầm ghi vào bộ nhớ canon hiện hành của R2.
  - **Cơ chế thực tế có bằng chứng:** Hệ thống phải thể hiện rõ một trong các cơ chế kiểm soát sau:
    - Chặn tác giả duyệt các đề xuất thuộc về revision đã cũ.
    - Hiển thị cảnh báo rõ ràng trên UI về đề xuất đã lỗi thời / superseded.
    - Đánh dấu đề xuất là stale / obsolete trong hàng đợi.
    - Tự động hủy tiến trình phân tích R1 khi R2 xuất hiện.
  - **Tính toàn vẹn canon:** Canon của Story Brain luôn phản ánh trạng thái bắt nguồn từ bản thảo hợp lệ mới nhất.
  - **Không Deadlock / 500:** Các tiến trình phân tích nền hoàn tất mà không gây xung đột khóa hay lỗi 500.

---

### Kịch bản REG-05: Bảo toàn dữ kiện thiết yếu trong Context Preview (4k / 8k)

- **Mục tiêu:** Đảm bảo giải quyết lỗi `CTX-COVERAGE-001`, ở các mức ngân sách 4.000 và 8.192 tokens, gói ngữ cảnh (context preview) phải giữ được các dữ kiện và sự kiện thiết yếu theo đúng truy vấn và chapter cutoff đã khai báo, không để hiện tượng một nhóm dữ liệu nuốt trọn toàn bộ ngân sách và bỏ rơi toàn bộ lịch sử hay quy tắc cốt truyện.
- **Tiêu chuẩn đánh giá:** Đánh giá bằng **các probe kiểm thử có đáp án đóng băng (frozen-gold probes)**, **KHÔNG áp đặt tỷ lệ phần trăm phân bổ token tùy ý** (như cứng 30% event / 30% fact).
- **Tiền điều kiện:**
  - Story Brain của tác phẩm đã duyệt đầy đủ các chương 1–5.
- **Các bước thực hiện:**
  1. Gửi request read-only: `GET /v1/story-brains/{brain_id}/context-preview?chapter_number=5&token_budget=4000&character_name=Linh`.
  2. Gửi request read-only: `GET /v1/story-brains/{brain_id}/context-preview?chapter_number=5&token_budget=8192&character_name=Linh`.
  3. Đọc payload JSON trả về và phân tích các mảng dữ liệu.
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **Bảo toàn dữ kiện thiết yếu:**
    - Ở cả hai mức ngân sách 4.000 và 8.192 tokens, context preview cho truy vấn nhân vật `Linh` tại cutoff `chapter 5` phải chứa các sự kiện và dữ kiện cốt lõi liên quan tới Linh và bối cảnh (như sự kiện trở về, hợp đồng thẩm định, hoặc dữ kiện trận lũ / cha Mai Lâm).
    - Khắc phục hiện tượng context preview 4k hoàn toàn không chứa sự kiện hay dữ kiện nào như đã đo trong ca kiểm thử trước.
  - **Minh bạch IDs được chọn và bị loại:**
    - Trả về rõ ràng danh sách các ID được đóng gói (`packed_ids`) và danh sách các ID bị loại bỏ (`dropped_ids`).
    - Ghi nhận nguyên nhân bị loại (ví dụ: vượt quá ngân sách token, điểm liên quan thấp hơn, dữ kiện đã bị thay thế).
  - **Kiểm chứng qua Frozen Probes:**
    - Các probe kiểm thử (tương ứng PROBE-03 và PROBE-04) phải đạt tiêu chí PASS dựa trên sự hiện diện của các khẳng định vàng tương ứng.

---

### Kịch bản REG-06: Chống trùng lặp canon & Phân biệt sự kiện lặp lại thật

- **Mục tiêu:** Đảm bảo hệ thống giải quyết lỗi `MEM-DUPLICATE-001` bằng cách phân biệt rõ hai trường hợp:
  1. **Trích xuất trùng (Extraction Duplicate - LỖI):** Cùng một sự việc xảy ra ở Chương 1 được phân tích lại, không được tạo thêm bản ghi trùng lặp trong canon.
  2. **Hành động lặp lại thật trong truyện (Narrative Recurrence - HỢP LỆ):** Nhân vật lặp lại một hành động tương tự ở mốc thời gian hoặc bối cảnh khác, phải được ghi nhận là sự kiện riêng biệt.
- **Tiêu chuẩn đánh giá:** Không quy định cứng một bộ khóa composite cụ thể. Đánh giá dựa trên kết quả: cùng sự việc trích xuất lại không tạo canon trùng; thay đổi thật phải cập nhật đúng; hai hành động tương tự xảy ra ở thời điểm khác vẫn được giữ riêng. Kiểm tra đối chiếu qua provenance, thời điểm và cơ chế supersession.
- **Tiền điều kiện:**
  - Đã có sự kiện canon: *"An đón Mai Linh tại bến phà khi vừa trở về"* (Chương 1).
- **Các bước thực hiện:**
  1. **Thử nghiệm 1 (Trích xuất lại cùng sự việc):** Lưu và phân tích lại nội dung Chương 1. Kiểm tra proposal và dữ liệu sau khi duyệt.
  2. **Thử nghiệm 2 (Hành động lặp lại ở thời điểm khác):** Viết tiếp Chương 6:
     > *"Sáng hôm sau, An lại gặp Mai Linh tại trạm bơm số Hai. Cậu đưa cho cô một gói cơm nắm bọc lá chuối."*
     Đợi phân tích và duyệt đề xuất.
- **Kỳ vọng nghiệm thu (Expected / Assertions):**
  - **Thử nghiệm 1 (Không nhân đôi):**
    - Cùng sự việc đón Linh tại bến hoặc ký hợp đồng khi phân tích lại không sinh thêm bản ghi sự kiện/dữ kiện mới trong `narrative.events` và `narrative.facts`.
    - Số lượng bản ghi canon của các sự việc này giữ nguyên là 1.
  - **Thử nghiệm 2 (Giữ riêng sự việc khác thời điểm):**
    - Sự việc sáng hôm sau tại trạm bơm được công nhận là sự kiện mới, có narrative_order mới, provenance nguồn gắn với Chương 6, và cùng tồn tại độc lập với sự kiện ở Chương 1.
  - **Xác minh Provenance & Supersession:**
    - Mọi bản ghi canon đều duy trì chính xác nguồn trích dẫn và liên kết revision. Nếu có thay đổi trạng thái canon, cơ chế supersession ghi nhận đúng dòng thời gian.

