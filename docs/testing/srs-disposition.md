# Phân loại các kiểm tra SRS từng FAIL

11 kiểm tra trong `scripts/run_srs_acceptance_e2e.py` FAIL ở mọi lần chạy, cả trên PR #73 lẫn `main`. Bảng này phân loại từng kiểm tra, ghi người phụ trách và mức độ, giữ đường dẫn tới bằng chứng FAIL gốc (không sửa), và ghi các quyết định chính sách đi kèm bản sửa ở nhánh `fix/srs-backend-rules`.

Nhãn phân loại:
- `CONFIRMED_CONTRACT_GAP`: code lệch SRS hoặc `docs/API/error-codes.md`, không cần quyết định thêm.
- `SPEC_DECISION`: SRS có ghi, nhưng áp vào code là một quyết định chính sách (ảnh hưởng tác giả, dữ liệu cũ). Cần người duyệt chốt trước khi merge.
- `TEST_INVALID`: bài test chưa đo đúng điều SRS nói.
- `DEFERRED`: hoãn, có lý do.

## Bằng chứng

| Lần chạy | Code | Kết quả | Thư mục |
|---|---|---|---|
| PR #73 (giao diện) | `4983d6a` | 60/71 × 2 | `docs/development/PR73-REVIEW-R3/pr73-head/` |
| `main`, runner cũ | `06ecfbb` | 60/71 × 2 | `docs/development/PR73-REVIEW-R3/main-baseline/` |
| `main`, runner đã chỉnh `TC-AI-06` và `TC-ADM-03/06` | `06ecfbb` | 60/71 × 2 | `docs/development/SRS-BACKEND-R1/main-baseline/` |
| Nhánh sửa `fix/srs-backend-rules` | `4d89f0a` | 71/71 × 2 | `docs/development/SRS-BACKEND-R1/pr-head/` |

## Bảng phân loại

Người làm: Minh Sơn (@Beomup31). Người chốt chính sách: Thái (@Ephurin). Phần gỡ truyện chạm vào code của #74 nên cần @karasunosu xem.

| Kiểm tra | Trên `main` (bằng chứng FAIL) | Phân loại | Mức | Xử lý trên nhánh sửa |
|---|---|---|---|---|
| `TC-AUTH-02` | email sai → 400 `VALIDATION_001` | `CONFIRMED_CONTRACT_GAP` (phụ lục A: `AUTH_001`) | Thấp | 400 `AUTH_001` |
| `TC-NOV-02` | tiêu đề 255 ký tự → 500 `SYS_001`: slug vượt `varchar(255)` | `CONFIRMED_CONTRACT_GAP`, có lỗi 500 | Cao | tiêu đề < 255; slug cắt còn 200 ký tự + hậu tố |
| `TC-NOV-03` | tóm tắt 18 ký tự được chấp nhận (chỉ cần ≥ 10) | `SPEC_DECISION` (D3) | Trung bình | ≥ 500 khi tạo và khi đổi tóm tắt |
| `TC-NOV-05` | tiêu đề chương 100 ký tự được chấp nhận | `CONFIRMED_CONTRACT_GAP` | Thấp | < 100 |
| `TC-NOV-04` | truyện 1 chương gửi xuất bản được | `SPEC_DECISION` (D2) | Cao | cần ≥ 5 chương hợp lệ, 422 `VALIDATION_002` |
| `TC-NOV-06` | chương 18 ký tự xuất bản được | `SPEC_DECISION` (D1) | Cao | < 500 ký tự → 422 `CONTENT_003` khi xuất bản |
| `TC-SOC-12` | người theo dõi không nhận thông báo chương mới | `CONFIRMED_CONTRACT_GAP` | Trung bình | thông báo `NEW_CHAPTER` (D7) |
| `TC-PAY-15` | 40 lần tạo phiên nạp liên tiếp đều 201 | `CONFIRMED_CONTRACT_GAP`; con số giới hạn là `SPEC_DECISION` (D4) | Trung bình; Cao nếu mở API ra ngoài | 30 lượt/phút/người, 429 `RATE_LIMIT_001` |
| `TC-AI-06` | runner cũ: LLM tắt → 200 kèm gợi ý mẫu. Runner đã chỉnh (provider giả): 503 `AI_002`, treo → 504 `AI_004` sau 3 giây, mất kết nối → 502 `AI_002` | Runner cũ là `TEST_INVALID` vì không giả lập provider sập. Sau khi chỉnh thì là `CONFIRMED_CONTRACT_GAP`. Ngưỡng 5 giây là `DEFERRED` (D5) | Trung bình | mọi lỗi provider → 503 `AI_001` kèm `details.reason`; không cấu hình LLM → `AI_001` ngay |
| `TC-ADM-03` | khách và tác giả **đã nhận 404** sau khi gỡ (không lộ nội dung), nhưng 9 chương vẫn `deleted_at is null` và thông báo không có câu SRS | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 (`6b5a58f`) | Thấp: chỉ dữ liệu và câu chữ, không lộ nội dung | ẩn cả chương; thông báo "Truyện đã bị gỡ bởi Admin" kèm tên truyện, lý do, thời điểm (D6) |
| `TC-ADM-08` | 9/9 bản nháp Mongo vẫn còn hiệu lực sau khi gỡ | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 | Thấp: chương đã 404 nên IDE không mở được | job `NOVEL_DRAFT_SYNC` đánh dấu và khôi phục bản nháp (D6) |

`TC-ADM-06` (khôi phục) PASS cả trên `main` lẫn nhánh sửa: đọc lại giống hệt lúc trước khi gỡ.

Chưa tạo issue trên GitHub. PR `fix/srs-backend-rules` là nơi theo dõi; khi tạo issue thì thêm link vào bảng này.

## Quyết định chính sách cần chốt

- **D1. Luật 500 ký tự** chỉ áp khi xuất bản chương (gửi trực tiếp, theo lịch, hay xuất bản lại chương đã sửa). Lưu nháp và autosave không bị chặn. Lý do: `TC-MOD-09` và SRS §1 yêu cầu soạn thảo không bị chặn. UC 3.2 bước 4 lại kiểm độ dài khi "Lưu tạm"; hai chỗ này mâu thuẫn, nên chọn kiểm khi xuất bản.
- **D2. Chương hợp lệ** là chương chưa xoá, có tiêu đề < 100 ký tự và nội dung (bản nháp nếu có, không thì bản đã lưu) ≥ 500 ký tự. Điều kiện 5 chương chỉ áp khi gửi xuất bản truyện đang `DRAFT`/`REJECTED`/`PENDING_MODERATION`. Truyện đã `PUBLISHED` không bị ảnh hưởng.
- **D3. Dữ liệu cũ không bị sửa.** Truyện cũ có tóm tắt ngắn vẫn sửa được ảnh bìa, thể loại: form web chỉ gửi tiêu đề/tóm tắt khi có thay đổi. API nhận tóm tắt ngắn thì từ chối (400).
- **D4. Giới hạn tần suất:** 30 lượt/phút/người, dùng chung cho tạo phiên nạp, rút, mở khoá chương, ủng hộ; webhook giả lập tính theo IP. Cấu hình qua `PAYMENT_RATE_LIMIT_MAX` và `PAYMENT_RATE_LIMIT_WINDOW_MS`. Giới hạn nằm trong bộ nhớ một tiến trình. SRS đặt giới hạn ở API Gateway; khi chạy nhiều instance cần gateway hoặc Redis (`DEFERRED`).
- **D5. Timeout AI:** SRS §1 nói lời gọi LLM không treo quá 5 giây để không làm gián đoạn việc lưu. Copilot là lời gọi riêng, không chặn việc lưu, nên vẫn giữ `AI_LLM_TIMEOUT_MS` (code mặc định 30 giây, `.env.example` 120 giây) cho LLM local. Đưa về 5 giây là quyết định để sau (`DEFERRED`). Runner đặt 3 giây để kiểm đúng ngưỡng SRS.
- **D6. Gỡ truyện** vẫn dùng sanction của #74: loại thông báo `ADMIN_DECISION`, giữ link kháng nghị, audit, job có retry. Sanction lưu danh sách chương đang hiện lúc gỡ; khôi phục chỉ trả lại các chương đó và các bản nháp mang mã sanction đó. Sanction cũ (không có danh sách chương) khi khôi phục không đụng tới chương nào.
- **D7. Thông báo chương mới** chỉ gửi khi truyện đang công khai, cho người theo dõi tác giả và người theo dõi truyện (trừ chính tác giả), mỗi chương mỗi người 1 lần. Áp cho cả 3 đường: tác giả đăng, đăng theo lịch, admin duyệt.

## Tương thích ngược

- CI P7/P8 (`run_ai_pipe_01a/02a/02b/03a`) tạo truyện bằng SQL, tạo chương với tiêu đề ngắn và không gửi xuất bản, nên không bị luật mới chặn.
- Bốn script chạy tay ghi vào DB dùng chung đã được sửa dữ liệu cho đủ độ dài/số chương nhưng **không chạy lại**, vì chúng ghi vào `ephurin`: `run_real_browser_e2e.py`, `run_manuscript_import_browser_e2e.py`, `run_ai_pipe_01b_main_e2e.py`, `run_author_publish_admin_moderation_e2e.py`. Hai script đã hỏng trên `main` vì lý do khác: `01b` sửa chương không gửi `expectedVersion` (428); `author_publish` tìm nút "New Project" không còn tồn tại.
- Test opt-in `author-launch.integration.test.ts` đã hỏng từ #74 (403 ở bước admin duyệt); nhánh sửa đã sửa lại.
