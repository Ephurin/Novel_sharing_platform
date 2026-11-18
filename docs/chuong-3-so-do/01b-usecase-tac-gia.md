# Chương 3 – Use Case Tác giả

> Tách từ [bản báo cáo Chương 3](../BAO_CAO_CHUONG_3.md). Các quan hệ được xác định theo mã nguồn nhánh `main`; sơ đồ Mermaid là biểu diễn gần đúng ký pháp UML.

#### a) Quản lý tác phẩm, chương và vòng đời công bố

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Tác phẩm, chương và bản thảo"]
        U1(["Quản lý tác phẩm (trừu tượng)"])
        U2(["Tạo tác phẩm"])
        U3(["Cập nhật tác phẩm"])
        U4(["Xóa tác phẩm"])
        U5(["Xem danh sách tác phẩm"])
        U6(["Gửi công bố tác phẩm"])
        U7(["Kiểm tra số chương hợp lệ"])
        U8(["Kiểm tra nội dung theo quy tắc"])
        U9(["Tạo chương truyện"])
        U10(["Lưu nội dung bản thảo"])
        U11(["Lưu revision"])
        U12(["Xem lịch sử revision"])
        U13(["Gửi công bố chương"])
        U14(["Sắp xếp chương"])
        U15(["Lên lịch hoặc hủy lịch công bố"])
        U16(["Lưu trữ hoặc khôi phục chương"])
        U17(["Xem thu nhập theo truyện"])
    end
    A --- U1
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
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U4 -.->|"«generalization»"| U1
    U6 -.->|"«include»"| U7
    U6 -.->|"«include»"| U8
    U13 -.->|"«include»"| U8
    U10 -.->|"«include»: khi lưu thay đổi nội dung"| U11
```

*Hình 3.6. Use Case tác giả với phân cấp tác phẩm và các bước công bố bắt buộc.*

**Phân cấp:** Tạo, sửa và xóa tác phẩm là các biến thể của nhóm quản lý tác phẩm. **«include» được kiểm chứng:** Gửi công bố *tác phẩm* bắt buộc kiểm tra số chương hợp lệ và kiểm tra nội dung; gửi công bố *chương* bắt buộc kiểm tra nội dung theo quy tắc. Trong `chapters.service.ts`, lưu thay đổi nội dung gọi chức năng snapshot revision; quan hệ từ Lưu nội dung bản thảo tới Lưu revision áp dụng cho **lưu thay đổi nội dung** (không áp dụng cho chỉ thay đổi giá/metadata). **Điều kiện tiên quyết, không phải «include»:** Tạo chương cần truyện đã tồn tại; gửi công bố truyện cần tối thiểu hai chương hợp lệ. Lên lịch chương là thao tác riêng, không phải bước luôn xảy ra khi xuất bản.

#### b) Quản lý ngữ cảnh tác phẩm thủ công

```mermaid
flowchart LR
    A["Author"]
    subgraph SYS["Dữ kiện do tác giả quản lý"]
        U1(["Quản lý hồ sơ nhân vật (trừu tượng)"])
        U2(["Xem hồ sơ nhân vật"])
        U3(["Tạo nhân vật"])
        U4(["Sửa hoặc xóa nhân vật"])
        U5(["Quản lý quan hệ nhân vật (trừu tượng)"])
        U6(["Xem quan hệ nhân vật"])
        U7(["Tạo, sửa hoặc xóa quan hệ"])
        U8(["Quản lý sự kiện timeline (trừu tượng)"])
        U9(["Xem dòng thời gian"])
        U10(["Tạo, sửa hoặc xóa sự kiện"])
        U11(["Quản lý tóm tắt (trừu tượng)"])
        U12(["Xem tóm tắt"])
        U13(["Tạo, sửa hoặc xóa tóm tắt"])
        U14(["Đồng bộ Story Bible"])
    end
    A --- U1
    A --- U5
    A --- U8
    A --- U11
    A --- U14
    U2 -.->|"«generalization»"| U1
    U3 -.->|"«generalization»"| U1
    U4 -.->|"«generalization»"| U1
    U6 -.->|"«generalization»"| U5
    U7 -.->|"«generalization»"| U5
    U9 -.->|"«generalization»"| U8
    U10 -.->|"«generalization»"| U8
    U12 -.->|"«generalization»"| U11
    U13 -.->|"«generalization»"| U11
```

*Hình 3.7. Use Case quản lý ngữ cảnh thủ công với các ca sử dụng trừu tượng.*

**Phân cấp rõ ràng:** Bốn nhánh độc lập quản lý nhân vật, quan hệ, timeline và tóm tắt; mỗi nhánh có các thao tác chuyên biệt. Các nhánh cùng liên quan đến một truyện nhưng **không** phải bước bắt buộc của nhau. Chẳng hạn, tạo hồ sơ nhân vật không tự động bao gồm tạo sự kiện timeline. Đồng bộ Story Bible là thao tác riêng, không giả định mọi thay đổi hồ sơ tự động gọi đồng bộ. Nguồn: `story-context.routes.ts`.

