# Kịch bản kiểm thử chấp nhận (UAT) toàn hệ thống

Bộ kịch bản này dành cho người kiểm thử thủ công. Mỗi kịch bản tương ứng một use case chính. Người kiểm thử dùng app như người dùng thật, đi theo các bước, so với kết quả mong đợi, rồi ghi **Đạt / Không đạt / Bị chặn**.

Phạm vi: toàn bộ hệ thống web, gồm Khách, Độc giả, Tác giả, Quản trị và AI. Use case lấy từ `docs/SRA_doc/phase_3/Final_SRS_v1.md` (chương II và IV) và `docs/SRA_doc/Phase_2/05_Usecase_UserStory_Specification.md` (UC1–UC9). Tên nút và màn hình theo giao diện trên `main` ngày 2026-11-20.

## 1. Chuẩn bị

### Môi trường

- Chạy trên **một stack đã seed dữ liệu mẫu**, không chạy trên dữ liệu thật. Trước mỗi đợt kiểm thử, chụp bản sao lưu; kiểm thử xong thì khôi phục. Lệnh chụp và khôi phục nằm trong `docs/development/p2/P2_DEFENSE_DEMO_RUNBOOK.md`, mục 1.
- Dữ liệu mẫu do các script seed của backend tạo ra: `npm run db:seed:demo`, `db:seed:author`, `db:seed:admin`. Seed chỉ ghi theo ID cố định.
- Các kịch bản có nhãn **[LIVE]** gọi model AI thật. Chỉ chạy khi chủ dự án đã bật live (Gemini free tier qua quota gateway), và phải tắt live ngay sau đó. Khi live tắt, ghi các kịch bản này là "Bị chặn", không ghi "Không đạt".
- Dùng trình duyệt Chrome hoặc Edge bản mới, cửa sổ rộng ít nhất 1440 px. Ở mục 7 có thêm một lượt kiểm tra ở bề rộng điện thoại.

### Tài khoản

| Vai trò | Tài khoản | Ghi chú |
|---|---|---|
| Quản trị | `reader02` | `SUPER_ADMIN` |
| Tác giả | `reader03` | Có hai truyện mẫu đã xuất bản (Ashenhold, Thanh Van) |
| Tác giả (AI) | tài khoản tác giả thử nghiệm của stack p2live | Có truyện "Kiếm Ấn Lôi Sơn" với bộ nhớ đã duyệt |
| Độc giả A | `reader04` | Ví 1.000 xu |
| Độc giả B | `reader05` | Ví 1.000 xu, dùng cho tương tác giữa hai độc giả |

Mật khẩu của các tài khoản seed nằm trong script seed (`backend/src/scripts/seed-sample-stories.ts`). Mật khẩu tài khoản tác giả AI nằm trong thư mục riêng `.eval-private/` và được chủ dự án cung cấp riêng. Không ghi mật khẩu vào biên bản kiểm thử.

Phiên đăng nhập được lưu theo từng trình duyệt. Muốn đăng nhập hai vai trò cùng lúc thì dùng hai profile trình duyệt khác nhau, hoặc một cửa sổ thường và một cửa sổ ẩn danh.

### Cách ghi kết quả

Mỗi kịch bản ghi một dòng:

| Mã | Người kiểm thử | Ngày | Kết quả | Mã lỗi | Ghi chú |
|---|---|---|---|---|---|

Mỗi lỗi phát hiện được ghi theo mẫu sau:

- **Mã lỗi:** `BUG-<số>`
- **Kịch bản / bước:** ví dụ `UAT-12 / bước 4`
- **Mức độ:**
  - Nghiêm trọng: không làm tiếp được, hoặc sai dữ liệu, sai tiền.
  - Cao: sai chức năng nhưng có cách đi vòng.
  - Trung bình: hiển thị sai hoặc khó dùng.
  - Thấp: chữ, giao diện.
- **Mô tả:** việc đã làm → điều mong đợi → điều thực tế xảy ra.
- **Bằng chứng:** ảnh chụp màn hình, URL, giờ xảy ra.

Kịch bản được tính là Đạt khi **mọi** kết quả mong đợi đều đúng. Lỗi chữ hoặc giao diện vẫn ghi Đạt, kèm mã lỗi mức Thấp.

## 2. Bảng đối chiếu use case

| Use case (SRS) | Kịch bản |
|---|---|
| UC1 Đăng ký / Đăng nhập (4.1.1, 4.1.2) | UAT-01, UAT-02, UAT-03 |
| UC2 Tìm kiếm truyện (4.4.2) | UAT-04 |
| UC3 Đọc truyện & Bookmark (4.4.1, 4.5.2) | UAT-05, UAT-06, UAT-07 |
| UC4 Mở khóa chương trả phí | UAT-11 |
| Tương tác cộng đồng (4.5.1–4.5.3) | UAT-08, UAT-09, UAT-10, UAT-12, UAT-13, UAT-14 |
| UC5 Sáng tác & Đăng chương (4.2.1, 4.2.2) | UAT-15 → UAT-20 |
| UC6 Quản lý doanh thu | UAT-21 |
| UC8 Hỗ trợ viết AI | UAT-22 → UAT-25 |
| UC7 Kiểm duyệt nội dung (4.6.1) | UAT-27, UAT-28 |
| UC9 Quản lý người dùng | UAT-29, UAT-30 |
| Thống kê / Dashboard (4.6.2) | UAT-26 |
| Vận hành quản trị khác | UAT-31, UAT-32, UAT-33 |
| Luồng xuyên suốt | UAT-34 |

**Chênh lệch giữa SRS và app hiện tại**

Các mục dưới đây không có kịch bản. Nhóm cần ghi rõ chúng trong báo cáo:

- SRS 4.3.1 "Gợi ý thẻ và tiêu đề", 4.3.2 "Phân loại truyện tự động" và 4.3.3 "Phân tích văn phong, độ dài" không có màn hình tương ứng. AI hiện tại phục vụ việc viết (UAT-22 → UAT-25). Trong số các tác vụ nhanh có "Gọt giũa văn phong", nhưng đó là chức năng viết lại, không phải phân tích.
- SRS mô tả độc giả dùng **ứng dụng di động**. Bản hiện tại là web có giao diện co giãn. Mục 7 kiểm tra ở bề rộng điện thoại thay cho ứng dụng di động.

## 3. Khách và tài khoản

### UAT-01 Đăng ký tài khoản (UC1, 4.1.1)
- **Vai trò:** Khách.
- **Điều kiện:** chưa đăng nhập; có một email thử nghiệm nhận được thư.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở trang đăng nhập, chuyển sang chế độ đăng ký | Có các ô Email, Tên người dùng, Mật khẩu; chữ trên trang là tiếng Việt |
| 2 | Gửi form với email sai định dạng, rồi với mật khẩu quá ngắn | Mỗi lần có thông báo lỗi rõ ràng; không tạo tài khoản |
| 3 | Đăng ký bằng email và tên người dùng mới hợp lệ | Có thông báo hướng dẫn xác minh email |
| 4 | Mở thư xác minh, bấm liên kết | Trang xác minh báo thành công; đăng nhập được bằng tài khoản mới |
| 5 | Đăng ký lại với tên người dùng ở bước 3 | Báo tên đã tồn tại |

Ghi chú: bước 4 cần cấu hình gửi thư. Nếu môi trường không gửi được thư, ghi bước 4 là "Bị chặn" và nêu lý do.

### UAT-02 Đăng nhập và đăng xuất (UC1, 4.1.2)
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Nhập sai mật khẩu, nhấn Enter | Báo sai thông tin; không lộ chi tiết kiểu "email tồn tại" |
| 2 | Nhập đúng, nhấn Enter (không bấm nút) | Đăng nhập thành công, vào trang dành cho độc giả |
| 3 | Tải lại trang | Vẫn đăng nhập |
| 4 | Đăng xuất | Về trạng thái khách; mở lại một trang cần đăng nhập thì được chuyển tới trang đăng nhập |

### UAT-03 Hồ sơ cá nhân và trở thành tác giả (UC1)
- **Vai trò:** Độc giả B.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở "Hồ sơ của tôi" | Thấy tên hiển thị, giới thiệu, ảnh đại diện |
| 2 | Sửa tên hiển thị và giới thiệu, lưu | Có thông báo đã lưu; tải lại trang vẫn giữ giá trị mới |
| 3 | Mở trang hồ sơ công khai của chính mình từ một tài khoản khác | Thấy thông tin vừa sửa |
| 4 | (Tuỳ chọn, làm trên tài khoản mới tạo ở UAT-01) Bấm "Trở thành tác giả" | Tài khoản có thêm khu vực tác giả ("Tác phẩm") |

## 4. Độc giả

### UAT-04 Tìm kiếm và lọc truyện (UC2, 4.4.2)
- **Vai trò:** Khách, sau đó Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở trang chủ, gõ một phần tên truyện mẫu vào ô "Tìm truyện" | Có danh sách gợi ý; dùng phím mũi tên và Enter để mở được |
| 2 | Bấm "Xem tất cả kết quả" | Trang danh sách truyện hiện kết quả khớp từ khoá |
| 3 | Lọc theo một thể loại, rồi đổi cách sắp xếp | Danh sách thay đổi đúng; URL giữ bộ lọc, tải lại trang không mất bộ lọc |
| 4 | Tìm bằng một từ không có kết quả | Có thông báo "không có kết quả", không phải trang lỗi |
| 5 | Tìm có dấu và không dấu (ví dụ "kiem" và "kiếm") | Ghi lại kết quả của cả hai cách. Nếu tìm không dấu không ra kết quả thì ghi lỗi mức Trung bình |

### UAT-05 Xem truyện và đọc chương miễn phí (UC3)
- **Vai trò:** Khách.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở trang một truyện đã xuất bản | Thấy ảnh bìa, giới thiệu, thể loại, tác giả, danh sách chương, đánh giá |
| 2 | Bấm "Đọc chương đầu" | Mở chương 1; nội dung hiển thị đầy đủ |
| 3 | Dùng "Chương sau" và "Chương trước" | Chuyển đúng chương |
| 4 | Mở một chương VIP | Thấy "Chương VIP đang khóa" và nút "Đăng nhập để mở khóa"; không lộ nội dung |

### UAT-06 Tuỳ chỉnh giao diện đọc (UC3, 4.4.1)
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Trong một chương, mở công cụ đọc | Có các tuỳ chọn phông chữ, cỡ chữ, căn lề, giãn dòng, màu nền |
| 2 | Đổi phông (ví dụ Literata), cỡ chữ, căn đều, nền tối | Văn bản đổi ngay theo lựa chọn |
| 3 | Sang chương khác, rồi tải lại trang | Các tuỳ chỉnh vẫn giữ |
| 4 | Dùng phím mũi tên lên/xuống và Escape | Cuộn trang và đóng công cụ hoạt động; không bị kẹt focus |

### UAT-07 Bookmark, lịch sử đọc và thư viện (UC3, 4.5.2)
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Đọc giữa chừng một chương, đặt bookmark tại đoạn đang đọc | Có xác nhận đã đánh dấu |
| 2 | Mở "Thư viện của tôi" → mục bookmark | Bookmark có mặt; bấm vào thì mở đúng chương, đúng đoạn |
| 3 | Mở "Lịch sử đọc" | Truyện và chương vừa đọc đứng đầu |
| 4 | Ở trang truyện, bấm "Đọc tiếp" | Mở đúng chương đọc gần nhất |
| 5 | Xoá bookmark | Bookmark biến mất khỏi thư viện |

### UAT-08 Theo dõi truyện, thông báo và đánh giá (4.5.2, 4.5.3)
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở trang truyện, bấm theo dõi và bật thông báo chương mới | Trạng thái nút đổi; truyện xuất hiện ở "Truyện đang theo dõi" |
| 2 | Chấm điểm (1–10) và viết nhận xét, gửi | Đánh giá xuất hiện ở mục "Đánh giá độc giả"; điểm trung bình của truyện cập nhật |
| 3 | Sửa điểm, rồi "Xóa đánh giá" | Điểm trung bình cập nhật theo từng lần |
| 4 | Thử chấm 0 hoặc 11 | Không cho gửi, có hướng dẫn "từ 1 đến 10" |

### UAT-09 Bình luận chương và đoạn văn (4.5.1)
- **Vai trò:** Độc giả A và Độc giả B.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Độc giả A viết bình luận ở cuối chương, có emoji | Bình luận hiện ngay với tên và giờ |
| 2 | Độc giả B trả lời bình luận của A, có nhắc tên (@) | Câu trả lời nằm dưới bình luận gốc; A nhận thông báo |
| 3 | A sửa rồi xoá bình luận của mình | Sửa: nội dung đổi. Xoá: bình luận biến mất hoặc ghi "đã xoá" |
| 4 | B thử sửa bình luận của A | Không có nút sửa |

### UAT-10 Góp ý riêng cho tác giả, gắn với đoạn văn (4.5.1)

Bình luận theo đoạn (SRS 4.5.1) được làm dưới dạng góp ý riêng cho tác giả. Bình luận công khai chỉ gắn với cả chương.

- **Vai trò:** Độc giả A, sau đó tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Độc giả A chọn một đoạn, chọn "Nhắn riêng cho tác giả", gửi góp ý | Góp ý ở trạng thái "Góp ý đã gửi"; độc giả khác không thấy |
| 2 | Tác giả mở trang bình luận của truyện | Thấy góp ý riêng kèm đoạn văn liên quan |
| 3 | Tác giả trả lời | Độc giả A thấy câu trả lời và nhận thông báo |

### UAT-11 Nạp xu và mở khoá chương VIP (UC4)
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở ví, ghi lại số dư | Thấy số dư và lịch sử giao dịch |
| 2 | "Nạp Xu thử nghiệm": chọn một gói | Có thông báo rõ đây là cổng thử nghiệm; số dư tăng đúng số xu của gói; có giao dịch mới |
| 3 | Mở một chương VIP, chọn mở khoá | Hộp xác nhận ghi giá xu; sau khi xác nhận thì đọc được nội dung |
| 4 | Kiểm tra ví | Số dư giảm đúng giá chương; có giao dịch mở khoá |
| 5 | Mở lại chương đó | Không bị trừ xu lần nữa |
| 6 | Với số dư nhỏ hơn giá chương (dùng tài khoản mới), thử mở khoá | Báo không đủ xu, có đường dẫn "Đến ví xu"; không trừ tiền |

### UAT-12 Ủng hộ tác giả
- **Vai trò:** Độc giả A.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở trang tác giả, ủng hộ một số xu | Số dư giảm đúng; có giao dịch ủng hộ |
| 2 | Tác giả mở doanh thu (xem UAT-21) | Thấy khoản ủng hộ |
| 3 | Thử ủng hộ số xu lớn hơn số dư | Bị từ chối; số dư không đổi |

### UAT-13 Theo dõi người dùng và kết nối (4.5.3)
- **Vai trò:** Độc giả A và Độc giả B.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | A theo dõi tác giả `reader03` | Số người theo dõi của tác giả tăng 1 |
| 2 | A và B theo dõi lẫn nhau | Cả hai thấy nhau trong "Bạn bè" ở trang kết nối |
| 3 | A bỏ theo dõi B | B rời khỏi "Bạn bè" và "Đang theo dõi" của A |

### UAT-14 Báo cáo vi phạm và thông báo
- **Vai trò:** Độc giả B.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở trang truyện, bấm "Báo cáo", chọn lý do, ghi chi tiết, gửi | Có xác nhận đã gửi; báo cáo xuất hiện ở hàng đợi quản trị (UAT-28) |
| 2 | Báo cáo một bình luận | Như bước 1 |
| 3 | Mở trang Thông báo | Các thông báo từ các kịch bản trước (trả lời, theo dõi) có mặt; đánh dấu đã đọc được |

## 5. Tác giả

### UAT-15 Tạo tác phẩm và sửa thông tin (UC5, 4.2.1)
- **Vai trò:** tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở "Tác phẩm", bấm "Tạo tác phẩm mới"; nhập tên, giới thiệu, thể loại | Tác phẩm mới ở trạng thái Bản nháp |
| 2 | Mở trang quản lý tác phẩm, sửa giới thiệu, thể loại, độ tuổi, lời tác giả, ảnh bìa; "Lưu thay đổi" | Tải lại trang vẫn giữ giá trị mới |
| 3 | Tìm, lọc và sắp xếp ở trang "Tác phẩm"; ghim một tác phẩm | Danh sách đúng; tác phẩm đã ghim đứng đầu |
| 4 | Lưu với tên trống | Báo lỗi, không lưu |

### UAT-16 Viết chương trong IDE (UC5, 4.2.2)
- **Vai trò:** tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở tác phẩm bằng "Viết tiếp", rồi "Thêm chương mới" | Chương mới đúng số thứ tự, mở trong trình soạn thảo |
| 2 | Gõ khoảng 200 chữ, dùng in đậm và in nghiêng | Thanh trên cùng hiện "Đã lưu · giờ"; số chữ cập nhật |
| 3 | Tải lại trang | Nội dung còn nguyên |
| 4 | Ngắt mạng (DevTools → Offline), gõ thêm, rồi bật mạng lại | Báo lưu lỗi trong lúc offline; khi có mạng thì tự lưu lại, không mất chữ |
| 5 | Mở "Lịch sử bản thảo", so sánh hai phiên bản, khôi phục bản cũ | So sánh hiển thị khác biệt; khôi phục đúng nội dung |

### UAT-17 Nhập bản thảo từ tệp
- **Vai trò:** tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở "Nhập bản thảo", chọn một tệp .txt có 3 chương (mỗi chương bắt đầu bằng "Chương N") | Có danh sách chương tách tự động, kèm tiêu đề và số chữ |
| 2 | Sửa tiêu đề một chương, bỏ chọn một chương | Danh sách cập nhật |
| 3 | "Lưu chương ở trạng thái bản nháp" | Các chương đã chọn xuất hiện trong tác phẩm ở trạng thái Bản nháp |
| 4 | Nhập một tệp rỗng | Báo "Nội dung chương trống", không tạo chương |

### UAT-18 Gửi duyệt, chương VIP và lên lịch xuất bản (UC5, 4.2.2)
- **Vai trò:** tác giả `reader03`, sau đó Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở "Quyền đọc & giá xu", đặt một chương là "Chương VIP" và nhập giá xu | Giá được lưu |
| 2 | "Gửi duyệt chương" | Chương chuyển sang "Chờ duyệt"; xuất hiện ở hàng đợi kiểm duyệt (UAT-27) |
| 3 | Với một chương khác, "Lên lịch xuất bản" cho vài phút sau | Hiện "Lịch đăng đang chờ duyệt"; đến giờ thì chương được gửi cho quản trị |
| 4 | Sau khi quản trị duyệt (UAT-27) | Chương thành "Đã đăng"; độc giả theo dõi truyện nhận thông báo chương mới |
| 5 | Sửa một chương đã đăng, rồi gửi duyệt lại | Hiện "Phiên bản mới đang chờ duyệt"; độc giả vẫn đọc bản đã duyệt cũ cho tới khi bản mới được duyệt |

### UAT-19 Sắp xếp, lưu trữ và xoá chương
- **Vai trò:** tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | "Sắp xếp chương": kéo, hoặc dùng mũi tên, để đổi chỗ hai chương; "Lưu thứ tự" | Thứ tự mới hiển thị cả ở trang đọc |
| 2 | "Lưu trữ chương" một chương bản nháp, rồi khôi phục | Chương ẩn rồi xuất hiện lại |
| 3 | "Xóa chương" một chương bản nháp | Có hộp xác nhận; chương biến mất. Chương tạo sau đó không nhảy số |

### UAT-20 Quản lý bình luận và đánh giá của truyện
- **Vai trò:** tác giả `reader03`.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở trang bình luận của truyện | Thấy bình luận từ UAT-09, lọc được theo chương |
| 2 | Trả lời một bình luận; xoá một bình luận vi phạm | Độc giả thấy câu trả lời. Có hộp xác nhận xoá; bình luận bị xoá, kèm các trả lời của nó, không còn hiện |
| 3 | Mở trang đánh giá | Thấy đánh giá từ UAT-08 và điểm trung bình |

### UAT-21 Doanh thu và rút xu (UC6)
- **Vai trò:** tác giả `reader03`, sau đó Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở ví → doanh thu | Thấy biểu đồ "Doanh thu theo thời gian"; đổi được kỳ 30 / 60 / 365 ngày; có khoản mở khoá từ UAT-11 và khoản ủng hộ từ UAT-12 |
| 2 | "Rút Xu": nhập số xu và thông tin nhận tiền, gửi | Yêu cầu ở trạng thái chờ; "Dự kiến sau rút" tính đúng |
| 3 | Rút nhiều hơn số dư | Bị từ chối |
| 4 | Sau khi quản trị duyệt (UAT-32) | Trạng thái là Hoàn tất; số dư giảm đúng |

### UAT-22 Story Brain: xem và sửa bộ nhớ truyện (UC8)
- **Vai trò:** tác giả AI. Không cần live.
- **Các bước:** làm theo `docs/development/p2/P2_DEFENSE_DEMO_RUNBOOK.md`, mục 2, các bước 3–8:
  - xem các tab Nhân vật, Sự kiện, Dữ kiện, Hồ sơ Codex;
  - mở các hộp sửa dữ kiện, gỡ thực thể, đề xuất chỉnh sửa sự kiện, rồi bấm "Hủy".
- **Kết quả mong đợi:**
  - Mọi tab đều tải được.
  - Chữ trên giao diện là tiếng Việt; không còn mã thô (UUID) hay chữ kỹ thuật (Canon, Brain v, Fact).
  - Hộp gỡ thực thể cho biết bao nhiêu sự kiện đang nhắc tới thực thể đó.
  - Ô sửa dữ kiện Sống/chết là một danh sách để chọn.

### UAT-23 [LIVE] AI viết tiếp và kiểm tra nhất quán (UC8)
- **Vai trò:** tác giả AI. Cần live.
- **Các bước:** theo `P2_DEFENSE_DEMO_RUNBOOK.md`, mục 4, các bước 1–3.
- **Kết quả mong đợi:**
  - Bản nháp viết tiếp đúng mạch truyện và đúng tên nhân vật.
  - "Chấp nhận bản thảo" chèn bản nháp vào chương và lưu.
  - Kiểm tra nhất quán trả kết quả trong vòng 1 phút.

### UAT-24 [LIVE] Duyệt tên và duyệt đề xuất sau khi AI phân tích (UC8, UC7)
- **Vai trò:** tác giả AI. Cần live.
- **Các bước:** theo `P2_DEFENSE_DEMO_RUNBOOK.md`, mục 4, các bước 4–6.
- **Kết quả mong đợi:**
  - Nút Story Brain báo "mục chờ bạn duyệt".
  - Duyệt tên xong thì sinh ra nhóm đề xuất.
  - Duyệt nhóm thì phiên bản bộ nhớ tăng 1 và không còn mục chờ duyệt.

### UAT-25 Lập kế hoạch: thiết lập thế giới, dàn ý và gợi ý của AI (UC8)
- **Vai trò:** tác giả AI. Bước 3 cần live.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | "Lập kế hoạch" → "2. Thế giới" | Thấy các quy tắc thế giới đã duyệt và "Quản lý quy tắc thế giới" |
| 2 | "Đề xuất sửa quy tắc" cho một quy tắc, rồi Hủy | Form mở ra với nội dung đang dùng |
| 3 | [LIVE] "4. Dàn ý chương" → "AI gợi ý sự kiện tương lai" | Gợi ý dùng tên tiếng Việt, khớp với truyện; chưa có gì được ghi vào bộ nhớ cho tới khi tác giả chấp nhận |

## 6. Quản trị

### UAT-26 Tổng quan hệ thống (4.6.2)
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở "Tổng quan hệ thống" | Thấy các thẻ Tổng người dùng, Tổng tác phẩm, Nội dung chờ kiểm duyệt, Báo cáo người dùng, Yêu cầu rút Xu, Tổng Xu đã nạp |
| 2 | So số liệu với các kịch bản đã chạy | Số chờ kiểm duyệt, số báo cáo và số yêu cầu rút khớp với những gì đã tạo |
| 3 | Biểu đồ "Hoạt động 7 ngày qua" | Có dữ liệu; chú giải đọc được |
| 4 | Đăng nhập bằng độc giả rồi mở `/admin` | Bị từ chối truy cập |

### UAT-27 Kiểm duyệt xuất bản (UC7, 4.6.1)
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở hàng đợi kiểm duyệt, lọc theo trạng thái và nguồn | Thấy chương gửi từ UAT-18 |
| 2 | Mở chi tiết | Thấy "Phiên bản đã gửi để kiểm duyệt", nội dung, bằng chứng |
| 3 | "Duyệt xuất bản" một chương | Chương thành Đã đăng ở phía tác giả và độc giả (UAT-18 bước 4) |
| 4 | "Từ chối nội dung" một chương khác, ghi lý do | Tác giả thấy chương bị từ chối kèm lý do; độc giả không thấy chương đó |

### UAT-28 Xử lý báo cáo người dùng (UC7)
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở mục báo cáo | Thấy các báo cáo từ UAT-14 |
| 2 | Với báo cáo bình luận: "Chấp nhận báo cáo" → "Ẩn nội dung vi phạm" | Bình luận bị ẩn với độc giả; người báo cáo nhận thông báo |
| 3 | Với báo cáo truyện: "Từ chối báo cáo" | Truyện vẫn hiển thị; báo cáo đóng |
| 4 | Thử "Cảnh báo, giữ nguyên nội dung" | Nội dung giữ nguyên; có ghi nhận cảnh báo ở hồ sơ người dùng |

### UAT-29 Quản lý người dùng (UC9)
- **Vai trò:** Quản trị. Dùng một tài khoản phụ (ví dụ tài khoản tạo ở UAT-01) để thử khoá.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | "Quản lý người dùng": tìm theo username hoặc email, lọc theo vai trò và trạng thái | Kết quả đúng |
| 2 | Mở chi tiết người dùng | Thấy vai trò, ngày tạo, lần đăng nhập gần nhất, truyện, lịch sử quyết định |
| 3 | "Khóa tài khoản" kèm lý do | Tài khoản đó không đăng nhập được, và được báo bị khoá |
| 4 | "Mở khóa" | Đăng nhập lại được |
| 5 | "Thay đổi vai trò & quyền" (ví dụ thành tác giả) | Quyền thay đổi ngay sau khi người dùng đăng nhập lại |

### UAT-30 Khiếu nại quyết định
- **Vai trò:** tài khoản bị khoá ở UAT-29, sau đó Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Khi tài khoản đang bị khoá, mở trang khiếu nại, đăng nhập, "Gửi khiếu nại" kèm nội dung | Khiếu nại ở trạng thái "Chờ xem xét" |
| 2 | Quản trị mở "Khiếu nại", xem "Quyết định gốc" | Thấy nội dung khiếu nại và quyết định đã ra |
| 3 | "Chấp nhận khiếu nại" | Quyết định khoá chuyển thành "Đã thu hồi"; tài khoản đăng nhập lại được |
| 4 | Lặp lại với một khiếu nại khác và "Bác khiếu nại" | Quyết định giữ nguyên ("Còn hiệu lực") |

### UAT-31 Quản lý truyện
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở danh sách truyện, lọc theo trạng thái | Danh sách đúng |
| 2 | Mở chi tiết một truyện | Thấy thông tin, email tác giả, danh sách chương, quyền đọc |
| 3 | "Gỡ truyện" kèm xác nhận | Độc giả không còn tìm thấy và không mở được truyện |
| 4 | "Khôi phục truyện" | Truyện hiển thị lại như cũ |

### UAT-32 Duyệt rút xu và đối soát
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Mở "Yêu cầu rút Xu" | Thấy yêu cầu từ UAT-21, kèm người yêu cầu, số xu, tài khoản nhận |
| 2 | Duyệt yêu cầu | Trạng thái Hoàn tất; số dư tác giả giảm đúng |
| 3 | Từ chối một yêu cầu khác | Xu được hoàn về ví tác giả |
| 4 | Mở chi tiết một yêu cầu đã xử lý (trang đối soát) | Lịch sử đối soát ghi đúng người duyệt, thời gian và số xu |

### UAT-33 Thể loại, tag và nhật ký audit
- **Vai trò:** Quản trị.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Ở trang thể loại và tag: thêm một tag thử nghiệm, "Chỉnh sửa danh mục", "Gộp danh mục" vào một tag khác, rồi "Xóa danh mục" | Mỗi thao tác có thông báo; bộ lọc phía độc giả cập nhật theo; truyện gắn tag bị gộp chuyển sang tag giữ lại |
| 2 | Mở nhật ký audit | Các thao tác quản trị ở UAT-27 → UAT-33 có trong nhật ký, kèm người làm và thời gian |

## 7. Luồng xuyên suốt và kiểm tra chung

### UAT-34 Vòng đời một chương, từ lúc viết đến lúc tác giả nhận tiền
- **Vai trò:** Tác giả, Quản trị, Độc giả A.
- **Điều kiện:** Độc giả A đang theo dõi truyện của tác giả và đã bật thông báo.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Tác giả viết một chương mới, đặt là VIP giá 10 xu, gửi duyệt | Chương ở trạng thái Chờ duyệt |
| 2 | Quản trị duyệt xuất bản | Chương thành Đã đăng |
| 3 | Độc giả A mở thông báo | Có thông báo chương mới; bấm vào thì tới chương |
| 4 | Độc giả A mở khoá chương | Đọc được; ví giảm 10 xu |
| 5 | Tác giả mở doanh thu | Có khoản thu từ chương này |
| 6 | Quản trị mở Tổng quan | Số liệu cập nhật |

### UAT-35 Bề rộng điện thoại (thay cho ứng dụng di động trong SRS)
- **Vai trò:** Độc giả A, trên điện thoại thật hoặc DevTools ở 375 × 812.
- **Các bước:** lặp lại nhanh UAT-04, UAT-05, UAT-06 và UAT-11.
- **Kết quả mong đợi:**
  - Không có thanh cuộn ngang.
  - Nút bấm đủ lớn để chạm.
  - Menu mở và đóng được.
  - Đọc chương và mở khoá chương làm được trọn vẹn.

### UAT-36 Phân quyền
- **Vai trò:** Khách, Độc giả và Tác giả.

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Khách mở trực tiếp `/author/projects`, `/wallet`, `/admin` | Được chuyển tới trang đăng nhập |
| 2 | Độc giả mở `/author/projects` và `/admin` | Bị từ chối, hoặc được gợi ý "Trở thành tác giả" |
| 3 | Tác giả A mở trang quản lý truyện của tác giả B (đổi `novelId` trên URL) | Bị từ chối; không xem được bản nháp của người khác |

## 8. Thứ tự chạy gợi ý

Các kịch bản tạo dữ liệu cho nhau, nên chạy theo thứ tự sau:

1. **Tài khoản:** UAT-01 → UAT-03
2. **Độc giả:** UAT-04 → UAT-14
3. **Tác giả:** UAT-15 → UAT-21
4. **Quản trị:** UAT-26 → UAT-33
5. **Xuyên suốt và chung:** UAT-34 → UAT-36
6. **AI:** UAT-22 → UAT-25. Chạy riêng, vì các kịch bản [LIVE] cần chủ dự án bật live.

Có thể chia việc cho nhiều người kiểm thử theo vai trò. Kịch bản UAT-18, UAT-21 và UAT-34 cần hai người phối hợp: một bên tác giả và một bên quản trị.

Một lượt đầy đủ, không tính phần AI, mất khoảng 3–4 giờ cho một người.
