# Ma trận kiểm thử

| Điều kiện đầu vào | Hành vi mong đợi | Cách xác minh |
|---|---|---|
| Mở trực tiếp, refresh, mở tab mới và back/forward với các route trong inventory | Đúng màn hình, active nav, query, vai trò và lịch sử điều hướng | Browser smoke theo route, desktop và mobile viewport |
| UUID mẫu `451e1280-214c-4500-980b-34b9af0989eb` qua `/public` và `/reader` | Cùng đến `/truyen/sample-thanh-van-test-story` và cùng tài nguyên | Playwright trên Docker `8081` |
| Link cũ có bộ lọc, anchor, bình luận riêng hoặc tọa độ bookmark | Giữ đúng ngữ cảnh và vị trí | Browser với bookmark và thông báo có trước nâng cấp |
| Khách, reader, author, moderator, admin, tài khoản khóa và tài khoản sai quyền | Cùng đường dẫn công khai, giữ quyền tính năng và quyền sở hữu | Browser theo vai trò và kiểm API |
| Nội dung chưa xuất bản, ẩn, từ chối hoặc xóa. Cặp slug truyện và chương không khớp | Locator bảo toàn điều kiện hiển thị. Không xuất hiện trang của tài nguyên khác | PostgreSQL integration và browser |
| Chương thường, VIP khóa hoặc đã mở, đổi tài khoản | Đúng nội dung hoặc `402`. Cache giữ riêng theo người xem | Browser và kiểm response |
| Locator chương hoặc chủ đề được gọi trước khi mở trang | Locator giữ nguyên lượt xem, `chapter_reads` và outbox. Trang đích ghi nhận theo nghiệp vụ | So dữ liệu DB trước và sau hai bước |
| Tiếng Việt, `đ/Đ`, tiêu đề trùng, dài, rỗng hoặc trùng route. Writer đồng thời | Chuỗi hợp lệ, đúng scope, unique và đúng UUID. Hồ sơ giữ ưu tiên tên trần cho hàng cũ | Unit test và PostgreSQL integration với đăng ký trong lúc backfill |
| Dừng giữa batch, dừng ngay sau commit, chạy lại hết backlog | Batch dở rollback. Batch đã commit giữ mapping cũ. Chạy lại sau hoàn tất không đổi dữ liệu | Test ngắt kết nối có kiểm soát trên DB cô lập |
| Chỉ chạy schema mở rộng, còn NULL, rồi hoàn tất backfill | Writer cũ tiếp tục tạo hàng. Cổng siết constraint chỉ mở khi đủ điều kiện. `NOT NULL` áp dụng sau validate | Kiểm từng bản phát hành trên DB mới và DB nâng cấp |
| Đổi tên hoặc đổi thứ tự chương sau khi đã cấp slug | Slug giữ số cũ, UI dùng số hiện tại, link vẫn mở đúng chapter UUID | Đổi thứ tự qua luồng hợp lệ rồi xuất bản và mở lại URL đã ghi |
| Xóa mềm, khôi phục và tạo tài nguyên khác cùng tên | Định danh cũ vẫn dành cho hàng cũ. Khôi phục trả về đúng URL | API xóa mềm và khôi phục, kiểm unique constraint |
| Chạy lại hai seed, chạy startup demo seed, cho slug hoặc số chương thuộc UUID khác | Giữ link đã phát và hàng ngoài fixture. Xung đột dừng trước hard delete hoặc cascade | So snapshot UUID, slug, chapter, lịch sử và bookmark trước/sau |
| Link xuyên module được tạo trước khi route đích sẵn sàng | Nơi phát tiếp tục dùng href legacy. Bật URI mới sau khi đích, alias và backend đạt kiểm thử | Kiểm theo từng cấu hình phát hành cho reader, hồ sơ, Studio, thông báo, email và VNPay |
| Sau cutover, lùi frontend, backend hoặc cả hai đến bản tương thích | URL mới đã phát và URL cũ cùng hoạt động. Email, thông báo và giao dịch đang chờ vẫn đến đúng đích | Diễn tập ba tổ hợp phiên bản trên schema đã nâng cấp |
| Google, email `#token` và `#recovery`, hết phiên trước khi mở link cần đăng nhập | Xác thực đúng luồng, giữ thao tác xác nhận và trở lại đích hợp lệ | Auth browser test, PostgreSQL email test, Mailpit và smoke GIS |
| VNPay thành công, thất bại, hủy, IPN đến trước hoặc sau return | Giữ nguyên query ký, kiểm quyền giao dịch, cộng ví đúng một lần | `vnpay.test.ts`, `vnpay-deposit.postgres.test.ts`, browser và sandbox theo cấu hình |
| Thông báo cũ/mới, native `Thread`, mobile web, API AI và Studio hai tab | Giữ đích bình luận, UUID payload, API và quyền tác phẩm | Browser test link thông báo, mobile contract suite và smoke Studio |
