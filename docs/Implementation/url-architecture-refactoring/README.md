# StoryCraft URL Architecture Refactoring

Bản cập nhật giữ nguyên kiến trúc URL, Route Inventory, chính sách slug, khóa hồ sơ từ username chuẩn hóa và phương án chuyển hướng SPA. Phần bổ sung chốt cách backfill theo lô, thứ tự áp `NOT NULL`, điều kiện bật từng nơi phát link, phiên bản tối thiểu được phép rollback và cách xử lý seed có thể làm mất định danh.

Việt hóa URL điều hướng trên toàn bộ web StoryCraft. Truyện, chương và đánh giá có một URL chính thức dùng chung cho khách và người đã đăng nhập. Link cũ tiếp tục mở đúng tài nguyên. UUID, hợp đồng API hiện hành, bố cục và các quy tắc phân quyền, xuất bản, kiểm duyệt, thanh toán và VIP được giữ nguyên.

Worktree `F:/Code/Github/Novel_sharing_platform-reader-features`, nhánh `URL-Architecture-Refactoring`, HEAD `2a6b36677454e83a5e44bcbd2669f817f7de40e0`. Graphify khớp HEAD trong khảo sát trước. Đây là baseline đã xác minh trước triển khai.

## Tài liệu

- [Khảo sát hiện trạng](CURRENT_STATE_AUDIT.md)
- [Bảng chuyển đổi route](ROUTE_INVENTORY.md)
- [Kiến trúc URL](URL_ARCHITECTURE_DESIGN.md)
- [Chính sách slug và định danh](SLUG_AND_IDENTIFIER_POLICY.md)
- [Tương thích ngược](BACKWARD_COMPATIBILITY_PLAN.md)
- [Kế hoạch triển khai](IMPLEMENTATION_PLAN.md)
- [Ma trận kiểm thử](TEST_MATRIX.md)
- [Quyết định và điều kiện môi trường](OPEN_DECISIONS.md)
