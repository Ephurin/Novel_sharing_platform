# Chương 3 – Use Case Quản trị viên

> Tách từ [bản báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các quan hệ được xác định theo mã nguồn nhánh `main`; sơ đồ Mermaid là biểu diễn gần đúng ký pháp UML.

#### a) Kiểm duyệt và xử lý nội dung

```mermaid
flowchart LR
    AD["Admin có quyền kiểm duyệt"]
    subgraph SYS["Kiểm duyệt và xử lý báo cáo"]
        U1(["Xem danh sách review"])
        U2(["Xem chi tiết yêu cầu review"])
        U3(["Xem bằng chứng kiểm duyệt"])
        U4(["Ra quyết định kiểm duyệt (trừu tượng)"])
        U5(["Phê duyệt nội dung"])
        U6(["Từ chối nội dung"])
        U7(["Kiểm tra trạng thái và quyền xử lý"])
        U8(["Quản lý báo cáo (trừu tượng)"])
        U9(["Xem báo cáo vi phạm"])
        U10(["Giải quyết báo cáo vi phạm"])
        U11(["Quản lý trạng thái truyện (trừu tượng)"])
        U12(["Gỡ truyện"])
        U13(["Khôi phục truyện"])
        U14(["Xem chi tiết truyện hoặc chương"])
    end
    AD --- U1
    AD --- U2
    AD --- U3
    AD --- U4
    AD --- U8
    AD --- U11
    AD --- U14
    U5 -.->|"«generalization»"| U4
    U6 -.->|"«generalization»"| U4
    U4 -.->|"«include»"| U7
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U12 -.->|"«generalization»"| U11
    U13 -.->|"«generalization»"| U11
```

*Hình 3.10. Use Case kiểm duyệt với quyết định chấp nhận hoặc từ chối.*

**Phân cấp quyết định:** Phê duyệt và từ chối là hai biến thể loại trừ của mục tiêu giải quyết review; **không** dùng «include» bởi một lần xử lý không thực hiện cả hai. Backend luôn kiểm tra quyền, trạng thái review và điều kiện hợp lệ trước khi ghi quyết định, nên mô hình hóa phần kiểm tra chung bằng «include». Xem hàng đợi/chi tiết hỗ trợ thao tác UI, nhưng không được áp thành «include» bắt buộc khi một API xử lý có thể nhận trực tiếp ID review. Nguồn: `content-control.service.ts`, `admin.service.ts`.

#### b) Quản trị tài khoản, phân loại và Coin

```mermaid
flowchart LR
    AD["Admin có quyền tương ứng"]
    subgraph SYS["Quản trị và vận hành"]
        U1(["Xem danh sách người dùng"])
        U2(["Quản lý trạng thái tài khoản (trừu tượng)"])
        U3(["Khóa tài khoản"])
        U4(["Mở khóa tài khoản"])
        U5(["Xem danh sách truyện"])
        U6(["Quản lý phân loại (trừu tượng)"])
        U7(["Thêm thể loại"])
        U8(["Thêm tag"])
        U9(["Xem yêu cầu rút Coin"])
        U10(["Giải quyết yêu cầu rút Coin (trừu tượng)"])
        U11(["Phê duyệt rút Coin"])
        U12(["Từ chối rút Coin"])
        U13(["Xem thống kê vận hành"])
    end
    AD --- U1
    AD --- U2
    AD --- U5
    AD --- U6
    AD --- U9
    AD --- U10
    AD --- U13
    U3 -.->|"«generalization»"| U2
    U4 -.->|"«generalization»"| U2
    U7 -.->|"«generalization»"| U6
    U8 -.->|"«generalization»"| U6
    U11 -.->|"«generalization»"| U10
    U12 -.->|"«generalization»"| U10
```

*Hình 3.11. Use Case quản trị với các biến thể khóa, mở khóa và duyệt yêu cầu rút Coin.*

**Phân cấp:** Khóa/mở khóa tài khoản là các biến thể thay đổi trạng thái; thêm thể loại/tag là hai hình thức cập nhật danh mục; chấp thuận/từ chối rút Coin là hai kết quả lựa chọn của nghiệp vụ duyệt rút. **Điều kiện tiên quyết:** Mở khóa chỉ có nghĩa với tài khoản đang bị khóa; xử lý yêu cầu rút cần yêu cầu đang chờ và quyền finance. Xem danh sách không phải là một bước «include» của thao tác thay đổi trạng thái, vì API có thể được gọi khi đã biết ID. Nguồn: `admin.routes.ts`, `admin.service.ts`.

