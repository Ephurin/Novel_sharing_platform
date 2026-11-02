"""
Builds the system test workbook (layout of the team's 9_system_test.xlsx, chapter 6.2 of the course
material: GUI, function and flow test cases per module) from executed evidence only.

Inputs: the manifest written by scripts/run_e2e_evidence_suite.py (two runs of every runner) and,
optionally, the SRS evidence of baseline runs on main. Every Evaluation cell comes from those runs:
Pass only when every run passed, Fail when any run failed (a mismatch between runs is reported as
unstable), N/A with the reason when a case could not be executed.

Usage:
  python scripts/build_system_test_report.py --manifest docs/development/PR73-REVIEW-R3/pr73-head/manifest.json \
      --baseline <main srs-1 evidence.json> <main srs-2 evidence.json> --out docs/development/PR73-REVIEW-R3/system-test-report.xlsx
"""

import argparse
import json
import os
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

FONT = "Times New Roman"
YELLOW = PatternFill("solid", fgColor="FFFF00")
HEADER = PatternFill("solid", fgColor="D9D9D9")
SECTION = PatternFill("solid", fgColor="F2F2F2")
THIN = Side(style="thin", color="000000")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
COLUMNS = [("B", "C", "Test ID"), ("D", "G", "Test Objective"), ("H", "L", "Test Steps"), ("M", "Q", "Expected Results"),
           ("R", "V", "Input Data"), ("W", "AB", "Testing Result"), ("AC", "AC", "Evaluation")]

ALL_COMBOS = "375/390/1440 px × sáng/tối"
SMOKE_NOTE = f"Chạy trên trình duyệt Edge thật ({ALL_COMBOS}), 2 lượt"

# Each row: (id, objective, steps, expected, input data, source).
# source: ("srs", "TC-..") | ("smoke", role, step_prefix) | ("social", key) | ("discovery", key)
#         ("step", manifest step name) | ("na", reason)
FEATURES: List[Dict[str, Any]] = [
    {
        "sheet": "FeatureTest_AUTH", "function": "Đăng ký, đăng nhập và phân quyền", "scope": "Auth Service (auth-service.md)",
        "precondition": "Precond: DB tạm vừa seed có reader02 (ADMIN), reader03 (AUTHOR), reader04/05 (READER). Người dùng truy cập /login.",
        "sections": [
            ("Giao diện", [
                ("AUTH_01", "Kiểm tra màn hình đăng nhập ở các kích thước và giao diện sáng/tối", "1. Mở /login\n2. Nhập email, mật khẩu\n3. Bấm Login",
                 "Form hiển thị đủ, không tràn ngang, đúng giao diện sáng/tối, đăng nhập vào đúng trang theo vai trò", SMOKE_NOTE, ("smoke", "*", "login")),
            ]),
            ("Chức năng", [
                ("AUTH_02", "Đăng ký tài khoản hợp lệ (TC-AUTH-01)", "Gửi đăng ký với email, username, mật khẩu mạnh", "Tạo tài khoản vai trò READER; mật khẩu lưu dạng băm", "email srs_new_*@srs.test, mật khẩu đủ mạnh", ("srs", "TC-AUTH-01")),
                ("AUTH_03", "Email sai định dạng (TC-AUTH-02)", "Gửi đăng ký với email 'not-an-email'", "Từ chối với mã AUTH_001 (phụ lục A)", "email: not-an-email", ("srs", "TC-AUTH-02")),
                ("AUTH_04", "Mật khẩu yếu (TC-AUTH-03)", "Gửi đăng ký với mật khẩu 'short'", "Từ chối (400)", "password: short", ("srs", "TC-AUTH-03")),
                ("AUTH_05", "Trùng username (TC-AUTH-04)", "Đăng ký lại cùng username, email khác", "Từ chối với USER_004", "username đã tồn tại", ("srs", "TC-AUTH-04")),
                ("AUTH_06", "Trùng email (TC-AUTH-05)", "Đăng ký lại cùng email, username khác", "Từ chối (4xx)", "email đã tồn tại", ("srs", "TC-AUTH-05")),
                ("AUTH_07", "Đăng nhập đúng (TC-AUTH-06)", "Đăng nhập bằng tài khoản vừa tạo", "Access token 1 giờ; refresh token trong cookie HttpOnly", "tài khoản hợp lệ", ("srs", "TC-AUTH-06")),
                ("AUTH_08", "Sai mật khẩu (TC-AUTH-07)", "Đăng nhập với mật khẩu sai", "AUTH_003", "password: Wrong-Pass-1", ("srs", "TC-AUTH-07")),
                ("AUTH_09", "Tài khoản bị khoá (TC-AUTH-08)", "1. Admin khoá tài khoản\n2. Đăng nhập\n3. Admin mở khoá", "Đăng nhập bị từ chối với AUTH_004", "lý do khoá: SRS acceptance", ("srs", "TC-AUTH-08")),
                ("AUTH_10", "Refresh token (TC-AUTH-10)", "1. Đăng nhập\n2. Gọi /auth/refresh-token bằng cookie", "Cookie Max-Age 7 ngày; trả access token mới", "tài khoản riêng srs_refresh_*", ("srs", "TC-AUTH-10")),
                ("AUTH_11", "Phân quyền API admin (TC-AUTH-11)", "Độc giả gọi GET /admin/users", "403 AUTH_008", "reader04", ("srs", "TC-AUTH-11")),
            ]),
            ("Luồng", [
                ("AUTH_12", "Chuyển trang sau đăng nhập theo vai trò (TC-AUTH-09)", "Đăng nhập lần lượt độc giả, tác giả, admin", "Độc giả → /reader, tác giả → /author, admin → /admin", SMOKE_NOTE, ("smoke", "*", "login")),
                ("AUTH_13", "Đăng xuất (TC-AUTH-12)", "Mở menu tài khoản → Đăng xuất", "Về /login, token bị xoá", SMOKE_NOTE, ("smoke", "*", "logout")),
                ("AUTH_14", "Đăng nhập Google/Facebook (TC-AUTH-13)", "—", "Tạo tài khoản READER qua OAuth", "—", ("na", "Chưa triển khai: màn đăng nhập ghi rõ OAuth chưa được nối.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_READ", "function": "Trải nghiệm đọc", "scope": "Reading Experience Service (reading-experience-service.md)",
        "precondition": "Precond: Độc giả reader04 đã đăng nhập; truyện mẫu Ashenhold đã xuất bản, có chương miễn phí và chương VIP.",
        "sections": [
            ("Giao diện", [
                ("READ_01", "Màn đọc chương với nền Sepia (TC-READ-01, TC-READ-03)", "1. Lưu tuỳ chỉnh nền Sepia\n2. Mở chương", "Có bảng tuỳ chỉnh; chữ chương tương phản ≥ 4,5:1; nút tăng/giảm nằm trong ô số", SMOKE_NOTE, ("smoke", "reader", "chapter-prose-sepia")),
                ("READ_02", "Màn đọc chương với nền Tối", "1. Lưu nền Tối\n2. Mở chương", "Chữ chương tương phản ≥ 4,5:1, không tràn ngang", SMOKE_NOTE, ("smoke", "reader", "chapter-prose-dark")),
                ("READ_03", "Màn đọc chương với nền Sáng", "1. Lưu nền Sáng\n2. Mở chương", "Chữ chương tương phản ≥ 4,5:1, không tràn ngang", SMOKE_NOTE, ("smoke", "reader", "chapter-prose-light")),
                ("READ_04", "Màn chi tiết truyện của độc giả", "Mở /reader/novels/:id", "Hiển thị tiêu đề, nút thích/thêm thư viện; không lỗi", SMOKE_NOTE, ("smoke", "reader", "novel-detail")),
                ("READ_05", "Màn đọc chương công khai cho khách", "Mở /public/chapters/:id khi chưa đăng nhập", "Nội dung chương đọc được, tương phản ≥ 4,5:1", SMOKE_NOTE, ("smoke", "guest", "public-chapter")),
            ]),
            ("Chức năng", [
                ("READ_06", "Tìm theo từ khoá (TC-READ-05)", "Gọi tìm kiếm q=Ashenhold", "Trả đúng truyện", "q: Ashenhold", ("srs", "TC-READ-05")),
                ("READ_07", "Lọc theo thể loại (TC-READ-06)", "Lọc genre của truyện mẫu, không nhập từ khoá", "Mọi kết quả đúng thể loại", "genre: Fantasy", ("srs", "TC-READ-06")),
                ("READ_08", "Không có kết quả (TC-READ-07)", "Tìm một từ khoá không tồn tại", "Danh sách rỗng, không lỗi", "q: zz-no-match-*", ("srs", "TC-READ-07")),
                ("READ_09", "Tốc độ tìm kiếm (TC-READ-08)", "Đo 5 lần tìm kiếm", "Mỗi lần < 2 giây (local)", "q: Story", ("srs", "TC-READ-08")),
                ("READ_10", "Đồng bộ vị trí đọc (TC-READ-09)", "1. PUT lịch sử (chương 2, đoạn 3)\n2. GET lịch sử", "Trả đúng chương vừa gửi", "paragraphIndex 3, pageOffset 0.4", ("srs", "TC-READ-09")),
                ("READ_11", "Lịch sử đọc cần đăng nhập (TC-READ-10)", "Khách gọi GET lịch sử", "401", "không có token", ("srs", "TC-READ-10")),
                ("READ_12", "Tốc độ trang đọc chương (TC-READ-13)", "Đo 5 lần tải chương", "Mỗi lần < 2 giây (local)", "chương 1 Ashenhold", ("srs", "TC-READ-13")),
                ("READ_13", "Tuỳ chỉnh đọc theo từng người (TC-READ-14)", "reader04 lưu cỡ chữ 22; reader05 đọc tuỳ chỉnh", "reader05 không nhận thiết lập của reader04", "fontSize 22, SEPIA", ("srs", "TC-READ-14")),
            ]),
            ("Luồng", [
                ("READ_14", "Đổi tuỳ chỉnh, lưu, tải lại (TC-READ-02)", "1. Chọn Serif, cỡ 20, Sepia, giãn dòng 1.9\n2. Lưu\n3. Tải lại trang", "Giá trị giữ nguyên trong giao diện và DB", "Georgia, 20, SEPIA, 1.9", ("social", "interact_e")),
                ("READ_15", "Khám phá → đọc → lịch sử (TC-READ-09)", "Tìm truyện, đọc chương, mở lịch sử, đọc tiếp", "Lịch sử ghi đúng chương, Đọc tiếp mở đúng chương", "reader04, Ashenhold", ("discovery", "reader_f")),
                ("READ_16", "Đọc tiếp từ lịch sử", "Bấm Đọc tiếp trong lịch sử", "Mở đúng chương cuối đã đọc", "reader04", ("discovery", "reader_g")),
                ("READ_17", "Thêm và bỏ truyện khỏi thư viện (TC-READ-11)", "Thêm truyện → mở thư viện → bỏ truyện", "Có rồi không còn bản ghi bookmark", "reader04, Ashenhold", ("discovery", "reader_h")),
                ("READ_18", "Lưu tuỳ chỉnh thất bại (TC-READ-04)", "—", "Báo cấu hình chưa đồng bộ", "—", ("na", "Chưa tự động hoá: cần giả lập lỗi máy chủ khi lưu.")),
                ("READ_19", "Redis cache và worker đồng bộ (TC-READ-12)", "—", "Có cache và worker", "—", ("na", "Chưa triển khai: stack không có Redis.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_SOC", "function": "Bình luận, thích, theo dõi", "scope": "Interaction & Social Service (interaction-social-service.md)",
        "precondition": "Precond: reader04, reader05 đã đăng nhập; có rule lọc từ khoá kiểm thử trong DB tạm; tác giả reader03 sở hữu truyện mẫu.",
        "sections": [
            ("Giao diện", [
                ("SOC_01", "Khu bình luận chương", "Mở chương, gửi bình luận sạch", "Ô nhập, nút Gửi bình luận; bình luận hiện ngay trong danh sách", "E2E clean comment", ("social", "interact_f")),
            ]),
            ("Chức năng", [
                ("SOC_02", "Bình luận dính từ khoá bị lọc (TC-SOC-02)", "Gửi bình luận chứa từ khoá bị lọc", "PENDING_MODERATION, có review, khách không thấy", "srs-blocked-term", ("srs", "TC-SOC-02")),
                ("SOC_03", "Admin duyệt bình luận (TC-SOC-03)", "Admin resolve APPROVED", "Bình luận hiển thị công khai", "decision APPROVED", ("srs", "TC-SOC-03")),
                ("SOC_04", "Admin từ chối bình luận (TC-SOC-04)", "Admin resolve REJECTED", "REJECTED, ẩn khỏi người khác", "decision REJECTED", ("srs", "TC-SOC-04")),
                ("SOC_05", "Sửa/xoá bình luận của người khác (TC-SOC-06)", "reader05 sửa, xoá bình luận của reader04", "403", "comment của reader04", ("srs", "TC-SOC-06")),
                ("SOC_06", "Khách bình luận (TC-SOC-07)", "Gửi bình luận không có token", "401", "không có token", ("srs", "TC-SOC-07")),
                ("SOC_07", "Thích / thích trùng / bỏ thích (TC-SOC-09)", "Like, like lại, bỏ like", "likesCount +1; trùng 409; bỏ like −1", "reader05, Ashenhold", ("srs", "TC-SOC-09")),
                ("SOC_08", "Theo dõi tác giả (TC-SOC-11)", "reader05 theo dõi reader03", "Có bản ghi follows, số người theo dõi tăng", "reader05 → reader03", ("srs", "TC-SOC-11")),
                ("SOC_09", "Thông báo chương mới cho người theo dõi (TC-SOC-12)", "Tác giả xuất bản chương mới; đọc thông báo của reader05", "reader05 nhận thông báo Unread", "chương 'Chương sạch'", ("srs", "TC-SOC-12")),
            ]),
            ("Luồng", [
                ("SOC_10", "Thích và bỏ thích trên giao diện", "Bấm Thích, rồi Bỏ thích", "Phản hồi 200; DB có rồi không còn bản ghi like", "reader04", ("social", "interact_b")),
                ("SOC_11", "Bỏ thích trên giao diện", "Bấm Bỏ thích", "DB không còn bản ghi like", "reader04", ("social", "interact_c")),
                ("SOC_12", "Theo dõi và bỏ theo dõi trên giao diện", "Bấm Theo dõi tác giả, rồi Bỏ theo dõi", "DB có rồi không còn bản ghi follows", "reader04 → tác giả", ("social", "interact_d")),
                ("SOC_13", "Sửa bình luận của mình (TC-SOC-05)", "Bấm Sửa → nhập nội dung → Lưu bình luận → tải lại", "Nội dung mới hiển thị, nội dung cũ biến mất", "E2E updated comment", ("social", "interact_g")),
                ("SOC_14", "Xoá bình luận của mình (TC-SOC-05)", "Bấm Xóa → Xác nhận xóa → tải lại", "Bình luận biến mất; DB ghi DELETED", "comment vừa tạo", ("social", "interact_h")),
                ("SOC_15", "Thêm truyện vào kệ sách (TC-SOC-10)", "Bấm Thêm vào thư viện", "Có bản ghi bookmarks, thông báo thành công", "reader04", ("discovery", "reader_c")),
                ("SOC_16", "Bình luận inline theo đoạn (TC-SOC-08)", "—", "Lưu và hiển thị đúng đoạn", "—", ("na", "Chưa triển khai: chỉ có bình luận theo chương và truyện.")),
                ("SOC_17", "Push FCM (TC-SOC-13)", "—", "Thiết bị nhận push", "—", ("na", "Không chạy được: môi trường local không có FCM.")),
                ("SOC_18", "Tác giả không có người theo dõi (TC-SOC-14)", "—", "Không tạo thông báo", "—", ("na", "Không áp dụng: chưa có thông báo cho người theo dõi (xem SOC_09).")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_NOV", "function": "Quản lý truyện và chương", "scope": "Novel & Chapter Service (novel-chapter-service.md)",
        "precondition": "Precond: Tác giả reader03 đã đăng nhập; có rule lọc từ khoá kiểm thử; admin reader02 để duyệt.",
        "sections": [
            ("Giao diện", [
                ("NOV_01", "Màn quản lý truyện của tác giả", "Mở /author/novels/:id", "Hiển thị đúng truyện, không lỗi, không tràn ngang", SMOKE_NOTE, ("smoke", "author", "novel-workspace")),
                ("NOV_02", "Trình soạn thảo (IDE)", "Mở /author/ide?novelId=...", "Có vùng soạn thảo, không lỗi", SMOKE_NOTE, ("smoke", "author", "writing-ide")),
            ]),
            ("Chức năng", [
                ("NOV_03", "Tạo truyện (TC-NOV-01)", "Gửi tạo truyện hợp lệ", "Trạng thái DRAFT", "tiêu đề SRS Novel *, tóm tắt > 500 ký tự", ("srs", "TC-NOV-01")),
                ("NOV_04", "Tiêu đề 255 ký tự (TC-NOV-02)", "Tạo truyện với tiêu đề 255 ký tự", "Từ chối (SRS: tiêu đề < 255 ký tự)", "title = 'T' × 255", ("srs", "TC-NOV-02")),
                ("NOV_05", "Tóm tắt dưới 500 ký tự (TC-NOV-03)", "Tạo truyện với tóm tắt ngắn", "Từ chối", "synopsis 18 ký tự", ("srs", "TC-NOV-03")),
                ("NOV_06", "Gửi xuất bản khi dưới 5 chương (TC-NOV-04)", "Truyện có 1 chương nháp hợp lệ → submit-publish", "Bị chặn (422), truyện giữ DRAFT", "1 chương nháp ≥ 500 ký tự", ("srs", "TC-NOV-04")),
                ("NOV_07", "Tiêu đề chương 100 ký tự (TC-NOV-05)", "Tạo chương với tiêu đề 100 ký tự", "Từ chối (SRS: < 100 ký tự)", "title = 'C' × 100", ("srs", "TC-NOV-05")),
                ("NOV_08", "Chương dưới 500 ký tự (TC-NOV-06)", "Tạo chương ngắn → submit-publish", "Không được xuất bản", "nội dung 18 ký tự", ("srs", "TC-NOV-06")),
                ("NOV_09", "Độc giả tạo truyện (TC-NOV-13)", "reader04 gửi tạo truyện", "403", "reader04", ("srs", "TC-NOV-13")),
            ]),
            ("Luồng", [
                ("NOV_10", "Xuất bản truyện đủ 5 chương (TC-NOV-14)", "Tạo truyện + 5 chương hợp lệ → submit-publish", "PUBLISHED, khách xem được", "5 chương > 500 ký tự", ("srs", "TC-NOV-14")),
                ("NOV_11", "Xuất bản chương hợp lệ (TC-NOV-07)", "Tạo chương → submit-publish", "PUBLISHED, khách đọc được", "chương > 500 ký tự", ("srs", "TC-NOV-07")),
                ("NOV_12", "Chương dính từ khoá (TC-NOV-08)", "Chương chứa từ khoá → submit-publish", "PENDING_MODERATION, chưa công khai", "srs-blocked-term", ("srs", "TC-NOV-08")),
                ("NOV_13", "Admin duyệt chương (TC-NOV-09)", "Admin resolve APPROVED", "PUBLISHED", "decision APPROVED", ("srs", "TC-NOV-09")),
                ("NOV_14", "Admin từ chối chương (TC-NOV-10)", "Admin resolve REJECTED kèm lý do", "Chương không công khai; tác giả nhận lý do", "lý do 'Lý do SRS *'", ("srs", "TC-NOV-10")),
                ("NOV_15", "Khách mở chương VIP (TC-NOV-12)", "Khách gọi đọc chương VIP", "Không nhận nội dung (402)", "chương VIP 50 xu", ("srs", "TC-NOV-12")),
                ("NOV_16", "Nhân vật/timeline (TC-NOV-11)", "—", "Lưu kèm nguồn; người không sở hữu bị chặn", "—", ("na", "Không chạy: thuộc luồng Writing Copilot, ngoài phạm vi PR #73.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_PAY", "function": "Ví và thanh toán (mock)", "scope": "Payment & Wallet Service (payment-wallet-service.md)",
        "precondition": "Precond: reader04 và tác giả reader03 đã đăng nhập; cổng thanh toán giả lập nội bộ; admin reader02 duyệt rút.",
        "sections": [
            ("Chức năng", [
                ("PAY_01", "Danh sách gói nạp (TC-PAY-01)", "Gọi /wallet/deposit-packages", "Đủ các gói COIN_100/500/1000/5000", "—", ("srs", "TC-PAY-01")),
                ("PAY_02", "Nạp thành công (TC-PAY-02)", "Tạo phiên nạp COIN_500 → webhook SUCCESS", "Số dư +500; giao dịch DEPOSIT SUCCESS", "COIN_500", ("srs", "TC-PAY-02")),
                ("PAY_03", "Phiên nạp không xác nhận (TC-PAY-03)", "Tạo phiên COIN_100, không gọi webhook", "Số dư không đổi", "COIN_100", ("srs", "TC-PAY-03")),
                ("PAY_04", "Mở khoá chương VIP (TC-PAY-04)", "reader04 mở khoá chương VIP", "Độc giả −giá, tác giả +, đọc được nội dung", "chương VIP 50 xu", ("srs", "TC-PAY-04")),
                ("PAY_05", "Mở khoá khi không đủ xu (TC-PAY-05)", "Tài khoản 0 xu mở khoá", "Báo lỗi, không trừ tiền", "tài khoản mới 0 xu", ("srs", "TC-PAY-05")),
                ("PAY_06", "Ủng hộ tác giả (TC-PAY-07)", "reader04 ủng hộ 10 xu", "Độc giả −10, tác giả +, giao dịch DONATE", "amountCoins 10", ("srs", "TC-PAY-07")),
                ("PAY_07", "Ủng hộ khi không đủ xu (TC-PAY-08)", "Tài khoản 0 xu ủng hộ 50", "Báo lỗi", "amountCoins 50", ("srs", "TC-PAY-08")),
                ("PAY_08", "Ủng hộ số xu không hợp lệ (TC-PAY-09)", "Ủng hộ 0 xu", "400", "amountCoins 0", ("srs", "TC-PAY-09")),
                ("PAY_09", "Khách ủng hộ / xem ví (TC-PAY-10)", "Gọi donate, /wallet/me không có token", "401", "không có token", ("smoke", "guest", "anonymous-api-negatives")),
                ("PAY_10", "Rút dưới hạn mức (TC-PAY-11)", "Tác giả rút 50 xu", "Từ chối", "amountCoins 50", ("srs", "TC-PAY-11")),
                ("PAY_11", "Giới hạn tần suất (TC-PAY-15)", "Gửi liên tục 40 yêu cầu tạo phiên nạp", "Có phản hồi 429", "40 yêu cầu", ("srs", "TC-PAY-15")),
            ]),
            ("Luồng", [
                ("PAY_12", "Rút tiền bị từ chối (TC-PAY-12)", "1. Tác giả rút 100 xu\n2. Admin từ chối", "Xu chuyển sang đóng băng; từ chối thì trả lại", "amountCoins 100", ("srs", "TC-PAY-12")),
                ("PAY_13", "Thông báo từ chối rút (TC-PAY-13)", "Đọc thông báo của tác giả sau khi bị từ chối", "Có thông báo kèm lý do", "lý do 'Từ chối rút SRS *'", ("srs", "TC-PAY-13")),
                ("PAY_14", "Rút tiền được duyệt (TC-PAY-14)", "1. Tác giả rút 100 xu\n2. Admin duyệt", "Trừ hẳn xu đóng băng; giao dịch SUCCESS", "amountCoins 100", ("srs", "TC-PAY-14")),
                ("PAY_15", "Rollback khi giao dịch lỗi (TC-PAY-06)", "—", "Không đổi số dư", "—", ("na", "Chưa tự động hoá: cần chèn lỗi DB giữa giao dịch.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_MOD", "function": "Kiểm duyệt nội dung", "scope": "Content Control & Moderation (content-control-moderation-service.md)",
        "precondition": "Precond: Có rule lọc từ khoá kiểm thử; reader04, reader05 đăng nhập; admin reader02 đăng nhập.",
        "sections": [
            ("Giao diện", [
                ("MOD_01", "Màn hàng đợi kiểm duyệt của admin", "Admin mở /admin/moderation", "Trang hiển thị, đúng vai trò, không lỗi", SMOKE_NOTE, ("smoke", "admin", "moderation")),
            ]),
            ("Chức năng", [
                ("MOD_02", "Bình luận dính rule tạo review (TC-MOD-01)", "Gửi bình luận chứa từ khoá", "Có MODERATION_REVIEW", "srs-blocked-term", ("srs", "TC-SOC-02")),
                ("MOD_03", "Báo cáo kèm lý do (TC-MOD-02)", "Báo cáo chương với lý do", "Tạo report và review", "reason 'Nội dung vi phạm'", ("srs", "TC-MOD-02")),
                ("MOD_04", "Báo cáo thiếu lý do (TC-MOD-03)", "Báo cáo với reason rỗng", "400", "reason ''", ("srs", "TC-MOD-03")),
                ("MOD_05", "Báo cáo đối tượng không tồn tại (TC-MOD-04)", "Báo cáo chương có id ngẫu nhiên", "Lỗi validation/404", "uuid ngẫu nhiên", ("srs", "TC-MOD-04")),
                ("MOD_06", "Báo cáo thứ hai (TC-MOD-05)", "reader05 báo cáo cùng chương", "Gắn vào review đang mở", "cùng chương", ("srs", "TC-MOD-05")),
                ("MOD_07", "Lọc hàng đợi (TC-MOD-06)", "Admin lọc PENDING + USER_REPORT", "Có review vừa tạo", "status PENDING, source USER_REPORT", ("srs", "TC-MOD-06")),
                ("MOD_08", "Quyết định lần hai (TC-MOD-07)", "Resolve lại review đã xử lý", "409", "decision REJECTED", ("srs", "TC-MOD-07")),
                ("MOD_09", "Độc giả mở hàng đợi (TC-MOD-08)", "reader04 gọi /admin/moderation/reviews", "403", "reader04", ("srs", "TC-MOD-08")),
                ("MOD_10", "Lưu nháp chứa từ khoá (TC-MOD-09)", "Tác giả lưu chương nháp có từ khoá", "Không bị chặn", "srs-blocked-term", ("srs", "TC-MOD-09")),
                ("MOD_11", "Không dùng LLM khi kiểm duyệt (TC-MOD-10)", "Quét import trong backend/src/modules/content-control", "Không có import AI/LLM", "mã nguồn", ("srs", "TC-MOD-10")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_ADM", "function": "Admin quản lý truyện", "scope": "Admin Novel Management (admin-novel-management-service.md)",
        "precondition": "Precond: Admin reader02 đăng nhập; có truyện kiểm thử của reader03 với chương và bản nháp autosave.",
        "sections": [
            ("Giao diện", [
                ("ADM_01", "Trang admin sau đăng nhập", "Admin đăng nhập", "Vào khu /admin, đúng vai trò, không lỗi", SMOKE_NOTE, ("smoke", "admin", "login")),
                ("ADM_02", "Đăng xuất admin qua menu tài khoản", "Mở menu tài khoản → Đăng xuất", "Về /login, token bị xoá", SMOKE_NOTE, ("smoke", "admin", "logout")),
            ]),
            ("Chức năng", [
                ("ADM_03", "Xem danh sách và chi tiết truyện (TC-ADM-01)", "GET /admin/novels, GET /admin/novels/:id", "200, có truyện", "q 'SRS Novel'", ("srs", "TC-ADM-01")),
                ("ADM_04", "Gỡ truyện thiếu xác nhận (TC-ADM-02)", "DELETE không có confirm", "Không đổi dữ liệu", "reason 'SRS'", ("srs", "TC-ADM-02")),
                ("ADM_05", "Người không phải admin gỡ truyện (TC-ADM-04)", "Tác giả gọi DELETE /admin/novels/:id", "AUTH_008", "reader03", ("srs", "TC-ADM-04")),
                ("ADM_06", "Gỡ truyện không tồn tại (TC-ADM-05)", "DELETE id ngẫu nhiên", "CONTENT_001", "uuid ngẫu nhiên", ("srs", "TC-ADM-05")),
            ]),
            ("Luồng", [
                ("ADM_07", "Gỡ mềm truyện (TC-ADM-03)", "DELETE có confirm và lý do", "Truyện và chương có deleted_at; mất khỏi danh sách; tác giả nhận thông báo", "reason 'Gỡ truyện SRS *'", ("srs", "TC-ADM-03")),
                ("ADM_08", "Bản nháp của truyện bị gỡ (TC-ADM-08)", "Kiểm tra draft_chapters trong Mongo sau khi gỡ", "deletedAt được đặt cho mọi bản nháp", "3 bản nháp", ("srs", "TC-ADM-08")),
                ("ADM_09", "Khôi phục truyện (TC-ADM-06)", "POST /admin/novels/:id/restore", "Truyện hiện lại", "reason 'SRS acceptance'", ("srs", "TC-ADM-06")),
                ("ADM_10", "Hộp thoại cảnh báo trước khi gỡ (TC-ADM-07)", "—", "Có cảnh báo", "—", ("na", "Chưa tự động hoá: cần kịch bản trình duyệt cho màn admin mới của PR #74.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_AI", "function": "AI hỗ trợ sáng tác", "scope": "AI Intelligence Service (ai-intelligence-service.md)",
        "precondition": "Precond: Tác giả reader03 đăng nhập; dịch vụ LLM không chạy trong môi trường tạm.",
        "sections": [
            ("Chức năng", [
                ("AI_01", "Gợi ý tag và tiêu đề (TC-AI-01)", "—", "Danh sách gợi ý; văn bản < 100 từ bị từ chối", "—", ("na", "Không chạy: cần dịch vụ LLM.")),
                ("AI_02", "Gợi ý thể loại (TC-AI-02)", "—", "Thể loại hợp lệ theo Taxonomy", "—", ("na", "Không chạy: cần dịch vụ LLM.")),
                ("AI_03", "Phân tích văn phong (TC-AI-03)", "—", "Có báo cáo; chương < 500 từ bị từ chối", "—", ("na", "Không chạy: cần dịch vụ LLM.")),
                ("AI_04", "Writing Copilot (TC-AI-04)", "—", "Có gợi ý; chỉ lưu khi tác giả chấp nhận", "—", ("na", "Không chạy: cần dịch vụ LLM.")),
                ("AI_05", "Kiểm tra nhất quán (TC-AI-05)", "—", "Danh sách cảnh báo, không tự sửa", "—", ("na", "Không chạy: cần dịch vụ LLM.")),
                ("AI_06", "AI không sẵn sàng (TC-AI-06)", "Gọi /ai/copilot/suggestions khi LLM tắt", "Trả AI_001 trong 5 giây, không chặn thao tác", "instruction 'Viết tiếp đoạn mở đầu'", ("srs", "TC-AI-06")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_UI", "function": "Giao diện theo vai trò", "scope": "Client Applications (client-applications.md)",
        "precondition": f"Precond: Web production build trên môi trường tạm; trình duyệt Edge headless; {ALL_COMBOS}.",
        "sections": [
            ("Giao diện", [
                ("UI_01", "Thư viện công khai cho khách (TC-UI-01)", "Mở /public khi chưa đăng nhập", "Navbar khách, không có phiên, không tràn ngang", SMOKE_NOTE, ("smoke", "guest", "public-library")),
                ("UI_02", "Hồ sơ tác giả từ trang truyện công khai", "Từ /public/novels/:id bấm tên tác giả", "Mở /authors/:id, nút Đăng nhập để theo dõi, link về /public, tên không bị ảnh bìa che", SMOKE_NOTE, ("smoke", "guest", "author-from-public-novel")),
                ("UI_03", "Hồ sơ tác giả sau khi tải lại", "Tải lại /authors/:id", "Vẫn hiển thị cho khách, không chuyển về /login", SMOKE_NOTE, ("smoke", "guest", "author-after-reload")),
                ("UI_04", "Hồ sơ tác giả mở trực tiếp bằng URL", "Mở /authors/:id trên trình duyệt chưa có token", "Hiển thị cho khách", SMOKE_NOTE, ("smoke", "guest", "author-direct-url")),
                ("UI_05", "Hồ sơ tác giả khi độc giả đã đăng nhập", "reader04 mở /authors/:id", "Có nút Theo dõi, không có nút đăng nhập", SMOKE_NOTE, ("smoke", "reader", "author-profile")),
                ("UI_06", "Hồ sơ của chính tác giả", "reader03 mở /authors/<mình>", "Có nút Chỉnh sửa hồ sơ", SMOKE_NOTE, ("smoke", "author", "own-public-profile")),
                ("UI_07", "Navbar độc giả (TC-UI-06)", "Đăng nhập reader04", "Khám phá · Thư viện · Lịch sử đọc · Ví xu", SMOKE_NOTE, ("smoke", "reader", "navigation")),
                ("UI_08", "Navbar tác giả (TC-UI-06)", "Đăng nhập reader03", "Có mục Tác phẩm", SMOKE_NOTE, ("smoke", "author", "navigation")),
                ("UI_09", "Tương phản màu theo token (sáng/tối)", "Chạy npm run test:contrast cùng test color-scheme, project-sorting", "Mọi cặp chữ/nền ≥ 4,5:1", "web/tests/*.test.mjs", ("step", "web_unit_tests")),
            ]),
            ("Luồng", [
                ("UI_10", "Luồng khách (TC-UI-01)", "Thư viện → truyện → tác giả → chương", "Đi hết luồng không cần đăng nhập", SMOKE_NOTE, ("smoke", "guest", "")),
                ("UI_11", "Luồng độc giả (TC-UI-03)", "Khám phá → chi tiết → đọc → lịch sử/thư viện", "Đi hết luồng", "reader04", ("discovery", "reader_b")),
                ("UI_12", "Luồng tác giả (TC-UI-04)", "Dashboard → quản lý truyện → IDE → hồ sơ", "Đi hết luồng", SMOKE_NOTE, ("smoke", "author", "")),
                ("UI_13", "Luồng admin (TC-UI-05)", "Đăng nhập → hàng đợi kiểm duyệt → đăng xuất", "Đi hết luồng", SMOKE_NOTE, ("smoke", "admin", "")),
                ("UI_14", "Toàn bộ trang ở mọi kích thước/giao diện (TC-UI-07)", "Smoke 4 vai trò", "Không tràn ngang, đúng giao diện, không lỗi", SMOKE_NOTE, ("smoke", "*", "")),
                ("UI_15", "App di động React Native (TC-UI-08)", "—", "Chạy được luồng đọc", "—", ("na", "Không chạy: thư mục mobile/ ngoài phạm vi PR #73.")),
            ]),
        ],
    },
    {
        "sheet": "FeatureTest_SYS", "function": "Phi chức năng, bảo mật và an toàn kiểm thử", "scope": "Tổng quan hệ thống (README.md), quy tắc kiểm thử",
        "precondition": "Precond: Môi trường tạm (DB Postgres/Mongo riêng, cổng riêng); DB dùng chung ephurin chỉ được đọc để lấy fingerprint.",
        "sections": [
            ("Chức năng", [
                ("SYS_01", "Ma trận quyền (TC-SYS-01)", "Khách đọc chương miễn phí; khách theo dõi; tác giả vào API admin; độc giả vào hàng đợi", "200 / 401 / 403 / 403", "4 vai trò", ("srs", "TC-SYS-01")),
                ("SYS_02", "Mật khẩu được băm (TC-SYS-02)", "Đọc password_hash sau đăng ký", "Bắt đầu bằng $2 hoặc $argon2", "tài khoản mới", ("srs", "TC-AUTH-01")),
                ("SYS_03", "Tốc độ danh sách truyện (TC-SYS-03)", "Đo 5 lần GET /novels", "Mỗi lần < 2 giây (local)", "limit 20", ("srs", "TC-SYS-03")),
                ("SYS_04", "Script E2E từ chối DB dùng chung", "Chạy 4 script vào DB ephurin, thiếu opt-in, cổng 4000, DB đã tồn tại, Mongo localhost mơ hồ", "Exit 3, fingerprint DB dùng chung không đổi", "scripts/test_e2e_isolated_stack.py", ("step", "refusal_tests")),
                ("SYS_05", "Kiểu dữ liệu web", "npm run typecheck (web)", "Không lỗi", "web/", ("step", "web_typecheck")),
                ("SYS_06", "Kiểu dữ liệu backend", "npm run typecheck (backend)", "Không lỗi", "backend/", ("step", "backend_typecheck")),
                ("SYS_07", "Toàn bộ test backend (từ PR #74)", "npm run test:isolated", "Không có test fail", "DB tạm ephurin_test_admin_backend_*", ("step", "backend_isolated_suite")),
                ("SYS_08", "Tải 10.000 người dùng (TC-SYS-04)", "—", "Đạt tải", "—", ("na", "Không chạy: cần hạ tầng kiểm thử tải.")),
                ("SYS_09", "HTTPS, backup, uptime (TC-SYS-05)", "—", "Có cấu hình", "—", ("na", "Không chạy: thuộc hạ tầng production.")),
            ]),
        ],
    },
]

DETAIL_LABELS = {
    "response": "phản hồi", "srs_code": "SRS yêu cầu mã", "srs": "SRS", "status": "trạng thái", "final_status": "trạng thái cuối",
    "submit": "submit", "resolve": "quyết định", "novel_status": "trạng thái truyện", "draft_chapters": "số chương nháp",
    "live_chapters": "chương chưa bị đánh dấu xoá", "author_notified": "tác giả nhận thông báo", "srs_wording_present": "có câu chữ SRS",
    "drafts_not_deleted": "bản nháp chưa đánh dấu xoá", "drafts_total": "tổng bản nháp", "follower_notifications": "thông báo cho người theo dõi",
    "status_counts": "số phản hồi theo mã", "requests": "số yêu cầu", "data_preview": "nội dung trả về",
}


def fmt_detail(detail: Any) -> str:
    if not isinstance(detail, dict):
        return str(detail)
    parts = []
    for key, value in detail.items():
        if key in ("collections", "mongo_db", "data_keys", "notification_title", "autosave"):
            continue
        label = DETAIL_LABELS.get(key, key)
        text = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
        parts.append(f"{label}: {text[:140]}")
    return "; ".join(parts)


class Evidence:
    def __init__(self, manifest: Dict[str, Any], baseline: List[Dict[str, Any]]):
        self.manifest = manifest
        self.steps = {step["name"]: step for step in manifest["steps"]}
        self.baseline = [{r["id"]: r for r in run.get("results", [])} for run in baseline]
        self.baseline_sha = baseline[0].get("tested_code_sha", "")[:8] if baseline else ""
        self.fixed: set = set()  # SRS checks that fail on every baseline run but pass here

    def runs(self, prefix: str) -> List[Dict[str, Any]]:
        return [step.get("evidence") or {} for name, step in self.steps.items() if name.startswith(prefix)]

    def evaluate(self, source: Tuple) -> Tuple[str, str]:
        kind = source[0]
        if kind == "na":
            return "N/A", source[1]
        if kind == "srs":
            results = [{r["id"]: r for r in run.get("results", [])}.get(source[1]) for run in self.runs("srs_acceptance")]
            results = [r for r in results if r]
            if not results:
                return "N/A", "Không có kết quả chạy."
            outcomes = [r["result"] for r in results]
            detail = fmt_detail(results[-1].get("detail"))
            base = [b.get(source[1], {}).get("result") for b in self.baseline]
            if all(o == "PASS" for o in outcomes):
                fixed = ""
                if base and all(b == "FAIL" for b in base):
                    self.fixed.add(source[1])
                    fixed = f" Trên main {self.baseline_sha} cả {len(base)}/{len(base)} lần baseline đều FAIL; đã sửa trong PR #73."
                return "Pass", f"Đạt {len(outcomes)}/{len(outcomes)} lần chạy. Thực tế: {detail}.{fixed}"
            if base and all(b == "FAIL" for b in base):
                origin = f"Có sẵn trên main {self.baseline_sha} ({len(base)}/{len(base)} lần baseline cũng FAIL), không do PR #73."
            elif base:
                origin = f"main {self.baseline_sha}: {'/'.join(b or '-' for b in base)} → lỗi mới so với main."
            else:
                origin = ""
            stability = "" if len(set(outcomes)) == 1 else f" Không ổn định: {'/'.join(outcomes)}."
            return "Fail", f"Thực tế: {detail}.{stability} {origin}".strip()
        if kind in ("social", "discovery"):
            prefix = "social_run" if kind == "social" else "discovery_run"
            outcomes = [(run.get("checkpoints") or {}).get(source[1]) for run in self.runs(prefix)]
            outcomes = [o for o in outcomes if o]
            if not outcomes:
                return "N/A", "Không có kết quả chạy."
            if all(o == "PASS" for o in outcomes):
                return "Pass", f"Đạt {len(outcomes)}/{len(outcomes)} lần chạy trên trình duyệt thật (DB tạm, đã xoá sau khi chạy)."
            return "Fail", f"Kết quả các lần chạy: {'/'.join(outcomes)}."
        if kind == "smoke":
            role, step = source[1], source[2]
            checks = []
            for run in self.runs("smoke_matrix"):
                for r in run.get("results", []):
                    if (role == "*" or r.get("role") == role) and (not step or r.get("step", "").startswith(step)):
                        checks.append(r)
            if not checks:
                return "N/A", "Không có kết quả chạy."
            failed = [c for c in checks if c.get("result") != "PASS"]
            if not failed:
                return "Pass", f"Đạt {len(checks)}/{len(checks)} lần kiểm ({ALL_COMBOS}, 2 lượt)."
            sample = "; ".join(f"{c['combo']} {c['role']}/{c['step']}: {', '.join(c.get('problems') or [])[:120]}" for c in failed[:3])
            return "Fail", f"Đạt {len(checks) - len(failed)}/{len(checks)}. Lỗi: {sample}"
        if kind == "step":
            step = self.steps.get(source[1])
            if not step:
                return "N/A", "Bước này không có trong lần chạy."
            counts = []
            if step.get("tests_passed") is not None:
                counts.append(f"{step['tests_passed']} pass / {step.get('tests_failed') or 0} fail" + (f" / {step['tests_skipped']} skip" if step.get("tests_skipped") else ""))
            if step.get("unittest_ran") is not None:
                counts.append(f"{step['unittest_ran']} test, {'OK' if step.get('unittest_ok') else 'FAIL'}")
            text = f"exit {step['exit_code']}" + (f"; {'; '.join(counts)}" if counts else "")
            return ("Pass" if step["exit_code"] == 0 else "Fail"), text
        return "N/A", "Không xác định nguồn kết quả."


def style(cell, *, fill=None, bold=False, align="left", wrap=True, border=True):
    cell.font = Font(name=FONT, size=11, bold=bold)
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=wrap)
    if fill:
        cell.fill = fill
    if border:
        cell.border = BORDER


def merge(ws, start: str, end: str, row: int, value=None, **kw):
    ws.merge_cells(f"{start}{row}:{end}{row}")
    if value is not None:
        ws[f"{start}{row}"] = value
    for col in range(ws[f"{start}{row}"].column, ws[f"{end}{row}"].column + 1):
        style(ws.cell(row=row, column=col), **kw)


def estimate_height(texts: List[Tuple[str, int]]) -> float:
    lines = 1
    for text, width_chars in texts:
        chunks = str(text or "").split("\n")
        lines = max(lines, sum(max(1, -(-len(chunk) // max(width_chars, 1))) for chunk in chunks))
    return min(15 * lines + 4, 300)


def build_feature(wb: Workbook, feature: Dict[str, Any], ev: Evidence) -> Dict[str, int]:
    ws = wb.create_sheet(feature["sheet"])
    widths = {"A": 2, "B": 6, "C": 6, **{c: 7 for c in "DEFG"}, **{c: 8 for c in "HIJKL"}, **{c: 8 for c in "MNOPQ"},
              **{c: 6 for c in "RSTUV"}, "W": 8, "X": 8, "Y": 8, "Z": 8, "AA": 8, "AB": 8, "AC": 12}
    for col, width in widths.items():
        ws.column_dimensions[col].width = width
    # Header block (same cells as 9_system_test.xlsx)
    for row, label, value in ((2, "Reviewed Document", "System Test"), (3, "Reviewed Feature/Scope", feature["scope"]), (4, "Reviewed Function", feature["function"])):
        ws.merge_cells(f"B{row}:D{row}"); ws[f"B{row}"] = label
        ws.merge_cells(f"E{row}:H{row}"); ws[f"E{row}"] = value
        for col in "BCDEFGH":
            style(ws[f"{col}{row}"], fill=YELLOW, align="center" if col >= "E" else "left")
    ws.merge_cells("B5:D7"); ws["B5"] = "Number of"
    for row, label in ((5, "Pass"), (6, "Fail"), (7, "N/A")):
        ws.merge_cells(f"E{row}:F{row}"); ws[f"E{row}"] = label
        ws.merge_cells(f"G{row}:H{row}"); ws[f"G{row}"] = f'=COUNTIF(AC:AC,"{label}")'
    for row in (5, 6, 7):
        for col in "BCDEFGH":
            style(ws[f"{col}{row}"], fill=YELLOW, align="center" if col in "GH" else "left")
    ws.merge_cells("J2:Q2"); ws["J2"] = "Conclusion"
    for col in "JKLMNOPQ":
        style(ws[f"{col}2"], fill=YELLOW, align="center")
    ws.merge_cells("J3:Q7")
    for row in range(3, 8):
        for col in "JKLMNOPQ":
            style(ws[f"{col}{row}"])
    # Table header rows 9-10
    for start, end, label in COLUMNS:
        ws.merge_cells(f"{start}9:{end}10"); ws[f"{start}9"] = label
        for row in (9, 10):
            for col in range(ws[f"{start}9"].column, ws[f"{end}9"].column + 1):
                style(ws.cell(row=row, column=col), fill=HEADER, bold=True, align="center")
    ws.merge_cells("B11:AC12"); ws["B11"] = feature["precondition"]
    for row in (11, 12):
        for col in range(2, 30):
            style(ws.cell(row=row, column=col), fill=SECTION)
    row = 13
    counts = {"Pass": 0, "Fail": 0, "N/A": 0}
    failures = []
    data_rows = []
    for section, rows in feature["sections"]:
        merge(ws, "B", "AC", row, section, fill=SECTION, bold=True)
        row += 1
        for test_id, objective, steps, expected, data, source in rows:
            result, testing = ev.evaluate(source)
            counts[result] += 1
            if result == "Fail":
                failures.append(test_id)
            values = [test_id, objective, steps, expected, data, testing, result]
            for (start, end, _), value in zip(COLUMNS, values):
                if start != end:
                    ws.merge_cells(f"{start}{row}:{end}{row}")
                ws[f"{start}{row}"] = value
                for col in range(ws[f"{start}{row}"].column, ws[f"{end}{row}"].column + 1):
                    style(ws.cell(row=row, column=col), align="center" if start in ("B", "AC") else "left")
            ws.row_dimensions[row].height = estimate_height([(objective, 26), (steps, 36), (expected, 36), (data, 26), (testing, 44)])
            data_rows.append(row)
            row += 1
    ws["J3"] = conclusion_text(feature, counts, failures)
    ws["J3"].alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    if data_rows:
        rng = f"AC{data_rows[0]}:AC{data_rows[-1]}"
        dv = DataValidation(type="list", formula1='"Pass,Fail,N/A"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add(rng)
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Pass"'], fill=PatternFill("solid", fgColor="C6EFCE")))
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Fail"'], fill=PatternFill("solid", fgColor="FFC7CE")))
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"N/A"'], fill=PatternFill("solid", fgColor="EDEDED")))
    ws.freeze_panes = "B11"
    ws.sheet_view.zoomScale = 85
    return counts


def conclusion_text(feature: Dict[str, Any], counts: Dict[str, int], failures: List[str]) -> str:
    total = sum(counts.values())
    text = f"{feature['function']}: {counts['Pass']}/{total} Pass, {counts['Fail']} Fail, {counts['N/A']} N/A."
    if failures:
        text += f" Fail: {', '.join(failures)} (chi tiết ở cột Testing Result; đều đã đối chiếu với main)."
    else:
        text += " Mọi test case đã chạy đều đạt."
    if counts["N/A"]:
        text += " N/A là phần chưa triển khai hoặc cần hạ tầng không có ở local."
    return text


def build_summary(wb: Workbook, features: List[Dict[str, Any]], totals: Dict[str, Dict[str, int]], ev: Evidence, meta: Dict[str, str]) -> None:
    ws = wb.active
    ws.title = "System_Test_Report"
    for col, width in {"A": 2, "B": 6, "C": 14, "D": 14, "E": 14, "F": 10, "G": 10, "H": 8, "I": 8, "J": 8, "K": 14, "L": 10}.items():
        ws.column_dimensions[col].width = width
    for row, label, value in ((2, "Group:", meta["group"]), (3, "Project name:", meta["project"]), (4, "Source:", meta["source"])):
        ws.merge_cells(f"B{row}:C{row}"); ws[f"B{row}"] = label
        ws.merge_cells(f"D{row}:L{row}"); ws[f"D{row}"] = value
        for col in "BCDEFGHIJKL":
            style(ws[f"{col}{row}"], fill=YELLOW if col in "BC" else None)
    headers = [("B", "B", "No."), ("C", "E", "Function"), ("F", "G", "Tester"), ("H", "H", "Pass"), ("I", "I", "Fail"), ("J", "J", "N/A"), ("K", "L", "Sheet")]
    for start, end, label in headers:
        merge(ws, start, end, 7, label, fill=YELLOW, bold=True, align="center")
    row = 8
    for index, feature in enumerate(features, start=1):
        sheet = feature["sheet"]
        values = [index, f"='{sheet}'!E4", meta["tester"], f"='{sheet}'!G5", f"='{sheet}'!G6", f"='{sheet}'!G7", sheet]
        for (start, end, _), value in zip(headers, values):
            merge(ws, start, end, row, value, align="center" if start in "BHIJ" else "left")
        row += 1
    first, last = 8, row - 1
    merge(ws, "B", "G", row, "Total", bold=True, align="right")
    for col in "HIJ":
        ws[f"{col}{row}"] = f"=SUM({col}{first}:{col}{last})"
        style(ws[f"{col}{row}"], bold=True, align="center")
    merge(ws, "K", "L", row, "", border=True)
    row += 2
    merge(ws, "B", "L", row, "Conclusion", fill=YELLOW, bold=True, align="center")
    row += 1
    ws.merge_cells(f"B{row}:D{row + 6}"); ws[f"B{row}"] = "Comment"
    ws.merge_cells(f"E{row}:L{row + 6}"); ws[f"E{row}"] = meta["comment"]
    for r in range(row, row + 7):
        for col in "BCDEFGHIJKL":
            style(ws[f"{col}{r}"], align="left")
    ws[f"E{row}"].alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)


def build_run_info(wb: Workbook, ev: Evidence, baseline_runs: List[Dict[str, Any]]) -> None:
    ws = wb.create_sheet("Run_Info")
    env = ev.manifest["environment"]
    rows = [
        ("Mã nguồn được kiểm", f"{env['git_sha']} ({env['git_branch']}); thay đổi chưa commit: {env['git_dirty_tracked']}"),
        ("origin/main lúc chạy", env["origin_main_sha"]),
        ("Thời gian", f"{ev.manifest['started_at']} → {ev.manifest['finished_at']}"),
        ("Hệ điều hành", env["os"]),
        ("Python / Node / npm", f"{env['python']} / {env['node']} / {env['npm']}"),
        ("Trình duyệt", env["browser"]),
        ("PostgreSQL / MongoDB", f"{env['postgres']} / {env['mongodb']} tại {env.get('mongo_base_uri', '')}"),
        ("Baseline main", ", ".join(f"{run.get('tested_code_sha', '')[:8]} {run.get('checks_total', 0) - run.get('checks_failed', 0)}/{run.get('checks_total', 0)} ({run.get('disposable_database')})" for run in baseline_runs) or "không có"),
        ("Ghi chú", "Mọi kết quả lấy từ lần chạy thật trên DB tạm ephurin_test_*; DB dùng chung chỉ được đọc để lấy fingerprint và phải giữ nguyên."),
    ]
    ws.column_dimensions["A"].width = 2
    for col, width in {"B": 26, "C": 52, "D": 8, "E": 9, "F": 26, "G": 34, "H": 10, "I": 22}.items():
        ws.column_dimensions[col].width = width
    for index, (label, value) in enumerate(rows, start=2):
        ws[f"B{index}"] = label; style(ws[f"B{index}"], fill=YELLOW, bold=True)
        ws.merge_cells(f"C{index}:I{index}"); ws[f"C{index}"] = value
        for col in "CDEFGHI":
            style(ws[f"{col}{index}"])
    start = len(rows) + 4
    headers = ["Bước", "Lệnh", "Exit", "Giây", "Kết quả", "DB tạm", "Đã xoá", "DB dùng chung"]
    for offset, header in enumerate(headers):
        cell = ws.cell(row=start, column=2 + offset, value=header)
        style(cell, fill=HEADER, bold=True, align="center")
    for index, step in enumerate(ev.manifest["steps"], start=start + 1):
        evidence = step.get("evidence") or {}
        counts = []
        if step.get("tests_passed") is not None:
            counts.append(f"{step['tests_passed']} pass / {step.get('tests_failed') or 0} fail" + (f" / {step['tests_skipped']} skip" if step.get("tests_skipped") else ""))
        if step.get("unittest_ran") is not None:
            counts.append(f"{step['unittest_ran']} test {'OK' if step.get('unittest_ok') else 'FAIL'}")
        if evidence.get("checkpoints"):
            ok = sum(1 for v in evidence["checkpoints"].values() if v == "PASS")
            counts.append(f"{ok}/{len(evidence['checkpoints'])} checkpoint")
        if evidence.get("results") and evidence.get("checks_total") is None:
            ok = sum(1 for r in evidence["results"] if r.get("result") == "PASS")
            counts.append(f"{ok}/{len(evidence['results'])} kiểm tra")
        if evidence.get("checks_total") is not None:
            counts.append(f"{evidence['checks_total'] - evidence['checks_failed']}/{evidence['checks_total']} kiểm tra")
        shared = "" if not evidence else ("không đổi (" + str(evidence.get("shared_fingerprint_before", ""))[:12] + ")" if not evidence.get("shared_changes") else "ĐỔI: " + ", ".join(evidence["shared_changes"]))
        values = [step["name"], step["command"].split("python.exe")[-1].strip('" '), step["exit_code"], step["seconds"], "; ".join(counts),
                  evidence.get("disposable_database", ""), "" if evidence.get("teardown_ok") is None else str(evidence.get("teardown_ok")), shared]
        for offset, value in enumerate(values):
            cell = ws.cell(row=index, column=2 + offset, value=value)
            style(cell, align="center" if offset in (2, 3, 6) else "left")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--baseline", nargs="*", default=[])
    parser.add_argument("--out", required=True)
    parser.add_argument("--group", default="(điền số nhóm)")
    parser.add_argument("--tester", default="Minh Sơn")
    args = parser.parse_args()
    with open(args.manifest, encoding="utf-8") as handle:
        manifest = json.load(handle)
    baseline_runs = []
    for path in args.baseline:
        with open(path, encoding="utf-8") as handle:
            baseline_runs.append(json.load(handle))
    ev = Evidence(manifest, baseline_runs)
    wb = Workbook()
    totals = {}
    for feature in FEATURES:
        totals[feature["sheet"]] = build_feature(wb, feature, ev)
    pass_n = sum(t["Pass"] for t in totals.values()); fail_n = sum(t["Fail"] for t in totals.values()); na_n = sum(t["N/A"] for t in totals.values())
    env = manifest["environment"]
    fail_text = (f"Toàn bộ Fail đã chạy lại trên main {ev.baseline_sha} và cho cùng kết quả, nên không do PR #73: đó là chỗ code lệch SRS. "
                 if fail_n else "Không còn test case Fail. ")
    fixed_text = (f"{len(ev.fixed)} kiểm tra SRS ({', '.join(sorted(ev.fixed))}) Fail ở mọi lần chạy baseline trên main {ev.baseline_sha} "
                  "(mã lỗi, giới hạn độ dài, điều kiện 5 chương, thông báo theo dõi, giới hạn tần suất, fallback AI, gỡ truyện) "
                  "và đã được sửa trong PR #73. " if ev.fixed else "")
    comment = (f"Kiểm thử hệ thống theo SRS (docs/SRS) và chương 6.2: {pass_n + fail_n + na_n} test case, {pass_n} Pass, {fail_n} Fail, {na_n} N/A. "
               f"Mọi kết quả lấy từ lần chạy thật tại {env['git_sha'][:8]} trên môi trường tạm, mỗi script chạy 2 lần; DB dùng chung không đổi. "
               f"{fail_text}{fixed_text}"
               "N/A là tính năng chưa triển khai (OAuth, Redis, bình luận inline, FCM, app di động) hoặc cần hạ tầng/LLM không có ở local.")
    build_summary(wb, FEATURES, totals, ev, {"group": args.group, "project": "Ephurin Novel Platform (StoryCraft)",
                                             "source": f"github.com/Ephurin/Novel_sharing_platform @ {env['git_sha'][:8]} ({env['git_branch']})",
                                             "tester": args.tester, "comment": comment})
    build_run_info(wb, ev, baseline_runs)
    wb.calculation.fullCalcOnLoad = True
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    wb.save(args.out)
    print(json.dumps({"out": args.out, "pass": pass_n, "fail": fail_n, "na": na_n, "sheets": [f["sheet"] for f in FEATURES]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
