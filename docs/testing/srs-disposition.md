# Phân loại các kiểm tra SRS từng FAIL

11 kiểm tra trong `scripts/run_srs_acceptance_e2e.py` FAIL ở mọi lần chạy, cả trên PR #73 lẫn `main`. Bảng này phân loại từng kiểm tra, ghi người phụ trách và mức độ, giữ đường dẫn tới bằng chứng FAIL gốc (không sửa), và ghi các quyết định chính sách đi kèm bản sửa ở nhánh `fix/srs-backend-rules`.

Nhãn phân loại:
- `CONFIRMED_CONTRACT_GAP`: code lệch SRS hoặc `docs/API/error-codes.md`, không cần quyết định thêm.
- `SPEC_DECISION`: SRS có ghi, nhưng áp vào code cần một quyết định chính sách (ảnh hưởng tác giả, dữ liệu cũ). Chủ sản phẩm đã chốt ở mục cuối.
- `TEST_INVALID`: bài test chưa đo đúng điều SRS nói.
- `DEFERRED`: hoãn, có lý do.

## Bằng chứng

| Lần chạy | Code | Kết quả | Thư mục |
|---|---|---|---|
| PR #73 (giao diện) | `4983d6a` | 60/71 × 2 | `docs/development/PR73-REVIEW-R3/pr73-head/` |
| `main`, runner cũ | `06ecfbb` | 60/71 × 2 | `docs/development/PR73-REVIEW-R3/main-baseline/` |
| `main`, runner đã chỉnh `TC-AI-06` và `TC-ADM-03/06` | `06ecfbb` | 60/71 × 2 | `docs/development/SRS-BACKEND-R1/main-baseline/` |
| Nhánh sửa `fix/srs-backend-rules` | `4d89f0a` | 71/71 × 2 | `docs/development/SRS-BACKEND-R1/pr-head/` |
| `main` sau #86–#88 | `7b2ad2e` | 60/71 × 2 | `docs/development/SRS-BACKEND-R2/main-baseline/` |
| Nhánh sửa sau review và gộp `main` | `4534d50` | 71/71 × 2 | `docs/development/SRS-BACKEND-R2/pr-head/` |
| `main` sau #116 | `c47c87a` | 60/71 × 2 | `docs/development/SRS-BACKEND-R3/main-baseline/` |
| Nhánh sửa, hợp đồng D1–D7 ngày 2026-11-09 | `08217a6` | 71/71 × 2 | `docs/development/SRS-BACKEND-R3/pr-head/` |
| `main` sau #118 | `25fa0fd` | 60/71 × 2 | `docs/development/SRS-BACKEND-R4/main-baseline/` |
| Nhánh sửa, D6 đóng kỹ thuật, gộp #118 | `0c235df` | 71/71 × 2 | `docs/development/SRS-BACKEND-R4/pr-head/` |
| Nhánh sửa, review R5: bản nháp khi khôi phục truyện gỡ kiểu cũ | `2471728` | 71/71 × 2 | `docs/development/SRS-BACKEND-R5/pr-head/` |

## Bảng phân loại

Người làm: Minh Sơn (@Beomup31). Chủ sản phẩm: Thái (@Ephurin), đã chốt D1–D7 ngày 2026-11-09. D6 được chủ sản phẩm sign-off ngày 2026-11-10; nghiệm thu cuối thuộc chủ dự án.

| Kiểm tra | Trên `main` (bằng chứng FAIL) | Phân loại | Mức | Xử lý trên nhánh sửa |
|---|---|---|---|---|
| `TC-AUTH-02` | email sai → 400 `VALIDATION_001` | `CONFIRMED_CONTRACT_GAP` (phụ lục A: `AUTH_001`) | Thấp | 400 `AUTH_001` |
| `TC-NOV-02` | tiêu đề 255 ký tự → 500 `SYS_001`: slug vượt `varchar(255)` | `CONFIRMED_CONTRACT_GAP`, có lỗi 500 | Cao | tiêu đề < 255; slug cắt còn 200 ký tự + hậu tố |
| `TC-NOV-03` | tóm tắt 18 ký tự được chấp nhận (chỉ cần ≥ 10) | `SPEC_DECISION` (D3, đã chốt) | Trung bình | ≥ 50 ký tự (trim) khi tạo và khi đổi tóm tắt |
| `TC-NOV-05` | tiêu đề chương 100 ký tự được chấp nhận | `CONFIRMED_CONTRACT_GAP` | Thấp | < 100 |
| `TC-NOV-04` | truyện 1 chương gửi xuất bản được | `SPEC_DECISION` (D2, đã chốt) | Cao | cần ≥ 2 chương hợp lệ, không tính chương `ARCHIVED`, 422 `VALIDATION_002` |
| `TC-NOV-06` | chương 18 ký tự xuất bản được | `SPEC_DECISION` (D1) | Cao | < 500 ký tự → 422 `CONTENT_003` khi xuất bản |
| `TC-SOC-12` | người theo dõi không nhận thông báo chương mới | `CONFIRMED_CONTRACT_GAP` | Trung bình | thông báo `NEW_CHAPTER` cho người theo dõi tác giả, không trùng chuông truyện của #88 (D7) |
| `TC-PAY-15` | 40 lần tạo phiên nạp liên tiếp đều 201 | `CONFIRMED_CONTRACT_GAP`; con số giới hạn là `SPEC_DECISION` (D4) | Trung bình; Cao nếu mở API ra ngoài | 30 lượt/phút/người, 429 `RATE_LIMIT_001` |
| `TC-AI-06` | runner cũ: LLM tắt → 200 kèm gợi ý mẫu. Runner đã chỉnh (provider giả): 503 `AI_002`, treo → 504 `AI_004` sau 3 giây, mất kết nối → 502 `AI_002` | Runner cũ là `TEST_INVALID` vì không giả lập provider sập. Sau khi chỉnh thì là `CONFIRMED_CONTRACT_GAP`. Ngưỡng 5 giây được miễn cho Copilot (D5, đã chốt) | Trung bình | mọi lỗi provider → 503 `AI_001` kèm `details.reason`; không cấu hình LLM → `AI_001` ngay |
| `TC-ADM-03` | khách và tác giả **đã nhận 404** sau khi gỡ (không lộ nội dung), nhưng 9 chương vẫn `deleted_at is null` và thông báo không có câu SRS | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 (`6b5a58f`) | Thấp: chỉ dữ liệu và câu chữ, không lộ nội dung | ẩn cả chương; thông báo "Truyện đã bị gỡ bởi Admin" kèm tên truyện, lý do, thời điểm (D6) |
| `TC-ADM-08` | 9/9 bản nháp Mongo vẫn còn hiệu lực sau khi gỡ | `CONFIRMED_CONTRACT_GAP`, lỗi phát sinh từ #74 | Thấp: chương đã 404 nên IDE không mở được | job `NOVEL_DRAFT_SYNC` đánh dấu và khôi phục bản nháp (D6) |

`TC-ADM-06` (khôi phục) PASS cả trên `main` lẫn nhánh sửa: đọc lại giống hệt lúc trước khi gỡ.

Chưa tạo issue trên GitHub. PR `fix/srs-backend-rules` là nơi theo dõi; khi tạo issue thì thêm link vào bảng này.

## Quyết định chính sách (chủ sản phẩm đã chốt 2026-11-09)

Thái (chủ sản phẩm) đã chốt D1–D7 ngày 09/11/2026. D2 và D3 được **đổi** so với bản trước; các quyết định khác được chấp thuận kèm giới hạn phát hành ghi bên dưới. D6 được sign-off riêng ngày 10/11/2026. Đây là quyết định nghiệp vụ, không phải duyệt merge code. SRS gốc (`docs/SRS/novel-chapter-service.md`, `ai-intelligence-service.md`, `payment-wallet-service.md`) đã được sửa theo, có ghi ngày và lý do. Bằng chứng R1/R2 được giữ nguyên và thuộc **hợp đồng cũ** (5 chương, tóm tắt 500 ký tự).

- **D1. Chương phải có ít nhất 500 ký tự khi xuất bản**, gồm gửi trực tiếp, đặt lịch, và xuất bản lại chương đã sửa.
  - Không chặn tạo nháp, autosave, chỉnh sửa hay tạo chương bằng AI.
  - Chương cũ đã xuất bản dưới 500 ký tự vẫn đọc được; bản sửa mới phải đạt chuẩn khi xuất bản lại.
  - Hằng số: `CHAPTER_CONTENT_MIN`.
- **D2 (đổi). Xuất bản truyện lần đầu cần 2 chương hợp lệ** (trước đây là 5). Chương hợp lệ khi:
  - Chưa xoá.
  - Trạng thái `DRAFT`, `REJECTED`, `PENDING_MODERATION` hoặc `PUBLISHED` (không tính `ARCHIVED`).
  - Tiêu đề < 100 ký tự.
  - `content.trim().length >= 500`.

  Truyện có hơn 2 chương thì chỉ cần ít nhất 2 chương hợp lệ; chương `ARCHIVED` thứ ba không làm truyện bị chặn. Ví dụ: 1 chương thường + 1 `ARCHIVED` bị từ chối, 2 `ARCHIVED` bị từ chối, 2 chương thường được nhận.

  Luật chỉ kiểm khi gửi xuất bản truyện đang `DRAFT`, `REJECTED` hoặc `PENDING_MODERATION`, không áp ngược lên truyện đã `PUBLISHED`. Dòng truyện bị khoá và các chương được đếm bị khoá `FOR SHARE` trong cùng transaction với bước đổi trạng thái, nên thao tác lưu trữ chạy song song không lọt qua được. Hằng số: `INITIAL_PUBLISH_MIN_CHAPTERS = 2`.
- **D3 (đổi). Tóm tắt tối thiểu 50 ký tự** (trước đây là 500), đo bằng `trim().length`.
  - Áp khi tạo truyện hoặc khi tóm tắt thực sự thay đổi. Truyện cũ giữ nguyên tóm tắt ngắn vẫn sửa được bìa và thể loại, kể cả khi client gửi lại đúng tóm tắt đó; việc kiểm do `updateNovel` so với tóm tắt đang lưu.
  - Tạo dự án không bắt buộc hoàn thành Story Bible.
  - Lý do: tác giả có thể khởi tạo truyện từ ý tưởng, thế giới, nhân vật, luật lệ và Story Bible; tóm tắt chỉ là lời giới thiệu ngắn. Phần setup/outline của P2 là ý định dự kiến, không tự động coi là canon. Hằng số: `NOVEL_SYNOPSIS_MIN = 50`.
- **D4. Giới hạn tần suất, chỉ dùng cho demo 1 instance.**
  - 30 lượt/phút/người cho các API chuyển tiền.
  - Webhook giả lập: 5 lượt mỗi phiên nạp, đếm sau bước kiểm tra dữ liệu.
  - Đây **không** phải giới hạn phân tán, không xác thực webhook và không chống replay. **Chặn** thanh toán production và chạy nhiều instance công khai cho tới khi có gateway/Redis, xác thực callback, idempotency và nghiệm thu bảo mật.
  - Cấu hình: `PAYMENT_RATE_LIMIT_MAX`, `PAYMENT_RATE_LIMIT_WINDOW_MS`, `WEBHOOK_CALLS_PER_SESSION`.
- **D5. Copilot không khả dụng thì trả HTTP 503 `AI_001`** kèm `reason` cố định, không trả nội dung chẩn đoán của provider. Soạn thảo và autosave không phụ thuộc provider.
  - Ngoại lệ so với mốc 5 giây của SRS **được chấp thuận** cho Copilot: code mặc định 30 giây; môi trường LLM local/chậm có thể đặt 120 giây theo `.env.example`. SRS đã sửa để không ghi 5 giây.
  - 120 giây là cấu hình có chủ đích, không phải cam kết độ trễ production. Log không được lộ nội dung nhạy cảm: nội dung provider được cắt ngắn và che khoá trước khi ghi log.
- **D6. Gỡ truyện (chủ sản phẩm đã sign-off chính sách ngày 2026-11-10).** Người nghiệm thu cuối là chủ dự án (@Ephurin); không cần chờ người khác duyệt.
  - **HIDE:** sanction `HIDE` ẩn truyện, các chương đang hiện lúc gỡ và bản nháp Mongo của đúng các chương đó. Sanction, audit và thông báo cho tác giả giữ nguyên.
  - **RESTORE:** chỉ trả lại chương và bản nháp do chính sanction đó ẩn (`previous_state.chapterIds`).
    - Không hồi sinh nội dung tác giả đã xoá, kể cả khi xoá trước lúc HIDE.
    - Sanction cũ thiếu `chapterIds` không có danh sách để khôi phục, nên không chương hay bản nháp nào bị đụng tới (giữ nguyên, không đoán).
    - Truyện bị gỡ theo kiểu cũ, từ trước khi có sanction: chỉ khôi phục chương có `deleted_at` trùng đúng `deleted_at` của truyện (lần gỡ đó ghi cùng một mốc thời gian trong một transaction). Chương tác giả xoá trước đó giữ nguyên.
    - Bản nháp Mongo của các chương đó chỉ hiện lại nếu bị xoá từ lúc gỡ trở đi (`deletedAt >= deleted_at` của truyện); không đọc được thời điểm gỡ thì không bản nháp nào hiện lại (review R5).
      - Lần gỡ cũ chỉ đánh dấu bản nháp còn sống, bằng thời điểm của chính nó. Khi truyện đang bị gỡ, không có gì bên trong bị xoá thêm được.
      - Bản nháp đã bị xoá trước lúc gỡ giữ nguyên từng byte, kể cả khi chương của nó được khôi phục.
      - Quy tắc này so thời điểm API ghi vào Mongo với thời điểm của PostgreSQL, nên giả định demo 1 instance dùng chung đồng hồ. Nếu đồng hồ API chậm hơn DB, bản nháp giữ trạng thái đã xoá (chiều an toàn). Nếu nhanh hơn Δ giây, chỉ bản nháp bị xoá trong Δ giây ngay trước lúc gỡ có thể bị nhận nhầm; hiện không có đường code nào xoá riêng bản nháp như vậy.
  - **Đồng bộ Mongo:** job `NOVEL_DRAFT_SYNC` luôn đưa bản nháp về trạng thái sanction **hiện tại** của truyện, bất kể job do sanction nào tạo. Nhờ vậy job cũ chạy trễ không làm hiện lại hay ẩn lại sai. Job chạy lặp lại không đổi kết quả.
  - **Phạm vi demo 1 instance:** PostgreSQL và MongoDB nhất quán sau cùng (eventual consistency) qua job.
    - Job tự thử lại tối đa 6 lần, giãn cách tăng dần. Sau đó chuyển `FAILED` và admin thử lại bằng tay; thao tác này có ghi audit.
    - Lỗi Mongo nằm lại trên job (`error`, `attempts`, `failed_at`) và hiện ở trang admin jobs.
    - Trong lúc job đang chờ hoặc đã `FAILED`, khách và tác giả vẫn không đọc được truyện, vì quyền đọc đi qua PostgreSQL.
    - Đây **không** phải giao dịch nguyên tử giữa hai DB, không phải cam kết sẵn sàng production, và không thay cho các kiểm tra an toàn trước khi triển khai.
  - Trong lúc truyện bị ẩn, tác giả không xoá/lưu trữ được chương bên trong (404) và admin không sanction riêng được chương (409), nên không có đường API nào xoá riêng nội dung khi sanction đang hiệu lực.
  - Test: `backend/src/modules/admin/novel-removal-d6.postgres.test.ts` tiêm lỗi ghi Mongo thật bằng validator của collection. Bằng chứng RED → GREEN ở `docs/development/SRS-BACKEND-R4/` (3 lỗ hổng đầu) và `docs/development/SRS-BACKEND-R5/` (bản nháp khi khôi phục truyện gỡ kiểu cũ).
  - Migration `025_admin_novel_draft_sync.sql`.
- **D7. Mỗi độc giả nhận đúng 1 thông báo cho mỗi chương.**
  - Theo dõi tác giả → `NEW_CHAPTER` (nhánh này).
  - Bật chuông truyện → `NOVEL_CHAPTER_PUBLISHED` (trigger của #88).
  - Có cả hai thì không bị gửi đôi, nhờ dùng chung khoá sự kiện `chapter-published:<chương>:<người>`.
  - Truyện chưa công khai thì không gửi. Theo dõi truyện không đồng nghĩa với bật chuông; UI và tài liệu phải nói rõ.
## Tương thích ngược

- Bằng chứng R1 (`4d89f0a`) và R2 (`4534d50`) chạy theo hợp đồng cũ (5 chương, tóm tắt 500 ký tự); không dùng chúng làm bằng chứng cho D2/D3 mới.
- CI P7/P8 (`run_ai_pipe_01a/02a/02b/03a`) tạo truyện bằng SQL, tạo chương với tiêu đề ngắn và không gửi xuất bản, nên không bị luật mới chặn.
- Bốn script chạy tay ghi vào DB dùng chung đã được sửa dữ liệu cho đủ độ dài/số chương nhưng **không chạy lại**, vì chúng ghi vào `ephurin`: `run_real_browser_e2e.py`, `run_manuscript_import_browser_e2e.py`, `run_ai_pipe_01b_main_e2e.py`, `run_author_publish_admin_moderation_e2e.py`. Hai script đã hỏng trên `main` vì lý do khác: `01b` sửa chương không gửi `expectedVersion` (428); `author_publish` tìm nút "New Project" không còn tồn tại.
- Test opt-in `author-launch.integration.test.ts` đã hỏng từ #74 (403 ở bước admin duyệt); nhánh sửa đã sửa lại.
