# Test case theo SRS

Bộ test case sinh từ `docs/SRS/` (10 file). SRS không đánh mã yêu cầu, nên mỗi test case ghi nguồn theo `file § mục / bước`. Kết quả từng lần chạy (SHA, PASS/FAIL, thời gian, DB tạm) nằm trong evidence của lần chạy đó, không ghi cứng ở đây.

## Cách chạy

Mọi script có ghi dữ liệu chạy trên môi trường tạm `scripts/e2e_isolated_stack.py`: DB Postgres/Mongo `ephurin_test_*` riêng, API và web build trên cổng riêng, xoá DB khi xong, DB dùng chung `ephurin` không bị ghi. Script chỉ chạy trên Windows (`taskkill`, đường dẫn Edge). Trong lúc chạy, tắt dev server và không dùng web dev, vì fingerprint DB dùng chung phải giữ nguyên.

| Mã nguồn tự động | Lệnh |
| :--- | :--- |
| `SRS` | `python scripts/run_srs_acceptance_e2e.py` (API, theo mã test case) |
| `SMOKE` | `python scripts/run_ui_smoke_matrix_e2e.py` (trình duyệt, 4 vai trò × 375/390/1440 × sáng/tối) |
| `SOCIAL` | `python scripts/run_reader_social_comment_preferences_e2e.py` (Interact-A→H) |
| `DISCOVERY` | `python scripts/run_reader_discovery_reading_state_e2e.py` (Reader-A→H) |
| `GUARD` | `python -m unittest scripts/test_e2e_isolated_stack.py` |
| `BACKEND` | `npm run test:isolated` (backend, DB tạm) hoặc test Postgres tương ứng |

Biến môi trường: `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1`, `EPHURIN_E2E_DEMO_PASSWORD` (lấy từ `backend/src/scripts/seed-sample-stories.ts`). Script `SRS` tự chạy một provider LLM giả trên cổng ngẫu nhiên và trỏ `AI_LLM_BASE_URL` của API tạm vào đó.

Phân loại các kiểm tra từng FAIL và quyết định đi kèm: `docs/testing/srs-disposition.md`.

Nếu máy có hai MongoDB cùng nghe cổng 27017 (ví dụ dịch vụ MongoDB của Windows ở `127.0.0.1` và MongoDB trong Docker ở `::1`), script sẽ từ chối chạy. Lý do: backend Node hiểu `localhost` là `::1`, còn Python hiểu là `127.0.0.1`, nên hai bên sẽ nói chuyện với hai server khác nhau. Khi đó đặt `BASE_MONGODB_URI=mongodb://[::1]:27017` để trỏ đúng Mongo của Docker mà backend dev đang dùng.

**Trạng thái dùng trong evidence:**
- `PASS` / `FAIL`: đã chạy tự động.
- `NOT_IMPLEMENTED`: SRS mô tả nhưng code chưa có, nên không có gì để chạy.
- `NOT_RUN`: cần hạ tầng mà môi trường local không có (Redis, FCM, nhà cung cấp OAuth, dịch vụ LLM, app di động, hạ tầng production).
- `MANUAL`: chưa tự động hoá, kiểm bằng tay.

## 1. Tổng quan hệ thống (`README.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-SYS-01 | §3.2 Permission Matrix | Khách đọc chương miễn phí; khách không theo dõi được; tác giả không vào API admin; độc giả không vào hàng đợi kiểm duyệt | 200 / 401 / 403 / 403 | SRS |
| TC-SYS-02 | §4.2 Security | Mật khẩu lưu dạng băm bcrypt/argon2 | `password_hash` bắt đầu bằng `$2`/`$argon2` | SRS (TC-AUTH-01) |
| TC-SYS-03 | §4.1 Response Time | Danh sách truyện phản hồi dưới 2 giây | < 2000 ms (đo local, 5 lần) | SRS |
| TC-SYS-04 | §4.1 Scalability / Concurrency | 10.000 người dùng, 1.000 người đồng thời | Đạt tải | NOT_RUN (cần hạ tầng tải) |
| TC-SYS-05 | §4.2 Encryption, §4.3 Reliability | HTTPS, backup hằng ngày, uptime 99,9% | Có cấu hình | NOT_RUN (hạ tầng production) |

## 2. Auth Service (`auth-service.md`, `appendices.md` phụ lục A)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-AUTH-01 | §3.1 bước 2–6 | Đăng ký email/username/mật khẩu hợp lệ | Tạo tài khoản vai trò READER, mật khẩu được băm | SRS |
| TC-AUTH-02 | §3.1 bước 4, phụ lục A | Email sai định dạng | Từ chối với mã `AUTH_001` | SRS |
| TC-AUTH-03 | §3.1 bước 4 | Mật khẩu yếu | Từ chối (400) | SRS |
| TC-AUTH-04 | §3.1 4a, phụ lục A | Trùng username | Từ chối với `USER_004` | SRS |
| TC-AUTH-05 | §3.1 4a | Trùng email | Từ chối (4xx) | SRS |
| TC-AUTH-06 | §1, §2.1, §3.2 bước 5 | Đăng nhập đúng | Access token 1 giờ; refresh token trong cookie HttpOnly | SRS |
| TC-AUTH-07 | §3.2 4a | Sai mật khẩu | `AUTH_003` | SRS |
| TC-AUTH-08 | §3.2 4b | Tài khoản bị Admin khoá | `AUTH_004` | SRS |
| TC-AUTH-09 | §3.2 bước 6 | Đăng nhập chuyển về đúng trang theo vai trò | Độc giả → `/reader`, tác giả → `/author`, admin → `/admin` | SMOKE (`*/login`) |
| TC-AUTH-10 | §1 Session Management | Refresh token 7 ngày cấp lại access token | Cookie `Max-Age` 604800; `/auth/refresh-token` trả token mới | SRS |
| TC-AUTH-11 | §1 RBAC, phụ lục A | Độc giả gọi API admin | 403 `AUTH_008` | SRS |
| TC-AUTH-12 | §3.2 | Đăng xuất | Xoá token, về `/login` | SMOKE (`*/logout`) |
| TC-AUTH-13 | §3.1 3a | Đăng ký/đăng nhập qua Google/Facebook (OAuth 2.0) | Tạo tài khoản READER | NOT_IMPLEMENTED (màn đăng nhập ghi rõ OAuth chưa nối) |

## 3. Reading Experience Service (`reading-experience-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-READ-01 | §3.1 bước 1 | Màn đọc chương có bảng tùy chỉnh phông, cỡ chữ, màu nền | Bảng hiển thị đủ | SMOKE (`reader/chapter-prose-*`) |
| TC-READ-02 | §3.1 bước 2–4 | Đổi tùy chỉnh, lưu, tải lại trang | Giá trị giữ nguyên trong UI và DB | SOCIAL (Interact-E) |
| TC-READ-03 | §3.1 bước 3 | Nền Sáng/Sepia/Tối áp lên chữ chương | Chữ đọc được, tương phản ≥ 4,5:1 | SMOKE (`reader/chapter-prose-*`) |
| TC-READ-04 | §3.1 4a | Lưu tùy chỉnh thất bại | Báo cấu hình chưa đồng bộ | MANUAL |
| TC-READ-05 | §3.2 bước 1–4 | Tìm theo từ khoá | Trả đúng truyện | SRS; DISCOVERY (Reader-B) |
| TC-READ-06 | §3.2 bước 2 (alt) | Lọc theo thể loại, không nhập từ khoá | Mọi kết quả đúng thể loại | SRS |
| TC-READ-07 | §3.2 bước 3 (alt) | Không có kết quả | Danh sách rỗng, không lỗi | SRS |
| TC-READ-08 | §1 Performance | Tìm kiếm phản hồi dưới 2 giây | < 2000 ms (local) | SRS |
| TC-READ-09 | §3.3 bước 1–3 | Gửi vị trí đọc (truyện, chương, đoạn) rồi đọc lại | Trả đúng chương vừa gửi | SRS; DISCOVERY (Reader-F/G) |
| TC-READ-10 | §3.3 Pre-condition | Lịch sử đọc khi chưa đăng nhập | 401 | SRS |
| TC-READ-11 | Interaction §3.2 | Thêm và bỏ truyện khỏi thư viện | Có/không có bản ghi `bookmarks` | DISCOVERY (Reader-C/D/H) |
| TC-READ-12 | §1, §2.1, §3.3 bước 2/4 | Redis cache, worker đồng bộ Redis → Postgres | Có cache và worker | NOT_IMPLEMENTED (không có Redis trong stack) |
| TC-READ-13 | §1 Performance | Trang đọc chương phản hồi dưới 2 giây | < 2000 ms (local) | SRS |
| TC-READ-14 | §3.1 Post-condition | Tùy chỉnh đọc tách riêng từng người dùng | Người khác không thấy thiết lập | SRS; BACKEND (Invariant 10) |

## 4. Interaction & Social Service (`interaction-social-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-SOC-01 | §3.1 bước 1–7 | Bình luận chương nội dung sạch | `APPROVED`, hiển thị ngay | SOCIAL (Interact-F) |
| TC-SOC-02 | §3.1 5a1, Content Control §3.2 3a | Bình luận chứa từ khoá bị lọc | `PENDING_MODERATION`, có review, khách không thấy | SRS |
| TC-SOC-03 | §3.1 5a2 | Admin duyệt bình luận chờ | Hiển thị công khai | SRS |
| TC-SOC-04 | §3.1 5a2 | Admin từ chối bình luận chờ | `REJECTED`, ẩn khỏi người khác | SRS |
| TC-SOC-05 | §3 (CRUD của người viết) | Sửa và xoá bình luận của mình | Lưu bản sửa; xoá mềm `DELETED` | SOCIAL (Interact-G/H) |
| TC-SOC-06 | README §3.2 | Sửa/xoá bình luận của người khác | 403 | SRS; BACKEND (Invariant 6) |
| TC-SOC-07 | §3.1 Pre-condition | Khách gửi bình luận | 401 | SRS |
| TC-SOC-08 | §1, §3.1 | Bình luận inline theo đoạn (`ParagraphOffset`) | Lưu và hiển thị đúng đoạn | NOT_IMPLEMENTED (chỉ có bình luận chương/truyện) |
| TC-SOC-09 | §1 Denormalized Likes, §3.2 | Like / like trùng / bỏ like | `likesCount` +1; trùng trả 409; bỏ like −1 | SRS; SOCIAL (Interact-B/C) |
| TC-SOC-10 | §3.2 | Thêm truyện vào kệ sách | Có bản ghi `bookmarks` | DISCOVERY (Reader-C) |
| TC-SOC-11 | §3.3 | Theo dõi tác giả | Có bản ghi `follows`, số người theo dõi tăng | SRS; SOCIAL (Interact-D) |
| TC-SOC-12 | §2.1, §3.4 bước 1–3 | Tác giả đăng chương mới | Người theo dõi nhận thông báo `Unread` | SRS |
| TC-SOC-13 | §2.1, §3.4 bước 4 | Gửi push qua FCM | Thiết bị nhận push | NOT_RUN (không có FCM trong môi trường local) |
| TC-SOC-14 | §3.4 2a | Tác giả không có người theo dõi | Không tạo thông báo | MANUAL |

## 5. Novel & Chapter Service (`novel-chapter-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-NOV-01 | §3.1 bước 1–2 | Tác giả tạo truyện | Trạng thái `DRAFT` | SRS |
| TC-NOV-02 | §1, §3.1 2a | Tiêu đề 255 ký tự | Từ chối (SRS: < 255 ký tự) | SRS |
| TC-NOV-03 | §1, §3.1 2a (sửa 2026-11-09, D3) | Tóm tắt 49 ký tự, chỉ có khoảng trắng, và đúng 50 ký tự | 49 ký tự và khoảng trắng bị từ chối; 50 ký tự được nhận | SRS |
| TC-NOV-04 | §1 Initial Publish, §3.1 bước 3 (sửa 2026-11-09, D2) | Gửi xuất bản truyện có 1 chương hợp lệ + 1 chương đã lưu trữ | 422 `VALIDATION_002`, truyện giữ `DRAFT` | SRS |
| TC-NOV-05 | §1 Chapter Validation | Tiêu đề chương 100 ký tự | Từ chối (SRS: < 100 ký tự) | SRS |
| TC-NOV-06 | §1, §3.2 bước 4 | Gửi xuất bản chương dưới 500 ký tự | Không được xuất bản | SRS |
| TC-NOV-07 | §2.2, §3.2 bước 5–8 | Gửi xuất bản chương hợp lệ | `PUBLISHED`, khách đọc được | SRS |
| TC-NOV-08 | §3.2 7a1 | Gửi xuất bản chương chứa từ khoá | `PENDING_MODERATION`, chưa công khai | SRS |
| TC-NOV-09 | §3.2 7a2 | Admin duyệt chương chờ | `PUBLISHED` | SRS |
| TC-NOV-10 | §3.2 7a2 (từ chối) | Admin từ chối/yêu cầu sửa chương | Chương không công khai; tác giả nhận lý do | SRS |
| TC-NOV-11 | §3.3 bước 1–7 | Quản lý nhân vật/timeline, quyền sở hữu | Lưu kèm nguồn; người không sở hữu bị chặn | NOT_RUN (thuộc luồng Writing Copilot, ngoài phạm vi PR #73) |
| TC-NOV-12 | README §3.2 (Chapters: Guest R Free) | Khách mở chương VIP | Không nhận nội dung (402) | SRS; SMOKE (khách chỉ đọc chương miễn phí) |
| TC-NOV-13 | README §3.2 | Độc giả tạo truyện | 403 | SRS |
| TC-NOV-14 | §2.1, §3.1 bước 3–7 (sửa 2026-11-09, D2) | Truyện đủ 2 chương hợp lệ gửi xuất bản | `PUBLISHED`, công khai | SRS |

## 6. Payment & Wallet Service (`payment-wallet-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-PAY-01 | §3.1 bước 2 | Danh sách gói nạp | Đủ các gói | SRS |
| TC-PAY-02 | §2.1, §3.1 bước 3–6 | Nạp qua mock gateway và xác nhận | Số dư tăng, giao dịch `DEPOSIT SUCCESS` | SRS |
| TC-PAY-03 | §3.1 4a | Mở phiên nạp nhưng không xác nhận | Không cộng Coin | SRS |
| TC-PAY-04 | §2.2, §3.2 bước 1–6 | Mở khoá chương VIP khi đủ Coin | Độc giả bị trừ, tác giả được cộng, đọc được nội dung | SRS |
| TC-PAY-05 | §3.2 4a | Mở khoá khi không đủ Coin | Báo lỗi, không trừ tiền | SRS |
| TC-PAY-06 | §1 Transaction Atomicity, §3.4 4a | Giao dịch lỗi giữa chừng thì rollback | Không đổi số dư | MANUAL (cần chèn lỗi DB) |
| TC-PAY-07 | §3.4 bước 1–5 | Ủng hộ tác giả | Độc giả −, tác giả +, giao dịch `DONATE` | SRS |
| TC-PAY-08 | §3.4 3a | Ủng hộ khi không đủ Coin | Báo lỗi | SRS |
| TC-PAY-09 | §3.4 2a | Ủng hộ số Coin không hợp lệ | 400 | SRS |
| TC-PAY-10 | §3.4 Pre-condition | Khách ủng hộ / xem ví | 401 | SMOKE (`guest/anonymous-api-negatives`) |
| TC-PAY-11 | §3.3 2a | Rút dưới hạn mức tối thiểu | Từ chối | SRS |
| TC-PAY-12 | §1 Locked Balance, §3.3 5a | Gửi yêu cầu rút rồi Admin từ chối | Coin chuyển sang đóng băng; từ chối thì trả lại | SRS |
| TC-PAY-13 | §3.3 5a3 | Tác giả nhận thông báo từ chối rút | Có thông báo kèm lý do | SRS |
| TC-PAY-14 | §3.3 bước 5–7 | Admin duyệt rút | Trừ hẳn Coin đóng băng, giao dịch `SUCCESS` | SRS |
| TC-PAY-15 | §1 Rate Limiting | Gửi liên tục 40 yêu cầu thanh toán | Có phản hồi 429 | SRS |

## 7. Content Control & Moderation (`content-control-moderation-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-MOD-01 | §3.2 3a | Bình luận dính rule tạo review | Có `MODERATION_REVIEW` | SRS (TC-SOC-02) |
| TC-MOD-02 | §3.3 bước 1–3 | Báo cáo chương kèm lý do | Tạo report và review | SRS |
| TC-MOD-03 | §3.3 1a | Báo cáo thiếu lý do | 400 | SRS |
| TC-MOD-04 | §3.3 1a | Báo cáo đối tượng không tồn tại | Lỗi validation/404 | SRS |
| TC-MOD-05 | §2.3 | Báo cáo thứ hai trên cùng đối tượng | Gắn vào review đang mở | SRS |
| TC-MOD-06 | §3.4 bước 1 | Admin lọc hàng đợi theo trạng thái và nguồn | Có review đúng bộ lọc | SRS |
| TC-MOD-07 | §3.4 3a | Quyết định lần hai trên review đã xử lý | Báo trạng thái đã đổi (409) | SRS |
| TC-MOD-08 | §3.4 Actor | Độc giả mở hàng đợi kiểm duyệt | 403 | SRS |
| TC-MOD-09 | §1 Non-blocking Authoring | Lưu nháp chứa từ khoá | Không bị chặn | SRS |
| TC-MOD-10 | §1 No LLM Moderation | Kiểm duyệt không gọi LLM | Không có lời gọi AI trong luồng kiểm duyệt | SRS (quét import trong `content-control`) |

## 8. Admin Novel Management (`admin-novel-management-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-ADM-01 | §4 bước 1–4 | Admin xem danh sách và chi tiết truyện | 200, có truyện | SRS |
| TC-ADM-02 | §5 Admin hủy xác nhận | Gỡ truyện thiếu xác nhận | Không đổi dữ liệu | SRS |
| TC-ADM-03 | §4 bước 7–10, §6 | Gỡ mềm một truyện đang công khai | `deleted_at` ở truyện và chương; khách và tác giả đọc lại truyện/chương nhận 404, truyện mất khỏi danh sách công khai và danh sách admin; tác giả nhận "Truyện đã bị gỡ bởi Admin" | SRS |
| TC-ADM-04 | §5 | Người không phải Admin gỡ truyện | `AUTH_008` | SRS |
| TC-ADM-05 | §5 | Gỡ truyện không tồn tại | `CONTENT_001` | SRS |
| TC-ADM-06 | §1, §6 (khôi phục được) | Khôi phục truyện đã gỡ | Khách và tác giả đọc lại được như trước khi gỡ; số bản nháp còn hiệu lực bằng lúc trước khi gỡ | SRS |
| TC-ADM-07 | §4 bước 6, §7 | Hộp thoại cảnh báo trước khi gỡ trên UI | Có cảnh báo | MANUAL |
| TC-ADM-08 | §4 bước 8, §7 | Draft Mongo của truyện bị gỡ không còn load trong IDE | `deletedAt` được đặt cho mọi bản nháp của truyện | SRS |

## 9. AI Intelligence Service (`ai-intelligence-service.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-AI-01 | §3.1 | Gợi ý tag và tiêu đề | Danh sách gợi ý; văn bản < 100 từ bị từ chối | NOT_RUN (cần dịch vụ LLM) |
| TC-AI-02 | §3.2 | Gợi ý thể loại theo Taxonomy | Thể loại hợp lệ | NOT_RUN (cần dịch vụ LLM) |
| TC-AI-03 | §3.3 | Phân tích văn phong | Báo cáo; chương < 500 từ bị từ chối | NOT_RUN (cần dịch vụ LLM) |
| TC-AI-04 | §3.4 | Writing Copilot gợi ý theo ngữ cảnh | Gợi ý; chỉ lưu khi tác giả chấp nhận | NOT_RUN (cần dịch vụ LLM) |
| TC-AI-05 | §3.5 | Kiểm tra nhất quán | Danh sách cảnh báo, không tự sửa | NOT_RUN (cần dịch vụ LLM) |
| TC-AI-06 | §1 Fallback, Timeout | Provider LLM giả trả 503, treo quá timeout (API đặt 3 giây), rồi tắt cổng | Cả ba lần trả 503 `AI_001` kèm `details.reason` trong 5 giây; ngay sau đó tác giả vẫn lưu chương được | SRS |

## 10. Client Applications (`client-applications.md`)

| ID | Nguồn SRS | Kiểm tra | Mong đợi | Cách chạy |
| :--- | :--- | :--- | :--- | :--- |
| TC-UI-01 | §1.2 nhóm Guest, §2 | Khách: thư viện công khai, chi tiết truyện, đọc chương miễn phí, hồ sơ tác giả | Mở được, không bắt đăng nhập | SMOKE (`guest/*`) |
| TC-UI-02 | §2 Login → dashboard | Đăng nhập theo vai trò | Đúng trang theo vai trò | SMOKE (`*/login`) |
| TC-UI-03 | §2 Reader | Khám phá → chi tiết → đọc chương → bình luận → lịch sử/thư viện | Đi hết luồng | DISCOVERY; SOCIAL |
| TC-UI-04 | §2 Author | Dashboard → quản lý truyện → trình soạn thảo | Mở được, có editor | SMOKE (`author/*`) |
| TC-UI-05 | §2 Admin | Dashboard admin, hàng đợi kiểm duyệt | Mở được, đúng vai trò | SMOKE (`admin/*`) |
| TC-UI-06 | §1.1 Module 4–5 | Navbar theo vai trò, đăng xuất qua menu avatar | Đúng mục cho từng vai trò | SMOKE (`*/navigation`, `*/logout`) |
| TC-UI-07 | §3 (UI) | 375/390/1440px, sáng/tối: không tràn ngang, đúng giao diện, không lỗi | Đạt mọi trang đã kiểm | SMOKE |
| TC-UI-08 | §1, README §1.2 | App di động React Native cho độc giả | Chạy được luồng đọc | NOT_RUN (thư mục `mobile/` ngoài phạm vi PR #73) |
