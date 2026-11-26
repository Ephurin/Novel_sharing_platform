# Tương thích ngược

| Nhóm | Hành vi |
|---|---|
| Link UUID theo tài nguyên | Dùng locator rồi `replace` thẳng sang URL chính thức. Giữ query và fragment có nghĩa, gồm bộ lọc, `threadId`, `commentId`, `#reader-comments`, `#comment-<UUID>` và tọa độ bookmark. |
| Studio, tài khoản, kiểm duyệt và quản trị | Giữ guard trên đích. Shortcut IDE lấy UUID từ path cũ và giữ tham số còn lại. `AuthGate` lưu đích cùng origin trong router state. Đăng nhập xong kiểm tra lại đích và áp lại guard. Fallback là trang theo vai trò. Từ chối đích ngoài origin và đích gây vòng lặp. |
| Email, Google và khiếu nại | `/xac-thuc-email` và alias `/verify-email` giữ nguyên `#token` hoặc `#recovery` và luồng xác nhận hiện tại. Sau khi cả hai đi qua E2E mới đổi URL email. Áp cùng thứ tự cho `/khieu-nai` và `/appeals`. Giữ GIS JavaScript, API challenge, origin, cookie và COOP của Nginx. |
| VNPay | `/wallet/vnpay-return` chuyển đến `/vi/ket-qua-thanh-toan` với nguyên chuỗi `location.search`. Sau đăng nhập, gửi chuỗi ký nguyên vẹn tới API return. Giữ `/api/v1/wallet/vnpay/return` và `/api/v1/wallet/vnpay/ipn`. Đổi fallback phát ra sau khi hai đường dẫn đã hoạt động. Giữ alias cho override và giao dịch đang diễn ra. |
| Thông báo, bookmark và mobile | Giữ payload cũ trong PostgreSQL và MongoDB. Thêm `webTarget` tùy chọn theo lô trong response cho người nhận có quyền. Builder web chọn URL chính thức và giữ anchor. Thiếu metadata thì dùng link UUID đã kiểm tra. Mobile tiếp tục dùng UUID và `payload.commentId`. Bookmark cũ và khóa scroll cũ được đọc lại theo định danh hiện có. |
| SPA và canonical | Nginx giữ proxy API và HTML fallback HTTP `200`. React Router chịu trách nhiệm `replace`. Trang công khai đã phân giải có một `rel="canonical"` tuyệt đối, bỏ query và fragment. Gỡ canonical khi chuyển sang trang riêng hoặc lỗi. [Nginx](../../../web/nginx.conf#L7) |

## Phiên bản tối thiểu để phát link và rollback

Trước cutover, lưu cặp bản phát hành đã kiểm chứng độc lập với bản bật nơi phát link. **Backend tương thích** có locator, giữ API UUID, đọc được schema đã backfill và có seed an toàn. **Frontend tương thích** hiểu mọi URL mới đã duyệt, nhận alias cũ, giữ nguyên ngữ cảnh URL và dùng được cả payload cũ lẫn mới. Kiểm tra cặp đó trên cùng schema sẽ dùng khi phát hành.

| Tình huống | Hành động |
|---|---|
| Lỗi nơi phát link | Tạm quay lại phát href legacy. URL mới đã phát hành, locator và alias tiếp tục hoạt động. |
| Cần lùi frontend | Dùng bản frontend tương thích đã lưu hoặc bản sửa mới có cùng khả năng định tuyến. Ghép với backend tương thích đang chạy hoặc backend tương thích đã kiểm chứng. |
| Cần lùi backend | Dùng backend tương thích đã lưu. Giữ locator, API UUID, trigger an toàn với writer cũ và DTO mà frontend đang phục vụ cần. Giữ schema, slug và khóa hồ sơ đã cấp. |
| Cần lùi cả hai | Dùng đúng cặp tương thích đã kiểm chứng. Mở lại link canonical, UUID, email đã gửi, giao dịch VNPay đang chờ và thông báo đã lưu trước khi kết thúc rollback. |

Sau khi một URL mới đã được phát hành, **cặp tương thích là giới hạn rollback**. Bản trước locator hoặc trước route mới nằm ngoài các phiên bản được phép lùi. Lỗi dữ liệu cần sửa tiến trên mapping hiện tại. Alias và locator vẫn được giữ cho email, thông báo, bookmark và giao dịch đã phát hành.

Để quay về phát link cũ, đặt `WEB_EMIT_CANONICAL_LINKS=false` ở runtime backend và build web với `VITE_EMIT_CANONICAL_LINKS=false`. Cả hai cờ chỉ đổi cách tạo link. Giữ nguyên schema và hai bộ route. Cấu hình này dùng để kiểm tra cặp bản phát hành tương thích trước khi bật phát URL mới.
