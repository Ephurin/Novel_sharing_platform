# ADMIN NOVEL MANAGEMENT - SRS ADDENDUM

## 1. Overview

Admin Novel Management lets platform administrators inspect and soft-remove novel records from the system.

This is separate from Author Project Management:

- Authors manage their own writing projects.
- Admins manage platform-level novel availability and reversible removal.

## 2. Core Entities

| Entity | Description |
| :--- | :--- |
| `ADMIN_NOVEL_VIEW` | Admin-facing list/detail view of novels, authors, statuses, and chapter counts. |
| `NOVEL_AGGREGATE` | Novel root plus chapters, tags, reading/library/social/wallet unlock references, and authoring context records. |
| `DRAFT_CHAPTER` | MongoDB draft/autosave documents linked to chapters or novel. |
| `ADMIN_NOVEL_REMOVAL` | Admin action that soft-deletes a novel aggregate and notifies the owner. |
| `NOVEL_REMOVED_BY_ADMIN_NOTIFICATION` | In-app notification sent to the Author who owns the removed novel. |

## 3. UC: Admin Manage Novel Catalog and Remove Novel

| Attribute | Description |
| :--- | :--- |
| **Objective** | Cho phép Admin quản lý danh sách các đầu truyện trên nền tảng và gỡ mềm một truyện khi cần, để vẫn có thể khôi phục sau này. |
| **Actor** | Admin, Novel & Chapter Service, Interaction/Notification Service. |
| **Trigger** | Admin mở trang quản lý truyện và chọn thao tác xóa một truyện. |
| **Pre-condition** | Admin đã đăng nhập; truyện tồn tại; Admin có quyền quản trị nội dung. |
| **Post-condition** | Truyện và các chapter/draft liên quan bị ẩn khỏi luồng public/reader/author thông thường bằng soft delete; dữ liệu vẫn được giữ để Admin có thể khôi phục sau này; Author nhận thông báo truyện đã bị gỡ bởi Admin. |

## 4. Basic Flow

| Step | Description |
| :--- | :--- |
| 1 | Admin mở trang `Admin > Novels` để xem danh sách các đầu truyện. |
| 2 | Hệ thống hiển thị danh sách truyện gồm tiêu đề, tác giả, trạng thái, số chương, thời điểm cập nhật và hành động xem chi tiết. |
| 3 | Admin chọn một truyện để xem chi tiết. |
| 4 | Hệ thống hiển thị thông tin truyện, tác giả sở hữu, trạng thái publish/moderation và danh sách chapter. |
| 5 | Admin chọn `Xóa truyện`. |
| 6 | Hệ thống hiển thị hộp thoại nhắc nhở: thao tác sẽ gỡ truyện khỏi nền tảng, ẩn chapter/draft liên quan khỏi giao diện thông thường, nhưng dữ liệu được giữ để có thể khôi phục. |
| 7 | Admin bấm xác nhận. |
| 8 | Backend soft-delete novel aggregate: cập nhật `novels.deleted_at`; cập nhật `chapters.deleted_at` cho các chapter thuộc truyện; đánh dấu/ẩn MongoDB `draft_chapters` liên quan bằng trạng thái deleted/archived thay vì xóa vật lý. |
| 9 | Hệ thống tạo notification cho Author sở hữu truyện: `Truyện đã bị gỡ bởi Admin`. |
| 10 | Admin quay về danh sách truyện; truyện vừa xóa không còn xuất hiện. |

## 5. Alternative / Exception Flows

| Case | Handling |
| :--- | :--- |
| Admin hủy xác nhận | Không thay đổi dữ liệu. |
| Novel không tồn tại hoặc đã bị xóa | Trả `CONTENT_001`. |
| Người dùng không phải Admin | Trả `AUTH_008`. |
| PostgreSQL soft delete thất bại | Rollback transaction và trả lỗi hệ thống. |
| MongoDB draft marking thất bại | Không coi use case là hoàn tất; ghi log lỗi và trả lỗi để Admin thử lại hoặc xử lý thủ công. |
| Notification tạo thất bại sau khi soft delete thành công | Ghi log lỗi notification; novel vẫn đã bị gỡ mềm. |

## 6. Business Rules

- Đây là Admin removal action có tác động lớn, bắt buộc có confirmation.
- Đây là soft delete cho novel aggregate, không phải hard delete. Dữ liệu phải đủ để khôi phục sau này.
- Các query public/reader/author mặc định phải loại bỏ `deleted_at is not null`.
- Nếu sau này cần audit lâu dài, audit record nên nằm trong bảng/log riêng để biết Admin nào đã gỡ/khôi phục truyện.
- Notification gửi cho Author phải chứa tối thiểu:
  - `novelTitle`;
  - `reason`, nếu Admin nhập;
  - thời điểm bị gỡ;
  - thông điệp rõ ràng: `Truyện đã bị gỡ bởi Admin`.
- Admin Novel Management chỉ dành cho vận hành/nội dung cấp nền tảng, không thay thế Author Project Manager.

## 7. Review Checklist

- [ ] Admin mở được danh sách truyện.
- [ ] Admin mở được chi tiết một truyện.
- [ ] Admin thấy cảnh báo trước khi xóa.
- [ ] Hủy confirmation không làm thay đổi dữ liệu.
- [ ] Xác nhận xóa làm truyện biến mất khỏi danh sách.
- [ ] Chapter PostgreSQL liên quan được đánh dấu `deleted_at`.
- [ ] Draft MongoDB liên quan được đánh dấu deleted/archived và không còn load trong Author IDE.
- [ ] Author sở hữu truyện nhận notification.
- [ ] Non-admin không truy cập được API/UI.
