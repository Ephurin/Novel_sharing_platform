# Bộ công cụ viết trong Studio

Mở một chương tại `/author/ide`. Nhấn **Ctrl + Shift + R** sau khi cập nhật web để nhận bản mới.

## Sửa xuất tệp, tìm kiếm, định dạng và ghi chú theo đoạn

- **Xuất bản thảo** mở hộp chọn TXT, Markdown, HTML hoặc PDF qua trình duyệt. Không tự tải Markdown. TXT bỏ các ký hiệu định dạng đã hỗ trợ; Markdown giữ ký hiệu, HTML giữ định dạng hiển thị. Menu **Tệp** vẫn có các lựa chọn tải nhanh.
- **Ctrl/Cmd + F** mở riêng Tìm kiếm, không có ô thay thế. Nút **Thay thế** hoặc **Ctrl/Cmd + H** trong bản thảo mở công cụ thay thế. Enter/Shift + Enter tiếp tục tìm khi con trỏ ở ô tìm kiếm.
- Mặc định **Soạn thảo** hiển thị trực tiếp đậm, nghiêng, gạch chân và gạch ngang. Chọn chữ rồi bấm nút trên thanh công cụ hoặc Ctrl/Cmd + B/I/U. **Ký hiệu định dạng** cho phép xem/sửa dạng văn bản gốc. Hai chế độ dùng chung bản nháp và hàng đợi tự lưu.
- Chọn chữ hoặc đặt con trỏ trong một dòng, bấm **Ghi chú đoạn** (hoặc Ctrl/Cmd + Alt + M), nhập ghi chú và bấm **Lưu ghi chú đoạn**. Trong mục Ghi chú có **Tới đoạn**, sửa, xóa, đánh dấu đã xử lý và gắn lại vùng chọn.
- Ghi chú theo đoạn theo vị trí khi sửa phần trước hoặc bên trong đoạn. Nếu đoạn gốc bị xóa/thay toàn bộ, ghi chú vẫn được giữ và đánh dấu mất liên kết; không tự nhảy sang đoạn khác có chữ giống nhau. Có thể gắn lại vùng chọn một cách chủ động.
- Ghi chú chung và ghi chú theo đoạn lưu riêng theo tài khoản/chương trên trình duyệt. Có thể tải ghi chú theo đoạn ra TXT; chúng không đi vào bản xuất hoặc nội dung xuất bản.

## Những phần đã bổ sung

- Thanh công cụ bản thảo có menu Tệp, Chèn, hoàn tác/làm lại, tìm–thay thế, điều hướng cảnh, ghi chú, bản định dạng và thống kê.
- Menu, tooltip, hộp thoại và bảng công cụ dùng các hiệu ứng chung; tôn trọng chế độ giảm chuyển động của hệ điều hành.
- Lưu ngay bằng Ctrl/Cmd + S, bên cạnh tự lưu và lịch sử bản thảo hiện hữu.
- Khi trình duyệt báo có mạng trở lại, thử đồng bộ các bản nháp đang chờ, trừ những bản đã có xung đột phiên.
- Tùy chọn font, cỡ chữ, giãn dòng bị hỏng hoặc storage bị chặn không làm Studio ngừng mở.

## Cách thử

| Phần | Thao tác | Kết quả |
| --- | --- | --- |
| Hoàn tác | Viết một đoạn, hoặc chọn chữ và bấm in đậm, rồi Ctrl/Cmd + Z | Nội dung và vùng chọn trở về trước thay đổi. |
| Làm lại | Ctrl/Cmd + Shift + Z hoặc Ctrl + Y trong nội dung | Áp dụng lại thay đổi vừa hoàn tác. |
| Định dạng | Chọn chữ rồi Ctrl/Cmd + B, I hoặc U | Thêm dấu in đậm/nghiêng/gạch chân. Bấm lại khi vùng chọn vẫn nằm trong dấu đó sẽ bỏ định dạng. |
| Tìm | Ctrl/Cmd + F khi focus trong nội dung | Mở công cụ tìm; Enter/Shift + Enter đến kết quả tiếp/trước. |
| Nguyên từ | Tìm `An`, bật Nguyên từ, với nội dung `An gặp Anam` | Chỉ chọn `An`, không chọn phần đầu của `Anam`. Có hỗ trợ ranh giới từ tiếng Việt. |
| Thay thế | Điền ô Thay bằng → Thay một/Thay tất cả | Sửa đúng kết quả tìm. Chuỗi như `$&` là văn bản bình thường. Có thể hoàn tác. |
| Cảnh | Menu Chèn → Ngắt cảnh; viết đoạn sau dấu `---`; mở Cảnh | Liệt kê các cảnh, bấm để đến vị trí tương ứng trong chương. |
| Ghi chú | Mở Ghi chú, viết ghi nhớ, đổi chương rồi quay lại hoặc tải lại | Ghi chú riêng theo tài khoản và chương trên trình duyệt này. Không đi vào nội dung xuất bản. Có nút tải ghi chú TXT. |
| Bản định dạng | Viết `**in đậm**`, `*in nghiêng*`, `<u>gạch chân</u>`, `~~gạch ngang~~`, khối `> trích dẫn` | Xem bản định dạng hiển thị các dấu đang hỗ trợ. Nội dung đang soạn, kể cả chưa đồng bộ, được dùng để xem. |
| Thống kê | Mở Thống kê & mục tiêu, có thể chọn một đoạn trước khi mở | Hiện số từ, ký tự, ký tự bỏ khoảng trắng, đoạn văn, thời gian đọc và thống kê vùng chọn. |
| Mục tiêu | Đặt số từ từ 100 đến 100.000 | Tiến độ theo số từ chương hiện tại; mục tiêu lưu trên trình duyệt, riêng theo tài khoản/chương. |
| Xuất | Menu Tệp → TXT/Markdown/HTML | Tải nội dung hiện tại, không chờ máy chủ lưu. HTML hiển thị định dạng; các thẻ HTML ngoài phạm vi hỗ trợ được giữ dưới dạng chữ an toàn. |
| In/PDF | Menu Tệp → In / Lưu PDF qua trình duyệt | Mở bản in chương; chọn Save as PDF trong hộp in của trình duyệt nếu cần. |
| Lưu ngay | Sửa chương rồi Ctrl/Cmd + S | Thử lưu ngay bằng hàng đợi và kiểm tra phiên bản hiện hữu. Không ghi đè âm thầm khi có xung đột. |
| Ngoại tuyến | Trong môi trường thử, chuyển Network sang Offline rồi viết; bật mạng lại | Có thông báo ngoại tuyến và trạng thái lỗi nếu chưa lưu được. Bản đang viết được giữ; khi có mạng, thử lưu lại nếu không có xung đột. |

Có thể thử định dạng/tìm–thay thế bằng đoạn:

```text
An gặp Bình. Anam đứng ngoài.

---

**Cảnh hai**

An nói “Xin chào 🌙”.
```

Các kiểm tra thao tác nhập nội dung sẽ tự lưu vào chương; nên dùng một chương thử.

## Lưu và khôi phục

- Bản nháp tiếp tục dùng hàng đợi ghi tuần tự, expectedVersion, bản dự phòng theo tài khoản/chương và cảnh báo khi rời trang chưa lưu xong.
- Khi có xung đột, giữ nội dung đang sửa và để tác giả chọn xử lý. Có thể tải bản thảo về trước khi chọn tải bản máy chủ.
- Hoàn tác mới áp dụng cho **nội dung chương**, không áp dụng cho giá VIP hoặc trạng thái xuất bản. Ô tiêu đề và ghi chú dùng hành vi chỉnh sửa riêng của trình duyệt.
- Lịch sử hoàn tác nằm trong bộ nhớ phiên viết, tối đa 60 bước, có hạn mức tổng dung lượng và gộp các thao tác gõ liên tiếp. Đổi chương/tài khoản hoặc tải lại sẽ bắt đầu lịch sử mới. Dùng **Lịch sử bản thảo** hiện hữu cho các phiên bản trên máy chủ.
- Ghi chú và mục tiêu chỉ lưu trên thiết bị/trình duyệt đang dùng. Xóa dữ liệu trình duyệt sẽ xóa chúng; tải ghi chú để có bản độc lập. Khi lưu ghi chú thất bại, giao diện hiện lỗi.
- Trình duyệt không báo offline không có nghĩa máy chủ chắc chắn truy cập được. Luôn căn cứ trạng thái lưu và thông báo lỗi.

## Phạm vi định dạng

Studio lưu văn bản kèm các ký hiệu định dạng hiện hữu để tương thích bản thảo, màn đọc và vị trí chèn AI; chế độ trực quan chuyển các dấu inline đã hỗ trợ thành định dạng ngay trong vùng gõ. Chưa có cộng tác nhiều người theo thời gian thực, ghi chú đồng bộ giữa thiết bị, bảng/ảnh trong văn bản hoặc xuất DOCX. Kiểm tra chính tả sử dụng khả năng sẵn có của trình duyệt và bộ từ điển người dùng đã bật.

## Kiểm thử

Chạy từ `web`:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run typecheck
npm run test:studio-tools
node --test tests/author-ide-caret.browser.test.mjs
```

Kiểm tra thêm hàng đợi và Studio với backend thật trong schema/database thử riêng, cần PostgreSQL và MongoDB local theo `.env.example`:

```powershell
$env:RUN_DRAFT_BROWSER_TESTS = '1'
node --env-file=../backend/.env.example --test tests/draft-persistence.browser.test.mjs
node --env-file=../backend/.env.example --test tests/author-ide.browser.test.mjs
```

Các bài kiểm tra trên không dùng chương đang viết của người dùng.
