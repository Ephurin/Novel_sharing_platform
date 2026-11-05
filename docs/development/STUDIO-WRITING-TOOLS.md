# Bộ công cụ viết trong Studio

## Nhãn ghi chú, đánh dấu, vị trí viết và rà soát bản thảo

Đợt này triển khai 5 mục ưu tiên cho tác giả; không thay đổi giao diện người đọc.

| Công cụ | Cách dùng | Cách kiểm tra |
| --- | --- | --- |
| Nhãn ghi chú | Tạo/sửa ghi chú theo đoạn → chọn **Cốt truyện / Nhân vật / Câu chữ / Cần tra cứu**. **Lọc nhãn** dùng kết hợp với trạng thái và từ khóa. | Đặt nhãn, lọc sang nhãn khác rồi quay lại; tải lại trang. Ghi chú cũ vẫn có ở **Chưa phân loại**. |
| Đánh dấu đoạn | Bôi đen → icon bookmark trên thanh nổi, hoặc chuột phải → **Đánh dấu đoạn văn**. Có thể mở từ **Xem → Đánh dấu đoạn văn**, rồi chọn vùng/dòng hiện tại và đặt tên. | Mở tab **Đánh dấu** trong bảng Ghi chú, bấm **Tới đánh dấu**. Thêm chữ trước đoạn rồi kiểm tra vị trí; đổi chương và tải lại để kiểm tra lưu. Đoạn bị xóa được giữ như đánh dấu mất liên kết, có thể gắn lại. |
| Nhớ vị trí viết | Studio tự nhớ con trỏ/vùng chọn và vị trí cuộn riêng theo tài khoản/chương. | Đặt con trỏ giữa chương dài, cuộn xuống, đợi khoảng một giây rồi tải lại hoặc đổi chương và quay lại. Khôi phục chỉ chạy lúc vào chương; thao tác mới của người dùng hủy lần khôi phục đang chờ. |
| Tìm xuyên chương | **Chỉnh sửa → Tìm xuyên chương**, hoặc **Ctrl/Cmd+Shift+F**. Nhập từ khóa → **Tìm toàn truyện**; có phân biệt hoa/thường và nguyên từ. | Tìm một cụm xuất hiện ở nhiều chương; bấm kết quả để mở đúng chương và chọn đúng đoạn. Chương hiện tại dùng nội dung đang viết, chương khác ưu tiên bản nháp máy chủ. Chương lỗi quyền/tải được báo riêng; có nút dừng. |
| Dấu câu/khoảng trắng | **Xem → Kiểm tra dấu câu & khoảng trắng**. Xem đề xuất, lọc loại, bỏ qua, áp dụng từng mục hoặc các mục đang hiện. | Thử `An  mở cửa ,Bình nói...  `; chỉ mở công cụ không làm đổi nội dung. Áp dụng rồi đóng và Ctrl+Z để hoàn tác. Ghi chú/bookmark ở giữa các chỗ sửa vẫn giữ liên kết. |

- Nhãn, bookmark và vị trí viết hiện lưu trong trình duyệt, có khóa riêng theo tài khoản/chương. Vị trí viết lưu tọa độ và một mẩu ngữ cảnh tối đa 160 ký tự để nhận diện chỗ cũ nếu nội dung đổi; không đồng bộ sang thiết bị khác. Xóa dữ liệu trình duyệt sẽ xóa các dữ liệu tiện ích này.
- Tối đa 100 bookmark mỗi chương, tên tối đa 80 ký tự. Tìm xuyên chương tải tối đa 3 chương đồng thời và hiển thị tối đa 300 kết quả; không tự thay thế trên nhiều chương. Chương chưa lưu vẫn đi qua cảnh báo lưu hiện có trước khi chuyển.
- Kiểm tra trình bày chỉ gợi ý khoảng trắng lặp/cuối dòng/trước dấu câu, khoảng trắng sau một số dấu câu và dấu chấm lửng. Giữ xuống dòng, định dạng, URL, đoạn mã; không phải kiểm tra chính tả/ngữ pháp. Hiện tối đa 500 đề xuất mỗi lượt. Không tự áp dụng khi mở hoặc đổi bộ lọc.
- Nếu bản thảo đã đổi, công cụ kiểm tra lại tọa độ trước khi sửa; nếu đoạn tìm kiếm đã đổi thì báo tìm lại. Đánh dấu không tạo nội dung trong bản thảo hoặc bản xuất.

Kiểm thử riêng: `npm run test:studio-assistance` trong `web`. Browser test dùng API giả lập và kiểm tra cả bản nháp chưa lưu, quyền đọc chương, nhãn, liên kết bookmark qua nhiều chỗ sửa, undo, vị trí sau tải lại/đổi chương và cách ly tài khoản.

## Công cụ vùng chọn và phản hồi thao tác

- Bôi đen trong **Soạn thảo** hoặc **Ký hiệu định dạng** để hiện thanh công cụ nổi: đậm/nghiêng/gạch chân, ghi chú, tra cứu cẩm nang, mở AI. Thanh này dùng portal, không chèn phần tử vào nội dung và không thay kích thước bản thảo. Alt+Shift+T đưa focus vào thanh; dùng phím mũi tên, Home/End và Esc. Không tự gửi yêu cầu AI khi mở thanh.
- **Xem → Tra cứu cẩm nang** hoặc chuột phải → **Tra cứu trong cẩm nang** tìm nhân vật, sự kiện và tóm tắt đã có của tác phẩm. Tìm được bằng chữ không dấu; có lọc loại, sao chép và liên kết đến cẩm nang đầy đủ. Không tự phân tích hoặc tạo nhân vật từ bản thảo.
- Ghi chú theo đoạn có **Ghim/Bỏ ghim**, bộ lọc **Đã ghim**, và **Hoàn tác xóa** cho ghi chú vừa xóa. Ghim lưu theo tài khoản/chương cùng các ghi chú cũ; không thay đổi vị trí đoạn văn. **Tới đoạn** chọn đúng vùng và nhấn mạnh tạm thời trên trình duyệt hỗ trợ CSS Highlights, không sửa DOM của trình soạn thảo.
- Gợi ý AI có **So sánh trước khi áp dụng** và **Sao chép gợi ý**. So sánh dùng vùng thay thế và bản gốc tại thời điểm yêu cầu; xem hoặc đóng không tự chấp nhận. Chấp nhận tiếp tục qua API và kiểm tra phiên bản hiện hữu. AI và Ghi chú không mở cùng lúc.
- Hộp xác nhận xuất bản kiểm tra tình trạng thật: tiêu đề, nội dung, lưu bản nháp, giá VIP, ghi chú còn mở và lịch đăng nếu có. Ghi chú là nhắc việc, không tự chặn gửi duyệt. Nút gửi vẫn đi qua lưu, snapshot và kiểm tra của máy chủ.
- Thống kê dùng số chuyển động và phản hồi đạt mục tiêu. Cảnh đang chọn được đánh dấu. Xuất tệp có trạng thái đang tạo, ngăn bấm lặp trong cùng tác vụ; sao chép báo thành công chỉ sau khi trình duyệt xác nhận.
- Lịch sử bản thảo dùng hộp thoại chung, có phản hồi lưu mốc và sao chép phiên bản. Lên lịch nhấn mạnh ngày giờ xem trước và báo thời điểm đã qua. Cắt ảnh bìa báo đang xử lý/tải bằng tiến trình không xác định, không giả lập phần trăm tải.
- Các hiệu ứng mới dùng màu giao diện hiện có, hỗ trợ sáng/tối và giảm chuyển động. Không tạo animation cho văn bản đang gõ.

### Thử nhanh phần mới

1. Dùng chương thử, bôi đen một tên → bấm **B** trên thanh nổi → Ctrl+Z; nội dung phải khôi phục, trang không đổi kích thước.
2. Chọn tên nhân vật đã có → tra cứu cẩm nang; thử tìm không dấu. Đóng hộp thoại, nội dung bản thảo phải giữ nguyên.
3. Tạo hai ghi chú, ghim ghi chú thứ hai → nó lên đầu. Xóa → **Hoàn tác xóa** → lọc **Đã ghim** → tải lại để kiểm tra lưu.
4. Tạo gợi ý AI → **So sánh trước khi áp dụng**. Chỉ xem/đóng không sửa nội dung; **Chấp nhận bản thảo** mới gửi yêu cầu áp dụng.
5. Mở xác nhận xuất bản khi còn ghi chú chưa xử lý để thấy nhắc việc. Không cần xác nhận gửi để kiểm tra giao diện.
6. Mở lịch sử, lưu mốc thử; mở lên lịch và chọn thời điểm đã qua để thấy cảnh báo. Ở Tác phẩm, dùng icon mắt **Xem nhanh**, thử Trước/Sau và Esc.

Kiểm thử thêm: `npm run test:studio-enhancements`. Browser test dùng API giả lập, không thay đổi chương thật.

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
# Thanh công cụ gọn và bảng ghi chú

## Vị trí chèn bản thảo AI

- Vùng chọn và con trỏ dùng offset Unicode code point ở API; Studio chuyển đổi từ/to UTF-16 khi gửi yêu cầu và khôi phục con trỏ sau khi chấp nhận.
- Repository PostgreSQL của AI lưu con trỏ vào metadata riêng `_selection_cursor` vì bảng hiện hữu chỉ có `selection_start`/`selection_end`. Metadata này được tách khỏi `context_summary` trả ra API. Tác vụ cũ thiếu con trỏ dùng `selection_end`, không mặc định về đầu chương.
- Luồng tạo và đọc tác vụ kiểm tra vị trí patch khớp vùng chọn hoặc con trỏ. Gợi ý cũ sinh sai offset bị đánh dấu `PATCH_SELECTION_MISMATCH` khi đọc, không sửa lịch sử đã lưu; cần tạo gợi ý mới.
- Kiểm tra hồi quy: `python -m pytest tests/test_writing_cursor_persistence.py` trong `ai-service`, dùng SQLite riêng với ORM PostgreSQL để kiểm tra round-trip lưu/tải và xử lý nền. Kiểm tra phía Studio: `node --test tests/author-ide-caret.browser.test.mjs` trong `web`.

- Thanh đầu tiên có đường về tác phẩm, Story Brain, AI và xuất bản chương. Hàng menu và cài đặt chương dùng chung một hàng trên desktop; **Lên lịch** và icon **Lịch sử bản thảo** nằm cạnh Miễn phí/VIP. Trong chế độ Tập trung, hai lệnh vẫn có trong **Tệp**, cùng với Xuất bản thảo. Tìm/Thay thế nằm trong **Chỉnh sửa**; cảnh, xem bản định dạng và thống kê nằm trong **Xem**.
- **Ghi chú** mở bảng bên phải, không đẩy vùng viết xuống. Trên màn hình nhỏ bảng nổi lên ở mép phải và có nút đóng. Hai tab **Theo đoạn** và **Sổ tay chương** dùng lại ghi chú đã lưu, không di chuyển hoặc xóa dữ liệu cũ.
- Chọn đoạn, bấm chuột phải → **Thêm ghi chú đoạn** hoặc Ctrl/Cmd+Alt+M. Có thể tìm ghi chú, lọc đang mở/đã xử lý/tất cả/đoạn đã thay đổi, tới đoạn và gắn lại vùng chọn. Bảng này là ghi chú riêng trên trình duyệt, không phải nhận xét cộng tác hoặc thông báo cho người khác.
- Menu chuột phải có Cắt, Sao chép, Dán văn bản, Xóa vùng chọn và Chọn tất cả bản thảo. Khi trình duyệt chặn bảng nhớ tạm, dùng phím tắt được hướng dẫn; cắt chỉ xóa sau khi sao chép thành công.

## Công cụ sửa bản thảo tham khảo từ Docs

- Thanh vùng chọn hiện tên chức năng khi rê chuột hoặc focus bằng bàn phím, gồm định dạng chữ, ghi chú riêng, chú thích cho độc giả, đánh dấu, cẩm nang và AI.
- Cỡ chữ và giãn dòng có ô nhập trực tiếp trên thanh định dạng; Enter hoặc rời ô xác nhận giá trị. Giữ phạm vi hiện có: cỡ chữ 13–28, giãn dòng 1.2–3. Các nút tăng/giảm và mức giãn dòng có sẵn vẫn dùng được, lựa chọn còn sau khi tải lại.
- **Chèn → Ký tự đặc biệt**, hoặc nút **Ω**, mở kho có tìm kiếm theo tên/ký tự: ngoặc `「」『』【】《》`, dấu câu, dấu ngắt cảnh, mũi tên và ký hiệu. Cặp ngoặc bọc phần chữ đang chọn; nếu không chọn, đặt con trỏ giữa cặp. Chèn ký tự đi qua lịch sử và autosave, giữ vị trí ghi chú riêng.
- **Xem trước như độc giả** có ngay trên hàng menu, kể cả chương chưa có chú thích. Phần phạm vi ngữ cảnh AI dùng nhãn ở trên và ô chọn toàn chiều rộng bên dưới để tên Story Bible không ép nhãn xuống dòng.
- Kiểm tra các thao tác này bằng `npm run test:studio-polish`; browser test chạy cả Soạn thảo/Ký hiệu định dạng, desktop/mobile và sáng/tối.

- **Chỉnh sửa → Xóa định dạng vùng chọn** (Ctrl/Cmd+\): bỏ in đậm, nghiêng, gạch chân và gạch ngang trong phần chọn, giữ định dạng phần trước/sau. Có cả trong menu chuột phải. Không đổi phông, cỡ chữ hoặc bố cục chung.
- **Chỉnh sửa → Đổi vùng chọn thành CHỮ HOA / chữ thường** giữ các dấu định dạng; hỗ trợ tiếng Việt và có thể hoàn tác.
- **Chèn → Ngoặc thoại** bao vùng chọn bằng “…”; nếu chưa chọn, đặt con trỏ giữa hai dấu. **Dấu chấm lửng** chèn ký tự ….
- **Xem → Chiều rộng vùng viết** có Hẹp / Vừa / Rộng, lưu lựa chọn trên máy. Chỉ thay cách trình bày khi viết, không sửa nội dung hoặc bản xuất.
- Ctrl/Cmd+Shift+C mở thống kê và mục tiêu, kể cả thống kê riêng vùng chọn. **Xem → Phím tắt Studio** liệt kê các phím tắt hiện có.
- Tham khảo các thao tác phù hợp từ [hướng dẫn phím tắt Google Docs](https://support.google.com/docs/answer/179738?hl=en). Không thêm chức năng chia sẻ tài liệu, bảng tính, bố cục trang in hoặc nhận xét cộng tác.

### Kiểm tra nhanh

1. Tải lại Studio; giữ nguyên thanh đầu tiên. Bên dưới còn hàng menu/cài đặt và thanh định dạng phẳng. Lịch sử (icon) và Lên lịch nằm cạnh Miễn phí/VIP; mở **Tệp** để xuất tệp.
2. Ở chế độ **Soạn thảo**, bôi đen một phần câu in đậm → **Chỉnh sửa → Xóa định dạng vùng chọn**. Chỉ phần chọn mất định dạng; Ctrl+Z phục hồi. Thử đổi HOA/thường với đoạn tiếng Việt.
3. Bôi đen đoạn → chuột phải → **Thêm ghi chú đoạn** → nhập và lưu. Nút **Ghi chú** mở/đóng bảng bên phải. Thử tìm, lọc trạng thái, đánh dấu đã xử lý, tới đoạn, tab Sổ tay chương, rồi tải lại trang.
4. Chọn một từ in đậm → chuột phải → Sao chép/Cắt; dán vào vị trí khác và hoàn tác. Nếu quyền bảng nhớ tạm bị chặn, bản thảo giữ nguyên và hiện hướng dẫn phím tắt.
5. **Xem → Hẹp/Rộng**, tải lại để kiểm tra lưu lựa chọn. Thử giao diện tối và màn hình điện thoại; ghi chú có vùng cuộn và nút đóng riêng.

Kiểm thử tự động: `npm run test:studio-tools`, `node --test tests/author-ide-caret.browser.test.mjs`, `npm run typecheck`, `npm run build` trong thư mục `web`.

## Notes không làm dịch bản thảo

- Bản thảo căn giữa trên workspace và mặc định tối đa 760 px; lựa chọn Hẹp/Rộng vẫn được giữ. Mục lục chương 280 px không lấy chiều rộng khỏi workspace khi bật/tắt. Không giữ cột Notes rỗng khi đóng.
- Notes dock 336 px nằm trong khoảng trắng tự nhiên bên phải nếu khoảng này đủ rộng, không đè bản thảo. Ngưỡng tính bằng vị trí thực của trang, có tính scrollbar; ở cài đặt mặc định 1920/1600 px dùng dock, 1440/1280 px dùng bảng nổi. Tắt phần chừa scrollbar ngoài riêng trong Studio vì workspace đã có thanh cuộn riêng.
- Trên màn hình hẹp, Notes nổi bên dưới thanh định dạng, có nút đóng và Esc, không có nền che khóa vùng viết. Có thể chuyển giữa ghi chú và bản thảo. AI dùng cùng vị trí bên phải, chỉ một trong AI/Ghi chú được mở. Bật/tắt các bảng không thay kích thước hoặc vị trí vùng viết.
- Thanh định dạng cùng chiều rộng và căn giữa theo trang bản thảo, không tự xuống hàng. Trên màn hình nhỏ có cuộn ngang riêng; menu phông chữ/giãn dòng dùng portal nên không bị cắt bởi vùng cuộn. Không đổi phông, cỡ chữ hoặc nội dung bản thảo để đạt bố cục.
- Chỉ panel Notes chuyển động bằng transform/opacity 200 ms; chế độ giảm chuyển động tắt hiệu ứng. Panel đóng có `inert` và `aria-hidden`, không nhận bàn phím.
- Đóng Notes khôi phục vùng chọn đang lưu và focus vào editor bằng `preventScroll`, không cuộn tới vị trí con trỏ. Editor không remount khi bật/tắt Notes; lịch sử undo và autosave giữ nguyên.
- Chạy `npm run test:studio-notes-layout`: chụp cả mở/đóng và đối chiếu tọa độ/kích thước bản thảo, thanh định dạng, chiều cao nội dung, scrollTop, vùng chọn, node editor, undo/redo và autosave ở 1920/1600/1440/1280/1024/768 px, sáng/tối, có giảm chuyển động và cả hai chế độ soạn thảo. Kiểm tra dock không đè editor, không tràn ngang, thanh công cụ thẳng trang và menu định dạng dùng được; chuyển chương không lẫn sổ tay. Ảnh trước/sau sửa được chụp bằng cùng fixture.

## Chú thích cho độc giả

- Bôi đen câu/từ → nút **Chú thích vùng chọn cho độc giả** trên thanh nổi, hoặc chuột phải → **Chú thích cho độc giả**. Cũng có trong **Chèn** và **Ghi chú → Cho độc giả**. Khi không chọn chữ, dùng dòng hiện tại.
- Ví dụ: chọn “huynh”, ghi “Cách gọi anh kết nghĩa, không phải anh ruột”. Khi đọc, số `[1]` cạnh từ mở lời giải thích; cuối chương có danh sách chú thích. Hỗ trợ bàn phím, điện thoại và theme sáng/tối trên web.
- Thêm/sửa/xóa đi qua cùng autosave, undo/redo, kiểm tra phiên bản, lịch sử và quy trình duyệt/xuất bản của nội dung chương. Không xuất bản độc lập từ thao tác lưu chú thích. Không thay đổi hoặc chuyển ghi chú riêng thành chú thích công khai.
- Tab **Cho độc giả** đối chiếu bản nháp với nội dung công khai, báo **Chưa có trên bản công khai** hoặc **Đã có trên bản công khai**. Dùng **Xem trước như độc giả** để kiểm tra mà không xuất bản. Với chương đã đăng, **Xuất bản phiên bản mới** mở hộp thoại gửi duyệt/xuất bản hiện có, bao gồm nội dung bản nháp và chú thích; chỉ sau bước xác nhận mới gửi request. Gửi thành công làm mới cache chương ở trang đọc.
- Dùng footnote Markdown trong trường `content`: tham chiếu `[^author-<id>]`, định nghĩa `[^author-<id>]: Nội dung`, dòng tiếp theo thụt 4 dấu cách. Không thêm kho localStorage hoặc API riêng. Vì nằm trong nội dung, chú thích được gửi vào cùng luồng kiểm soát nội dung và kế thừa quyền xem chương/VIP.
- Chế độ Soạn thảo hiển thị số và hộp chú thích thay cho cú pháp, đồng thời giữ nguyên nguồn khi gõ/sửa. Chế độ Ký hiệu định dạng giữ cú pháp để sửa/xuất Markdown. HTML/PDF có danh sách chú thích qua `ManuscriptContent`.
- Xóa số gắn trong lời văn giữ lại lời giải thích ở **Cho độc giả** để tác giả gắn lại vị trí. Chú thích chưa gắn không xuất hiện trong nội dung đọc; bảng kiểm tra trước xuất bản nhắc tác giả rà lại. Tối đa 100 chú thích, mỗi chú thích 2.000 ký tự từ giao diện tạo/sửa.
- Kiểm tra: `npm run test:author-notes` (logic và browser trên bản production, dùng API giả lập), `npm run test:studio-enhancements`, `npm run test:studio-notes-layout`. Browser test kiểm tra lưu/tải lại, sửa, undo/redo, gắn lại, soạn thảo không làm mất dữ liệu chú thích, không lộ bản nháp cho khách, popup đọc và escape HTML. Không ghi vào chương thật.
