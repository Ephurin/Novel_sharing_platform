# Tiện ích giao diện tác giả và quản trị

Bộ công cụ mới cho màn viết có hướng dẫn riêng tại [STUDIO-WRITING-TOOLS.md](STUDIO-WRITING-TOOLS.md).

Phạm vi đợt này: tác giả và quản trị viên. Không bổ sung tính năng cho role người đọc.

## Cách kiểm tra

Mở `http://localhost:8080`, nhấn **Ctrl + Shift + R**, đăng nhập đúng role. Nên dùng truyện thử khi nhập chương hoặc thử lịch xuất bản.

| Tính năng | Cách kiểm tra | Kết quả mong đợi |
| --- | --- | --- |
| Nhớ kiểu hiển thị | Tác phẩm → Danh sách → tải lại | Vẫn là danh sách. Lựa chọn riêng cho từng tài khoản trên trình duyệt. |
| Bộ lọc trong URL | Tìm truyện, đổi trạng thái/thể loại/sắp xếp → tải lại hoặc mở URL ở tab khác | Điều kiện vẫn giữ nguyên. Bảng admin lưu thêm trang hiện tại. |
| Bộ lọc đã lưu | Mở mục **Bộ lọc đã lưu**, đặt tên, lưu → thay điều kiện → bấm tên đã lưu | Khôi phục các điều kiện của trang; không giữ trang phân trang cũ. Tên trùng ghi đè mẫu cũ; nút × xóa mẫu. Ở trang Tác phẩm, hộp mở bên phải và tự điều chỉnh vị trí khi màn hình hẹp; không đẩy mục Vừa làm việc xuống dưới. |
| Ghim truyện | Bấm biểu tượng ghim trên thẻ hoặc hàng truyện | Truyện lên đầu trong nhóm kết quả đang lọc; giữ sau tải lại. |
| Chỉ truyện đã ghim | Chọn **Chỉ tác phẩm đã ghim** | Hiện các truyện đã ghim và vẫn tuân theo các bộ lọc khác. |
| Vừa làm việc | Mở quản lý một truyện → quay lại Tác phẩm → mở **Vừa làm việc** | Có liên kết đến truyện vừa mở; chỉ hiển thị truyện có trong danh sách của tài khoản hiện tại. |
| Lệnh nhanh | Bấm biểu tượng tìm kiếm ở navbar hoặc Ctrl/Cmd + K khi không nhập văn bản | Mở danh sách lệnh; tìm được cả khi gõ không dấu; ↑/↓ chọn, Enter mở, Esc đóng. |
| Quyền của lệnh admin | Mở lệnh nhanh với admin có phạm vi hạn chế | Chỉ có trang thuộc quyền điều hướng của tài khoản; API và route guard vẫn kiểm tra quyền. |
| Phím tắt | Tại Tác phẩm, bấm `/`, `N`, `?` khi focus ngoài trường nhập | `/` tìm truyện, `N` mở tạo truyện, `?` xem hướng dẫn. Các phím này không kích hoạt khi đang nhập văn bản hoặc có dialog khác. |
| Cột bảng admin | Users/Novels/Moderation/Reports/Withdraws/Audit → **Cột hiển thị** | Có thể ẩn cột phụ; định danh chính và cột thao tác vẫn hiện. Tải lại vẫn nhớ; **Khôi phục** hiện lại các cột. |
| Header bảng cố định | Với bảng dài, cuộn bên trong bảng | Tiêu đề cột giữ ở trên; có thể cuộn ngang trên điện thoại. |
| Quay lại danh sách | Cuộn Tác phẩm hoặc bảng admin → mở chi tiết → Back | Khôi phục vị trí cuộn trang theo URL. Nếu chủ động cuộn trong lúc tải thì không ép về vị trí cũ. |
| Xem nhanh admin | Users/Novels → **Xem nhanh** | Mở ngăn bên phải bằng dữ liệu danh sách đã tải; **Trước/Sau** chuyển bản ghi trong trang; **Mở chi tiết** đến trang đầy đủ. |
| Xem nhanh tác phẩm | Tác phẩm → icon mắt cạnh ghim (lưới hoặc danh sách) | Xem giới thiệu, thể loại, số chương, lượt đọc; Trước/Sau chuyển trong kết quả hiện tại. Không rời danh sách; có nút sao chép thông tin. |
| Phản hồi thao tác mới | Studio → xuất tệp, ghi chú, lịch sử, lịch đăng; Tác phẩm → cắt ảnh bìa | Có trạng thái xử lý và kết quả phù hợp. Giảm chuyển động tắt hiệu ứng; không tự công bố hoặc chấp nhận nội dung. |
| So sánh AI | Sửa một trường của đề xuất AI → **So sánh thay đổi** | Hiện giá trị AI và giá trị tác giả sửa cho các trường thực sự khác nhau; không tự duyệt hoặc lưu. |
| So sánh audit | Nhật ký quản trị → mở **So sánh thay đổi** | Hiện trường trước/sau thay đổi; bản JSON gốc vẫn ở mục **Xem trước / sau**. |
| Tìm lỗi bản thảo | Nhập tệp có chương thiếu tên → **Lỗi tiếp theo** | Chuyển đến đúng trang và focus ô tiêu đề của chương cần sửa. |
| Lọc chương cần sửa | Bật **Chỉ chương cần sửa** | Bảng và phân trang chỉ hiển thị chương không hợp lệ. Sửa hết lỗi sẽ hiện trạng thái trống. Việc lọc không tự thay đổi danh sách chương đã chọn. |
| Tổng kết nhập | Nhập nhiều chương; có thể mô phỏng lỗi request snapshot trong môi trường test | Báo chính xác số chương hoàn tất, chương dừng và số chưa xử lý. Nếu đã tạo chương nhưng snapshot lỗi thì nêu rõ; có liên kết kiểm tra chương. |
| Giờ đăng | Quản lý chương → lên lịch → đổi ngày giờ | Hiện thời điểm tương ứng tại Asia/Bangkok trước khi lưu. Giá trị gửi API vẫn là thời điểm UTC từ lựa chọn ngày giờ hiện có. |
| Ảnh bìa và cắt tùy chọn | Tạo tác phẩm hoặc sửa thông tin → chọn ảnh; bấm **Cắt ảnh** nếu muốn chỉnh phóng to và vị trí | Ảnh nhỏ được dùng ngay, giữ nguyên tệp nếu không quá 1 MB. Ảnh rộng hơn 600px hoặc cao hơn 900px tự cắt giữa về JPEG 600×900. Trình cắt thủ công chỉ mở khi bấm Cắt ảnh; **Dùng ảnh đã cắt** tải kết quả mới, **Hủy cắt ảnh** giữ ảnh đã tải. |
| Tìm truyện trong lệnh nhanh | Ctrl/Cmd + K → nhập ít nhất hai ký tự trong tên truyện, có thể không dấu | Hiện lệnh quản lý, viết tiếp và cẩm nang cho các tác phẩm của tài khoản. Hiện tối đa năm truyện phù hợp; gõ thêm tên để thu hẹp. |
| Chương trùng nội dung | Nhập tệp có hai chương khác tiêu đề nhưng cùng nội dung | Có cảnh báo nhóm trùng. **Xem chương trùng** lọc bảng. **Bỏ chọn bản trùng** giữ bản đầu tiên đang được chọn trong từng nhóm, không xóa hoặc tự sửa chương. |
| Xem trước chuẩn hóa | Nhập tệp có dấu ngoặc kép thẳng, ba dấu chấm hoặc nhiều dòng trống → Cấu hình nâng cao → **Xem trước chuẩn hóa** | Hai cột hiện văn bản thực trước/sau và số ký tự. Với tệp dài, dùng **Đoạn trước/Đoạn sau**; mỗi bên hiển thị tối đa 6.000 ký tự một đoạn. |
| Lưu mẫu tách chương | Cấu hình nâng cao → **Mẫu tách chương đã lưu** → đặt tên → lưu → đổi quy tắc → bấm tên mẫu | Khôi phục Regex và các tùy chọn chuẩn hóa. Mẫu riêng theo tài khoản trên trình duyệt; có nút xóa. Regex sai cú pháp không được áp dụng hoặc lưu. |
| Giữ vị trí bên trong bảng | Cuộn ngang/dọc vùng bảng admin rồi tải lại hoặc mở chi tiết và Back | Khôi phục cả hai trục trong vùng bảng, riêng theo tài khoản, bảng và URL. Đổi bộ lọc sang URL khác bắt đầu ở đầu bảng. |

Kiểm tra thêm ở sáng/tối, desktop và điện thoại khoảng 390px. Dùng Tab/Shift + Tab và Esc để kiểm tra focus. Chuyển động tiếp tục tuân theo tùy chọn giảm chuyển động của hệ điều hành.

## Cách lưu dữ liệu

- Chế độ lưới/danh sách, ghim, truyện gần đây, mẫu lọc và cột hiển thị lưu trong localStorage, có khóa riêng theo tài khoản. Không lưu nội dung bản thảo.
- Vị trí cuộn trang và vị trí hai trục bên trong bảng lưu trong sessionStorage theo tài khoản và URL.
- Mẫu tách chương lưu Regex và các tùy chọn chuẩn hóa trong localStorage, tối đa 20 mẫu mỗi tài khoản trên trình duyệt; không lưu nội dung bản thảo.
- Phát hiện trùng so sánh các chương trong tệp đang nhập, bỏ qua khác biệt khoảng trắng và cách tổ hợp Unicode. Giữ phân biệt hoa/thường và dấu câu; không đối chiếu với nội dung chương đã lưu trên máy chủ.
- Ảnh bìa nhận PNG/JPEG/WebP gốc tối đa 10 MB. Ảnh nhỏ không quá 1 MB giữ nguyên; ảnh nhỏ vượt giới hạn này được nén ở kích thước gốc. Ảnh lớn tự cắt giữa và trình cắt thủ công xuất JPEG 600×900, tối đa 1 MB; vùng trong suốt có nền trắng. Công cụ không sửa tệp gốc trên máy.
- Xóa dữ liệu trình duyệt sẽ xóa các tùy chọn trên; hiện chưa đồng bộ sang thiết bị khác.
- Bộ lọc trong URL có thể chia sẻ, nhưng người mở vẫn cần quyền truy cập và chỉ nhận dữ liệu API cho phép.
- Nhập bản thảo dừng khi gặp lỗi. Không tự nhập lại phần thất bại vì một chương có thể đã được tạo trước khi request snapshot lỗi. Cần kiểm tra danh sách chương trước khi thử lại.

## Điều hướng và tạo tác phẩm

- Trang gốc của tác giả có tên **Tác phẩm** trên menu và breadcrumb. Breadcrumb của trang con chỉ có các trang đích thực tế, không lặp lại cùng một đường dẫn; trang Ví và doanh thu và Trang tác giả không có breadcrumb.
- Hàng **Chỉ tác phẩm đã ghim / Bộ lọc đã lưu / Vừa làm việc** dùng cùng chiều cao, cỡ chữ và mũi tên; tự xuống hàng trên màn hình hẹp.
- Khi tạo hoặc chỉnh sửa tác phẩm, thể loại đã tồn tại được dùng lại theo tên hoặc slug, kể cả thể loại seed có slug khác tên. Không đổi tên thể loại có sẵn; các yêu cầu đồng thời không tạo bản trùng. Kiểm tra PostgreSQL và POST tạo tác phẩm ở `backend/src/modules/novels/novels-genre.postgres.test.ts` chạy trong schema riêng.

## Kiểm thử tự động

Chạy trong thư mục `web`, với Chrome cài trên máy:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run typecheck
npm run test:author-admin-motion
npm run test:animated-feedback
npm run test:manuscript-tools
npm run test:p1-hitl-interactions
```

Các browser test dùng API giả lập, không ghi vào dữ liệu đang sử dụng. Kiểm tra thủ công vẫn cần thiết cho quyền admin thực, dữ liệu nhiều dòng và lưu lịch xuất bản qua backend.

## Các mục còn có thể phát triển

- Tự thử lại phần nhập thất bại sau khi có cơ chế theo dõi trạng thái từng chương và bảo đảm không tạo trùng.
- Mở rộng dòng thời gian xử lý từ các sự kiện backend hiện có.
- Thông báo có dữ liệu mới để người dùng chủ động cập nhật khi đang xem danh sách.
- Cài đặt mức chuyển động riêng cho khu vực tác giả/admin.
- Đồng bộ các tùy chọn giao diện sang tài khoản trên máy chủ.

So sánh lịch sử phiên bản bản thảo đã có trong chức năng **Lịch sử** hiện hữu; đợt này bổ sung so sánh chỉnh sửa đề xuất AI và dữ liệu audit.
