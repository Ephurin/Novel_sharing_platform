# Chương 3 – Use Case độc giả

> Trích từ [Chương 3](../BAO_CAO_CHUONG_3.md); nguồn đối chiếu: `main`. Chỉ dùng mũi tên «include» và «extend». Đường liền là liên kết tác nhân; khung là nhóm chức năng.

### 3.2.3. Use Case của độc giả

#### a) Khám phá, đọc và quản lý dữ liệu đọc

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Khám phá và đọc truyện"]
        U1(["Tìm kiếm truyện"])
        U2(["Lọc kết quả tìm kiếm"])
        U3(["Xem thông tin tác phẩm"])
        U4(["Xem danh sách chương"])
        U5(["Đọc chương"])
        U6(["Kiểm tra quyền đọc"])
        U7(["Tùy chỉnh giao diện đọc"])
        U11(["Lưu hoặc xem tiến độ đọc"])
        subgraph G3_1["Quản lý thư viện"]
            U9(["Thêm truyện vào thư viện"])
            U10(["Xóa truyện khỏi thư viện"])
        end
        subgraph G3_2["Quản lý dấu trang"]
            U13(["Tạo dấu trang"])
            U14(["Xem dấu trang"])
            U15(["Xóa dấu trang"])
        end
    end
    G --- U1
    R --- U1
    G --- U3
    R --- U3
    G --- U4
    R --- U4
    G --- U5
    R --- U5
    R --- U7
    R --- U9
    R --- U10
    R --- U11
    R --- U13
    R --- U14
    R --- U15
    U2 -.->|"«extend»: khi áp dụng bộ lọc"| U1
    U5 -.->|"«include»"| U6
```

*Hình 3.3. Use Case tìm kiếm, đọc và quản lý thư viện/dấu trang.*

**«include»:** Khi đọc chương, backend phải kiểm tra quyền truy cập. **«extend»:** Việc lọc kết quả chỉ phát sinh khi người dùng áp dụng bộ lọc lúc tìm kiếm. Quản lý thư viện và dấu trang được chia thành các nhóm thao tác nhưng không có mũi tên giữa tạo/xem/xóa vì chúng không phải bước bắt buộc của nhau. Nguồn: `reading.routes.ts`, `reading.service.ts`.

#### b) Bình luận và tương tác cộng đồng

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Tương tác với tác phẩm"]
        U1(["Xem bình luận"])
        U2(["Gửi bình luận"])
        U3(["Trả lời bình luận"])
        U7(["Bày tỏ cảm xúc với bình luận"])
        U11(["Theo dõi hoặc bỏ theo dõi tác giả"])
        U12(["Theo dõi hoặc bỏ theo dõi truyện"])
        U13(["Thiết lập thông báo truyện"])
        U14(["Đánh giá tác phẩm"])
        subgraph G4_1["Bình luận của mình"]
            U5(["Sửa bình luận"])
            U6(["Xóa bình luận"])
        end
        subgraph G4_2["Thích / bỏ thích truyện"]
            U9(["Thích truyện"])
            U10(["Bỏ thích truyện"])
        end
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U5
    R --- U6
    R --- U7
    R --- U9
    R --- U10
    R --- U11
    R --- U12
    R --- U13
    R --- U14
    U3 -.->|"«extend»: khi trả lời"| U2
```

*Hình 3.4. Use Case bình luận, cảm xúc, theo dõi và đánh giá.*

**«extend»:** Trả lời bình luận là tình huống tùy chọn khi người dùng muốn phản hồi một bình luận có sẵn. Các thao tác sửa/xóa bình luận, thích/bỏ thích, theo dõi tác giả/truyện, đánh giá và cài đặt thông báo là các chức năng riêng; không giả định quan hệ «include» khi backend không yêu cầu thao tác này phải thực hiện thao tác kia. Nguồn: `comments.routes.ts`, `social.routes.ts`, `novel-engagement.service.ts`.

#### c) Ví Coin và quyền truy cập VIP

```mermaid
flowchart LR
    U["Tài khoản có quyền phù hợp"]
    subgraph SYS["Ví Coin mô phỏng"]
        U1(["Xem số dư ví"])
        U2(["Xem lịch sử giao dịch"])
        U3(["Xem gói nạp Coin"])
        U4(["Tạo phiên nạp mô phỏng"])
        U9(["Kiểm tra điều kiện sử dụng Coin"])
        U10(["Xem thông tin thu nhập"])
        subgraph G5_1["Các nghiệp vụ dùng Coin"]
            U6(["Mở khóa chương VIP"])
            U7(["Ủng hộ tác giả bằng Coin"])
            U8(["Yêu cầu rút Coin"])
        end
    end
    U --- U1
    U --- U2
    U --- U3
    U --- U4
    U --- U6
    U --- U7
    U --- U8
    U --- U10
    U6 -.->|"«include»"| U9
    U7 -.->|"«include»"| U9
    U8 -.->|"«include»"| U9
```

*Hình 3.5. Use Case ví Coin mô phỏng với các biến thể sử dụng số dư.*

**«include»:** Mở khóa, ủng hộ và gửi yêu cầu rút Coin đều phải kiểm tra điều kiện xử lý tương ứng. Với chương đã mở khóa, dịch vụ có thể trả quyền hiện có mà không tạo thêm giao dịch. Xem lịch sử giao dịch hoặc tạo phiên nạp không phải hành vi bắt buộc của mở khóa. Coin ở đây là mô phỏng. Nguồn: `wallet.service.ts`, `wallet.repository.ts`.

