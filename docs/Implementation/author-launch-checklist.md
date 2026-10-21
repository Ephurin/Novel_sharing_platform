# Checklist tác giả trước ra mắt — Nhóm A

Đối chiếu theo code và kiểm thử ngày 21/10/2026. Cả năm nhóm trong checklist đều đã có luồng sử dụng.

| Mục | Trước lượt bổ sung này | Kết quả và nơi sử dụng |
| --- | --- | --- |
| Quản lý bình luận chương | Đã có xem, trả lời, xóa và báo cáo | Xác nhận lại component dùng chung trên `/author/novels/:novelId/comments`; báo cáo gửi tới luồng quản trị, tác giả không sửa nội dung của độc giả. |
| Lên lịch xuất bản chương | Chưa có | Thêm **Lên lịch xuất bản** trong menu thao tác chương và **Lên lịch** ở Studio. Có đặt, đổi, hủy lịch và trạng thái xử lý. |
| Chỉnh sửa hồ sơ tác giả | Đã có avatar, tên hiển thị/bút danh và tiểu sử | Bổ sung banner, tải banner, lịch đăng dự kiến; lưu tại `/profile/me`, hiển thị trên trang tác giả. Có thể xóa các trường tùy chọn bằng giá trị null. |
| Trung tâm thông báo | Đã có bình luận, trả lời và kết quả duyệt | Bổ sung đánh giá, theo dõi tác phẩm, theo dõi tác giả, xu mở khóa và xu ủng hộ. Thông báo doanh thu dẫn tới Ví. Giữ bộ đếm chưa đọc trên chuông. |
| Khôi phục bản thảo | Đã có | Giữ lịch sử mốc lưu, so sánh/khôi phục, mốc dự phòng trước khi khôi phục, lưu dự phòng trên máy và kiểm tra xung đột phiên bản. |

## Quy tắc lịch xuất bản

- Chỉ chủ sở hữu hoặc admin có tài khoản đang hoạt động được đặt/hủy lịch.
- Tác phẩm phải được phát hành; chương phải là bản nháp hoặc bị từ chối, có nội dung và thời gian trong tương lai.
- Giao diện dùng múi giờ thiết bị và ghi rõ múi giờ. API nhận ISO timestamp có offset; database lưu `timestamptz`.
- Lịch gắn với phiên bản bản nháp đã lưu. Sửa nội dung/tiêu đề sẽ hủy lịch cũ; thay đổi từ luồng khác cũng được kiểm tra lại lúc đến hạn.
- Lưu trữ/xóa chương hủy lịch chờ. Chương đang chờ kiểm duyệt không được lưu trữ trước khi có kết quả.
- Server kiểm tra chương đến hạn mỗi 10 giây, đồng thời xử lý lịch quá hạn khi khởi động. Dữ liệu lịch tồn tại qua lần khởi động lại.
- Khóa hàng và `SKIP LOCKED` cho phép nhiều worker phối hợp. Cập nhật chương, trạng thái lịch và sự kiện thông báo cùng nằm trong transaction PostgreSQL.
- Chương vẫn đi qua kiểm duyệt. Nội dung bị đánh dấu chỉ công khai sau khi được duyệt; bản chụp nội dung gửi duyệt được giữ riêng với bản nháp tiếp tục chỉnh sửa. Duyệt một yêu cầu cũ không được ghi đè phiên bản đã phát hành mới hơn.
- Lịch thành công, cần duyệt hoặc lỗi đều tạo thông báo cho tác giả; lỗi xuất hiện trong danh sách chương.

API mới (dưới `/api/v1`):

- `POST /chapters/:chapterId/schedule` — `{ scheduledAt, expectedVersion }`.
- `DELETE /chapters/:chapterId/schedule` — hủy lịch còn chờ.
- DTO chương dành cho tác giả bổ sung `publicationSchedule`. Danh sách chương công khai không trả thông tin lịch nội bộ.

## Hồ sơ và thông báo

Migration `016_author_launch_checklist.sql` bổ sung `banner_url`, `publishing_schedule`, lịch xuất bản, bản chụp nội dung gửi duyệt và bảng sự kiện thông báo. Không tạo thông báo giả hoặc backfill lịch sử cũ.

Tên hiển thị hiện có tiếp tục đóng vai trò bút danh; không thêm một trường tên pháp lý trùng lặp. Lịch đăng dự kiến trên hồ sơ là mô tả công khai; thời điểm tự đăng từng chương được đặt riêng trong chức năng lên lịch.

Các sự kiện đánh giá/theo dõi/doanh thu được ghi cùng transaction với thao tác gốc. Worker chuyển sang inbox MongoDB với khóa idempotent, không tạo bản sao khi thử lại và không đặt lại trạng thái đã đọc. Đánh giá/theo dõi lặp lại không đổi dữ liệu không phát sinh thông báo mới. Các khoản xu vẫn thuộc Wallet demo hiện có.

## Kiểm chứng

- Backend: TypeScript và 52 tests đều đạt, gồm PostgreSQL/MongoDB thật trong schema/database kiểm thử riêng.
- Frontend: TypeScript, 12 tests hiện có và production build đều đạt.
- Test mới: quyền đặt lịch, ngày quá khứ, bản nháp rỗng, xung đột phiên bản, chưa đến hạn, đăng tự động, hủy lịch, sửa bản nháp, tài khoản bị khóa, kiểm duyệt bản chụp, yêu cầu duyệt cũ, hồ sơ null/không đổi trường, thông báo có người nhận đúng và chống trùng.
- Chrome: lưu banner/bút danh/tiểu sử/lịch đăng; đặt và hủy lịch bằng UI; server đang chạy tự đăng chương đến hạn; inbox nhận sự kiện đánh giá/theo dõi/xu; kiểm tra liên kết Ví, Light/Dark và mobile không tràn ngang.
- Dữ liệu/tài khoản kiểm thử giao diện được dọn sau khi chạy.
- Migration đã áp dụng và Docker backend/web đã được build, cập nhật với seed demo tắt.
