# Chương 3 – Use Case quản trị viên

> Trích từ [Chương 3](../BAO_CAO_CHUONG_3.md); nguồn đối chiếu: `main`. Chỉ dùng mũi tên «include» và «extend». Đường liền là liên kết tác nhân; khung là nhóm chức năng.

### 3.2.6. Use Case của quản trị viên

#### a) Kiểm duyệt và xử lý nội dung

```mermaid
flowchart LR
    AD["Admin có quyền kiểm duyệt"]
    subgraph SYS["Kiểm duyệt và xử lý báo cáo"]
        U1(["Xem danh sách review"])
        U2(["Xem chi tiết yêu cầu review"])
        U3(["Xem bằng chứng kiểm duyệt"])
        U7(["Kiểm tra trạng thái và quyền xử lý"])
        U14(["Xem chi tiết truyện hoặc chương"])
        subgraph G10_1["Quyết định kiểm duyệt"]
            U5(["Phê duyệt nội dung"])
            U6(["Từ chối nội dung"])
        end
        subgraph G10_2["Báo cáo vi phạm"]
            U9(["Xem báo cáo vi phạm"])
            U10(["Giải quyết báo cáo vi phạm"])
        end
        subgraph G10_3["Trạng thái truyện"]
            U12(["Gỡ truyện"])
            U13(["Khôi phục truyện"])
        end
    end
    AD --- U1
    AD --- U2
    AD --- U3
    AD --- U5
    AD --- U6
    AD --- U9
    AD --- U10
    AD --- U12
    AD --- U13
    AD --- U14
    U5 -.->|"«include»"| U7
    U6 -.->|"«include»"| U7
```

*Hình 3.10. Use Case kiểm duyệt và xử lý báo cáo.*

**«include»:** Khi phê duyệt hoặc từ chối nội dung, backend luôn kiểm tra quyền và trạng thái yêu cầu kiểm duyệt. **Không nối hai quyết định với nhau:** một lần xử lý chỉ chọn nhánh phù hợp. Xem danh sách hay chi tiết hỗ trợ điều hướng trên UI, nhưng không phải bước API bắt buộc khi đã có review ID. Nguồn: `content-control.service.ts`, `admin.service.ts`.

#### b) Quản trị tài khoản, phân loại và Coin

```mermaid
flowchart LR
    AD["Admin có quyền tương ứng"]
    subgraph SYS["Quản trị và vận hành"]
        U1(["Xem danh sách người dùng"])
        U5(["Xem danh sách truyện"])
        U9(["Xem yêu cầu rút Coin"])
        U13(["Xem thống kê vận hành"])
        subgraph G11_1["Trạng thái tài khoản"]
            U3(["Khóa tài khoản"])
            U4(["Mở khóa tài khoản"])
        end
        subgraph G11_2["Danh mục"]
            U7(["Thêm thể loại"])
            U8(["Thêm tag"])
        end
        subgraph G11_3["Yêu cầu rút Coin"]
            U11(["Phê duyệt rút Coin"])
            U12(["Từ chối rút Coin"])
        end
    end
    AD --- U1
    AD --- U3
    AD --- U4
    AD --- U5
    AD --- U7
    AD --- U8
    AD --- U9
    AD --- U11
    AD --- U12
    AD --- U13
```

*Hình 3.11. Use Case quản trị tài khoản, phân loại và Coin.*

Khóa và mở khóa tài khoản, thêm thể loại/tag, phê duyệt hoặc từ chối rút Coin được chia thành những nhóm nghiệp vụ. **Không tự thêm «include»/«extend»** giữa những lựa chọn thay thế. Trạng thái tài khoản, quyền admin, yêu cầu rút đang chờ là các điều kiện tiên quyết được backend kiểm tra. Nguồn: `admin.routes.ts`, `admin.service.ts`.

