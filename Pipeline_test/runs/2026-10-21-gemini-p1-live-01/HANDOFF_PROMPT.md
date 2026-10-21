# PROMPT HANDOFF: Tiếp tục nhiệm vụ P1 Live (S01–S11)

Dành cho coding agent tiếp nhận nhiệm vụ trên branch `codex/ai-copilot-pipeline-test`.

---

## 1. Nhiệm vụ chính & Phạm vi

Tiếp tục thực thi **P1 Live Human Entity Review và hành trình S01–S11** theo hợp đồng `WORKFLOW_CONTRACT.md` revision 1.3 và chỉ thị `P1_LIVE_RESUME_APPROVED_2026-10-21.md`.

- **Branch duy nhất:** `codex/ai-copilot-pipeline-test` (đồng bộ bằng fast-forward, không sửa main, UI, astra/* hay các run cũ).
- **Run ID hiện tại:** `Pipeline_test/runs/2026-10-21-gemini-p1-live-01/`
- **Ngân sách đã duyệt:** Tối đa 200 provider calls, tối đa 5.00 USD (ngừng nhận việc mới ở $4.50), tối đa 2 giờ live wall-clock.
- **Phạm vi nghiêm ngặt:** Chỉ chạy Wave 1 / P1 S01–S11. Tuyệt đối **KHÔNG** chạy P2, P3 hoặc bài 100.000 từ.
- **An toàn tài nguyên:** Tuyệt đối **KHÔNG** chạy `docker compose down -v`.

---

## 2. Trạng thái hiện tại đã đạt được (Preflight Gate: PASS)

Toàn bộ 8 technical blocker từ bản đánh giá độc lập của GPT-6 (`reviews/2026-10-21-p1-preflight-gpt6/REVIEW.md`) đã được giải quyết hoàn toàn (xem chi tiết tại `REVIEW_FINDINGS_CLOSURE.md`):

1. **Provider thật (REV-P1-01):** Đã cấu hình `gemini-3.5-flash-lite` qua Google AI Studio (`google-genai` SDK trên AI service và OpenAI-compatible endpoint trên Backend). Bounded smoke test đã gọi thành công: HTTP 200, output: `pong`, latency: 1.595s (bằng chứng: `evidence/provider-smoke.json`).
2. **Budget Guard (REV-P1-02):** Đã nạp và kiểm thử deterministic (`budget_guard.py`). Đã ghi nhận 1 call khói (~0.000001 USD), trần 200 calls, deadline: `2026-10-21T05:47:52Z` (file trạng thái: `budget_state.json`).
3. **Cô lập Loopback (REV-P1-03):** Tất cả 5 containers trong `docker-compose.isolated.yml` đã được bind chặt chẽ vào `127.0.0.1:`:
   - Web Frontend: `http://127.0.0.1:18080` (Up, HTTP 200)
   - Backend API: `http://127.0.0.1:14000/api/v1` (Up, HTTP 200)
   - AI Service: `http://127.0.0.1:18000` (Up, HTTP 200)
   - PostgreSQL: `127.0.0.1:25432` (DB `p1_ephurin`, migrations head `0012_entity_guidance`)
   - MongoDB: `127.0.0.1:27018`
4. **Đối chiếu số lượng test Backend (REV-P1-04):** Đã làm rõ 60 PASS trong runner targeted (thay vì hiểu nhầm 26 PASS của sub-slice ban đầu).
5. **Gán nhãn suite chính xác (REV-P1-05):** Đã phân định rõ 397 pass / 42 deselected do cờ marker `not benchmark and not e2e`.
6. **Đóng băng Gold (REV-P1-06):** 35 narrative assertions (G01–G35) đã được vật chất hóa vào `memory_items.csv` (SHA256: `e9e5bb778841bd4e5eb4a0444268a1acc01512860b8ace3c56332d61d5881d0b`) và `evidence/gold_manifest.json` (13 canon entities, 4 negative controls, alias rules).
7. **Sổ theo dõi lỗi (REV-P1-07):** `issues.csv` đã được điền đầy đủ tất cả các issue và finding.
8. **Chỉ thị Teardown an toàn (REV-P1-08):** Đã thay thế chỉ thị `down -v` bằng quy trình stop an toàn và bảo toàn volume phục vụ audit.

---

## 3. Tài nguyên sẵn sàng cho S01

- **Tài khoản tác giả đã tạo sẵn trên database cô lập:**
  - `username`: `p1_author`
  - `email`: `p1_author@ephurin.test`
  - `password`: `P1AuthorPass123!`
  - `role`: `AUTHOR` (đã kích hoạt)
- **Database hiện tại:** Đang trống hoàn toàn (0 novel, 0 chapter), sẵn sàng cho tác phẩm mới.
- **Nguồn bản thảo fixture:** `Pipeline_test/input/manuscript/` chứa `ch01.md` đến `ch05.md`.

---

## 4. Kịch bản thực thi tiếp theo từ điểm này (S01–S11)

### Bước S01: Tạo truyện & Nhập 5 chương bản thảo
1. Đăng nhập tại `http://127.0.0.1:18080/login` bằng tài khoản `p1_author` / `P1AuthorPass123!`.
2. Tạo truyện mới:
   - Tiêu đề: `Gió Thoảng Qua Phố Cổ`
   - Thể loại: `Đô thị / Tình cảm`
   - Tóm tắt: `Hành trình trở về phố cổ của Mai Linh sau nhiều năm xa cách và những ký ức trạm Bốn.`
3. Vào trang Nhập bản thảo (`/author/import/:novelId`):
   - Nạp nội dung 5 chương từ `Pipeline_test/input/manuscript/ch01.md` đến `ch05.md`.
   - Lưu 5 chương dưới dạng bản nháp.
   - Xác minh nội dung readback qua API/DB: kiểm tra chapterId, revisionId, content hash. Đảm bảo bước nhập chưa tự ý trích xuất vào canon.

### Bước S02: Lưu hints tăng cường & Kích hoạt trích xuất ban đầu
1. Mở IDE (`/author/ide?novelId=...`) -> mở Drawer "Bộ nhớ truyện" -> tab "Chờ duyệt" (`EntityExtractionReview`).
2. Điền danh sách tăng cường (entity hints):
   - `An`
   - `Mai Linh`
   - `trạm Bốn`
   - `CV-04`
   - Tên viết thường: `linh`
   - Tên vắng mặt trong văn bản: `Thanh Hằng`
3. Bấm Lưu gợi ý: reload trang để kiểm tra gợi ý còn lưu (version tăng lên). Xác minh narrative memory/canon vẫn chưa có entity/fact nào.
4. Bấm "Bắt đầu trích xuất" bản thảo: Job phải dừng ở trạng thái `waiting_entity_review` trước khi gọi bước trích xuất event/fact.

### Bước S03: Human Entity Review & Kích hoạt Baseline M0
1. Duyệt thực thể trong `EntityExtractionReview`:
   - Phân biệt nhân vật `An` thật với cụm từ `an toàn` / `An toàn là trên hết` (loại bỏ occurrence trong `an toàn`).
   - Chuẩn hóa alias: `Linh` -> tên canon `Mai Linh`.
   - Xác nhận `trạm Bốn` (Địa danh), `CV-04` (Vật phẩm/Địa danh).
   - Xử lý dứt điểm các candidate chưa phân giải.
2. Kiểm tra rerun riêng entity stage: thêm 1 tên vào guidance, lưu, bấm "Chạy lại riêng bước entity" -> xác nhận chỉ entity LLM chạy lại.
3. Bấm "Tiếp tục trích xuất event/fact": LLM sinh các đề xuất sự kiện và dữ kiện.
4. Duyệt các proposal group canon, sau đó bấm kích hoạt baseline (`baseline/activate`).
5. Tiến hành Audit P1-M0 đối chiếu với 35 narrative assertions trong `memory_items.csv`!

### Bước S04–S06: Kiểm tra Tabs, Kế hoạch & Chống rò rỉ Canon
- Mở các tab Nhân vật, Địa danh, Vật phẩm, Sự kiện, Dữ kiện để xác nhận dữ liệu đã duyệt hiển thị đầy đủ.
- Dùng AI Copilot trong IDE yêu cầu gợi ý sự kiện kế tiếp; chỉnh sửa 1 gợi ý, bỏ 1 gợi ý; kiểm tra chỉ gợi ý được chọn mới vào Story Plan.
- Xác nhận các sự kiện tương lai trong Story Plan **không** bị rò rỉ thành sự kiện lịch sử trong canon.

### Bước S07–S09: Viết chương 6, Auto-extraction & Idempotency
- Viết tiếp chương 6 qua editor bình thường (không dùng snapshot thủ công).
- Kiểm tra checkpoint trích xuất tự động kích hoạt từ revision mới; duyệt entity và continue event/fact.
- Thử lưu nhanh 2 lần liên tiếp để xác minh tính idempotent (không tạo bản ghi canon trùng lặp).

### Bước S10–S11: Kiểm tra Tính nhất quán & Audit M-FIRST
- Cài đặt 1 chi tiết mâu thuẫn có chủ đích trong bản nháp (ví dụ: tuổi hoặc quê quán nhân vật sai lệch canon).
- Chạy Consistency Checker qua UI, xác nhận phát hiện đúng mâu thuẫn kèm bằng chứng.
- Sửa lại bản nháp qua UI, lưu và kiểm tra lại.
- Tải lại trang, audit M-FIRST và trạng thái bộ nhớ cuối cùng.

---

## 5. Lưu ý kỹ thuật cho Browser / UI

Nếu công cụ Playwright tự động của agent gặp lỗi tải driver từ CDN (404 Not Found):
- Có thể dùng một script Python Playwright chạy trực tiếp với Edge/Chrome có sẵn trên máy:
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
- Hoặc thực hiện các request HTTP tương ứng với các action của tác giả qua frontend endpoint `/api/v1` (giữ header `Authorization: Bearer <token>` của `p1_author`), sau đó xác minh kết quả và chụp bằng chứng.

## 6. Giao nộp khi hoàn thành
1. Cập nhật `REPORT.md`, `checkpoint.json`, `validation.json`, `actions.csv`, `continuity.csv`, `MEMORY_AUDIT.md`.
2. Kiểm tra `git diff` sạch, không chứa API key raw.
3. Commit và push lên `codex/ai-copilot-pipeline-test`.
4. Trả về commit SHA, bảng tổng kết S01–S11, mức tiêu thụ ngân sách và trạng thái cuối cùng (`P1_LOCAL_EVIDENCE_READY_FOR_INDEPENDENT_REVIEW`).
