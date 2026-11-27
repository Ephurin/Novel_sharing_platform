# Kế hoạch triển khai

| Đợt | Phụ thuộc và việc cần làm | Điều kiện chuyển đợt | Phương án lùi |
|---|---|---|---|
| **0. Baseline** | Dùng HEAD đã kiểm kê. Chụp hành vi link cũ, quyền, VIP, auth, thông báo và ví trên fixture cô lập. Đo số hàng, slug ngoài chuẩn và thời gian DDL trên bản sao. | Baseline tái lập được. Route Inventory khớp router. Cấu hình `8081`, Mailpit và sandbox được ghi rõ. | Dừng ở baseline khi cấu hình hoặc dữ liệu kiểm thử chưa tái lập được. |
| **1. Seed và schema** | Sau đợt 0. Sửa seed trước, rồi phát hành schema nullable và trigger. Backfill theo batch. Sau kiểm chứng mới phát hành migration siết `NOT NULL`. | DB mới và DB nâng cấp đạt kiểm thử. Mất kết nối giữa batch tiếp tục an toàn. Chạy lại seed giữ đúng mapping và hàng ngoài fixture. | Giữ schema mở rộng và mapping đã commit. Dừng trước migration siết nếu dữ liệu chưa đạt. |
| **2. Locator và DTO** | Sau backfill và cổng constraint. Thêm locator, DTO bổ sung và kiểm thử quyền. Chuẩn bị bản backend tương thích. | Locator chỉ đọc, xử lý đúng VIP và nội dung ẩn. Client cũ vẫn dùng được API UUID. Chạy backend typecheck và PostgreSQL suite cô lập. | Trước khi phát link mới, có thể lùi backend về bản tương thích schema có seed an toàn. Sau khi phát link, áp giới hạn rollback. |
| **3. Web công khai và độc giả** | Sau đợt 2. Cài route đích và alias reader. Hoàn thiện builder, layout theo phiên, cache UUID và canonical. Giữ các nơi phát link công khai ở chế độ cũ trong bản tương thích. | Route mới mở trực tiếp được. Alias cũ chuyển hướng được trong bài kiểm thử. Đích chờ từ module khác vẫn dùng href cũ cho đến khi đợt 4 đạt. | Giữ bước phát link ở chế độ cũ và sửa route trong bản tương thích. |
| **4. Web cộng đồng, tài khoản và vai trò** | Sau đợt 3. Cài toàn bộ route đích và alias còn lại. Đưa cùng bản frontend tương thích lên môi trường kiểm chứng. Kiểm tra route xuyên module, auth continuation, email hash và VNPay query. | Kiểm cả cặp frontend và backend tương thích. Lưu image hoặc revision chính xác. Chạy thử rollback với link mới và payload cũ trước khi bật nơi phát link. | Lùi về cặp tương thích đã kiểm chứng. |
| **5. Bật nơi phát link và E2E** | Sau đợt 4 trên môi trường đích. Bật link web, rồi thông báo, email, khiếu nại và VNPay fallback. Mỗi nơi phát chỉ bật sau khi kiểm đường dẫn mới, alias cũ và quyền đích trên bản đang phục vụ. | Build lại Docker và chạy E2E tại `8081`. So với baseline về quyền, tác động dữ liệu và callback. Kiểm mobile và báo riêng kết quả mock, sandbox. | Có thể đưa nơi phát link về URL cũ. Mọi URL mới đã phát tiếp tục phục vụ qua cặp tương thích. |

**Điều kiện bắt buộc trước mỗi nơi phát link.** Dùng cùng bảng kiểm cho link bên trong giao diện và link gửi ra ngoài. Ví dụ, nút từ trang truyện sang hồ sơ hoặc đăng nhập chờ `/tac-gia/:publicKey` và `/dang-nhap`. Đề cử và Studio chờ route truyện công khai. Thông báo chờ route tài nguyên, route cần đăng nhập và anchor tương ứng. Email và VNPay chờ cả đường dẫn hiện tại lẫn đường dẫn mới. Một route mới xuất hiện trong bản frontend kiểm chứng chưa kích hoạt việc phát link trên môi trường đích.

Sau phê duyệt triển khai, chạy `npm --prefix backend run typecheck`, `npm --prefix backend run test:isolated` với nhóm kiểm thử liên quan, `npm --prefix web run typecheck`, các browser suite, `npm --prefix mobile run typecheck`, `npm --prefix mobile test` và `git diff --check`. Stack reader dùng lệnh đã xác minh dưới đây sau khi schema và job backfill đạt điều kiện của đợt tương ứng. [Quy trình stack reader](../../../docs/development/discussions-plan.md#L97)

```powershell
docker compose -p storycraft-reader -f docker-compose.yml -f .vscode/docker-compose.reader.yml up -d --build backend web
```

Cổng cuối kiểm `/api/v1/health` và hành vi thực tế tại `http://localhost:8081`. IPN do nhà cung cấp gửi cần endpoint sandbox công khai được cấp phép. Dùng test cô lập để kiểm IPN khi chạy localhost.
