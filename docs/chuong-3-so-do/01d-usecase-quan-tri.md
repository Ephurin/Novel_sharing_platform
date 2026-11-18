# Chương 3 – Use Case quản trị

> Tách từ [báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các sơ đồ bám theo mã nguồn nhánh `main`.

#### a) Kiểm duyệt và xử lý nội dung

```mermaid
flowchart LR
    AD["Admin có quyền kiểm duyệt"]
    subgraph SYS["Kiểm duyệt và báo cáo"]
        U1(["Xem hàng đợi kiểm duyệt"])
        U2(["Xem chi tiết nội dung cần duyệt"])
        U3(["Xem bằng chứng kiểm duyệt"])
        U4(["Chấp nhận nội dung"])
        U5(["Từ chối nội dung"])
        U6(["Xem báo cáo vi phạm"])
        U7(["Giải quyết báo cáo vi phạm"])
        U8(["Xem truyện và chương thuộc diện quản lý"])
        U9(["Gỡ hoặc khôi phục truyện"])
    end
    AD --- U1
    AD --- U2
    AD --- U3
    AD --- U4
    AD --- U5
    AD --- U6
    AD --- U7
    AD --- U8
    AD --- U9
```

*Hình 3.10. Use Case kiểm duyệt và xử lý vi phạm.*

Căn cứ là content-control.routes.ts và các route truyện/chương của admin. Kiểm tra theo quy tắc hoặc báo cáo người dùng có thể tạo yêu cầu review; quyết định phê duyệt hoặc từ chối do quản trị viên có quyền thực hiện, không phải cơ chế LLM tự động kiểm duyệt.

#### b) Quản trị người dùng, danh mục và Coin

```mermaid
flowchart LR
    AD["Admin có quyền phù hợp"]
    subgraph SYS["Quản trị và vận hành"]
        U1(["Xem danh sách người dùng"])
        U2(["Khóa tài khoản"])
        U3(["Mở khóa tài khoản"])
        U4(["Xem danh sách truyện trong hệ thống"])
        U5(["Quản lý thể loại"])
        U6(["Quản lý tag"])
        U7(["Xem yêu cầu rút Coin"])
        U8(["Chấp thuận rút Coin mô phỏng"])
        U9(["Từ chối rút Coin mô phỏng"])
        U10(["Xem thống kê vận hành"])
    end
    AD --- U1
    AD --- U2
    AD --- U3
    AD --- U4
    AD --- U5
    AD --- U6
    AD --- U7
    AD --- U8
    AD --- U9
    AD --- U10
```

*Hình 3.11. Use Case quản trị vận hành Ephurin.*

Đối chiếu với admin.routes.ts. Các quyền thao tác được backend phân theo loại nghiệp vụ như users, finance và audit. Vì vậy sơ đồ ghi Admin có quyền phù hợp, không khẳng định một tài khoản quản trị bất kỳ đều sở hữu toàn bộ quyền.

