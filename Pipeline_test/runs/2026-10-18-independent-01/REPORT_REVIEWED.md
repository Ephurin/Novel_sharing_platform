# Báo cáo Đánh giá Lại (Audited Review) — Pipeline Test 2026-10-18-independent-01

- **Run ID:** `2026-10-18-independent-01`
- **Tác phẩm (Main Novel ID):** `46642ff1-5bac-4513-98fd-ffe1be6cb318`
- **Tác giả / Tài khoản:** `reader02` (`reader02@example.com`, ID: `9c595f00-050d-4d2d-9f38-ce4d577a00c6`, role: `ADMIN`)
- **Thời gian đánh giá:** `2026-10-19T13:10:00+07:00`
- **Văn bản chuẩn tham chiếu:** `AUDIT_REVIEW.md`, `NARRATIVE_MEMORY_AUDIT.md`, `SHORT_LOOP_TEST.md`, `WORKFLOW_CONTRACT.md`
- **Báo cáo gốc:** Giữ nguyên [REPORT.md](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/REPORT.md) không ghi đè; văn bản này là báo cáo thẩm định độc lập sau rà soát kỹ thuật.

---

## 1. Kết luận Thẩm định Chung (Executive Verdict)

- **Kết luận chung:** **PARTIAL / KHÔNG NGHIỆM THU CỔNG P1 ĐỂ CHẠY TIẾP BÀI 100K**.
- **Không giữ kết luận "11/11 PASS":** Phân tích dữ liệu thực tế tại database và context preview xác nhận 3 lỗi sản phẩm nghiêm trọng đang OPEN:
  1. `MEM-DUPLICATE-001`: Trùng lặp canon ngữ nghĩa (3 events, 2 facts bị nhân đôi trong database sau khi lưu và duyệt lại Chương 1).
  2. `MEM-CRITICAL-001`: Thiếu các dữ kiện vật lý trọng yếu của CV-04 trong trích xuất ban đầu (G06 cạnh sơn xanh, G07 vết nứt cong móc câu, G13 chuông).
  3. `CTX-COVERAGE-001`: Context preview ở ngân sách 4.000 token không chứa event/fact trong ca đã đo (rớt 20/20 sự kiện và 31/31 dữ kiện lịch sử).
- **Bảng tổng hợp trạng thái các bước (S01–S11):**
  - **PASS (7 bước):** S01, S02, S04, S05, S06, S07, S10.
  - **PARTIAL (3 bước):** 
    - **S03:** Cơ chế kích hoạt baseline trên UI hoạt động (PASS), nhưng chất lượng trích xuất M0 chỉ đạt PARTIAL do thiếu G06, G07, G13.
    - **S08:** Hàng đợi duyệt trên UI hoạt động tốt, nhưng thao tác duyệt làm sinh bản ghi trùng lặp trong bộ nhớ canon.
    - **S11:** F5 reload và giữ nháp DRAFT hoạt động tốt, nhưng Story Brain mang theo bản ghi trùng lặp và 26 proposals đang pending.
  - **FAIL (1 bước):** **S09** (do lỗi nhân đôi sự kiện và dữ kiện canon; xử lý revision cũ lỗi thời ghi nhận NOT_ASSESSED).
  - **Tầng Đóng gói & Truy xuất Context (`context_retrieval`):** **FAIL** (do Probe 4 ngân sách 4.000 token rớt 100% events/facts trong ca đã đo; context thực tế gửi model generation ghi nhận NOT_ASSESSED).
- **Cam kết kiểm thử:** 100% tuân thủ nguyên tắc không can thiệp database, không sửa code trong lượt review, không xóa bản ghi duplicate để làm đẹp kết quả, và giữ nguyên 26 proposals đang pending trong hàng đợi.

---

## 2. Chi tiết 7 Nội dung Thẩm định Kỹ thuật

### 2.1. Xác minh Trạng thái Server & Cách ly Tuyệt đối
- **Server State:** 
  - Backend (`:14000`), AI Service (`:18000`), Postgres (`:55432`), Frontend (`:18080`) hoạt động ổn định.
  - Microsoft Edge (`msedge.exe`) và Chrome CDP (`:9222`) hoạt động bình thường.
  - Tài nguyên hoàn toàn thuộc về `reader02` và Novel ID `46642ff1-5bac-4513-98fd-ffe1be6cb318`. Không ảnh hưởng tới agent Codex (`reader03`).

---

### 2.2. Bằng chứng Trùng lặp Canon (Canon Duplication — `MEM-DUPLICATE-001`)
Khảo sát trực tiếp bảng `narrative.events` và `narrative.facts` phát hiện **3 sự kiện** và **2 dữ kiện** bị nhân đôi hoàn toàn sau khi duyệt các đề xuất từ revision viết mới `addb83f3`:

#### A. Các cặp sự kiện trùng lặp (Duplicate Events):
1. **Sự kiện An đón Mai Linh tại bến:**
   - **Bản ghi gốc (M0):** ID `db9c32c3-e006-5990-afc0-13d30a9d8576`, `narrative_order: 2048`, `event_type: meeting`.
     - *Summary:* `"An meets Mai Linh at the dock and greets her on behalf of her mother."`
     - *Nguồn revision:* `046a3f75-6082-4f3f-ab8f-5123ead024d4` (Chương 1 ban đầu).
   - **Bản ghi trùng (M-FIRST):** ID `c5f8682a-6642-5790-b8ce-f1559a71f055`, `narrative_order: 23552`, `event_type: meeting`.
     - *Summary:* `"An meets Mai Linh at the ferry landing with a sign bearing her name."`
     - *Nguồn revision:* `addb83f3-e1bb-4d9b-9817-2a61165742e5` (Chương 1 chỉnh sửa).
2. **Sự kiện Mai Linh gặp ông Hòa tại kho gốm:**
   - **Bản ghi gốc (M0):** ID `628034da-28a5-5978-9aaa-cdceff9df5e8`, `narrative_order: 3072`, `event_type: meeting`.
     - *Summary:* `"Ông Hòa greets Mai Linh at the ceramic warehouse / audio archive room."`
     - *Nguồn revision:* `046a3f75-6082-4f3f-ab8f-5123ead024d4`.
   - **Bản ghi trùng (M-FIRST):** ID `df63a129-2716-5424-8f29-69bcdad65f1c`, `narrative_order: 24576`, `event_type: meeting`.
     - *Summary:* `"Mai Linh arrives at the pottery warehouse and meets storekeeper Hòa."`
     - *Nguồn revision:* `addb83f3-e1bb-4d9b-9817-2a61165742e5`.
3. **Sự kiện ký hợp đồng 12 ngày:**
   - **Bản ghi gốc (M0):** ID `223eea03-929c-5dc9-a4d0-bd8df4f4be06`, `narrative_order: 4096`, `event_type: signing_contract`.
     - *Summary:* `"Mai Linh signs a twelve-day contract with Ông Hòa to inspect audio and ceramic fragments."`
     - *Nguồn revision:* `046a3f75-6082-4f3f-ab8f-5123ead024d4`.
   - **Bản ghi trùng (M-FIRST):** ID `d63a1e48-2f1a-54c2-b9b5-2fedc9be65d8`, `narrative_order: 25600`, `event_type: contract_signing`.
     - *Summary:* `"Mai Linh signs a twelve-day contract for inventory and assessment work with Hòa."`
     - *Nguồn revision:* `addb83f3-e1bb-4d9b-9817-2a61165742e5`.

#### B. Các cặp dữ kiện trùng lặp (Duplicate Facts):
1. **Dữ kiện Mai Lâm đã chết (`status = Dead`):**
   - **Bản ghi gốc:** ID `ef032515-f8b0-4998-94f4-276c12423025`, subject `b1368ee4-2815-4aee-8699-3acda0c231c7`, value `"Dead"` (tạo lúc `2026-10-18T18:09:47Z`).
   - **Bản ghi trùng:** ID `9829aecd-2b48-42e0-94f4-4c4b07e6258d`, subject `b1368ee4-2815-4aee-8699-3acda0c231c7`, value `"Dead"` (tạo lúc `2026-10-19T04:34:06Z`).
2. **Dữ kiện tuổi của An (`age = 19`):**
   - **Bản ghi gốc:** ID `87e534eb-a89f-4076-b8c1-d6fd071f755a`, subject `3eb9b4e3-6eec-4bed-aa5d-5518254e17ce`, value `19` (tạo lúc `2026-10-18T18:09:47Z`).
   - **Bản ghi trùng:** ID `e973257b-0032-4d90-9a9f-d1ccc598bb3c`, subject `3eb9b4e3-6eec-4bed-aa5d-5518254e17ce`, value `19` (tạo lúc `2026-10-19T04:34:06Z`).

> [!CAUTION]
> **Phân biệt Debounce Save và Memory Deduplication:**
> - Cơ chế debounce 1.200ms của frontend IDE hoạt động tốt để gộp các thao tác gõ văn bản liên tiếp thành một revision duy nhất (`6212307d`).
> - Tuy nhiên, **tầng backend/materialization hoàn toàn thiếu cơ chế chống trùng ngữ nghĩa (semantic deduplication)**. Khi một chương được lưu lại, extractor quét toàn bộ văn bản và sinh lại các đề xuất cũ. Việc phê duyệt các đề xuất này dẫn đến việc chèn các bản ghi trùng lặp vào Story Brain.
> - **Hệ quả:** **S09 chính thức nhận kết luận FAIL** theo mã lỗi `MEM-DUPLICATE-001`. Xử lý revision cũ lỗi thời (stale revision) ghi nhận **NOT_ASSESSED**.

---

### 2.3. Lịch sử Toàn bộ Đề xuất & Quyết định (Proposal & Decision History)
Toàn bộ 179 đề xuất được xuất ra tệp [all-proposals-history.json](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/evidence/memory/P1-M0/all-proposals-history.json), phân bổ qua 7 lượt phân tích:

| Đợt phân tích (Analysis Run ID) | Nguồn Revision / Key | Tổng đề xuất | Đã duyệt (Accepted) | Từ chối (Rejected) | Chờ duyệt (Pending) | Ghi chú giai đoạn |
|---|---|---|---|---|---|---|
| `6abfd52b-80ba-4b9f-bb95-b028c969febb` | `046a3f75-6082-4f3f-ab8f-5123ead024d4` | 25 | 24 | 1 | 0 | Chương 1 ban đầu (1 reject: Linh age 29) |
| `00227cb7-dcf4-4240-87c5-6f29051c5e48` | `ab94b7a2-5cf5-42ad-9d5c-5aa122000520` | 31 | 31 | 0 | 0 | Chương 2 sau khi Resume |
| `e02569e7-4809-444a-840d-3539c3d2d1a4` | `22fe72de-3597-41e1-9520-1fc6452f653a` | 22 | 22 | 0 | 0 | Chương 3 sau khi Resume |
| `366db917-f5f9-4488-9f31-017123d71275` | `8911e253-0ee1-4b2f-b994-4d8bca467c3e` | 18 | 18 | 0 | 0 | Chương 4 sau khi Resume |
| `1024df8a-0ea8-4cda-9e3e-286f19c795f8` | `df5c3e78-bacc-4eab-823b-d6cd44992b36` | 24 | 24 | 0 | 0 | Chương 5 sau khi Resume |
| **Tổng Bootstrap (M0)** | **Ch01–Ch05** | **120** | **119** | **1** | **0** | **Số 95 đề xuất trong báo cáo cũ là Ch02–Ch05** |
| `25b87982-a855-40d7-a919-958eaed70c3a` | `addb83f3-e1bb-4d9b-9817-2a61165742e5` | 33 | 33 | 0 | 0 | S07: Viết thêm văn xuôi lần 1 |
| `ab084d01-c825-4b12-9fd9-66eea6d3e5c2` | `6212307d-fb36-43f7-8e6e-d42dac617ae5` | 26 | 0 | 0 | **26** | S09: Viết nhanh lần 2 (ĐANG CHỜ DUYỆT) |
| **TỔNG CỘNG HỆ THỐNG** | — | **179** | **152** | **1** | **26** | **26 pending được giữ nguyên, không duyệt ép** |

- **Bằng chứng chụp màn hình hàng đợi hiện tại:** [queue_26_pending_current_state.png](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/evidence/queue_26_pending_current_state.png) hiển thị rõ 26 đề xuất đang chờ tác giả duyệt.

---

### 2.4. Đối chiếu Đáp án Vàng Đóng băng (Frozen Gold Standard)
Các tệp CSV audit đã được hoàn thiện đầy đủ: [memory_items.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/memory_items.csv), [memory_checkpoints.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/memory_checkpoints.csv), và [memory_probes.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/memory_probes.csv).

| Khẳng định Gold | Định nghĩa gốc đóng băng | Proposal ID / Record ID | Quote trích dẫn nguồn | Revision nguồn | Certainty | Raw Match | Approved Match | Context Status (8k / 4k) | Đánh giá |
|---|---|---|---|---|---|---|---|---|---|
| **G01** | Linh 29 tuổi | `f6bbf028...` / `966e0f0e...` | "Ở tuổi hai mươi chín" | `046a3f75` | confirmed | EXACT | REJECTED (M0) / EXACT (M-FIRST) | PACKED / DROPPED | ĐẠT trích xuất |
| **G02** | Linh trở về sau 11 năm | `8442cb06...` / `bfbb93a8...` | "Mười một năm trước" | `046a3f75` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G03** | Lũ xảy ra 17 năm trước | `f91a53b9...` / `f91a53b9...` | "mười bảy năm trước" | `046a3f75` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G04** | 23 người chết trong lũ | `74353279...` / `74353279...` | "hai mươi ba người chết" | `046a3f75` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G05** | Mai Lâm đã chết | `b1368ee4...` / `b1368ee4...` | "Mai Lâm, cha cô" | `046a3f75` | confirmed | EXACT | EXACT_MATCH | PACKED / PACKED | **ĐẠT** |
| **G06** | **CV-04 có cạnh sơn xanh** | *Không có* | "một cạnh phủ sơn xanh" | `046a3f75` | confirmed | **MISSING** | **MISSING** | DROPPED / DROPPED | **BỎ SÓT** (`MEM-CRITICAL-001`) |
| **G07** | **CV-04 có vết nứt cong móc câu** | *Không có* | "vết nứt cong như móc câu" | `046a3f75` | confirmed | **MISSING** | **MISSING** | DROPPED / DROPPED | **BỎ SÓT** (`MEM-CRITICAL-001`) |
| **G08** | CV-04 đã quét 1 lần | `68c997c9...` / `68c997c9...` | "Lần quét thứ nhất" | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G09** | Mỗi lần quét mất phổ cao | `b7e1aefb...` / `b7e1aefb...` | "phần phổ cao mất thêm" | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G10** | Giới hạn quét 3 lần | `e9767f0c...` / `e9767f0c...` | "Ba lần đã là giới hạn" | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G11** | Bản ghi có câu mở cửa Bốn | `089574fc...` / `089574fc...` | "Mở cửa Bốn." | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G12** | Linh nhận định giọng cha (chưa xác minh) | `568369ff...` / `568369ff...` | "Ghi là chị nhận ra giọng giống ông" | `ab94b7a2` | hypothesis | EXACT | EXACT_MATCH | PACKED / DROPPED | **ĐẠT** |
| **G13** | **Chuông chưa chứng minh vị trí** | *Không có* | "Cô viết ba chữ “nếu”" | `ab94b7a2` | hypothesis | **MISSING** | **MISSING** | DROPPED / DROPPED | **BỎ SÓT** (`MEM-CRITICAL-001`) |
| **G14** | Duy không nghe tai trái | `921109f2...` / `921109f2...` | "Tai trái tôi không nghe" | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / PACKED | **ĐẠT** |
| **G15** | Duy ngoài 30, dùng tai phải, 4 năm | `4bbfc188...` / `4bbfc188...` | "Anh đặt ngón tay lên mặt bàn" | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / PACKED | **ĐẠT** |
| **G16–G19** | Hai ổ lưu, niêm tủ, túi chống ẩm, vòng đồng | `3377d8e2...` / `41d2894a...` | Các quote tương ứng | `ab94b7a2` | confirmed | EXACT | EXACT_MATCH | PACKED / PACKED | **ĐẠT** |

> [!NOTE]
> **Lưu ý về tỷ lệ 16/19:** Con số 16/19 (84.2%) chỉ là tỷ lệ khớp trên mẫu khảo sát 19 khẳng định ban đầu, **chưa phải là recall toàn bộ gold của toàn bộ tác phẩm**. Tỷ lệ này xác nhận model trích xuất tốt các thực thể và sự kiện lớn, nhưng bỏ sót các thuộc tính vật lý tinh vi (G06, G07) và dữ kiện trạng thái không chắc chắn (G13).

---

### 2.5. Kiểm tra So sánh Context Preview ở 4.000 vs 8.192 Tokens (`CTX-COVERAGE-001`)
Thực hiện truy vấn với bộ tham số hoàn toàn đồng nhất:
- `novel_id`: `46642ff1-5bac-4513-98fd-ffe1be6cb318`
- `chapter_number`: `5`
- `character_name`: `"Linh"`

| Tiêu chí | Ngân sách 4.000 tokens ([context-preview-4000-linh.json](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/evidence/context-preview-4000-linh.json)) | Ngân sách 8.192 tokens ([context-preview-8192-linh.json](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/evidence/context-preview-8192-linh.json)) | Nhận định Kỹ thuật |
|---|---|---|---|
| **Số token thực dùng** | 4.000 / 4.000 (100% kịch trần) | 8.175 / 8.192 (99.8%) | Cả hai đều lấp đầy ngân sách |
| **Thực thể được chọn** | 38 thực thể | 54 thực thể | Ngân sách 4k phải loại 16 thực thể |
| **Sự kiện gần nhất (Recent Events)** | **0 sự kiện** (RỚT 100%, 20/20 events bị drop) | **3 sự kiện** (Rớt 17 events) | **Lỗi `CTX-COVERAGE-001` tại 4k token** |
| **Dữ kiện thế giới (World Rules)** | **0 dữ kiện** (RỚT 100%, 31/31 facts bị drop) | **31 dữ kiện** (0 facts bị drop) | **Lỗi `CTX-COVERAGE-001` tại 4k token** |
| **Dữ kiện trọng yếu còn lại** | 0% dữ kiện canon | 100% dữ kiện canon | Context preview 4k không chứa event/fact trong ca đã đo |

#### Phân tích chi tiết 3 Sự kiện được Đóng gói ở 8.192 Tokens:
Khi kiểm tra từng sự kiện cụ thể trong 3 sự kiện lọt vào context:
1. **Sự kiện 1 (`c5f8682a-6642-5790-b8ce-f1559a71f055`):** *"An meets Mai Linh at the ferry landing with a sign bearing her name."*
   -> **SỰ KIỆN TRÙNG LẶP** (Duplicate) của sự kiện Chương 1 gốc `db9c32c3-e006-5990-afc0-13d30a9d8576`.
2. **Sự kiện 2 (`d63a1e48-2f1a-54c2-b9b5-2fedc9be65d8`):** *"Mai Linh signs a twelve-day contract for inventory and assessment work with Hòa."*
   -> **SỰ KIỆN TRÙNG LẶP** (Duplicate) của sự kiện Chương 1 gốc `223eea03-929c-5dc9-a4d0-bd8df4f4be06`.
3. **Sự kiện 3 (`b0b51a7e-f580-5b23-a632-cd73754927f6`):** *"Mai Linh meets Định at a teahouse, receiving an old bronze key to the reading room."*
   -> **SỰ KIỆN MỚI THỰC SỰ** (New Event) được trích xuất từ đoạn văn xuôi mới viết thêm tại S07.

> [!IMPORTANT]
> **Đính chính quan trọng:** Không phải cả 3 sự kiện đều là duplicate. Sự kiện gặp ông giáo Định tại quán nước là sự kiện mới phát sinh hợp lệ; chỉ có 2 sự kiện đón Linh và ký hợp đồng là duplicate do bị phân tích lại từ phần văn bản cũ của Chương 1.

#### Về Bằng chứng Context Thế hệ Viết thực tế (Generation Context):
- **Giới hạn kết luận:** Kết quả đo đạc trên chỉ áp dụng cho API `context-preview` (context preview 4k không chứa event/fact trong ca đã đo). **Không kết luận model generation thực tế bị mù lịch sử** vì chưa có evidence thực tế về payload đã gửi cho model viết.
- Trong toàn bộ quá trình chạy short loop P1, **chưa có lượt sinh văn bản tự động (writing generation) nào được kích hoạt** (`narrative.writing_generations` có 0 bản ghi).
- Do đó, context thực tế gửi tới model viết ghi nhận chính xác là **NOT_ASSESSED**. Không tự ý gọi generation mới chỉ để bổ sung coverage khi chưa nghiệm thu cổng.

---

### 2.6. Thẩm định S09 & Xử lý Trùng lặp
- **Yêu cầu của S09:** "Không nhân đôi canon, không áp kết quả revision cũ âm thầm; dữ liệu mới nhất được xử lý".
- **Thực tế:**
  1. Thao tác debounce save chỉ chứng minh frontend không gửi nhiều request lưu đồng thời.
  2. Bằng chứng SQL chứng minh canon đã bị nhân đôi (3 events, 2 facts).
  3. Xử lý revision lỗi thời (stale revision) chưa có kịch bản kích hoạt 2 revision đang xử lý dở cùng lúc để kiểm chứng loại bỏ kết quả cũ -> Ghi nhận **NOT_ASSESSED**.
- **Kết luận:** **S09: FAIL** (Lỗi sản phẩm: `MEM-DUPLICATE-001`).

---

### 2.7. Nguồn Readback, Hash & Đồng bộ Checkpoint
Đã cập nhật toàn bộ hệ thống tệp tin khớp hoàn toàn với thực tế trên máy chủ:
- **Tệp xuất văn bản:** Đã xuất đầy đủ 5 chương vào thư mục [final/chapters/](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/final/chapters/):
  - `ch01.md`: 1,265 từ, hash SHA-256 `2e7fedafb40ce4dd59f9a6c122db8f12b951d8c9a942c68a9760d4779159fe7f`.
  - `ch02.md`: 1,005 từ, hash `b71336aae2d225345b7b67e190d7d2a46c7a4607ab80d23f299c4c875be7ff45`.
  - `ch03.md`: 995 từ, hash `b380dddddd2e0bc07339699a005b4e0ae4b34f496907e50b75701d9746b36717`.
  - `ch04.md`: 957 từ, hash `29254bfa6bd8782110a668b9f74f37b7d43022ad472366a33f625f9a741775cf`.
  - `ch05.md`: 574 từ, hash `e9291c815661b8300c09a2ea5ad13fec573de127874a270a59a9df57cbadb321`.
  - **Tổng số từ canonical:** **4,796 từ**.
- **[revision_manifest.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/revision_manifest.csv):** Cập nhật đúng hash `2e7fedaf...` và số từ 1,265 cho Chương 1.
- **[actions.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/actions.csv):** Ghi nhận đầy đủ 12 thao tác từ `ACT-S01-01` đến `ACT-S11-01`.
- **[checkpoint.json](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/checkpoint.json):** Cập nhật `status: PARTIAL_AUDITED`, `brain_version: 7`, `plan_id: 6bde4330-6495-422f-9214-44170d30151e`, `unresolved_issue_ids: ["MEM-DUPLICATE-001", "MEM-CRITICAL-001", "CTX-COVERAGE-001"]`.
- **[issues.csv](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/issues.csv):** Cập nhật đủ 3 issues OPEN.

---

## 3. Bảng Tổng kết Nghiệm thu Rà soát (Reviewed Verdict Table)

| Bước | Kênh | Kỳ vọng chuẩn | Kết quả thực tế thẩm định | Bằng chứng kiểm chứng | Verdict | Mã lỗi |
|---|---|---|---|---|---|---|
| **S01** | LIVE_UI | Nhập 5 chương, lưu nháp | 4.747 từ, hash khớp fixture, 5 draft revisions | `evidence/s01-source-manifest.json` | **PASS** | — |
| **S02** | LIVE_UI | Trích xuất ban đầu 5 chương | Gemini thật trích xuất đủ 120 proposals (25 ch1 + 95 ch2-5); sửa lỗi quote | `evidence/memory/P1-M0/all-proposals-history.json` | **PASS** | `MEM-PROVENANCE-001` (Resolved)<br>`UI-REVIEW-001` (Resolved) |
| **S03** | LIVE_UI | Duyệt và kích hoạt baseline M0 | Cơ chế UI duyệt và kích hoạt baseline hoạt động (119 accepted, 1 rejected); **tuy nhiên chất lượng trích xuất M0 đạt PARTIAL** do bỏ sót G06, G07, G13 | `evidence/ui_baseline_activated.png`<br>`memory_items.csv` | **PARTIAL** | `MEM-CRITICAL-001` |
| **S04** | LIVE_UI | Tab memory và reload | Dữ liệu hiển thị đúng trên 5 tab và bền vững qua reload | `evidence/s04_characters_1792347664390.png` | **PASS** | — |
| **S05** | LIVE_UI | Gợi ý / chỉnh kế hoạch | Gợi ý từ canon; sửa event 1, bỏ event 2, lưu plan `6bde4330...` | `evidence/s05_plan_saved_1792348184966.png` | **PASS** | — |
| **S06** | LIVE_UI | Cách ly context kế hoạch | 0 event tương lai lẫn vào canon lịch sử; plan context tách biệt | `evidence/context-preview-8192-linh.json` | **PASS** | — |
| **S07** | LIVE_UI | Viết/lưu bình thường, tự trích xuất | Lưu văn xuôi sinh revision `addb83f3`; worker tự trích xuất 33 proposals | `evidence/s07_author_saved_new_prose.png` | **PASS** | — |
| **S08** | LIVE_UI | Đợi queue, kiểm tra rồi duyệt | Duyệt 33 proposals qua UI; tuy nhiên materialization làm sinh duplicate records | `evidence/s08_proposals_approved.png` | **PARTIAL** | `MEM-DUPLICATE-001` |
| **S09** | LIVE_UI | Lưu sửa nhanh 2 lần, dedup / stale | Debounce save đạt; **nhưng xuất hiện canon duplication** (3 events, 2 facts); stale-revision handling ghi nhận NOT_ASSESSED | `evidence/s09_rapid_save_result.png` | **FAIL** | `MEM-DUPLICATE-001` |
| **S10** | LIVE_UI | Kiểm tra mâu thuẫn | Phát hiện chính xác Mai Lâm Dead; báo 0 lỗi khi sửa lại đúng | `evidence/s10-consistency-check.json` | **PASS** | — |
| **S11** | LIVE_UI | Reload và tiếp tục | Reload giữ nguyên 1.265 từ DRAFT; tuy nhiên còn 26 pending proposals, memory có duplicate, và ngân sách 4k token rớt 100% events/facts | `evidence/s11_reloaded_and_continue.png` | **PARTIAL** | `MEM-DUPLICATE-001`<br>`CTX-COVERAGE-001` |

---

## 4. Bộ Kịch bản Kiểm thử Hồi quy (Regression Suite)

Đã tạo riêng tệp [REGRESSION_CASES.md](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/REGRESSION_CASES.md) mô tả chi tiết điều kiện tiên quyết, quy trình thực hiện, câu lệnh SQL kiểm chứng và kỳ vọng nghiệm thu cho 6 ca thử trọng yếu (tách bạch rõ yêu cầu nghiệm thu khỏi phương án thiết kế):
1. **REG-01:** Lưu lại chương không đổi nội dung không nhân đôi memory hay tăng revision vô nghĩa.
2. **REG-02:** Thêm cảnh mới vào chương ghi nhận cảnh mới và không materialize trùng lặp phần cũ; sửa hoặc bỏ nội dung cũ được xử lý đúng (cho phép extractor phân tích lại toàn chương).
3. **REG-03:** Chỉnh sửa một sự kiện cập nhật canon hiện hành, ghi nhận supersession và bảo toàn provenance nguồn.
4. **REG-04:** Hai revision xử lý chồng nhau không cho kết quả từ revision cũ âm thầm ghi vào canon hiện hành (chặn duyệt, cảnh báo, đánh dấu stale hoặc cơ chế tương đương có bằng chứng).
5. **REG-05:** Bảo toàn dữ kiện thiết yếu trong Context Preview (4.000 / 8.192 tokens) theo đúng truy vấn và cutoff khai báo; ghi nhận IDs được chọn/bị loại; chấm bằng các frozen probes, không áp đặt tỷ lệ phần trăm phân bổ tùy ý.
6. **REG-06:** Chống trùng lặp canon và phân biệt rõ sự kiện lặp lại thật trong cốt truyện với hiện tượng trích xuất trùng cùng một sự việc; kiểm chứng qua provenance, thời điểm và supersession (không quy định cứng bộ khóa composite cụ thể).

---

## 5. Danh mục Lỗi đang OPEN, Bằng chứng còn thiếu & Điều kiện Nghiệm thu lại

### A. Danh sách lỗi sản phẩm đang OPEN:
1. **`MEM-DUPLICATE-001` (Severity: HIGH):** Lỗi nhân đôi canon ngữ nghĩa khi phân tích lại chương đã chỉnh sửa (trùng 3 sự kiện, 2 dữ kiện).
2. **`MEM-CRITICAL-001` (Severity: HIGH):** Thiếu các thuộc tính vật lý của CV-04 (G06 cạnh sơn xanh, G07 vết nứt cong móc câu) và tính không chắc chắn của chuông (G13).
3. **`CTX-COVERAGE-001` (Severity: HIGH):** Context preview ở ngân sách 4.000 token không chứa event/fact trong ca đã đo (rớt 20/20 sự kiện và 31/31 dữ kiện).

### B. Bằng chứng còn thiếu (Gaps):
- **Bằng chứng xử lý stale revision chồng nhau:** Chưa có kịch bản kích hoạt 2 revision đang xử lý dở cùng lúc để kiểm chứng loại bỏ kết quả cũ (được ghi nhận `NOT_ASSESSED`).
- **Bằng chứng context thực tế gửi model generation:** Do chưa kích hoạt writing generation trong short loop P1, payload context thực tế của thế hệ viết được ghi nhận `NOT_ASSESSED`.

### C. Điều kiện tiên quyết để nghiệm thu lại cổng P1 (Retest Gate Criteria):
1. **Chống trùng lặp canon (`MEM-DUPLICATE-001`):** Bảo đảm cùng sự việc khi trích xuất hoặc duyệt lại không tạo canon trùng lặp; thay đổi thật phải cập nhật đúng; hai hành động tương tự xảy ra ở thời điểm khác vẫn được giữ riêng; kiểm chứng qua provenance, thời điểm và cơ chế supersession (không áp đặt phương án thiết kế cụ thể).
2. **Bổ sung trích xuất dữ kiện vật lý (`MEM-CRITICAL-001`):** Nâng cao khả năng trích xuất để nhận diện chính xác các thuộc tính vật lý then chốt (G06 cạnh sơn xanh, G07 vết nứt cong) và trạng thái không chắc chắn (G13) trong baseline Chapter 1 & 2.
3. **Đóng gói context bảo toàn dữ kiện thiết yếu (`CTX-COVERAGE-001`):** Bảo đảm ở các mức ngân sách 4.000 và 8.192 tokens, context preview giữ được các dữ kiện và sự kiện thiết yếu theo đúng truy vấn và chapter cutoff đã khai báo; có danh sách ID được chọn/bị loại minh bạch; chấm đạt các probe kiểm thử có đáp án đóng băng (frozen probes), không dùng tỷ lệ phần trăm phân bổ tùy ý.
4. **Thực thi bộ test hồi quy [REGRESSION_CASES.md](file:///c:/Users/Laptop/OneDrive/Documents/testproject/Pipeline_test/runs/2026-10-18-independent-01/REGRESSION_CASES.md):** Đạt toàn bộ các ca thử REG-01 đến REG-06 trên môi trường UI và read-only SQL trước khi cho phép mở cổng bài dài 100k.

