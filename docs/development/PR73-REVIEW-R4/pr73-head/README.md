# Evidence `pr73-head`

- Source: `484a58e6955f0d50cca8287a2d187a6051d121a1` on `feat/ui-reader` (tracked changes uncommitted: False); `origin/main` at `06ecfbbec3650afbfd289f0b1fae390f3b0db0d5`
- Started 2026-11-02T22:26:11+0700, finished 2026-11-02T22:40:10+0700
- Environment: Windows 11 (10.0.26200); Python 3.15.0; Node v24.21.0; npm 11.19.0; Microsoft Edge 156.0.4314.58 (headless=new, CDP); PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2); MongoDB 7.0.43 at `mongodb://[::1]:27017`
- Every step exit 0: **True**
- Shared database fingerprint (35 Postgres tables + Mongo collections of `ephurin`, before = after for every runner): `686d5ca351f2c4b1`

Windows-only runners (taskkill, Microsoft Edge). Commands ran with `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` except the refusal tests; the demo password came from the seed file through `EPHURIN_E2E_DEMO_PASSWORD` and is not recorded.

| Step | Command | Exit | Seconds | Counts | Disposable DB | Dropped | Shared DB |
|---|---|---|---|---|---|---|---|
| `web_typecheck` | `npm run typecheck` | 0 | 6.7 |  |  |  |  |
| `web_unit_tests` | `node --test tests/contrast.test.mjs tests/color-scheme.test.mjs tests/project-sorting.test.mjs` | 0 | 0.4 | 26 pass / 0 fail |  |  |  |
| `web_wallet_test` | `npm run test:wallet` | 0 | 0.9 | 4 pass / 0 fail |  |  |  |
| `backend_typecheck` | `npm run typecheck` | 0 | 4.1 |  |  |  |  |
| `web_chapter_sorting_test` | `node --test tests/chapter-sorting.test.mjs` | 0 | 0.4 | 2 pass / 0 fail |  |  |  |
| `backend_isolated_suite` | `npm run test:isolated` | 0 | 21.0 | 246 pass / 0 fail / 5 skip |  |  |  |
| `refusal_tests` | `"python" -m unittest scripts/test_e2e_isolated_stack.py -v` | 0 | 42.7 | 10 tests, OK |  |  |  |
| `social_run_1` | `"python" scripts/run_reader_social_comment_preferences_e2e.py` | 0 | 58.2 | 8/8 checkpoints | `ephurin_test_social_368869ac311d` | True | unchanged |
| `social_run_2` | `"python" scripts/run_reader_social_comment_preferences_e2e.py` | 0 | 57.3 | 8/8 checkpoints | `ephurin_test_social_8f9e93612193` | True | unchanged |
| `discovery_run_1` | `"python" scripts/run_reader_discovery_reading_state_e2e.py` | 0 | 56.3 | 6 pass / 0 fail; 8/8 checkpoints | `ephurin_test_discovery_16573097486d` | True | unchanged |
| `discovery_run_2` | `"python" scripts/run_reader_discovery_reading_state_e2e.py` | 0 | 56.9 | 6 pass / 0 fail; 8/8 checkpoints | `ephurin_test_discovery_837eed44c07b` | True | unchanged |
| `smoke_matrix_1` | `"python" scripts/run_ui_smoke_matrix_e2e.py` | 0 | 209.8 | 138/138 checks | `ephurin_test_smoke_fa72048dc0cd` | True | unchanged |
| `smoke_matrix_2` | `"python" scripts/run_ui_smoke_matrix_e2e.py` | 0 | 210.3 | 138/138 checks | `ephurin_test_smoke_34958425a38e` | True | unchanged |
| `srs_acceptance_1` | `"python" scripts/run_srs_acceptance_e2e.py` | 0 | 55.3 | 71/71 checks | `ephurin_test_srs_c979deb955d8` | True | unchanged |
| `srs_acceptance_2` | `"python" scripts/run_srs_acceptance_e2e.py` | 0 | 54.4 | 71/71 checks | `ephurin_test_srs_4b619cfbfe22` | True | unchanged |

Full per-step data, failures and output tails: `manifest.json`. Screenshots: `screenshots/`.

## SRS acceptance results

| ID | Test case | Result |
|---|---|---|
| TC-AUTH-01 | Đăng ký hợp lệ tạo tài khoản READER, mật khẩu được băm | PASS |
| TC-AUTH-02 | Email sai định dạng trả AUTH_001 | PASS |
| TC-AUTH-03 | Mật khẩu yếu bị từ chối | PASS |
| TC-AUTH-04 | Trùng username trả USER_004 | PASS |
| TC-AUTH-05 | Trùng email bị từ chối | PASS |
| TC-AUTH-06 | Đăng nhập trả access token 1 giờ và refresh token trong HttpOnly cookie | PASS |
| TC-AUTH-07 | Sai mật khẩu trả AUTH_003 | PASS |
| TC-AUTH-08 | Tài khoản bị khoá đăng nhập trả AUTH_004 | PASS |
| TC-AUTH-10 | Refresh token 7 ngày cấp lại access token | PASS |
| TC-AUTH-11 | Độc giả gọi API admin bị chặn AUTH_008 | PASS |
| TC-READ-05 | Tìm theo từ khoá trả đúng truyện | PASS |
| TC-READ-06 | Lọc theo thể loại không cần từ khoá | PASS |
| TC-READ-07 | Không có kết quả trả danh sách rỗng, không lỗi | PASS |
| TC-READ-08 | Tìm kiếm phản hồi dưới 2 giây (local) | PASS |
| TC-READ-09 | Đồng bộ vị trí đọc và đọc lại đúng chương | PASS |
| TC-READ-10 | Lịch sử đọc yêu cầu đăng nhập | PASS |
| TC-READ-13 | Trang đọc chương phản hồi dưới 2 giây (local) | PASS |
| TC-READ-14 | Tùy chỉnh đọc tách riêng từng người dùng | PASS |
| TC-SOC-09 | Like tăng likesCount, like trùng trả 409, bỏ like giảm lại | PASS |
| TC-SOC-02 | Bình luận dính từ khoá chờ duyệt, khách không thấy | PASS |
| TC-SOC-03 | Admin duyệt bình luận thì bình luận hiển thị công khai | PASS |
| TC-SOC-04 | Admin từ chối bình luận thì bình luận bị ẩn (REJECTED) | PASS |
| TC-SOC-06 | Không sửa/xoá được bình luận của người khác | PASS |
| TC-SOC-07 | Khách không bình luận được (401) | PASS |
| TC-SOC-11 | Theo dõi tác giả ghi quan hệ follow | PASS |
| TC-MOD-02 | Báo cáo kèm lý do tạo USER_REPORT và review | PASS |
| TC-MOD-03 | Báo cáo thiếu lý do bị từ chối | PASS |
| TC-MOD-04 | Báo cáo đối tượng không tồn tại bị từ chối | PASS |
| TC-MOD-05 | Báo cáo thứ hai gắn vào review đang mở | PASS |
| TC-MOD-06 | Admin lọc hàng đợi theo trạng thái và nguồn | PASS |
| TC-MOD-07 | Quyết định lần hai trên review đã xử lý bị từ chối | PASS |
| TC-MOD-08 | Độc giả không vào được hàng đợi kiểm duyệt | PASS |
| TC-MOD-10 | Luồng kiểm duyệt không gọi AI/LLM (quét import) | PASS |
| TC-NOV-01 | Tác giả tạo truyện mới ở trạng thái DRAFT | PASS |
| TC-NOV-02 | Tiêu đề 255 ký tự bị từ chối | PASS |
| TC-NOV-03 | Tóm tắt dưới 500 ký tự bị từ chối | PASS |
| TC-NOV-05 | Tiêu đề chương 100 ký tự bị từ chối | PASS |
| TC-NOV-04 | Truyện dưới 5 chương nháp không gửi xuất bản được | PASS |
| TC-NOV-14 | Truyện đủ 5 chương hợp lệ gửi duyệt thì được xuất bản công khai | PASS |
| TC-NOV-06 | Chương dưới 500 ký tự không được xuất bản | PASS |
| TC-NOV-07 | Chương hợp lệ được xuất bản và khách đọc được | PASS |
| TC-NOV-08 | Chương dính từ khoá chuyển sang chờ duyệt, chưa công khai | PASS |
| TC-NOV-09 | Admin duyệt chương chờ duyệt thì chương được xuất bản | PASS |
| TC-NOV-10 | Admin từ chối chương thì chương không công khai và tác giả nhận lý do | PASS |
| TC-NOV-12 | Khách không đọc được nội dung chương VIP | PASS |
| TC-NOV-13 | Độc giả không tạo được truyện | PASS |
| TC-SOC-12 | Người theo dõi nhận thông báo khi tác giả đăng chương mới | PASS |
| TC-MOD-09 | Lưu nháp chứa từ khoá không bị chặn | PASS |
| TC-PAY-01 | Hiển thị các gói nạp | PASS |
| TC-PAY-02 | Nạp thành công cộng Coin và ghi giao dịch DEPOSIT SUCCESS | PASS |
| TC-PAY-03 | Phiên nạp chưa xác nhận (huỷ) không cộng Coin | PASS |
| TC-PAY-04 | Mở khoá VIP trừ Coin độc giả, cộng tác giả, mở nội dung | PASS |
| TC-PAY-05 | Không đủ Coin thì không mở khoá được và không trừ tiền | PASS |
| TC-PAY-07 | Ủng hộ trừ Coin độc giả và cộng tác giả | PASS |
| TC-PAY-08 | Ủng hộ khi không đủ Coin bị từ chối | PASS |
| TC-PAY-09 | Ủng hộ số Coin không hợp lệ bị từ chối | PASS |
| TC-PAY-11 | Rút dưới hạn mức tối thiểu bị từ chối | PASS |
| TC-PAY-12 | Yêu cầu rút đóng băng Coin; Admin từ chối thì trả lại | PASS |
| TC-PAY-13 | Tác giả nhận thông báo từ chối rút kèm lý do | PASS |
| TC-PAY-14 | Admin duyệt rút thì trừ hẳn Coin đóng băng, giao dịch SUCCESS | PASS |
| TC-PAY-15 | API thanh toán có giới hạn tần suất (429) | PASS |
| TC-ADM-01 | Admin xem danh sách và chi tiết truyện | PASS |
| TC-ADM-02 | Gỡ truyện thiếu xác nhận không thay đổi dữ liệu | PASS |
| TC-ADM-04 | Người không phải Admin không gỡ được truyện (AUTH_008) | PASS |
| TC-ADM-03 | Gỡ mềm truyện: ẩn truyện và chương, báo tác giả | PASS |
| TC-ADM-08 | Bản nháp Mongo của truyện bị gỡ được đánh dấu xoá | PASS |
| TC-ADM-05 | Gỡ truyện không tồn tại trả CONTENT_001 | PASS |
| TC-ADM-06 | Admin khôi phục truyện đã gỡ | PASS |
| TC-AI-06 | AI không sẵn sàng trả AI_001 trong 5 giây, không chặn thao tác | PASS |
| TC-SYS-01 | Ma trận quyền Guest/Reader/Author/Admin | PASS |
| TC-SYS-03 | Danh sách truyện phản hồi dưới 2 giây (local) | PASS |
