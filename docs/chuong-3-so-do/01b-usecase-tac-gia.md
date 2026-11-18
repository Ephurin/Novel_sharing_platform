# Chương 3 – Use Case tác giả

> Trích từ [Chương 3](../BAO_CAO_CHUONG_3.md); nguồn đối chiếu: `main`. Chỉ dùng mũi tên «include» và «extend». Đường liền là liên kết tác nhân; khung là nhóm chức năng.

### 3.2.4. Use Case của tác giả

#### a) Quản lý tác phẩm, chương và vòng đời công bố

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Tác phẩm, chương và bản thảo"]
        U5(["Xem danh sách tác phẩm"])
        U6(["Gửi công bố tác phẩm"])
        U7(["Kiểm tra số chương hợp lệ"])
        U8(["Kiểm tra nội dung theo quy tắc"])
        U9(["Tạo chương truyện"])
        U10(["Lưu thay đổi nội dung bản thảo"])
        U11(["Lưu revision"])
        U12(["Xem lịch sử revision"])
        U13(["Gửi công bố chương"])
        U14(["Sắp xếp chương"])
        U15(["Lên lịch hoặc hủy lịch công bố"])
        U16(["Lưu trữ hoặc khôi phục chương"])
        U17(["Xem thu nhập theo truyện"])
        subgraph G6_1["Tạo và quản lý tác phẩm"]
            U2(["Tạo tác phẩm"])
            U3(["Cập nhật tác phẩm"])
            U4(["Xóa tác phẩm"])
        end
    end
    A --- U2
    A --- U3
    A --- U4
    A --- U5
    A --- U6
    A --- U9
    A --- U10
    A --- U12
    A --- U13
    A --- U14
    A --- U15
    A --- U16
    A --- U17
    U6 -.->|"«include»"| U7
    U6 -.->|"«include»"| U8
    U13 -.->|"«include»"| U8
    U10 -.->|"«include»"| U11
```

*Hình 3.6. Use Case quản lý tác phẩm và kiểm tra công bố.*

**«include»:** Gửi công bố tác phẩm phải kiểm tra số chương hợp lệ và nội dung; gửi công bố chương phải kiểm tra nội dung. Lưu thay đổi **nội dung** bản thảo gọi bước lưu revision, không đồng nhất với sửa riêng thông tin giá. **Điều kiện trước:** Tạo chương cần có tác phẩm đã tồn tại, không dùng «include» đến Tạo tác phẩm. Nguồn: `novels.service.ts`, `chapters.service.ts`.

#### b) Quản lý ngữ cảnh tác phẩm thủ công

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Dữ kiện do tác giả quản lý"]
        U14(["Đồng bộ Story Bible"])
        subgraph G7_1["Hồ sơ nhân vật"]
            U2(["Xem hồ sơ nhân vật"])
            U3(["Tạo nhân vật"])
            U4(["Sửa hoặc xóa nhân vật"])
        end
        subgraph G7_2["Quan hệ nhân vật"]
            U6(["Xem quan hệ nhân vật"])
            U7(["Tạo, sửa hoặc xóa quan hệ"])
        end
        subgraph G7_3["Dòng thời gian"]
            U9(["Xem dòng thời gian"])
            U10(["Tạo, sửa hoặc xóa sự kiện"])
        end
        subgraph G7_4["Tóm tắt"]
            U12(["Xem tóm tắt"])
            U13(["Tạo, sửa hoặc xóa tóm tắt"])
        end
    end
    A --- U2
    A --- U3
    A --- U4
    A --- U6
    A --- U7
    A --- U9
    A --- U10
    A --- U12
    A --- U13
    A --- U14
```

*Hình 3.7. Use Case quản lý dữ kiện và ngữ cảnh truyện.*

Quản lý nhân vật, quan hệ, timeline và tóm tắt được chia thành những nhóm thao tác để người đọc nhận diện phạm vi. **Không thêm «include» hoặc «extend» thiếu căn cứ:** tạo nhân vật không bắt buộc tạo sự kiện, đồng bộ Story Bible là hành động riêng. Các thao tác liên quan đến cùng một truyện không vì thế mà tạo thành quan hệ Use Case. Nguồn: `story-context.routes.ts`.

