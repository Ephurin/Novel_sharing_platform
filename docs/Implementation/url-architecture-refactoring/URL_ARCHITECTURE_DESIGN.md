# Kiến trúc URL

- Web dùng chung mẫu route, builder có kiểu và ánh xạ legacy. Router, navbar, breadcrumb, role home, chia sẻ và thông báo lấy URL từ các định nghĩa này. Dữ liệu cũ chỉ có UUID có thể dùng href legacy đã biết. Link xuyên module chỉ dùng mẫu mới sau khi route đích và alias đều hoạt động.
- Danh sách, truyện, chương và đánh giá dùng `OptionalSession`. Giữ CTA chương đầu và bookmark trình duyệt cho khách. Phiên hợp lệ giữ đọc tiếp, lịch sử, bookmark tài khoản, bình luận, đánh giá, báo cáo và mở khóa theo quyền hiện hành. Cache nội dung và invalidation tiếp tục dùng UUID, kèm định danh người xem khi quyền có thể khác nhau.
- Bổ sung `novelSlug`, `chapterSlug`, `topicSlug` và `publicKey` vào DTO phù hợp bằng SELECT hoặc JOIN hiện có. Response tạo chủ đề giữ `topicId` và thêm `topicSlug`. Dùng metadata đã tải cho link nội bộ. Dùng locator khi mở trực tiếp hoặc khi dữ liệu cũ thiếu metadata. Giữ ranh giới route, service và repository theo module. [Reading routes](../../../backend/src/modules/reading/reading.routes.ts#L55) · [API tạo chủ đề](../../../backend/src/modules/discussions/discussions.routes.ts#L197)

Các locator bổ sung nằm dưới `/api/v1` và dùng envelope hiện tại.

| Tài nguyên | Endpoint | Trường trả về |
|---|---|---|
| Truyện | `GET /reading/novels/by-slug/:novelSlug/locator`, `GET /reading/novels/:novelId/locator` | `novelId`, `novelSlug` |
| Chương | `GET /reading/novels/by-slug/:novelSlug/chapters/:chapterSlug/locator`, `GET /reading/chapters/:chapterId/locator` | `novelId`, `novelSlug`, `chapterId`, `chapterSlug` |
| Chủ đề | `GET /discussions/by-slug/:topicSlug/locator`, `GET /discussions/:topicId/locator` | `topicId`, `topicSlug` |
| Hồ sơ | `GET /users/by-key/:publicKey/locator`, `GET /authors/by-key/:publicKey/locator`. Link UUID dùng API hồ sơ hiện có với `publicKey` bổ sung. | `userId`, `publicKey` |

Locator quản lý tác phẩm nằm trong khu vực API tương ứng. `GET /novels/workspace/:novelRef/locator` dùng quyền xem của tác giả đối với bản nháp. `GET /admin/novels/:novelRef/locator` giữ phạm vi quản trị nội dung, bao gồm truyện đã gỡ để khôi phục. Các màn hình tiếp tục gửi UUID tới API nghiệp vụ. Hồ sơ kiểm duyệt dùng dạng `<slug-tac-pham>--<so-ho-so>` hoặc `ho-so--<so-ho-so>` khi hồ sơ không gắn với tác phẩm. Số duy nhất do migration `057` cấp giúp các lần duyệt cùng tác phẩm có URL riêng. API theo slug áp dụng cùng quyền và audit như API theo UUID.

Locator chỉ trả định danh mà người xem được phép biết. Locator chương khớp cả truyện và chương đã xuất bản. Chương VIP đang khóa vẫn phân giải được, sau đó API đọc UUID giữ `402 PAYMENT_002` và kiểm tra quyền nội dung. Locator chủ đề giữ điều kiện `VISIBLE` và danh mục hoạt động, kể cả khi thông tin tác giả được ẩn. Trang sửa và trang quản lý tiếp tục dùng quyền riêng hiện hành. [Reading repository](../../../backend/src/modules/reading/reading.repository.ts#L475) · [Discussion read](../../../backend/src/modules/discussions/discussions.read.ts#L186) · [User profiles](../../../backend/src/modules/users/users.service.ts#L13)
