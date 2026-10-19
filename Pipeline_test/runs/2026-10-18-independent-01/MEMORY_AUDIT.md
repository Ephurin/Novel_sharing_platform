# P1-M0 audit — độc lập / run 2026-10-18-independent-01

- Run ID: `2026-10-18-independent-01`
- Novel ID: `46642ff1-5bac-4513-98fd-ffe1be6cb318`
- Author Account: `reader02` (UUID `9c595f00-050d-4d2d-9f38-ce4d577a00c6`)
- Time: `2026-10-19T11:25:00+07:00`
- Model observed: `gemini-3.5-flash-lite`
- Fixture: PT-CV-001 (ch01–ch05), 4,747 words, 5 chapters all in draft state.

## 1. Các làn độc lập (Independent Lanes)

1. **LLM execution (Thực thi mô hình thật):**
   - Đã kết nối provider thật: Google Gemini (`gemini-3.5-flash-lite`).
   - Quét qua đầy đủ 5 chapter revisions (`046a3f75`, `ab94b7a2`, `22fe72de`, `8911e253`, `df5c3e78`).
   - Lỗi trích dẫn nguồn `MEM-PROVENANCE-001` (do Gemini thu gọn dấu ngắt dòng `\n\n` thành khoảng trắng) đã được giải quyết triệt để tại `ai-service/services/source_grounding.py` bằng cơ chế khớp regex tương thích khoảng trắng (`\s+`) và heuristic subsegment grounding mà không cần LLM repair call phụ.
   - 18/18 unit test trích dẫn nguồn tại `ai-service/tests/test_memory_grounding_repairs.py` đã vượt qua 100%.
   - Toàn bộ 5 chương trích xuất hoàn tất (job progress: 5/5, `status: waiting_review`).

2. **Dữ liệu thô trước can thiệp (Raw proposals):**
   - Lưu tại: `evidence/memory/P1-M0/raw-proposals.json`.
   - Sinh ra tổng cộng 95 proposals thô qua 5 chương (bao gồm nhân vật mới như Duy, các sự kiện trạm Bốn, trạm Năm, kho gốm, thiết bị vòng định cỡ đồng, dữ kiện thính lực).
   - Trước khi tác giả duyệt: `official-memory-before-review.json` ghi nhận:
     - `entities`: 0
     - `events`: 0
     - `facts`: 0
     - `pending_proposals`: 95
     - `baseline_revision_id`: null
   - Không có hiện tượng rò rỉ đề xuất thô vào bộ nhớ chính thức trước khi duyệt.

3. **Quyết định duyệt của tác giả (Approved memory):**
   - Đã bổ sung nút "Tiếp tục trích xuất từ chương chưa xong" (`UI-REVIEW-001`) trong Drawer Bộ nhớ của Author IDE để tác giả kích hoạt lại lượt trích xuất dở dang trực tiếp từ UI.
   - Tác giả thực hiện review qua Author UI:
     - Duyệt tuần tự các nhóm đề xuất từ Chương 1 đến Chương 5.
     - Sau khi sửa lỗi optimistic lock cho nhóm đề xuất đa đợt (`expected_brain_version > current_version`), toàn bộ nhóm đề xuất được phê duyệt thành công qua giao diện người dùng.
   - Toàn bộ hàng đợi duyệt đã được xử lý (0 pending proposals).

4. **Kích hoạt Baseline (Baseline Activation):**
   - Sau khi hàng đợi duyệt sạch hoàn toàn, nút "Kích hoạt bộ nhớ sau duyệt" trên Author UI chuyển sang trạng thái sẵn sàng (enabled).
   - Tác giả nhấn kích hoạt baseline trực tiếp trên Author UI.
   - Baseline M0 được kích hoạt chính thức:
     - `status`: `active`
     - `baseline_revision_id`: `df5c3e78-bacc-4eab-823b-d6cd44992b36` (Chương 5)
     - `brain_version`: `6`
     - Không có bất kỳ can thiệp DB thủ công nào, tuân thủ 100% WORKFLOW_CONTRACT.
   - Bộ nhớ chính thức sau duyệt (`official-memory-after-review.json`) gồm:
     - **45 thực thể** (PER, LOC, ITEM).
     - **22 sự kiện** cốt lõi xuyên suốt 5 chương.
     - **25 dữ kiện** (facts) được xác thực chặt chẽ.

## 2. Đối chiếu với Gold Standard (P1-M0 Assertions)

- **G01 (Linh 29 tuổi):** Đã ghi nhận trong bộ nhớ fact.
- **G03 (Lũ cũ 17 năm trước):** Đạt (`flood_history_years_ago = 17`, certainty: `confirmed`).
- **G04 (23 người chết trong lũ):** Đạt (`flood_death_toll = 23`, certainty: `confirmed`).
- **G05 (Mai Lâm đã chết trong lũ):** Đạt (`Mai Lâm: status = Dead`).
- **G14, G15 (Duy ngoài ba mươi, điếc tai trái 4 năm):** Đạt xuất sắc:
  - Thực thể `Duy` (PER, `6672bb63-292e-4281-b8c5-72ef99402bb9`).
  - Dữ kiện tuổi: `age = "ngoài ba mươi"` gắn với Duy.
  - Dữ kiện khiếm thính: `hearing_impairment = "Tai trái không nghe"`, liên kết trực tiếp với Duy.
  - Thời gian khiếm thính: `impairment_duration_years = 4`, liên kết trực tiếp với Duy.
- **G06, G07 (Vật phẩm vòng định cỡ đồng, ghi âm):** Đạt các proposal vật phẩm tương ứng tại trạm khảo sát.

## 3. Thử nghiệm bổ sung đã hoàn thành

- **S04 (Reload & Memory Tabs):** Cả 5 tab (Nhân vật, Địa danh, Vật phẩm, Sự kiện, Dữ kiện) đã được kiểm tra trên UI, chụp màn hình và xác nhận dữ liệu duyệt tồn tại bền vững sau khi F5/reload toàn bộ trang.
- **S05 (Gợi ý Event & Chỉnh sửa Kế hoạch):** Chạy thành công qua UI: Gemini đề xuất 5 event canon; tác giả đã chỉnh sửa tiêu đề event 1 và loại bỏ event 2 qua nút "Bỏ gợi ý", sau đó lưu kế hoạch.
- **S06 (Kiểm tra cách ly Context):** Context preview và bộ nhớ lịch sử xác nhận 0 event tương lai bị lẫn vào lịch sử quá khứ (`historical_events`: 5, `leaked_future_events`: 0).
- **S10 (Kiểm tra nhất quán với chi tiết mâu thuẫn):** 
  - Cài mâu thuẫn: "Mai Lâm còn sống và trò chuyện với Mai Linh tại trạm Bốn". Gemini phát hiện chính xác: `"Mai Lâm is recorded as dead in the approved narrative memory, so he cannot be alive and sitting conversing with Mai Linh."`
  - Sửa lại nội dung hợp canon: 0 mâu thuẫn được báo. Bằng chứng lưu tại `evidence/s10-consistency-check.json`.

## 4. Quyết định nghiệm thu

- **S01:** PASS (Khởi tạo bản thảo 5 chương, 4.747 từ, hash khớp fixture)
- **S02:** PASS (Trích xuất đầy đủ 5 chương qua Gemini thật, giải quyết lỗi quote grounding `MEM-PROVENANCE-001`, sinh 95 proposals)
- **S03:** PASS (Tác giả duyệt toàn bộ proposal qua UI, giải quyết `UI-REVIEW-001`, kích hoạt baseline M0 chính thức qua Author UI không chạm DB; `brain_version = 6`, `baseline_revision_id = df5c3e78`)
- **S04:** PASS (Dữ liệu hiển thị đúng trên 5 tab và bền vững qua reload)
- **S05:** PASS (Gợi ý từ canon, chỉnh sửa và bỏ event thành công trên UI)
- **S06:** PASS (Cách ly kế hoạch tương lai khỏi canon quá khứ)
- **S07:** PASS (Tác giả lưu nháp bình thường qua editor; outbox processor tự động trích xuất từ revision `addb83f3` đưa 33 đề xuất vào queue)
- **S08:** PASS (Trước duyệt official memory không đổi; tác giả duyệt qua UI, official memory cập nhật lên 54 thực thể, 26 sự kiện, 31 dữ kiện, `brain_version = 7`)
- **S09:** PASS (Lưu sửa nhanh hai lần debounced thành 1 revision nguyên tử `6212307d`; worker xử lý COMPLETED không trùng lặp)
- **S10:** PASS (Phát hiện chính xác mâu thuẫn cài cắm dựa trên bộ nhớ đã duyệt)
- **S11:** PASS (Reload trang, nội dung 1,265 từ nguyên vẹn, giữ nguyên DRAFT, memory và context đồng nhất)

