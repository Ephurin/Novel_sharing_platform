# Chương 3 – Use Case độc giả

> Tách từ [báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các sơ đồ bám theo mã nguồn nhánh `main`.

#### a) Khám phá, đọc và lưu tiến độ

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Khám phá và đọc truyện"]
        U1(["Tìm kiếm truyện"])
        U2(["Lọc và xem danh mục"])
        U3(["Xem thông tin truyện"])
        U4(["Xem danh sách chương"])
        U5(["Đọc chương được phép truy cập"])
        U6(["Tùy chỉnh giao diện đọc"])
        U7(["Lưu và xem lịch sử đọc"])
        U8(["Thêm hoặc xóa khỏi thư viện"])
        U9(["Tạo dấu trang tại vị trí đọc"])
        U10(["Xem và xóa dấu trang"])
    end
    G --- U1
    R --- U1
    G --- U2
    R --- U2
    G --- U3
    R --- U3
    G --- U4
    R --- U4
    G --- U5
    R --- U5
    R --- U6
    R --- U7
    R --- U8
    R --- U9
    R --- U10
```

*Hình 3.3. Use Case khám phá, đọc và lưu tiến độ.*

Các thao tác được đối chiếu với reading.routes.ts trên nhánh main. Độc giả đã đăng nhập có thể lưu tiến độ, thư viện và dấu trang, trong khi khách truy cập chỉ dùng các chức năng công khai theo quyền đọc. Lưu lịch sử đọc không phải một Use Case bắt buộc xảy ra mỗi khi mở chương.

#### b) Bình luận và tương tác cộng đồng

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Tương tác với tác phẩm"]
        U1(["Xem bình luận truyện và chương"])
        U2(["Gửi bình luận"])
        U3(["Sửa hoặc xóa bình luận của mình"])
        U4(["Xem và gửi trả lời"])
        U5(["Thả cảm xúc cho bình luận"])
        U6(["Thích hoặc bỏ thích truyện"])
        U7(["Theo dõi hoặc bỏ theo dõi tác giả"])
        U8(["Theo dõi hoặc bỏ theo dõi truyện"])
        U9(["Đánh giá tác phẩm"])
        U10(["Bật hoặc tắt thông báo truyện"])
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U3
    R --- U4
    R --- U5
    R --- U6
    R --- U7
    R --- U8
    R --- U9
    R --- U10
```

*Hình 3.4. Use Case tương tác cộng đồng.*

Các chức năng được đối chiếu với comments.routes.ts, social.routes.ts và novel-engagement.routes.ts. Theo dõi tác giả và theo dõi tác phẩm là hai mục tiêu riêng, tương ứng với hai loại đối tượng. Sửa và xóa bình luận phụ thuộc quyền sở hữu và chính sách hệ thống.

#### c) Ví Coin và quyền truy cập VIP

```mermaid
flowchart LR
    U["Tài khoản có quyền phù hợp"]
    subgraph SYS["Ví Coin mô phỏng"]
        U1(["Xem số dư Coin"])
        U2(["Xem giao dịch"])
        U3(["Xem các gói nạp"])
        U4(["Tạo phiên nạp Coin mô phỏng"])
        U5(["Mở khóa chương VIP"])
        U6(["Ủng hộ tác giả bằng Coin"])
        U7(["Gửi yêu cầu rút Coin"])
        U8(["Xem thông tin thu nhập"])
    end
    U --- U1
    U --- U2
    U --- U3
    U --- U4
    U --- U5
    U --- U6
    U --- U7
    U --- U8
```

*Hình 3.5. Use Case ví Coin mô phỏng và mở khóa chương.*

Hình mô tả các thao tác có endpoint trong wallet.routes.ts, không khẳng định tất cả vai trò được phép sử dụng mọi thao tác. Webhook báo nạp thành công là cơ chế tích hợp mô phỏng, không phải Use Case do độc giả trực tiếp kích hoạt. Không xem Coin như giải pháp thanh toán thương mại thực.

