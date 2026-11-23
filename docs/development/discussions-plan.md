# Kế hoạch thảo luận cộng đồng

**Đã triển khai** · `feat/discussions` · baseline `57621950` · 21/11/2026

## Nghiên cứu tham khảo

Codex mở danh sách và chủ đề mẫu ở 1366 px và 390 px bằng Chrome. DeepSeek phân tích quan sát và trích đoạn mã của nhánh hiện tại qua Mistral Vibe CLI. Trình đọc web có lúc nhận 403 từ Hako. Chrome tải được cả hai trang Hako cần khảo sát.

| Tiêu chí | Hako | Valvrareteam | Áp dụng |
| --- | --- | --- | --- |
| Chuyên mục | Có bộ chọn, gồm Hỏi đáp, Đánh giá, Thảo luận và Thông báo | Mẫu công khai hiển thị một luồng bài, chưa xác minh bộ lọc chuyên mục | Dùng chuyên mục theo nhu cầu độc giả và tác giả |
| Danh sách | Bảng gọn có người đăng cuối | Thẻ có trích đoạn, người đăng và số liệu | Dùng danh sách gọn, ưu tiên tiêu đề và hoạt động |
| Chi tiết | Bài mở đầu, người đăng, tổng bình luận, luồng trao đổi | Breadcrumb, người đăng, lượt xem, dấu đã sửa và luồng bình luận | Bài mở đầu và luồng phản hồi có ngữ cảnh |
| Tạo, sửa, xóa | Thấy nút Thêm | Thấy nút Thêm | Chưa xác minh biểu mẫu hoặc quyền sửa/xóa. Áp dụng quyền chủ sở hữu |
| Bình luận, trả lời | Thấy bình luận và URL phân biệt bình luận gốc với phản hồi | Thấy nút Trả lời và lời mời đăng nhập | Hai cấp hiển thị, có liên kết đến phản hồi |
| Reaction | Chưa xác minh cách tương tác | Thấy tùy chọn Thích nhiều nhất, chưa thử thao tác | Một loại Thích cho cả chủ đề và phản hồi |
| Người đăng | Tên, ảnh đại diện, nhãn tài khoản ở trang mẫu | Tên, ảnh đại diện và nhãn ADMIN/MOD ở trang mẫu | Tên, ảnh đại diện, hồ sơ và nhãn chính chủ có xác minh |
| Số liệu, hoạt động | Lượt xem, bình luận, thời gian và người đăng cuối trên desktop | Lượt xem, số bình luận và tuổi bài trên danh sách | Đếm phản hồi công khai và hiển thị hoạt động cuối |
| Ghim, khóa, ẩn | Chưa xác minh luồng quản trị | Thấy ký hiệu ghim và khóa, chưa xác minh thao tác quản trị | Admin có quyền nội dung được ghim, khóa, ẩn và xử lý báo cáo |
| Tìm, lọc, sắp xếp, phân trang | Bộ lọc chuyên mục và phân trang bằng URL. Chưa xác minh tìm kiếm thảo luận | Ô tìm kiếm quan sát được dành cho truyện. Có tùy chọn sắp bình luận. Chưa xác minh cách tải trang tiếp | Tìm không dấu, lọc chuyên mục/truyện, sắp xếp và phân trang phía server |
| Liên kết bình luận | Timestamp có URL chứa ID và anchor, kể cả phản hồi | Chưa thấy liên kết tương đương trong trang mẫu | URL mở được phản hồi nằm ngoài trang đầu |
| Desktop, mobile | Mobile rút gọn cột số liệu | Giữ luồng thẻ ở hai kích thước | Một luồng đọc, ưu tiên tiêu đề và hành động trên mobile |

Nguồn Hako: [Danh sách](https://ln.hako.vn/thao-luan), [trang 7](https://ln.hako.vn/thao-luan?page=7), [chủ đề tác giả](https://ln.hako.vn/thao-luan/2266-thao-luan-cho-tac-gia-oln), [liên kết phản hồi](https://ln.hako.vn/thao-luan/2266-thao-luan-cho-tac-gia-oln?comment_id=3898929&reply_id=3898984#ln-comment-3898984).

Nguồn Valvrareteam: [Danh sách](https://valvrareteam.net/thao-luan), [chủ đề có bình luận](https://valvrareteam.net/thao-luan/ban-co-muon-nghe-truyen-thay-vi-doc-truyen), [chủ đề có biểu tượng khóa trên danh sách](https://valvrareteam.net/thao-luan/quy-dinh-ve-truyen-sang-tac-truyen-viet-cua-valvrareteam), [chủ đề lưu trữ](https://valvrareteam.net/thao-luan/luu-tru-cuoc-thi-val-ln-contest-2025).

Khảo sát ở chế độ khách. Biểu mẫu tác giả, thao tác reaction, quy trình duyệt và quyền xóa trên hai website chỉ có thể xác minh thêm bằng tài khoản phù hợp hoặc ảnh chụp các màn hình đó.

## Tính năng và quyền

- **Guest** xem, tìm, lọc và sắp xếp thảo luận công khai. Trang truyện và thảo luận liên kết hai chiều khi tác phẩm đang công khai.
- **Reader và Author** có cùng quyền cộng đồng. Cả hai tạo chủ đề, sửa/xóa nội dung của mình, bình luận, trả lời, Thích và báo cáo. Bộ chuyên mục khởi tạo gồm Thảo luận chung, Thảo luận truyện, Góc tác giả, Hỏi đáp, Góp ý tác phẩm và Thông báo cộng đồng. Góp ý tác phẩm yêu cầu chọn truyện công khai. Author có thể xin góp ý về tác phẩm của mình trong chuyên mục này.
- **Bài chính chủ** là lựa chọn rõ ràng trên biểu mẫu. Server xác minh quyền sở hữu khi ghi và khi hiển thị nhãn. Liên kết truyện thông thường vẫn dành cho cả Reader và Author. Khi truyện mất trạng thái công khai, API bỏ liên kết, dữ liệu tác phẩm và nhãn chính chủ theo truyện.
- **Admin có quyền `content`** quản lý chuyên mục, đăng Thông báo cộng đồng, ghim, khóa, ẩn/khôi phục, xóa mềm và xử lý báo cáo chủ đề hoặc bình luận. Admin dùng thao tác kiểm duyệt có lý do và audit. Chỉnh nội dung là quyền của người đăng.
- Chủ đề khóa vẫn đọc được. Khóa chặn phản hồi mới, sửa nội dung công khai và thêm lượt Thích. Chủ sở hữu vẫn được xóa nội dung của mình và người dùng vẫn có thể báo cáo. Khi chủ đề hoặc chuyên mục bị ẩn, bề mặt công khai trả 404 hoặc loại bỏ mục đó. Chủ sở hữu chỉ nhận trạng thái qua API bài của mình. Admin xem nội dung kiểm duyệt qua API riêng. Bình luận gốc tự xóa để lại nội dung thay thế khi còn phản hồi công khai. Bình luận bị admin ẩn loại khỏi luồng cùng phần phản hồi dưới nó cho đến khi khôi phục.
- Bản đầu dùng văn bản có định dạng giới hạn, phản hồi hai cấp hiển thị và một loại Thích. Spoiler, mention, upload, emoji picker và GIF có thể mở rộng sau khi có yêu cầu.

## Kiến trúc, dữ liệu và quyền truy cập

Tạo module `backend/src/modules/discussions` theo routes/controller/service/repository/schema và `web/src/features/discussions`. PostgreSQL cho phép kiểm tra FK, ghi reply, cập nhật số liệu, enqueue thông báo và ghi audit trong một giao dịch. MongoDB vẫn phục vụ comments hiện tại của truyện/chương và kho thông báo. Dùng lại auth, Zod, lỗi/API envelope, hồ sơ công khai, `withPostgresTransaction`, outbox, audit, API client và thành phần UI chung.

| Dữ liệu | Ràng buộc và chỉ mục dự kiến |
| --- | --- |
| Chuyên mục và chủ đề | UUID cho khóa mới và FK `users.user_id`, `novels.novel_id`. Slug chuyên mục duy nhất. Chủ đề có category, author, optional novel, nội dung, trạng thái hiển thị, cờ ghim/khóa và số liệu. Chỉ mục danh sách theo trạng thái, ghim, khóa sắp xếp và ID, với biến thể theo chuyên mục/truyện |
| Bình luận | FK ghép đảm bảo root và đích trả lời cùng chủ đề, đích thuộc cùng nhánh. UI hiển thị bình luận gốc và phản hồi phẳng có đích cụ thể. Chỉ mục theo chủ đề/root, trạng thái, thời gian và ID |
| Reaction/lượt xem | Khóa duy nhất theo đối tượng và người Thích, mỗi mutation là PUT/DELETE idempotent. Lượt xem được khử trùng theo chủ đề và ngày bằng UUID phiên ngẫu nhiên của khách hoặc user đã đăng nhập, có thời hạn lưu bản ghi khử trùng và không lưu IP thô |
| Tìm kiếm | Ghi dữ liệu chuẩn hóa không dấu khi tạo/sửa. Dùng GIN trên vector của văn bản chuẩn hóa với cấu hình `simple`. `f_unaccent` tại migration 036 là `STABLE`, do đó dùng để chuẩn hóa khi ghi thay vì đặt trực tiếp trong biểu thức index hay generated column |
| Báo cáo | Tái dùng queue `reports` / `moderation_reviews` và khóa duy nhất của báo cáo mở. Thêm `DISCUSSION` và `DISCUSSION_COMMENT` vào hai enum tương ứng với adapter lấy đối tượng PostgreSQL. Migration enum hoàn tất giao dịch trước khi migration sau dùng giá trị mới |

Các thứ tự danh sách gồm hoạt động gần nhất, mới nhất và nhiều phản hồi. Cursor bao gồm khóa sort, ngữ cảnh bộ lọc và ID để xử lý hòa điểm. Với thứ tự dựa trên số liệu cập nhật trực tiếp, tải lại từ đầu để thấy mục vừa đổi vị trí. Ràng buộc kích thước trang và dùng truy vấn ghép/batch cho metadata. Khóa hàng chủ đề theo thứ tự thống nhất khi reply/khóa/ẩn, cập nhật thống kê từ dữ liệu công khai trong cùng giao dịch và tính lại hoạt động cuối khi mục cuối biến mất. Chỉ lượt xem của chủ đề công khai được tính.

## Hợp đồng API và giao diện

Các đường dẫn bên dưới tính từ API prefix hiện có.

| API | Quyền và dữ liệu |
| --- | --- |
| `GET /discussions/categories`, `GET /discussions`, `GET /discussions/:id` | Công khai. Danh sách nhận `category`, `novelId`, `q`, `sort`, `cursor`, `limit`. Chi tiết trả nội dung, tác giả công khai, trạng thái và số liệu |
| `GET /discussions/:id/comments`, `GET /discussions/:id/comments/:commentId/location` | Danh sách gốc hoặc theo `rootId` có cursor. Location trả gốc và vùng phân trang chứa đích bằng truy vấn giới hạn, sau khi kiểm tra visibility |
| `POST /discussions`, `PATCH/DELETE /discussions/:id`, `GET /discussions/me/topics` | Đăng nhập. Tạo nhận chuyên mục, tiêu đề, nội dung và tùy chọn truyện/chính chủ. Sửa/xóa cần quyền sở hữu. Danh sách của mình phân trang và cho biết trạng thái kiểm duyệt |
| `POST /discussions/:id/comments`, `PATCH/DELETE /discussions/:id/comments/:commentId` | Đăng nhập. Có thể truyền `replyToId`. Server kiểm tra cùng chủ đề, trạng thái, chủ sở hữu và giới hạn tốc độ |
| `PUT/DELETE /discussions/:id/reaction` và `/discussions/:id/comments/:commentId/reaction`, `POST /discussions/:id/views` | Reaction cần đăng nhập. Ghi lượt xem có khử trùng, hỗ trợ khách, trả kết quả không cache công khai |
| `POST /reports` và queue admin hiện có | Hai loại đích mới qua adapter có kiểm tra visibility. Admin có quyền nội dung chọn xử lý hoặc bác báo cáo và ghi lý do. Khi xử lý kèm ẩn, ghi thay đổi, kết quả và audit trong cùng giao dịch |
| `/admin/discussions/categories`, `PATCH /admin/discussions/:id/moderation`, `PATCH /admin/discussions/:id/comments/:commentId/moderation` | Admin có quyền nội dung. CRUD chuyên mục bằng tạo/sửa/lưu trữ. Điều chỉnh ghim, khóa hoặc visibility tùy loại đối tượng |

Web dùng `/discussions`, `/discussions/new`, `/discussions/:id` và `/discussions/:id/edit`. Liên kết bình luận dùng ID trong query và anchor để tải đúng vùng, đưa tiêu điểm đến đích, hoặc báo nội dung không còn công khai. Thêm mục điều hướng vào thanh hiện có và liên kết thảo luận ở trang truyện public/reader. Dùng StoryCraft với Be Vietnam Pro, màu ngà ấm và terracotta, token sáng/tối, một hành động chính, hỗ trợ bàn phím, trạng thái tải/rỗng/lỗi và khung desktop, tablet, mobile.

Khi có phản hồi, ghi `notification_events` cùng giao dịch với phản hồi. Gửi cho người đăng chủ đề khi có bình luận gốc hoặc người được trả lời khi có reply. Bỏ qua chính mình và dùng event key gắn với reply/recipient. Worker kiểm lại visibility trước khi gửi, kho Mongo dùng ID xác định để khử trùng khi retry. Nội dung thông báo chung, không đưa đoạn trích. Web mở URL thảo luận đã kiểm tra theo mẫu đường dẫn nội bộ cụ thể. Kiểm tương thích dữ liệu thông báo trên Expo.

## Rủi ro và tiêu chí qua checkpoint

Backend chuẩn hóa và kiểm tra tập định dạng nhỏ, kích thước và liên kết HTTP/HTTPS. React chỉ render các phần tử được hỗ trợ, không chèn HTML thô. Dùng cùng điều kiện visibility cho các đường đọc công khai, tìm kiếm, số liệu, link truyện và worker. Kiểm tra cấu trúc ID và quyền thực tế tại server. Tái dùng rate limiter theo user/IP cho Compose một backend, ghi nhận giới hạn của bộ đếm trong bộ nhớ khi chạy nhiều instance.

| Checkpoint | Deliverable và điều kiện qua |
| --- | --- |
| **B · Database** | Migration cộng thêm, seed chuyên mục chỉ chèn dữ liệu thiếu. Kiểm schema mới và bản sao DB đã ở baseline, đối chiếu dữ liệu cũ, FK, uniqueness, chỉ mục và chạy lại migration |
| **C · Backend** | CRUD, quyền chủ sở hữu, liên kết truyện, reaction, replies, location, search và counters. Unit/integration test cho boundary, trạng thái, phân trang DB và race giữa ghi reply với khóa/ẩn |
| **D · Frontend và tích hợp** | Web, link hai chiều, thông báo, chế độ sáng/tối, responsive, điều hướng bàn phím và trạng thái tải/rỗng/lỗi. Browser test luồng Guest, Reader, Author; test notification retry, self-reply và reply bị ẩn trước khi gửi |
| **E · Moderation và bảo mật** | UI quản trị chuyên mục, tác vụ ghim/khóa/ẩn/khôi phục/xóa mềm, tích hợp report queue và audit. Test phân quyền admin theo scope, trạng thái ẩn ở các đường truy cập, giới hạn ghi, render đầu vào an toàn và hồi quy report cũ |
| **F · QA và Docker** | Backend/web `typecheck` và `build`, test liên quan, Compose rebuild backend/web, service health và logs. Smoke login/đọc truyện/quản lý truyện, thử API và toàn bộ ma trận vai trò trên trình duyệt |

DeepSeek làm từng checkpoint trong cùng worktree. Codex đối chiếu diff, chạy kiểm tra độc lập và giao lại các lỗi cần sửa trước khi sang bước tiếp theo. Probe Vibe đã xác minh repo, branch, đọc/ghi tệp thử và thực thi Git qua một công cụ chỉ có thao tác cố định. Khi triển khai, giới hạn công cụ ghi theo phạm vi file, giới hạn lệnh test theo checkpoint và vẫn review từng diff.

### Điều kiện rebuild an toàn

[Compose](../../docker-compose.yml) bật cả `RUN_MIGRATIONS` và `RUN_DEMO_SEED`. [Entrypoint](../../backend/docker-entrypoint.sh) chạy seed trước khi start. [Seed demo](../../backend/src/scripts/seed-sample-stories.ts) cập nhật tài khoản/ví demo và xóa, dựng lại dữ liệu theo slug hoặc ID demo. Trước khi rebuild, xác định dự án Compose, volume và DB đích. Thử migration mới từ DB trống và từ bản sao baseline trong môi trường thử riêng. Trên volume hiện có, dùng Compose override đặt `RUN_DEMO_SEED=false` và xác minh cấu hình hiệu lực trước khi chạy `up -d --build backend web`. Nếu migration cần chỉnh, thêm migration sửa tiếp. Kiểm `docker compose ps`, logs backend/web, health tại `http://localhost:4000/api/v1/health` và web tại `http://localhost:8080`.

Kiểm thủ công theo vai trò: Guest đọc và lọc, Reader tạo bài/reply/Thích/sửa/xóa/báo cáo, Author kiểm liên kết và nhãn truyện chính chủ, Admin kiểm chuyên mục/ghim/khóa/ẩn/xử lý báo cáo. Thử thêm liên kết bình luận ở trang sau và hồi quy bình luận truyện/chương.

## Kết quả kiểm thử và địa chỉ chạy

- Migration **037** mở rộng loại đối tượng báo cáo, **038** tạo schema và chuyên mục, **039** sửa nhãn chuyên mục Góp ý tác phẩm. Đã chạy trên DB mới, chạy lại qua migration runner và kiểm dữ liệu mẫu có sẵn ở baseline.
- Backend và web qua `typecheck` và `build`. Hai bài integration thảo luận qua PostgreSQL/MongoDB riêng. Chín kiểm tra hồi quy backend về đăng nhập, quyền đọc bản thảo và revision cùng 74 kiểm tra tương phản của web đều qua.
- Playwright kiểm Guest ở 390 px, tablet ở 768 px trên Compose, Reader tạo/sửa/Thích, Author đăng bài chính chủ gắn truyện và gửi bình luận, Admin ghim/khóa và trạng thái khóa phía Reader. Thông báo phản hồi mở và focus đúng bình luận. Trang dự án tác giả và điều hướng đến chương vẫn hoạt động trong môi trường thử.
- PostgreSQL với 6.000 chủ đề giả lập dùng chỉ mục hoạt động cho truy vấn trang đầu và GIN cho truy vấn tìm kiếm chọn lọc. Hai API trả tối đa 20 mục cùng cursor tiếp theo. Đây là kiểm tra cục bộ trên dữ liệu giả lập.
- Worktree chạy dự án Compose `storycraft-reader`. Vì checkout chính đang dùng các cổng 8080 và 4000, mở [Thảo luận](http://localhost:8081/discussions), [Quản trị thảo luận](http://localhost:8081/admin/discussions) và [API health](http://localhost:4001/api/v1/health). Kiểm tra DB của worktree trước và sau rebuild thấy số lượng tài khoản, truyện và chương lần lượt là 8, 4 và 17.

Lệnh rebuild worktree dùng cấu hình hiện có, với demo seed tắt.

```powershell
docker compose -p storycraft-reader -f docker-compose.yml -f .vscode/docker-compose.reader.yml up -d --build backend web
```
