# Chương 3 – Use Case Độc giả

> Tách từ [bản báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các quan hệ được xác định theo mã nguồn nhánh `main`; sơ đồ Mermaid là biểu diễn gần đúng ký pháp UML.

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
        U8(["Quản lý thư viện (trừu tượng)"])
        U9(["Thêm truyện vào thư viện"])
        U10(["Xóa truyện khỏi thư viện"])
        U11(["Lưu hoặc xem tiến độ đọc"])
        U12(["Quản lý dấu trang (trừu tượng)"])
        U13(["Tạo dấu trang"])
        U14(["Xem dấu trang"])
        U15(["Xóa dấu trang"])
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
    R --- U8
    R --- U11
    R --- U12
    U2 -.->|"«extend»: khi áp dụng bộ lọc"| U1
    U5 -.->|"«include»"| U6
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U13 -.->|"«generalization»"| U12
    U14 -.->|"«generalization»"| U12
    U15 -.->|"«generalization»"| U12
```

*Hình 3.3. Use Case tìm kiếm, đọc và quản lý thư viện/dấu trang.*

**Phân cấp:** Quản lý thư viện và Quản lý dấu trang là các ca sử dụng trừu tượng gom những biến thể trên cùng một tài nguyên; các thao tác thêm/xóa hoặc tạo/xem/xóa là chuyên biệt hóa. **Quan hệ bắt buộc:** Đọc chương luôn kiểm tra quyền truy cập theo trạng thái chương và quyền của người đọc. **Mở rộng:** Lọc chỉ phát sinh khi người dùng chọn bộ lọc trong quá trình tìm kiếm. Việc xem chi tiết truyện trước khi đọc chỉ là luồng điều hướng thông thường, không mặc nhiên là «include». Mã nguồn: `reading.routes.ts`, `reading.service.ts`.

#### b) Bình luận và tương tác cộng đồng

```mermaid
flowchart LR
    G["Guest"]
    R["Reader"]
    subgraph SYS["Tương tác với tác phẩm"]
        U1(["Xem bình luận"])
        U2(["Gửi bình luận"])
        U3(["Trả lời bình luận"])
        U4(["Quản lý bình luận của mình (trừu tượng)"])
        U5(["Sửa bình luận"])
        U6(["Xóa bình luận"])
        U7(["Bày tỏ cảm xúc với bình luận"])
        U8(["Quản lý lượt thích truyện (trừu tượng)"])
        U9(["Thích truyện"])
        U10(["Bỏ thích truyện"])
        U11(["Theo dõi hoặc bỏ theo dõi tác giả"])
        U12(["Theo dõi hoặc bỏ theo dõi truyện"])
        U13(["Thiết lập thông báo truyện"])
        U14(["Đánh giá tác phẩm"])
    end
    G --- U1
    R --- U1
    R --- U2
    R --- U4
    R --- U7
    R --- U8
    R --- U11
    R --- U12
    R --- U13
    R --- U14
    U3 -.->|"«generalization»"| U2
    U5 -.->|"«generalization»"| U4
    U6 -.->|"«generalization»"| U4
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
```

*Hình 3.4. Use Case bình luận, cảm xúc, theo dõi và đánh giá.*

**Phân cấp:** Trả lời là biến thể của gửi bình luận; sửa và xóa là những biến thể của mục tiêu trừu tượng quản lý bình luận của mình. Thích và bỏ thích là những biến thể cập nhật cùng một quan hệ. **Không gán sai phụ thuộc:** Theo dõi truyện và bật thông báo là hai API riêng; mã nguồn không bắt buộc người dùng phải tạo bản ghi follow trước khi thiết lập thông báo, vì vậy không dùng «include» giữa chúng. Xem bình luận cũng không bắt buộc phải phát sinh trước mọi thao tác gửi bình luận ở cấp service. Căn cứ: `comments.routes.ts`, `social.routes.ts`, `novel-engagement.service.ts`.

#### c) Ví Coin và quyền truy cập VIP

```mermaid
flowchart LR
    U["Tài khoản có quyền phù hợp"]
    subgraph SYS["Ví Coin mô phỏng"]
        U1(["Xem số dư ví"])
        U2(["Xem lịch sử giao dịch"])
        U3(["Xem gói nạp Coin"])
        U4(["Tạo phiên nạp mô phỏng"])
        U5(["Sử dụng số dư Coin (trừu tượng)"])
        U6(["Mở khóa chương VIP"])
        U7(["Ủng hộ tác giả bằng Coin"])
        U8(["Yêu cầu rút Coin"])
        U9(["Kiểm tra điều kiện sử dụng Coin"])
        U10(["Xem thông tin thu nhập"])
    end
    U --- U1
    U --- U2
    U --- U3
    U --- U4
    U --- U5
    U --- U10
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U8 -.->|"«generalization»"| U5
    U5 -.->|"«include»"| U9
```

*Hình 3.5. Use Case ví Coin mô phỏng với các biến thể sử dụng số dư.*

**Phân cấp:** Mở khóa, ủng hộ và gửi yêu cầu rút là các nghiệp vụ sử dụng số dư theo những cách khác nhau; đều có bước kiểm tra điều kiện xử lý tương ứng (quyền đã mở khóa, ví và số dư); riêng trường hợp chương đã mở khóa từ trước có thể trả kết quả mà không phát sinh giao dịch trừ Coin mới. Hình dùng lớp trừu tượng Sử dụng số dư Coin để diễn tả điểm chung, không khẳng định tồn tại một endpoint có tên như vậy. **Không gán «include»:** Tạo phiên nạp và xem lịch sử giao dịch không phải bước bắt buộc của việc mở khóa; thiếu Coin là trường hợp ngoại lệ hoặc một lần giao dịch khác. Giao dịch nạp thực tế không được mô tả vì đây là Coin mô phỏng. Căn cứ: `wallet.service.ts`, `wallet.repository.ts`.

