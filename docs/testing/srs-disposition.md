# Phân loại các kiểm tra SRS từng FAIL

11 kiểm tra trong `scripts/run_srs_acceptance_e2e.py` FAIL ở mọi lần chạy, cả trên PR #73 lẫn `main`. Bảng này phân loại từng kiểm tra, ghi người phụ trách và mức độ, giữ đường dẫn tới bằng chứng FAIL gốc (không sửa), và ghi các quyết định chính sách đi kèm bản sửa ở nhánh `fix/srs-backend-rules`.

Nhãn phân loại:
- `CONFIRMED_CONTRACT_GAP`: code lệch SRS hoặc `docs/API/error-codes.md`, không cần quyết định thêm.
- `SPEC_DECISION`: SRS có ghi, nhưng áp vào code cần một quyết định chính sách (ảnh hưởng tác giả, dữ liệu cũ). Quyết định đã chốt ở mục cuối, kèm lý do.
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

Người làm: Minh Sơn (@Beomup31). Chủ sản phẩm, xác nhận chính sách: Thái (@Ephurin). Phần gỡ truyện chạm vào code của #74 nên cần @karasunosu xem.

| Kiểm tra | Trên `main` (bằng chứng FAIL) | Phân loại | Mức | Xử lý trên nhánh sửa |
|---|---|---|---|---|
| `TC-AUTH-02` | email sai → 400 `VALIDATION_001` | `CONFIRMED_CONTRACT_GAP` (phụ lục A: `AUTH_001`) | Thấp | 400 `AUTH_001` |
| `TC-NOV-02` | tiêu đề 255 ký tự → 500 `SYS_001`: slug vượt `varchar(255)` | `CONFIRMED_CONTRACT_GAP`, có lỗi 500 | Cao | tiêu đề < 255; slug cắt còn 200 ký tự + hậu tố |
| `TC-NOV-03` | tóm tắt 18 ký tự được chấp nhận (chỉ cần ≥ 10) | `SPEC_DECISION` (D3) | Trung bình | ≥ 500 khi tạo và khi đổi tóm tắt |
| `TC-NOV-05` | tiêu đề chương 100 ký tự được chấp nhận | `CONFIRMED_CONTRACT_GAP` | Thấp | < 100 |
| `TC-NOV-04` | truyện 1 chương gửi xuất bản được | `SPEC_DECISION` (D2) | Cao | cần ≥ 5 chương hợp lệ, không tính chương `ARCHIVED`, 422 `VALIDATION_002` |
| `TC-NOV-06` | chương 18 ký tự xuất bản được | `SPEC_DECISION` (D1) | Cao | < 500 ký tự → 422 `CONTENT_003` khi xuất bản |
| `TC-SOC-12` | người theo dõi không nhận thông báo chương mới | `CONFIRMED_CONTRACT_GAP` | Trung bình | thông báo `NEW_CHAPTER` cho người theo dõi tác giả, không trùng chuông truyện của #88 (D7) |
| `TC-PAY-15` | 40 lần tạo phiên nạp liên tiếp đều 201 | `CONFIRMED_CONTRACT_GAP`; con số giới hạn là `SPEC_DECISION` (D4) | Trung bình; Cao nếu mở API ra ngoài | 30 lượt/phút/người, 429 `RATE_LIMIT_001` |
| `TC-AI-06` | runner cũ: LLM tắt → 200 kèm gợi ý mẫu. Runner đã chỉnh (provider giả): 503 `AI_002`, treo → 504 `AI_004` sau 3 giây, mất kết nối → 502 `AI_002` | Runner cũ là `TEST_INVALID` vì không giả lập provider sập. Sau khi chỉnh thì là `CONFIRMED_CONTRACT_GAP`. Ngưỡng 5 giây là `DEFERRED` (D5) | Trung bình | mọi lỗi provider → 503 `AI_001` kèm `details.reason`; không cấu hình LLM → `AI_001` ngay |
| `TC-ADM-03` | khách và tác giả **đã nhận 404** sau khi gỡ (không lộ nội dung), nhưng 9 chương vẫn `deleted_at is null` và thông báo không có câu SRS | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 (`6b5a58f`) | Thấp: chỉ dữ liệu và câu chữ, không lộ nội dung | ẩn cả chương; thông báo "Truyện đã bị gỡ bởi Admin" kèm tên truyện, lý do, thời điểm (D6) |
| `TC-ADM-08` | 9/9 bản nháp Mongo vẫn còn hiệu lực sau khi gỡ | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 | Thấp: chương đã 404 nên IDE không mở được | job `NOVEL_DRAFT_SYNC` đánh dấu và khôi phục bản nháp (D6) |

`TC-ADM-06` (khôi phục) PASS cả trên `main` lẫn nhánh sửa: đọc lại giống hệt lúc trước khi gỡ.

Chưa tạo issue trên GitHub. PR `fix/srs-backend-rules` là nơi theo dõi; khi tạo issue thì thêm link vào bảng này.

## Quyết định chính sách

Người làm đã chốt và cài đặt các quyết định dưới đây. D1, D2, D4 và D5 đổi hành vi với tác giả, ví và AI, nên **chờ Thái (chủ sản phẩm) xác nhận** trước khi merge. D6 cần người phụ trách #74 (@karasunosu) xác nhận phần khôi phục. Muốn đổi thì chỉ cần sửa hằng số hoặc biến môi trường ghi kèm.

- **D1. Luật 500 ký tự chỉ kiểm khi xuất bản chương**, gồm gửi trực tiếp, đăng theo lịch, và xuất bản lại chương đã sửa. Lưu nháp và autosave không bị chặn.
  - Lý do: SRS §1 và `TC-MOD-09` yêu cầu soạn thảo không bị chặn. UC 3.2 bước 4 ghi kiểm khi "Lưu tạm", mâu thuẫn với hai chỗ trên.
  - Hằng số: `CHAPTER_CONTENT_MIN`.
- **D2. Chương hợp lệ** phải đủ 4 điều kiện:
  - Chưa xoá.
  - Ở trạng thái `DRAFT`, `REJECTED`, `PENDING_MODERATION` hoặc `PUBLISHED`. **Không tính `ARCHIVED`**: tác giả đã cất chương đó đi, nên không còn là chương nháp đang dùng.
  - Tiêu đề < 100 ký tự.
  - Nội dung ≥ 500 ký tự (lấy bản nháp nếu có, không thì bản đã lưu).

  Điều kiện 5 chương chỉ áp khi gửi xuất bản truyện đang `DRAFT`, `REJECTED` hoặc `PENDING_MODERATION`; truyện đã `PUBLISHED` không bị ảnh hưởng. Lúc kiểm, các dòng chương được khoá (`FOR SHARE`) trong cùng transaction với bước đổi trạng thái truyện. Nhờ vậy, nếu tác giả lưu trữ chương đúng lúc gửi xuất bản, thao tác lưu trữ hoặc xong trước (và chương bị loại khỏi phép đếm), hoặc phải chờ xuất bản xong. Hằng số: `INITIAL_PUBLISH_MIN_CHAPTERS`.
- **D3. Không sửa dữ liệu cũ.** Tóm tắt ≥ 500 ký tự chỉ bắt buộc khi tạo truyện hoặc khi đổi tóm tắt. Form web chỉ gửi tiêu đề/tóm tắt khi có thay đổi, nên truyện cũ có tóm tắt ngắn vẫn sửa được ảnh bìa và thể loại.
- **D4. Giới hạn tần suất:**
  - 30 lượt/phút/người, dùng chung cho tạo phiên nạp, rút, mở khoá chương và ủng hộ.
  - Webhook giả lập được đếm **theo phiên nạp** (5 lượt), **sau** bước kiểm tra dữ liệu. Request sai dữ liệu không làm cạn lượt, và các callback đi chung một proxy/NAT không chặn lẫn nhau.
  - Cấu hình: `PAYMENT_RATE_LIMIT_MAX`, `PAYMENT_RATE_LIMIT_WINDOW_MS`, `WEBHOOK_CALLS_PER_SESSION`.
  - **Giới hạn khi phát hành:** bộ đếm nằm trong bộ nhớ một tiến trình. Đây là biện pháp chống spam cho bản demo chạy 1 instance, **không** phải giới hạn phân tán ở API Gateway như SRS mô tả, và **không** phải chống replay mức production. Trước khi mở ra ngoài hoặc chạy nhiều instance cần giới hạn phân tán (gateway/Redis) và webhook có xác thực (`DEFERRED`).
- **D5. Mọi lỗi AI đều trả 503 `AI_001`.** Client chỉ nhận `details.reason`. Nội dung provider trả về chỉ ghi vào log máy chủ, sau khi đã cắt ngắn và che khoá.
  - **Ngoại lệ so với SRS (cần Thái chấp nhận):** SRS §1 ghi lời gọi LLM không quá 5 giây. Code mặc định 30 giây, `.env.example` đặt 120 giây (`AI_LLM_TIMEOUT_MS`), vì Copilot là lời gọi riêng, không nằm trên đường lưu truyện/chương, và LLM local cần vài chục giây.
  - Test chạy với 3 giây nên chỉ chứng minh cách trả lỗi đúng. **Bản triển khai mặc định chưa đạt mốc 5 giây của SRS.** Môi trường có LLM nhanh đặt `AI_LLM_TIMEOUT_MS=5000` để đạt đúng SRS.
- **D6. Gỡ truyện giữ nguyên cơ chế sanction của #74**, gồm loại thông báo `ADMIN_DECISION`, link kháng nghị, audit và job có retry. Chỉ thêm phần SRS yêu cầu:
  - Ẩn các chương đang hiện lúc gỡ và đánh dấu bản nháp.
  - Thông báo "Truyện đã bị gỡ bởi Admin" kèm tên truyện, lý do, thời điểm.
  - Khôi phục chỉ trả lại đúng các chương và bản nháp mà sanction đó đã ẩn. Sanction tạo trước bản sửa (không có danh sách chương) khi khôi phục không đụng tới chương nào.
  - Migration `024_admin_novel_draft_sync.sql`. Đổi từ `020` để không trùng số với `020_story_brain_bible.sql` của #87.
- **D7. Thông báo chương mới** chỉ gửi khi truyện đang công khai, mỗi chương mỗi người 1 lần, áp cho cả 3 đường: tác giả đăng, đăng theo lịch, admin duyệt. Chia việc với #88:
  - Người **theo dõi tác giả** nhận `NEW_CHAPTER` từ nhánh này. Đây là đối tượng SRS §3.4 nêu.
  - Người **bật chuông của truyện** nhận `NOVEL_CHAPTER_PUBLISHED` từ trigger của #88 (migration `021`), và được nhánh này bỏ qua.
  - Hai đường dùng chung khoá sự kiện `chapter-published:<chương>:<người>`, nên một người vừa theo dõi tác giả vừa bật chuông chỉ nhận 1 thông báo.
  - Người chỉ theo dõi truyện mà không bật chuông thì không nhận, theo thiết kế của #88.
## Tương thích ngược

- CI P7/P8 (`run_ai_pipe_01a/02a/02b/03a`) tạo truyện bằng SQL, tạo chương với tiêu đề ngắn và không gửi xuất bản, nên không bị luật mới chặn.
- Bốn script chạy tay ghi vào DB dùng chung đã được sửa dữ liệu cho đủ độ dài/số chương nhưng **không chạy lại**, vì chúng ghi vào `ephurin`: `run_real_browser_e2e.py`, `run_manuscript_import_browser_e2e.py`, `run_ai_pipe_01b_main_e2e.py`, `run_author_publish_admin_moderation_e2e.py`. Hai script đã hỏng trên `main` vì lý do khác: `01b` sửa chương không gửi `expectedVersion` (428); `author_publish` tìm nút "New Project" không còn tồn tại.
- Test opt-in `author-launch.integration.test.ts` đã hỏng từ #74 (403 ở bước admin duyệt); nhánh sửa đã sửa lại.
